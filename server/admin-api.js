import { handleAdminMeal } from './meal.js';
import { ApiError, bodyJSON, hash, json, randomToken, rateLimit } from './security.js';
import { adminIdentity, checkAdminCSRF, makeAdminCSRF } from './access.js';
import { statement } from './repository.js';
import { date, parseCSV, reservationInput, settingsInput, urgency } from './admin-validation.js';
import { dispatchNotification } from './notifications.js';
import { handleWorkflowAdmin, profileFor, workflowDetail } from './workflow.js';

function event(db, user, type, reservationId = null, metadata = {}) {
  return statement(db, 'INSERT INTO audit_event VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    user.property_id, crypto.randomUUID(), reservationId, 'admin', user.user_id,
    type, JSON.stringify(metadata), new Date().toISOString());
}

async function findReservation(db, user, id) {
  const row = await statement(db, 'SELECT * FROM reservation WHERE property_id = ? AND reservation_id = ?', user.property_id, id).first();
  if (!row) throw new ApiError(404, 'NOT_FOUND');
  return row;
}

function owner(user) {
  if (user.role !== 'owner') throw new ApiError(403, 'OWNER_REQUIRED');
}

async function currentSettings(db, user) {
  const property = await statement(db, `
    SELECT p.*, v.guide_json FROM property p JOIN property_version v
      ON v.property_id = p.property_id AND v.version = p.current_version
    WHERE p.property_id = ?
  `, user.property_id).first();
  return {
    expectedVersion: property.current_version, name: JSON.parse(property.name_json),
    contact: JSON.parse(property.contact_json), wifi: JSON.parse(property.wifi_json),
    notificationEmail: property.notification_email, guide: JSON.parse(property.guide_json),
    directBookingEnabled: Boolean(property.direct_booking_enabled), directBookingUrl: property.direct_booking_url || '',
    demo: Boolean(property.demo), timezone: property.timezone
  };
}

async function listReservations(request, env, user) {
  const params = new URL(request.url).searchParams;
  const offset = Number(params.get('offset') || 0);
  const filter = params.get('filter') || 'all';
  if (!Number.isInteger(offset) || offset < 0 || offset > 100000 || !['all', 'pending', 'attention'].includes(filter)) throw new ApiError(422, 'INVALID_INPUT');
  const needsHandling = `(EXISTS (SELECT 1 FROM service_request q WHERE q.property_id = r.property_id
      AND q.reservation_id = r.reservation_id AND q.status != 'resolved')
    OR (s.needs_attention = 1 AND NOT EXISTS (SELECT 1 FROM service_request q
      WHERE q.property_id = r.property_id AND q.reservation_id = r.reservation_id
        AND q.client_request_id = 'completion:' || r.guide_version)))`;
  const condition = filter === 'pending' ? 'AND r.completed_at IS NULL AND r.cancelled_at IS NULL'
    : filter === 'attention' ? `AND ${needsHandling} AND r.cancelled_at IS NULL` : '';
  const rows = await statement(env.DB, `
    SELECT r.*, s.arrival_slot, s.needs_attention, n.status AS notification_status,
      (SELECT COUNT(*) FROM service_request q WHERE q.property_id = r.property_id
        AND q.reservation_id = r.reservation_id AND q.status != 'resolved') AS open_request_count,
      (SELECT COUNT(*) FROM confirmation c WHERE c.property_id = r.property_id
        AND c.reservation_id = r.reservation_id AND c.guide_version = r.guide_version) AS checked_count
    FROM reservation r
    LEFT JOIN submission s ON s.property_id = r.property_id AND s.reservation_id = r.reservation_id AND s.guide_version = r.guide_version
    LEFT JOIN notification n ON n.property_id = r.property_id AND n.reservation_id = r.reservation_id AND n.guide_version = r.guide_version
    WHERE r.property_id = ? ${condition}
    ORDER BY r.arrival_date, r.reservation_id LIMIT 51 OFFSET ?
  `, user.property_id, offset).all();
  const summary = await statement(env.DB, `
    SELECT SUM(CASE WHEN r.completed_at IS NULL THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN ${needsHandling} THEN 1 ELSE 0 END) AS attention
    FROM reservation r LEFT JOIN submission s ON s.property_id = r.property_id
      AND s.reservation_id = r.reservation_id AND s.guide_version = r.guide_version
    WHERE r.property_id = ? AND r.cancelled_at IS NULL
  `, user.property_id).first();
  return json({
    summary: { pending: summary.pending || 0, attention: summary.attention || 0 },
    reservations: rows.results.slice(0, 50).map(row => ({ ...row,
      urgency: urgency(row.arrival_date, row.completed_at, row.cancelled_at, user.timezone)
    })),
    nextOffset: rows.results.length > 50 ? offset + 50 : null
  });
}

async function csvPreview(env, user, csv) {
  const rows = parseCSV(csv);
  const references = rows.filter(row => !row.error && row.value.externalRef).map(row => row.value.externalRef);
  const existing = await statement(env.DB, `
    SELECT external_ref FROM reservation WHERE property_id = ?
      AND external_ref IN (SELECT value FROM json_each(?))
  `, user.property_id, JSON.stringify(references)).all();
  const registered = new Set(existing.results.map(row => row.external_ref));
  const seen = new Set();
  for (const row of rows) {
    if (row.error) continue;
    const ref = row.value.externalRef;
    if (!ref || seen.has(ref)) row.error = 'REFERENCE_REQUIRED_OR_DUPLICATE';
    else if (registered.has(ref)) row.error = 'REFERENCE_EXISTS';
    seen.add(ref);
  }
  return { rows, valid: rows.every(row => !row.error) };
}

async function register(env, user, body, isCSV = false) {
  if (!/^[a-f0-9-]{36}$/.test(body.operationId || '')) throw new ApiError(422, 'INVALID_INPUT');
  const requestHash = await hash(JSON.stringify(isCSV ? body.csv : body.reservation));
  const previous = await statement(env.DB, 'SELECT request_hash FROM admin_operation WHERE property_id = ? AND operation_id = ?', user.property_id, body.operationId).first();
  if (previous) {
    if (previous.request_hash !== requestHash) throw new ApiError(409, 'OPERATION_CONFLICT');
    return json({ saved: true, duplicate: true });
  }
  let reservations;
  if (isCSV) {
    const preview = await csvPreview(env, user, body.csv);
    if (!preview.valid) return json({ error: 'CSV_ROWS_INVALID', ...preview }, 422);
    reservations = preview.rows.map(row => row.value);
  } else reservations = [reservationInput(body.reservation)];
  const property = await statement(env.DB, 'SELECT current_version FROM property WHERE property_id = ?', user.property_id).first();
  const now = new Date().toISOString();
  const entries = reservations.map(value => ({ ...value, id: crypto.randomUUID(), eventId: crypto.randomUUID() }));
  // Bulk inserts avoid a per-row query count that would exceed a low-cost
  // D1 plan's per-invocation query allowance on a 200-row CSV.
  const serialized = JSON.stringify(entries);
  const tasks = [
    statement(env.DB, 'INSERT INTO admin_operation VALUES (?, ?, ?, ?)', user.property_id, body.operationId, requestHash, now),
    statement(env.DB, `
      INSERT INTO reservation (
        property_id, reservation_id, guest_label, arrival_date, departure_date,
        guide_version, cancelled_at, completed_at, external_ref
      ) SELECT ?, json_extract(value, '$.id'), json_extract(value, '$.guestLabel'),
        json_extract(value, '$.arrivalDate'), json_extract(value, '$.departureDate'),
        ?, NULL, NULL, json_extract(value, '$.externalRef') FROM json_each(?)
    `, user.property_id, property.current_version, serialized),
    statement(env.DB, `
      INSERT INTO audit_event
      SELECT ?, json_extract(value, '$.eventId'), json_extract(value, '$.id'),
        'admin', ?, 'reservation_created', ?, ? FROM json_each(?)
    `, user.property_id, user.user_id, JSON.stringify({ source: isCSV ? 'csv' : 'manual' }), now, serialized)
  ];
  try { await env.DB.batch(tasks); }
  catch {
    const retry = await statement(env.DB, 'SELECT request_hash FROM admin_operation WHERE property_id = ? AND operation_id = ?', user.property_id, body.operationId).first();
    if (retry?.request_hash === requestHash) return json({ saved: true, duplicate: true });
    throw new ApiError(409, 'REGISTRATION_CONFLICT');
  }
  return json({ saved: true, count: reservations.length }, 201);
}

async function reservationDetail(env, user, id) {
  const reservation = await findReservation(env.DB, user, id);
  const answers = await statement(env.DB, `
    SELECT c.*, v.guide_json FROM confirmation c
    JOIN property_version v ON v.property_id = c.property_id AND v.version = c.guide_version
    WHERE c.property_id = ? AND c.reservation_id = ? ORDER BY c.guide_version, c.confirmed_at
  `, user.property_id, id).all();
  const submissions = await statement(env.DB, `
    SELECT s.guide_version, s.arrival_slot, s.notes, s.language, s.needs_attention,
      s.completed_at, v.guide_json FROM submission s JOIN property_version v
      ON v.property_id = s.property_id AND v.version = s.guide_version
    WHERE s.property_id = ? AND s.reservation_id = ? ORDER BY s.guide_version DESC
  `, user.property_id, id).all();
  const notifications = await statement(env.DB, 'SELECT notification_id, guide_version, status, attempts, next_attempt_at, last_code, created_at FROM notification WHERE property_id = ? AND reservation_id = ? ORDER BY created_at DESC', user.property_id, id).all();
  await event(env.DB, user, 'reservation_viewed', id).run();
  return json({ reservation, workflow: await workflowDetail(env.DB, reservation), submissions: submissions.results.map(row => {
    const slot = JSON.parse(row.guide_json).arrivalSlots.find(slot => slot.id === row.arrival_slot);
    const { guide_json, ...submission } = row;
    return { ...submission, arrivalLabel: slot?.label || { ja: row.arrival_slot, en: row.arrival_slot } };
  }), notifications: notifications.results,
    answers: answers.results.map(row => {
      const item = JSON.parse(row.guide_json).items.find(item => item.id === row.item_id);
      const { guide_json, ...answer } = row;
      return { ...answer, item };
    })
  });
}

async function issueToken(env, user, id) {
  const reservation = await findReservation(env.DB, user, id);
  if (reservation.cancelled_at) throw new ApiError(409, 'RESERVATION_CANCELLED');
  const property = await statement(env.DB, 'SELECT slug, timezone FROM property WHERE property_id = ?', user.property_id).first();
  if (property.timezone !== 'Asia/Tokyo') throw new ApiError(503, 'TIMEZONE_CONFIG_REQUIRED');
  const expires = new Date(Date.parse(`${reservation.departure_date}T00:00:00+09:00`) + 2 * 86400000 - 1).toISOString();
  const now = new Date().toISOString();
  if (expires <= now) throw new ApiError(422, 'RESERVATION_EXPIRED');
  const token = randomToken();
  await env.DB.batch([
    statement(env.DB, 'UPDATE guest_token SET revoked_at = ? WHERE property_id = ? AND reservation_id = ? AND revoked_at IS NULL', now, user.property_id, id),
    statement(env.DB, 'INSERT INTO guest_token VALUES (?, ?, ?, ?, NULL)', user.property_id, await hash(token), id, expires),
    event(env.DB, user, 'guest_link_rotated', id)
  ]);
  const profile = await profileFor(env.DB, reservation);
  return json({ url: `${env.APP_ORIGIN}/p/${property.slug}/confirm?lang=${profile.language}#token=${token}`, expiresAt: expires });
}

async function saveSettings(env, user, body) {
  owner(user);
  const input = settingsInput(body);
  const current = await currentSettings(env.DB, user);
  if (current.expectedVersion !== body.expectedVersion) throw new ApiError(409, 'SETTINGS_CHANGED');
  const nextVersion = current.expectedVersion + 1;
  try {
    await env.DB.batch([
      statement(env.DB, 'INSERT INTO property_version VALUES (?, ?, ?, ?)', user.property_id, nextVersion, JSON.stringify(input.guide), new Date().toISOString()),
      statement(env.DB, `
        UPDATE property SET name_json = ?, contact_json = ?, wifi_json = ?,
          notification_email = ?, direct_booking_enabled = ?, direct_booking_url = ?, current_version = ?
        WHERE property_id = ? AND current_version = ?
      `, JSON.stringify(input.name), JSON.stringify(input.contact), JSON.stringify(input.wifi), input.notificationEmail,
      input.directBookingEnabled ? 1 : 0, input.directBookingUrl || null, nextVersion, user.property_id, body.expectedVersion),
      event(env.DB, user, 'settings_updated', null, { fromVersion: body.expectedVersion, toVersion: nextVersion })
    ]);
  } catch { throw new ApiError(409, 'SETTINGS_CHANGED'); }
  return json({ saved: true, version: nextVersion });
}

export async function handleAdmin(request, env) {
  const user = await adminIdentity(request, env);
  await rateLimit(env.DB, env, `admin:${user.user_id}`, user.property_id, 120);
  const path = new URL(request.url).pathname;
  if (request.method === 'GET' && path === '/api/admin/me') {
    return json({ propertyId: user.property_id, properties: user.properties, role: user.role, userId: user.user_id, csrf: await makeAdminCSRF(user, env) });
  }
  if (!['GET', 'HEAD'].includes(request.method)) await checkAdminCSRF(request, user, env);
  const mealPath = path.match(/^\/api\/admin\/reservations\/([a-zA-Z0-9-]{1,80})\/meal$/);
  if (mealPath) return handleAdminMeal(request, env, user, mealPath[1]);
  const workflowResponse = await handleWorkflowAdmin(request, env, user, path);
  if (workflowResponse) return workflowResponse;
  if (path === '/api/admin/reservations' && request.method === 'GET') return listReservations(request, env, user);
  if (path === '/api/admin/reservations' && request.method === 'POST') return register(env, user, await bodyJSON(request));
  if (path === '/api/admin/imports/preview' && request.method === 'POST') {
    const body = await bodyJSON(request, 262144);
    return json(await csvPreview(env, user, body.csv));
  }
  if (path === '/api/admin/imports/commit' && request.method === 'POST') return register(env, user, await bodyJSON(request, 262144), true);
  if (path === '/api/admin/settings' && request.method === 'GET') {
    owner(user);
    await event(env.DB, user, 'settings_viewed').run();
    return json(await currentSettings(env.DB, user));
  }
  if (path === '/api/admin/settings' && request.method === 'PUT') return saveSettings(env, user, await bodyJSON(request, 262144));
  const detail = path.match(/^\/api\/admin\/reservations\/([a-zA-Z0-9-]{1,80})(?:\/(token|reconfirm|cancel))?$/);
  if (detail) {
    const [, id, action] = detail;
    if (!action && request.method === 'GET') return reservationDetail(env, user, id);
    if (request.method === 'POST' && action === 'token') return issueToken(env, user, id);
    if (request.method === 'POST' && action === 'cancel') {
      await findReservation(env.DB, user, id);
      const now = new Date().toISOString();
      await env.DB.batch([
        statement(env.DB, 'UPDATE reservation SET cancelled_at = ? WHERE property_id = ? AND reservation_id = ?', now, user.property_id, id),
        statement(env.DB, 'UPDATE guest_token SET revoked_at = ? WHERE property_id = ? AND reservation_id = ?', now, user.property_id, id),
        event(env.DB, user, 'reservation_cancelled', id)
      ]);
      return json({ saved: true });
    }
    if (request.method === 'POST' && action === 'reconfirm') {
      owner(user);
      const reservation = await findReservation(env.DB, user, id);
      if (reservation.cancelled_at) throw new ApiError(409, 'RESERVATION_CANCELLED');
      const current = await currentSettings(env.DB, user);
      if (reservation.guide_version === current.expectedVersion) throw new ApiError(409, 'ALREADY_CURRENT');
      await env.DB.batch([
        statement(env.DB, 'UPDATE reservation SET guide_version = ?, completed_at = NULL WHERE property_id = ? AND reservation_id = ? AND cancelled_at IS NULL', current.expectedVersion, user.property_id, id),
        event(env.DB, user, 'reconfirmation_requested', id, { version: current.expectedVersion })
      ]);
      return json({ saved: true });
    }
  }
  if (path === '/api/admin/audit' && request.method === 'GET') {
    const offset = Number(new URL(request.url).searchParams.get('offset') || 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 100000) throw new ApiError(422, 'INVALID_INPUT');
    const events = await statement(env.DB, 'SELECT event_id, reservation_id, actor_kind, actor_ref, event_type, metadata_json, created_at FROM audit_event WHERE property_id = ? ORDER BY created_at DESC, event_id LIMIT 51 OFFSET ?', user.property_id, offset).all();
    return json({ events: events.results.slice(0, 50), nextOffset: events.results.length > 50 ? offset + 50 : null });
  }
  const retry = path.match(/^\/api\/admin\/notifications\/([a-f0-9-]{36})\/retry$/);
  if (retry && request.method === 'POST') {
    const job = await statement(env.DB, 'SELECT * FROM notification WHERE property_id = ? AND notification_id = ?', user.property_id, retry[1]).first();
    if (!job) throw new ApiError(404, 'NOT_FOUND');
    const reservation = await findReservation(env.DB, user, job.reservation_id);
    if (reservation.cancelled_at || !reservation.completed_at || reservation.guide_version !== job.guide_version) {
      throw new ApiError(409, 'NOTIFICATION_REVIEW_REQUIRED');
    }
    if (!['failed', 'pending', 'processing'].includes(job.status) || job.attempts >= 5 ||
      (job.status === 'processing' && job.lease_until > new Date().toISOString()) ||
      Date.now() - Date.parse(job.created_at) >= 23 * 3600000) throw new ApiError(409, 'NOTIFICATION_REVIEW_REQUIRED');
    await statement(env.DB, 'UPDATE notification SET next_attempt_at = ? WHERE property_id = ? AND notification_id = ?', new Date().toISOString(), user.property_id, retry[1]).run();
    await event(env.DB, user, 'notification_retry_requested', job.reservation_id).run();
    await dispatchNotification(env, user.property_id, retry[1]);
    const updated = await statement(env.DB, 'SELECT status, last_code FROM notification WHERE property_id = ? AND notification_id = ?', user.property_id, retry[1]).first();
    return json(updated);
  }
  throw new ApiError(404, 'NOT_FOUND');
}
