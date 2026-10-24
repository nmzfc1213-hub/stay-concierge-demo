import { statement } from './repository.js';

// The DB is the durable outbox. waitUntil is only an immediate attempt,
// not a durable scheduler. Authorized staff can request a retry.
export async function dispatchNotification(env, propertyId, notificationId, fetcher = fetch) {
  const now = new Date().toISOString();
  const lease = new Date(Date.now() + 60000).toISOString();
  const job = await statement(env.DB, `
    UPDATE notification SET status = 'processing', lease_until = ?, attempts = attempts + 1
    WHERE property_id = ? AND notification_id = ? AND attempts < 5
      AND next_attempt_at <= ? AND (status IN ('pending', 'failed')
        OR (status = 'processing' AND lease_until < ?))
    RETURNING *
  `, lease, propertyId, notificationId, now, now).first();
  if (!job) return;
  const property = await statement(env.DB, `
    SELECT demo, notification_email FROM property WHERE property_id = ?
  `, propertyId).first();
  const reservation = await statement(env.DB, `
    SELECT guide_version, cancelled_at, completed_at FROM reservation
    WHERE property_id = ? AND reservation_id = ?
  `, propertyId, job.reservation_id).first();
  let status = 'failed';
  let code = 'MAIL_NOT_CONFIGURED';
  let providerId = null;
  if (!reservation || reservation.cancelled_at || !reservation.completed_at ||
    reservation.guide_version !== job.guide_version) {
    code = 'RESERVATION_INACTIVE';
  } else if (env.MAIL_MODE === 'disabled') {
    status = 'demo_skipped';
    code = 'DEMO_NO_EMAIL';
  } else if (env.MAIL_MODE === 'resend' && env.RESEND_API_KEY && env.MAIL_FROM) {
    // Never automatically retry an ambiguous send outside the provider's
    // idempotency retention window. Staff must review it instead.
    if (Date.now() - Date.parse(job.created_at) > 23 * 60 * 60 * 1000) {
      code = 'MANUAL_REVIEW_REQUIRED';
    } else {
      try {
        const response = await fetcher('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': `confirmation/${notificationId}`
          },
          body: JSON.stringify({
            from: env.MAIL_FROM,
            to: [property.notification_email],
            subject: `${property.demo ? '[DEMO] ' : ''}Stay Concierge：最終確認を受け付けました`,
            text: `宿泊者の最終確認を受け付けました。申告の有無・内容は、認証付き管理画面で確認してください。\n${env.APP_ORIGIN}/admin/`
          }),
          signal: AbortSignal.timeout(10000)
        });
        if (response.ok) {
          const result = await response.json();
          if (typeof result.id === 'string' && result.id.length < 150) {
            status = 'accepted';
            code = 'PROVIDER_ACCEPTED';
            providerId = result.id;
          } else code = 'PROVIDER_INVALID_RESPONSE';
        } else code = `PROVIDER_HTTP_${response.status}`;
      } catch {
        code = 'PROVIDER_UNCERTAIN';
      }
    }
  }
  const next = new Date(Date.now() + Math.min(3600, 60 * 2 ** job.attempts) * 1000).toISOString();
  await env.DB.batch([
    statement(env.DB, `
      UPDATE notification SET status = ?, last_code = ?, provider_id = ?,
        next_attempt_at = ?, lease_until = NULL
      WHERE property_id = ? AND notification_id = ? AND lease_until = ?
    `, status, code, providerId, next, propertyId, notificationId, lease),
    statement(env.DB, `INSERT INTO notification_attempt VALUES (?, ?, ?, ?, ?)`,
      propertyId, crypto.randomUUID(), notificationId, code, new Date().toISOString())
  ]);
}
