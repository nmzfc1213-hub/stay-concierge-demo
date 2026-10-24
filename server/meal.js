import '../public/assets/meal-model.js';
import { ApiError, bodyJSON, json } from './security.js';
import { statement } from './repository.js';
const M = globalThis.StayMealModel;
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

async function booking(db, identity) {
  const r = await statement(db, `SELECT r.*, p.demo FROM reservation r JOIN property p ON p.property_id = r.property_id
    WHERE r.property_id = ? AND r.reservation_id = ?`, identity.property_id, identity.reservation_id).first();
  if (!r) throw new ApiError(404, 'NOT_FOUND');
  if (!r.demo) throw new ApiError(403, 'MEAL_DEMO_ONLY');
  if (r.cancelled_at) throw new ApiError(410, 'RESERVATION_CANCELLED');
  return r;
}

export async function readMeal(db, identity, now = new Date().toISOString()) {
  // Expired demo data is excluded and erased on the next access for this booking.
  await statement(db, 'DELETE FROM meal_response WHERE property_id = ? AND reservation_id = ? AND expires_at <= ?',
    identity.property_id, identity.reservation_id, now).run();
  const row = await statement(db, `SELECT * FROM meal_response WHERE property_id = ? AND reservation_id = ? AND guide_version = ?`,
    identity.property_id, identity.reservation_id, identity.guide_version).first();
  if (!row) return { status: 'unanswered', revision: 0, submitted: null };
  const submitted = { answers: JSON.parse(row.answers_json), submittedAt: row.submitted_at, demoDate: row.demo_date };
  return { status: M.status({ submitted }), revision: row.revision, submitted, expiresAt: row.expires_at };
}

export function validateMeal(body, arrival) {
  if (!body || Object.keys(body).some(k => !['answers', 'consent', 'demoDate', 'version', 'expectedRevision'].includes(k)) ||
      !Number.isInteger(body.expectedRevision) || body.expectedRevision < 0 || !date(body.demoDate)) throw new ApiError(422, 'INVALID_INPUT');
  const d = body.answers;
  try {
    if (!d || JSON.stringify(d).length > 20000) throw new Error();
    const allowed = Object.keys(M.fresh());
    if (Object.keys(d).some(k => !allowed.includes(k)) || allowed.some(k => !(k in d))) throw new Error();
    for (const key of ['categories', 'allergens', 'avoided']) {
      if (!Array.isArray(d[key]) || d[key].length > 12 || new Set(d[key]).size !== d[key].length || d[key].some(v => typeof v !== 'string')) throw new Error();
    }
    for (const key of ['allergenOther', 'pregnancyOther', 'beliefOther', 'other', 'final']) {
      if (typeof d[key] !== 'string' || d[key].length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(d[key])) throw new Error();
    }
    for (const key of ['allergy', 'pregnancy', 'hidden']) {
      if (!d[key] || typeof d[key] !== 'object' || Array.isArray(d[key])) throw new Error();
    }
    if (d.categories.some(k => !Object.hasOwn(M.categories, k)) || d.allergens.some(k => !Object.hasOwn(M.allergens, k)) ||
        d.avoided.some(k => !M.avoided.some(v => v[0] === k))) throw new Error();
    if (d.allergens.includes('other') && !d.allergenOther.trim() || d.avoided.includes('other') && !d.beliefOther.trim()) throw new Error();
    // Reject arbitrary nested free text and prototype-like keys, including inactive branches.
    for (const [key, value] of Object.entries(d.pregnancy)) if (!M.pregnancy.some(v => v[0] === key) || !['avoid', 'okay'].includes(value)) throw new Error();
    for (const [key, value] of Object.entries(d.hidden)) if (!M.hidden.some(v => v[0] === key) || !['allowed', 'notAllowed', 'unknown'].includes(value)) throw new Error();
    for (const [allergen, answers] of Object.entries(d.allergy)) {
      if (!Object.hasOwn(M.allergens, allergen) || !answers || typeof answers !== 'object' || Array.isArray(answers)) throw new Error();
      for (const [key, value] of Object.entries(answers)) {
        if (key === 'foods') {
          if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
          for (const [food, answer] of Object.entries(value)) if (!(M.foods[allergen] || []).some(v => v[0] === food) || !['avoid', 'okay', 'unknown'].includes(answer)) throw new Error();
        } else if (!['severity', 'trace', 'stock', 'processed'].includes(key) ||
          !(key === 'severity' ? ['mild', 'severe', 'anaphylaxis'] : ['allowed', 'notAllowed', 'unknown']).includes(value)) throw new Error();
      }
    }
    const result = M.submit(d, arrival, body.demoDate, body.consent === true);
    if (result.error) throw new ApiError(422, result.error === 'expired' ? 'MEAL_DEADLINE' : 'MEAL_INCOMPLETE');
    return result;
  } catch (e) { if (e instanceof ApiError) throw e; throw new ApiError(422, 'INVALID_MEAL'); }
}

export async function handleGuestMeal(request, env, identity, now) {
  const r = await booking(env.DB, identity);
  if (request.method === 'GET') return json(await readMeal(env.DB, identity, now));
  if (request.method !== 'PUT') throw new ApiError(405, 'METHOD_NOT_ALLOWED');
  const body = await bodyJSON(request);
  if (body.version !== r.guide_version) throw new ApiError(409, 'GUIDE_CHANGED');
  const value = validateMeal(body, r.arrival_date);
  const current = await readMeal(env.DB, identity, now);
  if (body.expectedRevision !== current.revision) throw new ApiError(409, 'MEAL_CHANGED');
  const expiry = new Date(Date.parse(now) + 7 * 86400000).toISOString();
  try {
    const results = await env.DB.batch([
      statement(env.DB, `INSERT INTO meal_response VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT (property_id, reservation_id, guide_version) DO UPDATE SET
        answers_json = excluded.answers_json, demo_date = excluded.demo_date, submitted_at = excluded.submitted_at,
        expires_at = excluded.expires_at, revision = meal_response.revision + 1 WHERE meal_response.revision = ? RETURNING revision`,
        identity.property_id, identity.reservation_id, r.guide_version, JSON.stringify(value.answers), body.demoDate, now, expiry, 'demo-v1', body.expectedRevision)
    ]);
    if (!results[0].results.length) throw new ApiError(409, 'MEAL_CHANGED');
  } catch(e) { if (e instanceof ApiError) throw e; throw new ApiError(409, 'MEAL_CHANGED'); }
  return json(await readMeal(env.DB, identity, now));
}

export async function handleAdminMeal(request, env, user, id) {
  const r = await booking(env.DB, { ...user, reservation_id: id });
  if (request.method === 'GET') return json(await readMeal(env.DB, r));
  if (request.method === 'DELETE') {
    if (user.role !== 'owner') throw new ApiError(403, 'OWNER_REQUIRED');
    await env.DB.batch([
      statement(env.DB, 'DELETE FROM meal_response WHERE property_id = ? AND reservation_id = ?', user.property_id, id),
      statement(env.DB, `INSERT INTO audit_event VALUES (?, ?, ?, 'admin', ?, 'meal_demo_deleted', '{}', ?)`,
        user.property_id, crypto.randomUUID(), id, user.user_id, new Date().toISOString())
    ]);
    return json({ deleted: true });
  }
  throw new ApiError(405, 'METHOD_NOT_ALLOWED');
}
