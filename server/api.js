import { handleGuestMeal } from './meal.js';
import { handleAdmin } from './admin-api.js';
import {
  ApiError, bodyJSON, checkOrigin, hash, json, randomToken,
  rateLimit, secure, validLanguage
} from './security.js';
import { audit, contextFor, receiptFor, sessionIdentity, statement, tokenIdentity } from './repository.js';
import { dispatchNotification } from './notifications.js';
import { completionTask, createGuestRequest, guestRequests } from './workflow.js';

const COOKIE_AGE = 7200;

function onlyKeys(value, allowed) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new ApiError(422, 'INVALID_INPUT');
}

function versionCheck(value, identity) {
  if (!Number.isInteger(value) || value !== identity.guide_version) throw new ApiError(409, 'GUIDE_CHANGED');
}

async function exchange(request, env, now) {
  const body = await bodyJSON(request);
  onlyKeys(body, ['token', 'property']);
  if (!/^[a-f0-9]{64}$/.test(body.token || '') || !/^[a-z0-9-]{1,40}$/.test(body.property || '')) {
    throw new ApiError(404, 'LINK_INVALID');
  }
  const identity = await tokenIdentity(env.DB, await hash(body.token), now);
  const property = await statement(env.DB, 'SELECT slug FROM property WHERE property_id = ?', identity.property_id).first();
  if (property.slug !== body.property) throw new ApiError(404, 'LINK_INVALID');
  const session = randomToken();
  const csrf = randomToken();
  const expires = new Date(Math.min(Date.parse(identity.expires_at), Date.parse(now) + COOKIE_AGE * 1000)).toISOString();
  await statement(env.DB, `INSERT INTO guest_session VALUES (?, ?, ?, ?, ?, ?)`,
    identity.property_id, await hash(session), identity.reservation_id,
    identity.token_hash, await hash(csrf), expires).run();
  return json({ csrf }, 200, {
    'Set-Cookie': `__Host-sc_session=${session}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.max(0, Math.floor((Date.parse(expires) - Date.parse(now)) / 1000))}`
  });
}

async function answer(request, env, identity, itemId, now) {
  if (identity.completed_at) throw new ApiError(409, 'ALREADY_COMPLETED');
  const body = await bodyJSON(request);
  onlyKeys(body, ['version', 'language', 'answer']);
  versionCheck(body.version, identity);
  const language = validLanguage(body.language);
  if (body.answer !== true) throw new ApiError(422, 'INVALID_INPUT');
  const context = await contextFor(env.DB, identity);
  if (!context.guide.items.some(item => item.id === itemId)) throw new ApiError(422, 'INVALID_ITEM');
  await env.DB.batch([
    statement(env.DB, `
      INSERT INTO confirmation VALUES (?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT (property_id, reservation_id, guide_version, item_id)
      DO NOTHING
    `, identity.property_id, identity.reservation_id, identity.guide_version, itemId, language, now),
    audit(env.DB, identity, 'item_acknowledged', { itemId, version: identity.guide_version }, now)
  ]);
  return json({ saved: true });
}

async function complete(request, env, identity, now, waitUntil) {
  const body = await bodyJSON(request);
  onlyKeys(body, ['version', 'language', 'arrivalSlot', 'notes', 'requestId']);
  versionCheck(body.version, identity);
  const language = validLanguage(body.language);
  if (typeof body.notes !== 'string' || !body.notes.trim() || body.notes.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body.notes)) {
    throw new ApiError(422, 'NOTES_REQUIRED');
  }
  if (!/^[a-f0-9-]{36}$/.test(body.requestId || '')) throw new ApiError(422, 'INVALID_INPUT');
  const context = await contextFor(env.DB, identity);
  const selectedSlot = context.guide.arrivalSlots.find(slot => slot.id === body.arrivalSlot);
  if (!selectedSlot) throw new ApiError(422, 'INVALID_ARRIVAL');
  const notes = body.notes.trim();
  const payloadHash = await hash(JSON.stringify({ version: body.version, language, arrivalSlot: body.arrivalSlot, notes }));
  const existing = await statement(env.DB, `
    SELECT request_id, payload_hash FROM submission
    WHERE property_id = ? AND reservation_id = ? AND guide_version = ?
  `, identity.property_id, identity.reservation_id, identity.guide_version).first();
  if (existing) {
    if (existing.request_id !== body.requestId || existing.payload_hash !== payloadHash) {
      throw new ApiError(409, 'ALREADY_COMPLETED');
    }
    return json(await receiptFor(env.DB, identity));
  }
  if (!context.guide.items.every(item => context.answers.some(answer => answer.item_id === item.id))) {
    throw new ApiError(422, 'ANSWERS_MISSING');
  }
  const arrivalNeedsContact = body.arrivalSlot === 'late' || selectedSlot.requiresContact === true;
  const attention = !['なし', 'none', 'no', '特になし'].includes(notes.toLowerCase()) || arrivalNeedsContact;
  const notificationId = crypto.randomUUID();
  try {
    await env.DB.batch([
      statement(env.DB, `INSERT INTO submission VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        identity.property_id, identity.reservation_id, identity.guide_version,
        body.requestId, payloadHash, body.arrivalSlot, notes, language, attention ? 1 : 0, now),
      statement(env.DB, `
        UPDATE reservation SET completed_at = ?
        WHERE property_id = ? AND reservation_id = ? AND guide_version = ? AND completed_at IS NULL
      `, now, identity.property_id, identity.reservation_id, identity.guide_version),
      statement(env.DB, `
        INSERT INTO notification (
          property_id, notification_id, reservation_id, guide_version,
          status, next_attempt_at, created_at
        ) VALUES (?, ?, ?, ?, 'pending', ?, ?)
      `, identity.property_id, notificationId, identity.reservation_id, identity.guide_version, now, now),
      audit(env.DB, identity, 'confirmation_completed', { version: identity.guide_version, needsAttention: attention }, now),
      ...(attention ? [completionTask(env.DB, identity,
        `${body.arrivalSlot === 'late' ? (language === 'ja' ? '夜間到着希望。' : 'Late arrival requested. ')
          : arrivalNeedsContact ? (language === 'ja' ? '到着時刻の相談が必要です。' : 'Arrival time needs staff review. ') : ''}${notes}`,
        language, payloadHash, now)] : [])
    ]);
  } catch {
    // A concurrent duplicate may already have committed. Do not write a
    // second receipt or notification; check the committed result first.
    const winner = await statement(env.DB, `
      SELECT request_id, payload_hash FROM submission
      WHERE property_id = ? AND reservation_id = ? AND guide_version = ?
    `, identity.property_id, identity.reservation_id, identity.guide_version).first();
    if (winner?.request_id === body.requestId && winner.payload_hash === payloadHash) {
      return json(await receiptFor(env.DB, identity));
    }
    throw new ApiError(409, 'RETRY_REVIEW');
  }
  if (waitUntil) waitUntil(dispatchNotification(env, identity.property_id, notificationId).catch(() => {}));
  else await dispatchNotification(env, identity.property_id, notificationId);
  return json(await receiptFor(env.DB, identity), 201);
}

export async function handleApi(request, env, waitUntil) {
  try {
    if (!env.DB) throw new ApiError(503, 'CONFIG_REQUIRED');
    checkOrigin(request, env);
    const path = new URL(request.url).pathname;
    const ip = request.headers.get('CF-Connecting-IP') || 'local-unknown';
    await rateLimit(env.DB, env, `ip:${ip}`, '__public__', path === '/api/guest/session' ? 15 : 120);
    const now = new Date().toISOString();
    if (path.startsWith('/api/admin/')) return secure(await handleAdmin(request, env));
    if (path === '/api/guest/session' && request.method === 'POST') return secure(await exchange(request, env, now));
    const knownRead = ['/api/guest/csrf', '/api/guest/context', '/api/guest/review', '/api/guest/receipt', '/api/guest/requests', '/api/guest/meal'];
    const knownWrite = path === '/api/guest/meal' || path === '/api/guest/complete' || path === '/api/guest/requests' || /^\/api\/guest\/answers\/[a-z0-9-]{1,40}$/.test(path);
    if (!knownRead.includes(path) && !knownWrite) throw new ApiError(404, 'NOT_FOUND');
    const identity = await sessionIdentity(env.DB, request, now);
    await rateLimit(env.DB, env, `reservation:${identity.reservation_id}`, identity.property_id, 90);
    if (path === '/api/guest/csrf' && request.method === 'GET') {
      const csrf = randomToken();
      await statement(env.DB, `UPDATE guest_session SET csrf_hash = ? WHERE property_id = ? AND session_hash = ?`,
        await hash(csrf), identity.property_id, identity.session_hash).run();
      return secure(json({ csrf }));
    }
    if (path === '/api/guest/context' && request.method === 'GET') return secure(json(await contextFor(env.DB, identity)));
    if (path === '/api/guest/review' && request.method === 'GET') return secure(json(await contextFor(env.DB, identity)));
    if (path === '/api/guest/receipt' && request.method === 'GET') return secure(json(await receiptFor(env.DB, identity)));
    if (path === '/api/guest/requests' && request.method === 'GET') return secure(json({ requests: await guestRequests(env.DB, identity) }));
    if (path === '/api/guest/requests' && request.method === 'POST') return secure(await createGuestRequest(request, env, identity, now));
    if (path === '/api/guest/meal') return secure(await handleGuestMeal(request, env, identity, now));
    const match = path.match(/^\/api\/guest\/answers\/([a-z0-9-]{1,40})$/);
    if (match && request.method === 'PUT') return secure(await answer(request, env, identity, match[1], now));
    if (path === '/api/guest/complete' && request.method === 'POST') return secure(await complete(request, env, identity, now, waitUntil));
    throw new ApiError(404, 'NOT_FOUND');
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 503;
    const code = error instanceof ApiError ? error.code : 'SERVICE_UNAVAILABLE';
    return secure(json({ error: code }, status, status === 429 ? { 'Retry-After': '60' } : {}));
  }
}
