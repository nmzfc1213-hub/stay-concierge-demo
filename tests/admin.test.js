import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LocalD1 } from './d1-local.js';
import { handleApi } from '../server/api.js';
import { verifyAccess } from '../server/access.js';
import { parseCSV, urgency } from '../server/admin-validation.js';
import { randomToken, hash } from '../server/security.js';
import { onRequest } from '../functions/[[path]].js';

const demo = JSON.parse(await readFile(new URL('../seeds/demo-stage2.json', import.meta.url), 'utf8'));
const schema1 = await readFile(new URL('../migrations/0001_stage2.sql', import.meta.url), 'utf8');
const schema2 = await readFile(new URL('../migrations/0002_admin.sql', import.meta.url), 'utf8');
const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...await crypto.subtle.exportKey('jwk', pair.publicKey), kid: 'test-key', alg: 'RS256' };
const issuer = 'https://stage3-unit-test.cloudflareaccess.com';
const origin = 'https://demo.example';
const encode = bytes => Buffer.from(bytes).toString('base64url');

async function token(overrides = {}, headerOverrides = {}) {
  const header = encode(JSON.stringify({ alg: 'RS256', kid: 'test-key', ...headerOverrides }));
  const payload = encode(JSON.stringify({ iss: issuer, aud: ['test-app'], sub: 'owner-sub', email: 'owner@example.invalid', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, ...overrides }));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${encode(sig)}`;
}

async function fixture(t, role = 'owner') {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ keys: [jwk] }));
  const DB = new LocalD1();
  DB.sqlite.exec(schema1);
  DB.sqlite.exec(schema2);
  DB.sqlite.exec(await readFile(new URL('../migrations/0003_frontdesk.sql', import.meta.url), 'utf8'));
  t.after(() => DB.sqlite.close());
  for (const id of ['p1', 'p2']) {
    await DB.prepare('INSERT INTO property VALUES (?, ?, ?, ?, ?, ?, 1, 0, NULL, ?, 1)').bind(
      id, id, JSON.stringify(demo.name), JSON.stringify(demo.contact), JSON.stringify(demo.wifi), 'Asia/Tokyo', demo.notificationEmail
    ).run();
    await DB.prepare('INSERT INTO property_version VALUES (?, 1, ?, ?)').bind(id, JSON.stringify(demo.guide), new Date().toISOString()).run();
  }
  await DB.prepare('INSERT INTO admin_user VALUES (?, ?, ?, ?, ?, 1)').bind('p1', 'owner1', 'owner-sub', 'owner@example.invalid', role).run();
  const env = { DB, APP_ORIGIN: origin, RATE_LIMIT_SECRET: randomToken(), ADMIN_CSRF_SECRET: randomToken(), MAIL_MODE: 'disabled', ACCESS_TEAM_DOMAIN: issuer, ACCESS_AUD: 'test-app' };
  let jwt = await token();
  let csrf = '';
  async function request(path, method = 'GET', body, headers = {}) {
    return handleApi(new Request(`${origin}/api/admin/${path}`, {
      method,
      headers: { Origin: origin, 'Cf-Access-Jwt-Assertion': jwt, 'CF-Connecting-IP': '192.0.2.5',
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    }), env);
  }
  const meResponse = await request('me');
  assert.equal(meResponse.status, 200);
  csrf = (await meResponse.json()).csrf;
  return { DB, env, request, setToken: value => { jwt = value; } };
}

const registration = ref => ({ operationId: crypto.randomUUID(), reservation: {
  guestLabel: '架空のお客様', arrivalDate: '2027-01-10', departureDate: '2027-01-11', externalRef: ref
} });

test('Access JWT verifies signature, issuer, audience, expiry and rejects unsigned or modified claims', async () => {
  const env = { ACCESS_TEAM_DOMAIN: issuer, ACCESS_AUD: 'test-app' };
  const call = jwt => verifyAccess(new Request(origin, { headers: { 'Cf-Access-Jwt-Assertion': jwt } }), env, async () => Response.json({ keys: [jwk] }));
  assert.equal((await call(await token())).subject, 'owner-sub');
  for (const claims of [{ iss: 'https://evil.example' }, { aud: ['other-app'] }, { exp: 1 }, { nbf: 9999999999 }, { email: '' }]) {
    await assert.rejects(call(await token(claims)));
  }
  await assert.rejects(call(await token({}, { alg: 'none' })));
  const valid = await token();
  const parts = valid.split('.');
  parts[1] = encode(JSON.stringify({ sub: 'attacker' }));
  await assert.rejects(call(parts.join('.')));
});

test('manual reservation registration is server validated, durable and idempotent', async t => {
  const f = await fixture(t);
  const input = registration('REF-1');
  assert.equal((await f.request('reservations', 'POST', input)).status, 201);
  assert.equal((await f.request('reservations', 'POST', input)).status, 200);
  const list = await (await f.request('reservations?filter=pending')).json();
  assert.equal(list.reservations.length, 1);
  assert.equal(list.reservations[0].property_id, 'p1');
  assert.equal(f.DB.sqlite.prepare('SELECT COUNT(*) n FROM reservation').get().n, 1);
  const bad = registration('REF-2'); bad.reservation.departureDate = bad.reservation.arrivalDate;
  assert.equal((await f.request('reservations', 'POST', bad)).status, 422);
  assert.equal((await f.request('reservations', 'POST', { ...input, reservation: { ...input.reservation, guestLabel: 'Changed' } })).status, 409);
});

test('CSV parsing supports quoted commas and newlines and registration is all-or-nothing', async t => {
  const f = await fixture(t);
  const csv = 'external_ref,guest_label,arrival_date,departure_date\r\nREF-1,"Demo, guest",2027-01-10,2027-01-11\r\nREF-2,"Second\nguest",2027-01-12,2027-01-13';
  const parsed = parseCSV(csv);
  assert.equal(parsed[0].value.guestLabel, 'Demo, guest');
  assert.equal(parsed[1].value.guestLabel, 'Second\nguest');
  assert.equal((await (await f.request('imports/preview', 'POST', { csv })).json()).valid, true);
  assert.equal((await f.request('imports/commit', 'POST', { csv, operationId: crypto.randomUUID() })).status, 201);
  assert.equal((await (await f.request('imports/preview', 'POST', { csv })).json()).valid, false);
  assert.equal((await f.request('imports/commit', 'POST', { csv, operationId: crypto.randomUUID() })).status, 422);
  assert.equal(f.DB.sqlite.prepare('SELECT COUNT(*) n FROM reservation').get().n, 2);
  assert.throws(() => parseCSV('wrong,headers\nx,y'));
  assert.throws(() => parseCSV('external_ref,guest_label,arrival_date,departure_date\nREF,"bad'));
});

test('unregistered users, another property, cross-origin writes and missing CSRF are rejected', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('reservations', 'GET', undefined, { 'X-Property-Id': 'p2' })).status, 403);
  assert.equal((await f.request('reservations', 'POST', registration('REF'), { 'X-CSRF-Token': 'bad' })).status, 403);
  assert.equal((await f.request('reservations', 'POST', registration('REF'), { Origin: 'https://evil.example' })).status, 403);
  f.setToken(await token({ sub: 'unregistered' }));
  assert.equal((await f.request('me')).status, 403);
});

test('reservation detail and token actions cannot reference another property', async t => {
  const f = await fixture(t);
  f.DB.sqlite.prepare('INSERT INTO reservation VALUES (?, ?, ?, ?, ?, 1, NULL, NULL, NULL)').run('p2', 'other-reservation', 'Other Guest', '2027-01-01', '2027-01-02');
  assert.equal((await f.request('reservations/other-reservation')).status, 404);
  assert.equal((await f.request('reservations/other-reservation/token', 'POST', {})).status, 404);
});

test('token rotation invalidates old URLs and cancellation revokes all tokens', async t => {
  const f = await fixture(t);
  await f.request('reservations', 'POST', registration('REF'));
  const id = f.DB.sqlite.prepare('SELECT reservation_id FROM reservation').get().reservation_id;
  const first = await (await f.request(`reservations/${id}/token`, 'POST', {})).json();
  assert.ok(first.url.startsWith(`${origin}/p/p1/confirm?lang=ja#token=`));
  const raw = first.url.split('token=')[1];
  await f.request(`reservations/${id}/token`, 'POST', {});
  assert.ok(f.DB.sqlite.prepare('SELECT revoked_at FROM guest_token WHERE token_hash = ?').get(await hash(raw)).revoked_at);
  assert.equal((await f.request(`reservations/${id}/cancel`, 'POST', {})).status, 200);
  assert.equal((await f.request(`reservations/${id}/token`, 'POST', {})).status, 409);
});

test('settings revisions preserve historical wording, reject conflicts and do not change demo mode', async t => {
  const f = await fixture(t);
  await f.request('reservations', 'POST', registration('REF'));
  const original = await (await f.request('settings')).json();
  const { demo: ignoredDemo, timezone: ignoredTimezone, ...input } = original;
  input.guide.items[0].body.ja = '変更後の案内';
  assert.equal((await f.request('settings', 'PUT', input)).status, 200);
  assert.equal((await f.request('settings', 'PUT', input)).status, 409);
  const property = f.DB.sqlite.prepare('SELECT current_version, demo FROM property WHERE property_id = ?').get('p1');
  assert.equal(property.current_version, 2);
  assert.equal(property.demo, 1);
  const old = JSON.parse(f.DB.sqlite.prepare('SELECT guide_json FROM property_version WHERE property_id = ? AND version = 1').get('p1').guide_json);
  assert.notEqual(old.items[0].body.ja, '変更後の案内');
  const id = f.DB.sqlite.prepare('SELECT reservation_id FROM reservation').get().reservation_id;
  assert.equal(f.DB.sqlite.prepare('SELECT guide_version FROM reservation').get().guide_version, 1);
  assert.equal((await f.request(`reservations/${id}/reconfirm`, 'POST', {})).status, 200);
  assert.equal(f.DB.sqlite.prepare('SELECT guide_version FROM reservation').get().guide_version, 2);
});

test('staff cannot edit property settings and direct booking requires OTA review', async t => {
  const f = await fixture(t, 'staff');
  assert.equal((await f.request('settings')).status, 403);
  assert.equal((await f.request('settings', 'PUT', {})).status, 403);
});

test('direct booking remains off unless the owner supplies a safe link and confirms OTA review', async t => {
  const f = await fixture(t);
  const { demo: ignoredDemo, timezone: ignoredTimezone, ...input } = await (await f.request('settings')).json();
  input.directBookingEnabled = true; input.directBookingUrl = 'https://example.invalid/book';
  assert.equal((await f.request('settings', 'PUT', input)).status, 422);
  assert.equal((await f.request('settings', 'PUT', { ...input, otaReviewed: true, directBookingUrl: 'javascript:alert(1)' })).status, 422);
  assert.equal((await f.request('settings', 'PUT', { ...input, otaReviewed: true })).status, 200);
});

test('arrival alerts use the property timezone and distinguish tomorrow, today and overdue', () => {
  const now = new Date('2026-10-19T16:00:00Z');
  assert.equal(urgency('2026-10-21', null, null, 'Asia/Tokyo', now), 'tomorrow');
  assert.equal(urgency('2026-10-20', null, null, 'Asia/Tokyo', now), 'today');
  assert.equal(urgency('2026-10-19', null, null, 'Asia/Tokyo', now), 'overdue');
  assert.equal(urgency('2026-10-19', 'saved', null, 'Asia/Tokyo', now), 'complete');
  assert.equal(urgency('2026-10-19', null, 'cancelled', 'Asia/Tokyo', now), 'cancelled');
});

test('all new tables retain property_id and audit omits submitted names and link secrets', async t => {
  const f = await fixture(t);
  await f.request('reservations', 'POST', registration('REF'));
  const id = f.DB.sqlite.prepare('SELECT reservation_id FROM reservation').get().reservation_id;
  const link = await (await f.request(`reservations/${id}/token`, 'POST', {})).json();
  const result = await (await f.request('audit')).json();
  const audit = JSON.stringify(result);
  assert.ok(audit.includes('reservation_created'));
  assert.ok(!audit.includes('架空のお客様'));
  assert.ok(!audit.includes(link.url.split('token=')[1]));
  assert.ok(f.DB.sqlite.prepare('PRAGMA table_info(admin_operation)').all().some(column => column.name === 'property_id'));
});

test('admin registration to guest completion updates pending list and preserves history after a new guide', async t => {
  const f = await fixture(t);
  await f.request('reservations', 'POST', registration('REF-E2E'));
  const id = f.DB.sqlite.prepare('SELECT reservation_id FROM reservation').get().reservation_id;
  const link = await (await f.request(`reservations/${id}/token`, 'POST', {})).json();
  const tokenValue = link.url.split('token=')[1];
  let cookie = '';
  let csrf = '';
  async function guest(path, method = 'GET', body) {
    return handleApi(new Request(`${origin}/api/guest/${path}`, {
      method,
      headers: { Origin: origin, 'CF-Connecting-IP': '192.0.2.50', Cookie: cookie, 'X-CSRF-Token': csrf,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    }), f.env);
  }
  const response = await guest('session', 'POST', { token: tokenValue, property: 'p1' });
  cookie = response.headers.get('set-cookie').split(';')[0];
  csrf = (await response.json()).csrf;
  const context = await (await guest('context')).json();
  for (const item of context.guide.items) {
    assert.equal((await guest(`answers/${item.id}`, 'PUT', { version: 1, answer: true, language: 'ja' })).status, 200);
  }
  assert.equal((await guest('complete', 'POST', {
    version: 1, language: 'ja', arrivalSlot: 'late', notes: '架空のアレルギー申告', requestId: crypto.randomUUID()
  })).status, 201);
  assert.equal((await (await f.request('reservations?filter=pending')).json()).reservations.length, 0);
  assert.equal((await (await f.request('reservations?filter=attention')).json()).reservations.length, 1);
  const detail = await (await f.request(`reservations/${id}`)).json();
  assert.equal(detail.submissions[0].notes, '架空のアレルギー申告');
  assert.equal(detail.answers.length, 4);
  const { demo: unusedDemo, timezone: unusedZone, ...settings } = await (await f.request('settings')).json();
  settings.guide.items[0].body.ja = '新版の案内';
  assert.equal((await f.request('settings', 'PUT', settings)).status, 200);
  await f.request(`reservations/${id}/reconfirm`, 'POST', {});
  assert.equal((await (await f.request('reservations?filter=pending')).json()).reservations.length, 1);
  const oldDetail = await (await f.request(`reservations/${id}`)).json();
  assert.equal(oldDetail.submissions.length, 1);
  assert.notEqual(oldDetail.answers[0].item.body.ja, '新版の案内');
  const newContext = await (await guest('context')).json();
  assert.equal(newContext.version, 2);
  assert.equal(newContext.answers.length, 0);
});

test('CSV import accepts 200 valid rows using atomic bulk SQL', async t => {
  const f = await fixture(t);
  const csv = 'external_ref,guest_label,arrival_date,departure_date\n' + Array.from({ length: 200 }, (_, index) => `REF-${index},Demo ${index},2027-02-01,2027-02-02`).join('\n');
  assert.equal((await f.request('imports/commit', 'POST', { csv, operationId: crypto.randomUUID() })).status, 201);
  assert.equal(f.DB.sqlite.prepare('SELECT COUNT(*) n FROM reservation').get().n, 200);
});

async function registeredGuest(f, ref = 'WORKFLOW') {
  await f.request('reservations', 'POST', registration(ref));
  const id = f.DB.sqlite.prepare('SELECT reservation_id FROM reservation WHERE property_id = ? AND external_ref = ?').get('p1', ref).reservation_id;
  return { id, async login() {
    const link = await (await f.request(`reservations/${id}/token`, 'POST', {})).json();
    let cookie = '', csrf = '';
    async function request(path, method = 'GET', body) {
      return handleApi(new Request(`${origin}/api/guest/${path}`, {
        method, headers: { Origin: origin, 'CF-Connecting-IP': '192.0.2.77', Cookie: cookie,
          'X-CSRF-Token': csrf, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      }), f.env);
    }
    const response = await request('session', 'POST', { property: 'p1', token: link.url.split('token=')[1] });
    assert.equal(response.status, 200);
    cookie = response.headers.get('set-cookie').split(';')[0];
    csrf = (await response.json()).csrf;
    return { request, link: link.url };
  } };
}

test('staff select language, dinner and late guidance before acknowledgement; later changes are locked', async t => {
  const f = await fixture(t), reservation = await registeredGuest(f);
  assert.equal((await f.request(`reservations/${reservation.id}/profile`, 'PUT', {
    expectedRevision: 0, language: 'en', dinner: true, lateArrival: true
  })).status, 200);
  const guest = await reservation.login();
  assert.ok(guest.link.includes('?lang=en#token='));
  const context = await (await guest.request('context')).json();
  assert.equal(context.guide.items.length, 6);
  assert.ok(context.guide.items.some(item => item.id === 'dinner'));
  assert.ok(context.guide.items.some(item => item.id === 'late-entry'));
  assert.equal((await guest.request('answers/arrival', 'PUT', { version: 1, language: 'en', answer: true })).status, 200);
  assert.equal((await f.request(`reservations/${reservation.id}/profile`, 'PUT', {
    expectedRevision: 1, language: 'ja', dinner: false, lateArrival: false
  })).status, 409);
  assert.equal((await (await guest.request('context')).json()).guide.items.length, 6);
  for (const id of ['charges', 'cancellation', 'rules']) await guest.request(`answers/${id}`, 'PUT', { version: 1, language: 'en', answer: true });
  assert.equal((await guest.request('complete', 'POST', { version: 1, language: 'en', notes: 'None', arrivalSlot: 'unknown', requestId: crypto.randomUUID() })).status, 422);
  assert.throws(() => f.DB.sqlite.prepare('INSERT INTO submission VALUES (?, ?, 1, ?, ?, ?, ?, ?, 0, ?)').run(
    'p1', reservation.id, crypto.randomUUID(), 'bypass-attempt', 'unknown', 'None', 'en', new Date().toISOString()
  ), /answers_missing/);
  for (const id of ['dinner', 'late-entry']) {
    assert.equal((await guest.request(`answers/${id}`, 'PUT', { version: 1, language: 'en', answer: true })).status, 200);
  }
  assert.equal((await guest.request('complete', 'POST', { version: 1, language: 'en', notes: 'None', arrivalSlot: 'unknown', requestId: crypto.randomUUID() })).status, 201);
});

test('questions can precede acknowledgement and flow through assignment, handoff and resolution without leaking staff notes', async t => {
  const f = await fixture(t), reservation = await registeredGuest(f), guest = await reservation.login();
  const input = { version: 1, itemId: 'arrival', requestId: crypto.randomUUID(), language: 'en', message: 'Fictional question about arrival' };
  const created = await guest.request('requests', 'POST', input);
  assert.equal(created.status, 201);
  const { requestId } = await created.json();
  assert.equal((await guest.request('requests', 'POST', input)).status, 200);
  assert.equal((await guest.request('requests', 'POST', { ...input, message: 'Changed' })).status, 409);
  assert.equal(f.DB.sqlite.prepare('SELECT COUNT(*) n FROM confirmation').get().n, 0);
  let board = await (await f.request('workboard')).json();
  assert.equal(board.requests.length, 1);
  assert.equal(board.requests[0].status, 'open');
  assert.equal((await (await f.request('reservations?filter=attention')).json()).reservations.length, 1);
  const update = { expectedRevision: 1, status: 'in_progress', assignedTo: 'owner1', note: 'PRIVATE STAFF HANDOFF' };
  assert.equal((await f.request(`requests/${requestId}`, 'PUT', update)).status, 200);
  assert.equal((await f.request(`requests/${requestId}`, 'PUT', update)).status, 409);
  let received = await (await guest.request('requests')).json();
  assert.equal(received.requests[0].status, 'in_progress');
  assert.ok(!JSON.stringify(received).includes('PRIVATE STAFF HANDOFF'));
  assert.ok(!JSON.stringify(received).includes('owner1'));
  assert.equal((await f.request(`requests/${requestId}`, 'PUT', { ...update, expectedRevision: 2, status: 'resolved', note: '' })).status, 422);
  assert.equal((await f.request(`requests/${requestId}`, 'PUT', { ...update, expectedRevision: 2, status: 'resolved', note: 'Discussed with the guest in person' })).status, 200);
  assert.equal((await (await f.request('workboard')).json()).requests.length, 0);
  assert.equal((await (await f.request('reservations?filter=attention')).json()).reservations.length, 0);
  board = await (await f.request('workboard?filter=all')).json();
  assert.equal(board.requests[0].notes.length, 2);
  received = await (await guest.request('requests')).json();
  assert.equal(received.requests[0].status, 'resolved');
  const audit = JSON.stringify(await (await f.request('audit')).json());
  assert.ok(!audit.includes(input.message));
  assert.ok(!audit.includes('PRIVATE STAFF HANDOFF'));
});

test('requests and staff assignment are tenant-scoped and foreign assignees are rejected', async t => {
  const f = await fixture(t), reservation = await registeredGuest(f), guest = await reservation.login();
  const response = await guest.request('requests', 'POST', { version: 1, requestId: crypto.randomUUID(), language: 'ja', message: '架空の相談' });
  const { requestId } = await response.json();
  await f.DB.prepare('INSERT INTO admin_user VALUES (?, ?, ?, ?, ?, 1)').bind('p2', 'other-staff', 'other-sub', 'other@example.invalid', 'staff').run();
  assert.equal((await f.request(`requests/${requestId}`, 'PUT', {
    expectedRevision: 1, status: 'in_progress', assignedTo: 'other-staff', note: 'test'
  })).status, 422);
  assert.equal((await f.request('workboard', 'GET', undefined, { 'X-Property-Id': 'p2' })).status, 403);
  assert.equal((await f.request(`reservations/foreign/oral`, 'POST', { itemId: 'arrival', version: 1, note: 'test' })).status, 404);
  assert.equal((await f.request(`requests/${crypto.randomUUID()}`, 'PUT', { expectedRevision: 1, status: 'resolved', assignedTo: 'owner1', note: 'test' })).status, 404);
});

test('oral explanation retains the actor and timestamp without impersonating a guest confirmation', async t => {
  const f = await fixture(t), reservation = await registeredGuest(f), guest = await reservation.login();
  const input = { version: 1, itemId: 'arrival', note: 'Explained at reception in English' };
  assert.equal((await f.request(`reservations/${reservation.id}/oral`, 'POST', input)).status, 200);
  assert.equal((await f.request(`reservations/${reservation.id}/oral`, 'POST', { ...input, note: 'Must not overwrite original' })).status, 200);
  const detail = await (await f.request(`reservations/${reservation.id}`)).json();
  assert.equal(detail.workflow.oral.length, 1);
  assert.equal(detail.workflow.oral[0].staff_id, 'owner1');
  assert.equal(detail.workflow.oral[0].note, input.note);
  assert.ok(detail.workflow.oral[0].confirmed_at);
  assert.equal(detail.reservation.completed_at, null);
  assert.equal((await (await guest.request('context')).json()).answers.length, 0);
  assert.equal((await f.request(`reservations/${reservation.id}/profile`, 'PUT', { expectedRevision: 0, language: 'en', dinner: true, lateArrival: false })).status, 409);
});

test('special requests create a staff task atomically with final confirmation, without duplicate tasks', async t => {
  const f = await fixture(t), reservation = await registeredGuest(f), guest = await reservation.login();
  const context = await (await guest.request('context')).json();
  assert.equal(context.guide.items.length, 4);
  for (const item of context.guide.items) await guest.request(`answers/${item.id}`, 'PUT', { version: 1, language: 'ja', answer: true });
  const input = { version: 1, language: 'ja', arrivalSlot: 'late', notes: '架空の食物アレルギー申告', requestId: crypto.randomUUID() };
  assert.equal((await guest.request('complete', 'POST', input)).status, 201);
  assert.equal((await guest.request('complete', 'POST', input)).status, 200);
  const board = await (await f.request('workboard')).json();
  assert.equal(board.requests.length, 1);
  assert.ok(board.requests[0].message.includes(input.notes));
  assert.ok(board.requests[0].message.includes('夜間'));
  assert.equal(board.requests[0].status, 'open');
});

test('staff note storage failure rolls back request status, assignment and audit together', async t => {
  const f = await fixture(t), reservation = await registeredGuest(f), guest = await reservation.login();
  const { requestId } = await (await guest.request('requests', 'POST', { version: 1, requestId: crypto.randomUUID(), language: 'en', message: 'Demo request' })).json();
  f.DB.sqlite.exec("CREATE TRIGGER fail_note BEFORE INSERT ON staff_note BEGIN SELECT RAISE(ABORT, 'test_failure'); END;");
  assert.equal((await f.request(`requests/${requestId}`, 'PUT', { expectedRevision: 1, status: 'resolved', assignedTo: 'owner1', note: 'Handled' })).status, 503);
  const row = f.DB.sqlite.prepare('SELECT status, revision, assigned_to FROM service_request').get();
  assert.equal(row.status, 'open'); assert.equal(row.revision, 1); assert.equal(row.assigned_to, null);
  assert.equal(f.DB.sqlite.prepare("SELECT COUNT(*) n FROM audit_event WHERE event_type = 'service_request_updated'").get().n, 0);
});

test('front-desk shared guide renders without private booking details, tokens or Wi-Fi', async t => {
  const f = await fixture(t), reservation = await registeredGuest(f);
  const response = await onRequest({ request: new Request(`${origin}/p/p1/guide`), env: f.env });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes('共通の館内案内'));
  assert.ok(!html.includes(demo.wifi.password));
  assert.ok(!html.includes('架空のお客様'));
  assert.ok(!html.includes('#token='));
  assert.ok(!html.includes('夕食をご予約のお客様へ'));
  assert.ok(html.includes('noindex'));
});
