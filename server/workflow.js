import { ApiError, bodyJSON, hash, json, validLanguage } from './security.js';
import { statement } from './repository.js';
import { text } from './admin-validation.js';

const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);

function keys(body, allowed) {
  if (Object.keys(body).some(key => !allowed.includes(key))) throw new ApiError(422, 'INVALID_INPUT');
}

export async function profileFor(db, identity) {
  const row = await statement(db, `SELECT language, dinner, late_arrival, revision FROM stay_profile
    WHERE property_id = ? AND reservation_id = ? AND guide_version = ?`,
  identity.property_id, identity.reservation_id, identity.guide_version).first();
  return row ? { language: row.language, dinner: Boolean(row.dinner), lateArrival: Boolean(row.late_arrival), revision: row.revision }
    : { language: 'ja', dinner: false, lateArrival: false, revision: 0 };
}

export function relevantGuide(guide, profile) {
  const applies = item => item.audience === 'dinner' ? profile.dinner : item.audience === 'late' ? profile.lateArrival : true;
  return { ...guide, items: guide.items.filter(applies), ...(guide.info ? { info: guide.info.filter(applies) } : {}) };
}

async function reservationFor(db, user, id) {
  const row = await statement(db, 'SELECT * FROM reservation WHERE property_id = ? AND reservation_id = ?', user.property_id, id).first();
  if (!row) throw new ApiError(404, 'NOT_FOUND');
  return row;
}

async function guideFor(db, reservation) {
  const row = await statement(db, 'SELECT guide_json FROM property_version WHERE property_id = ? AND version = ?',
    reservation.property_id, reservation.guide_version).first();
  return relevantGuide(JSON.parse(row.guide_json), await profileFor(db, reservation));
}

function staffEvent(db, user, id, event, metadata = {}) {
  return statement(db, 'INSERT INTO audit_event VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    user.property_id, crypto.randomUUID(), id, 'admin', user.user_id, event, JSON.stringify(metadata), new Date().toISOString());
}

export async function workflowDetail(db, reservation) {
  const profile = await profileFor(db, reservation);
  const guide = await guideFor(db, reservation);
  const oral = await statement(db, `SELECT * FROM oral_confirmation
    WHERE property_id = ? AND reservation_id = ? ORDER BY confirmed_at`, reservation.property_id, reservation.reservation_id).all();
  return { profile, relevantItems: guide.items, oral: oral.results };
}

export async function guestRequests(db, identity) {
  // Staff-only notes and assignee identities are never returned to guests.
  const rows = await statement(db, `SELECT request_id, item_id, guide_version, message, language, status, created_at
    FROM service_request WHERE property_id = ? AND reservation_id = ?
    ORDER BY created_at DESC LIMIT 30`, identity.property_id, identity.reservation_id).all();
  return rows.results;
}

export async function createGuestRequest(request, env, identity, now) {
  const body = await bodyJSON(request);
  keys(body, ['requestId', 'version', 'itemId', 'message', 'language']);
  if (!uuid(body.requestId)) throw new ApiError(422, 'INVALID_INPUT');
  if (body.version !== identity.guide_version) throw new ApiError(409, 'GUIDE_CHANGED');
  const message = text(body.message, 2000);
  const language = validLanguage(body.language);
  const guide = await guideFor(env.DB, identity);
  if (body.itemId != null && (typeof body.itemId !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(body.itemId))) throw new ApiError(422, 'INVALID_ITEM');
  const itemId = body.itemId || null;
  if (itemId && !guide.items.some(item => item.id === itemId)) throw new ApiError(422, 'INVALID_ITEM');
  const payloadHash = await hash(JSON.stringify({ message, language, itemId, version: body.version }));
  const existing = await statement(env.DB, `SELECT request_id, payload_hash FROM service_request
    WHERE property_id = ? AND reservation_id = ? AND client_request_id = ?`,
  identity.property_id, identity.reservation_id, body.requestId).first();
  if (existing) {
    if (existing.payload_hash !== payloadHash) throw new ApiError(409, 'REQUEST_CHANGED');
    return json({ saved: true, requestId: existing.request_id });
  }
  const id = crypto.randomUUID();
  try {
    await env.DB.batch([
      statement(env.DB, `INSERT INTO service_request (
        property_id, request_id, reservation_id, guide_version, item_id, client_request_id,
        payload_hash, message, language, created_at, updated_at
      ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE
        (SELECT COUNT(*) FROM service_request WHERE property_id = ? AND reservation_id = ?) < 30
        AND EXISTS (SELECT 1 FROM reservation WHERE property_id = ? AND reservation_id = ?
          AND guide_version = ? AND cancelled_at IS NULL) RETURNING request_id`,
      identity.property_id, id, identity.reservation_id, identity.guide_version, itemId,
      body.requestId, payloadHash, message, language, now, now,
      identity.property_id, identity.reservation_id, identity.property_id, identity.reservation_id, identity.guide_version),
      statement(env.DB, `INSERT INTO audit_event SELECT ?, ?, ?, 'guest', ?, 'guest_question_created', ?, ?
        WHERE EXISTS (SELECT 1 FROM service_request WHERE property_id = ? AND request_id = ?)`,
      identity.property_id, crypto.randomUUID(), identity.reservation_id, identity.reservation_id,
      JSON.stringify({ requestId: id, version: identity.guide_version }), now, identity.property_id, id)
    ]);
  } catch {
    const duplicate = await statement(env.DB, `SELECT request_id, payload_hash FROM service_request
      WHERE property_id = ? AND reservation_id = ? AND client_request_id = ?`,
    identity.property_id, identity.reservation_id, body.requestId).first();
    if (duplicate?.payload_hash === payloadHash) return json({ saved: true, requestId: duplicate.request_id });
    throw new ApiError(409, 'REQUEST_CHANGED');
  }
  const saved = await statement(env.DB, 'SELECT request_id FROM service_request WHERE property_id = ? AND request_id = ?', identity.property_id, id).first();
  if (!saved) throw new ApiError(409, 'REQUEST_LIMIT_OR_CHANGED');
  return json({ saved: true, requestId: id }, 201);
}

export function completionTask(db, identity, message, language, payloadHash, now) {
  return statement(db, `INSERT INTO service_request (
    property_id, request_id, reservation_id, guide_version, client_request_id, payload_hash,
    message, language, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  identity.property_id, crypto.randomUUID(), identity.reservation_id, identity.guide_version,
  `completion:${identity.guide_version}`, payloadHash, message, language, now, now);
}

async function saveProfile(request, env, user, id) {
  const reservation = await reservationFor(env.DB, user, id);
  if (reservation.cancelled_at || reservation.completed_at) throw new ApiError(409, 'PROFILE_LOCKED');
  const body = await bodyJSON(request);
  keys(body, ['expectedRevision', 'language', 'dinner', 'lateArrival']);
  const language = validLanguage(body.language);
  if (!Number.isInteger(body.expectedRevision) || body.expectedRevision < 0 || typeof body.dinner !== 'boolean' || typeof body.lateArrival !== 'boolean') throw new ApiError(422, 'INVALID_INPUT');
  const current = await profileFor(env.DB, reservation);
  if (current.revision !== body.expectedRevision) throw new ApiError(409, 'WORK_CHANGED');
  const updateId = crypto.randomUUID();
  try {
    const result = await env.DB.batch([
      statement(env.DB, `INSERT INTO stay_profile VALUES (?, ?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT (property_id, reservation_id, guide_version) DO UPDATE SET
          language = excluded.language, dinner = excluded.dinner, late_arrival = excluded.late_arrival,
          revision = stay_profile.revision + 1, update_id = excluded.update_id
          WHERE stay_profile.revision = ? RETURNING revision`,
      user.property_id, id, reservation.guide_version, language, body.dinner ? 1 : 0, body.lateArrival ? 1 : 0, updateId, body.expectedRevision),
      statement(env.DB, `INSERT INTO audit_event SELECT ?, ?, ?, 'admin', ?, 'stay_profile_configured', ?, ?
        WHERE EXISTS (SELECT 1 FROM stay_profile WHERE property_id = ? AND reservation_id = ?
          AND guide_version = ? AND update_id = ?)`, user.property_id, crypto.randomUUID(), id,
      user.user_id, JSON.stringify({ version: reservation.guide_version }), new Date().toISOString(),
      user.property_id, id, reservation.guide_version, updateId)
    ]);
    if (!result[0].results.length) throw new ApiError(409, 'WORK_CHANGED');
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(409, 'PROFILE_LOCKED');
  }
  return json({ saved: true, profile: await profileFor(env.DB, reservation) });
}

async function oralConfirmation(request, env, user, id) {
  const reservation = await reservationFor(env.DB, user, id);
  if (reservation.cancelled_at) throw new ApiError(409, 'RESERVATION_CANCELLED');
  const body = await bodyJSON(request);
  keys(body, ['version', 'itemId', 'note']);
  const note = text(body.note, 2000);
  const guide = await guideFor(env.DB, reservation);
  if (body.version !== reservation.guide_version) throw new ApiError(409, 'GUIDE_CHANGED');
  if (!guide.items.some(item => item.id === body.itemId)) throw new ApiError(422, 'INVALID_ITEM');
  const now = new Date().toISOString();
  await env.DB.batch([
    statement(env.DB, `INSERT INTO oral_confirmation SELECT ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM reservation WHERE property_id = ? AND reservation_id = ?
        AND guide_version = ? AND cancelled_at IS NULL)
      ON CONFLICT (property_id, reservation_id, guide_version, item_id) DO NOTHING`,
    user.property_id, id, body.version, body.itemId, user.user_id, note, now,
    user.property_id, id, body.version),
    staffEvent(env.DB, user, id, 'staff_oral_explanation_recorded', { itemId: body.itemId, version: body.version })
  ]);
  const row = await statement(env.DB, `SELECT * FROM oral_confirmation WHERE property_id = ? AND reservation_id = ?
    AND guide_version = ? AND item_id = ?`, user.property_id, id, body.version, body.itemId).first();
  if (!row) throw new ApiError(409, 'GUIDE_CHANGED');
  return json({ saved: true, oral: row });
}

async function board(request, env, user) {
  const params = new URL(request.url).searchParams;
  const filter = params.get('filter') || 'active';
  const offset = Number(params.get('offset') || 0);
  if (!['active', 'all', 'mine'].includes(filter) || !Number.isInteger(offset) || offset < 0 || offset > 100000) throw new ApiError(422, 'INVALID_INPUT');
  const rows = await statement(env.DB, `SELECT q.*, r.guest_label, r.arrival_date, r.cancelled_at,
      r.guide_version AS current_guide_version
    FROM service_request q JOIN reservation r ON r.property_id = q.property_id AND r.reservation_id = q.reservation_id
    WHERE q.property_id = ? AND (? = 'all' OR q.status != 'resolved')
      AND (? != 'mine' OR q.assigned_to = ?)
    ORDER BY CASE q.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
      r.arrival_date, q.created_at, q.request_id LIMIT 51 OFFSET ?`, user.property_id, filter, filter, user.user_id, offset).all();
  const ids = rows.results.slice(0, 50).map(row => row.request_id);
  const notes = await statement(env.DB, `SELECT * FROM staff_note WHERE property_id = ?
    AND request_id IN (SELECT value FROM json_each(?)) ORDER BY created_at, note_id`, user.property_id, JSON.stringify(ids)).all();
  const staff = await statement(env.DB, `SELECT user_id, role FROM admin_user WHERE property_id = ? AND active = 1 ORDER BY user_id`, user.property_id).all();
  await staffEvent(env.DB, user, null, 'workboard_viewed').run();
  return json({ requests: rows.results.slice(0, 50).map(row => ({ ...row, notes: notes.results.filter(note => note.request_id === row.request_id) })),
    staff: staff.results, currentUserId: user.user_id, nextOffset: rows.results.length > 50 ? offset + 50 : null });
}

async function updateRequest(request, env, user, id) {
  const row = await statement(env.DB, 'SELECT * FROM service_request WHERE property_id = ? AND request_id = ?', user.property_id, id).first();
  if (!row) throw new ApiError(404, 'NOT_FOUND');
  const body = await bodyJSON(request);
  keys(body, ['expectedRevision', 'status', 'assignedTo', 'note']);
  const note = text(body.note, 2000);
  if (!Number.isInteger(body.expectedRevision) || body.expectedRevision !== row.revision || !['open', 'in_progress', 'resolved'].includes(body.status)) throw new ApiError(409, 'WORK_CHANGED');
  if (body.assignedTo !== null && (typeof body.assignedTo !== 'string' || !body.assignedTo)) throw new ApiError(422, 'INVALID_ASSIGNEE');
  const assigned = body.assignedTo;
  if (assigned !== null && (typeof assigned !== 'string' || !await statement(env.DB,
    'SELECT user_id FROM admin_user WHERE property_id = ? AND user_id = ? AND active = 1', user.property_id, assigned).first())) throw new ApiError(422, 'INVALID_ASSIGNEE');
  if (body.status !== 'open' && !assigned) throw new ApiError(422, 'ASSIGNEE_REQUIRED');
  const now = new Date().toISOString(), updateId = crypto.randomUUID();
  const results = await env.DB.batch([
    statement(env.DB, `UPDATE service_request SET status = ?, assigned_to = ?, revision = revision + 1,
      update_id = ?, updated_at = ? WHERE property_id = ? AND request_id = ? AND revision = ? RETURNING request_id`,
    body.status, assigned, updateId, now, user.property_id, id, body.expectedRevision),
    statement(env.DB, `INSERT INTO staff_note SELECT ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM service_request WHERE property_id = ? AND request_id = ? AND update_id = ?)`,
    user.property_id, crypto.randomUUID(), id, user.user_id, note, now, user.property_id, id, updateId),
    statement(env.DB, `INSERT INTO audit_event SELECT ?, ?, ?, 'admin', ?, 'service_request_updated', ?, ?
      WHERE EXISTS (SELECT 1 FROM service_request WHERE property_id = ? AND request_id = ? AND update_id = ?)`,
    user.property_id, crypto.randomUUID(), row.reservation_id, user.user_id,
    JSON.stringify({ requestId: id, status: body.status, assignedTo: assigned }), now, user.property_id, id, updateId)
  ]);
  if (!results[0].results.length) throw new ApiError(409, 'WORK_CHANGED');
  return json({ saved: true, revision: body.expectedRevision + 1 });
}

export async function handleWorkflowAdmin(request, env, user, path) {
  if (path === '/api/admin/workboard' && request.method === 'GET') return board(request, env, user);
  const task = path.match(/^\/api\/admin\/requests\/([a-f0-9-]{36})$/);
  if (task && request.method === 'PUT') return updateRequest(request, env, user, task[1]);
  const reservation = path.match(/^\/api\/admin\/reservations\/([a-zA-Z0-9-]{1,80})\/(profile|oral)$/);
  if (reservation && request.method === 'PUT' && reservation[2] === 'profile') return saveProfile(request, env, user, reservation[1]);
  if (reservation && request.method === 'POST' && reservation[2] === 'oral') return oralConfirmation(request, env, user, reservation[1]);
}
