import { ApiError, cookies, hash } from './security.js';
import { guestRequests, profileFor, relevantGuide } from './workflow.js';

export function statement(db, sql, ...args) {
  return db.prepare(sql).bind(...args);
}

export function audit(db, identity, event, metadata, now) {
  return statement(db, `
    INSERT INTO audit_event VALUES (?, ?, ?, 'guest', ?, ?, ?, ?)
  `, identity.property_id, crypto.randomUUID(), identity.reservation_id,
  identity.reservation_id, event, JSON.stringify(metadata), now);
}

export async function tokenIdentity(db, tokenHash, now) {
  const row = await statement(db, `
    SELECT t.*, r.guide_version, r.cancelled_at, r.completed_at
    FROM guest_token t JOIN reservation r
      ON r.property_id = t.property_id AND r.reservation_id = t.reservation_id
    WHERE t.token_hash = ?
  `, tokenHash).first();
  if (!row) throw new ApiError(404, 'LINK_INVALID');
  if (row.revoked_at || row.cancelled_at || row.expires_at <= now) throw new ApiError(410, 'LINK_EXPIRED');
  return row;
}

export async function sessionIdentity(db, request, now) {
  const raw = cookies(request)['__Host-sc_session'];
  if (!raw || !/^[a-f0-9]{64}$/.test(raw)) throw new ApiError(401, 'SESSION_REQUIRED');
  const row = await statement(db, `
    SELECT s.*, r.guide_version, r.completed_at, r.cancelled_at,
      t.expires_at AS token_expires_at, t.revoked_at
    FROM guest_session s
    JOIN guest_token t ON t.property_id = s.property_id AND t.token_hash = s.token_hash
      AND t.reservation_id = s.reservation_id
    JOIN reservation r ON r.property_id = s.property_id AND r.reservation_id = s.reservation_id
    WHERE s.session_hash = ?
  `, await hash(raw)).first();
  if (!row) throw new ApiError(401, 'SESSION_REQUIRED');
  if (row.revoked_at || row.cancelled_at || row.expires_at <= now || row.token_expires_at <= now) {
    throw new ApiError(410, 'LINK_EXPIRED');
  }
  if (!['GET', 'HEAD'].includes(request.method)) {
    const csrf = request.headers.get('x-csrf-token') || '';
    if (await hash(csrf) !== row.csrf_hash) throw new ApiError(403, 'CSRF_REJECTED');
  }
  return row;
}

export async function contextFor(db, identity) {
  const profile = await profileFor(db, identity);
  const row = await statement(db, `
    SELECT p.*, r.guest_label, r.arrival_date, r.departure_date, v.guide_json
    FROM reservation r
    JOIN property p ON p.property_id = r.property_id
    JOIN property_version v ON v.property_id = r.property_id AND v.version = r.guide_version
    WHERE r.property_id = ? AND r.reservation_id = ?
  `, identity.property_id, identity.reservation_id).first();
  if (!row) throw new ApiError(404, 'NOT_FOUND');
  const answers = await statement(db, `
    SELECT item_id, language, confirmed_at FROM confirmation
    WHERE property_id = ? AND reservation_id = ? AND guide_version = ?
  `, identity.property_id, identity.reservation_id, identity.guide_version).all();
  return {
    property: {
      name: JSON.parse(row.name_json), contact: JSON.parse(row.contact_json),
      wifi: JSON.parse(row.wifi_json), demo: Boolean(row.demo)
    },
    reservation: {
      guestLabel: row.guest_label, arrivalDate: row.arrival_date,
      departureDate: row.departure_date, completedAt: identity.completed_at
    },
    version: identity.guide_version,
    guide: relevantGuide(JSON.parse(row.guide_json), profile),
    profile,
    requests: await guestRequests(db, identity),
    answers: answers.results
  };
}

export async function receiptFor(db, identity) {
  const row = await statement(db, `
    SELECT s.request_id, s.completed_at, s.arrival_slot, s.notes, s.language,
      n.status AS notification_status, p.direct_booking_enabled, p.direct_booking_url
    FROM submission s JOIN property p ON p.property_id = s.property_id
    LEFT JOIN notification n ON n.property_id = s.property_id
      AND n.reservation_id = s.reservation_id AND n.guide_version = s.guide_version
    WHERE s.property_id = ? AND s.reservation_id = ? AND s.guide_version = ?
  `, identity.property_id, identity.reservation_id, identity.guide_version).first();
  if (!row) return { completed: false };
  return {
    completed: true, requestId: row.request_id, completedAt: row.completed_at,
    arrivalSlot: row.arrival_slot, notes: row.notes,
    notificationStatus: row.notification_status,
    directBookingUrl: row.direct_booking_enabled && /^https:\/\//.test(row.direct_booking_url || '')
      ? row.direct_booking_url : null
  };
}
