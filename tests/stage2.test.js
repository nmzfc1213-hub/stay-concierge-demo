import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { LocalD1 } from './d1-local.js';
import { handleApi } from '../server/api.js';
import { hash, randomToken } from '../server/security.js';
import { dispatchNotification } from '../server/notifications.js';
import { renderPage, notFound } from '../server/pages.js';
import { initialLanguage, dictionaries } from '../public/assets/i18n.js';

const sample = JSON.parse(await readFile(new URL('../seeds/demo-stage2.json', import.meta.url), 'utf8'));
const schema = await readFile(new URL('../migrations/0001_stage2.sql', import.meta.url), 'utf8');
const origin = 'https://demo.example';

async function fixture() {
  const DB = new LocalD1();
  DB.sqlite.exec(schema);
  DB.sqlite.exec(await readFile(new URL('../migrations/0003_frontdesk.sql', import.meta.url), 'utf8'));
  const env = { DB, APP_ORIGIN: origin, RATE_LIMIT_SECRET: randomToken(), MAIL_MODE: 'disabled' };
  const token = randomToken();
  const expires = new Date(Date.now() + 86400000).toISOString();
  const now = new Date().toISOString();
  await DB.prepare('INSERT INTO property VALUES (?, ?, ?, ?, ?, ?, 1, 0, NULL, ?, 1)').bind(
    sample.propertyId, sample.slug, JSON.stringify(sample.name), JSON.stringify(sample.contact),
    JSON.stringify(sample.wifi), 'Asia/Tokyo', sample.notificationEmail
  ).run();
  await DB.prepare('INSERT INTO property_version VALUES (?, 1, ?, ?)').bind(sample.propertyId, JSON.stringify(sample.guide), now).run();
  await DB.prepare('INSERT INTO reservation VALUES (?, ?, ?, ?, ?, 1, NULL, NULL)').bind(
    sample.propertyId, 'r1', 'Fictional', '2027-01-01', '2027-01-02'
  ).run();
  await DB.prepare('INSERT INTO guest_token VALUES (?, ?, ?, ?, NULL)').bind(sample.propertyId, await hash(token), 'r1', expires).run();
  let cookie = '';
  let csrf = '';
  async function request(path, method = 'GET', body, headers = {}) {
    return handleApi(new Request(origin + '/api/' + path, {
      method,
      headers: {
        Origin: origin, 'CF-Connecting-IP': '192.0.2.1',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie, 'X-CSRF-Token': csrf } : {}), ...headers
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    }), env);
  }
  async function login() {
    const response = await request('guest/session', 'POST', { token, property: sample.slug });
    assert.equal(response.status, 200);
    cookie = response.headers.get('set-cookie').split(';')[0];
    csrf = (await response.json()).csrf;
  }
  async function acknowledgeAll() {
    for (const item of (await (await request('guest/context')).json()).guide.items) {
      assert.equal((await request(`guest/answers/${item.id}`, 'PUT', { version: 1, language: 'en', answer: true })).status, 200);
    }
  }
  return { DB, env, token, request, login, acknowledgeAll };
}

const submission = () => ({ version: 1, language: 'en', arrivalSlot: 'unknown', notes: 'None', requestId: crypto.randomUUID() });

test('guest flow persists each acknowledgement, final receipt, audit and demo notification', async () => {
  const f = await fixture();
  await f.login();
  assert.equal((await f.request('guest/context')).status, 200);
  await f.acknowledgeAll();
  const body = submission();
  const response = await f.request('guest/complete', 'POST', body);
  assert.equal(response.status, 201);
  const receipt = await response.json();
  assert.equal(receipt.completed, true);
  assert.equal(receipt.notificationStatus, 'demo_skipped');
  assert.equal(receipt.directBookingUrl, null);
  assert.equal(f.DB.sqlite.prepare('SELECT COUNT(*) n FROM confirmation').get().n, 4);
  assert.equal(f.DB.sqlite.prepare("SELECT COUNT(*) n FROM audit_event WHERE event_type='confirmation_completed'").get().n, 1);
  assert.equal((await (await f.request('guest/receipt')).json()).completed, true);
  assert.equal((await f.request('guest/complete', 'POST', body)).status, 200);
  assert.equal(f.DB.sqlite.prepare('SELECT COUNT(*) n FROM notification').get().n, 1);
  assert.equal((await f.request('guest/complete', 'POST', { ...body, notes: 'Changed' })).status, 409);
});

test('rejects missing acknowledgements, notes, illegal values and stale guide', async () => {
  const f = await fixture(); await f.login();
  assert.equal((await f.request('guest/complete', 'POST', submission())).status, 422);
  await f.acknowledgeAll();
  for (const patch of [{ notes: '' }, { notes: 'x'.repeat(2001) }, { arrivalSlot: 'anything' }, { language: 'xx' }, { property_id: 'other' }]) {
    assert.equal((await f.request('guest/complete', 'POST', { ...submission(), ...patch })).status, 422);
  }
  assert.equal((await f.request('guest/complete', 'POST', { ...submission(), version: 2 })).status, 409);
  assert.equal(f.DB.sqlite.prepare('SELECT COUNT(*) n FROM submission').get().n, 0);
});

test('invalid, expired and revoked links fail; Wi-Fi requires a session', async () => {
  const f = await fixture();
  const response = await f.request('guest/context');
  assert.equal(response.status, 401);
  assert.ok(!(await response.text()).includes(sample.wifi.password));
  assert.equal((await f.request('guest/session', 'POST', { token: randomToken(), property: sample.slug })).status, 404);
  assert.equal((await f.request('guest/session', 'POST', { token: f.token, property: 'wrong-property' })).status, 404);
  await f.login();
  f.DB.sqlite.exec("UPDATE guest_token SET revoked_at = '2020-01-01T00:00:00.000Z'");
  assert.equal((await f.request('guest/context')).status, 410);
});

test('Origin, CSRF, oversized body and API rate limits are enforced', async () => {
  const f = await fixture(); await f.login();
  assert.equal((await f.request('guest/context', 'GET', undefined, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await f.request('guest/complete', 'POST', submission(), { 'X-CSRF-Token': 'wrong' })).status, 403);
  assert.equal((await f.request('guest/complete', 'POST', { ...submission(), notes: 'x'.repeat(40000) })).status, 413);
  let response;
  for (let i = 0; i < 16; i += 1) response = await f.request('guest/session', 'POST', { token: randomToken(), property: sample.slug });
  assert.equal(response.status, 429);
});

test('a failure halfway through completion rolls back receipt, completion time and notification', async () => {
  const f = await fixture(); await f.login(); await f.acknowledgeAll();
  f.DB.sqlite.exec("CREATE TRIGGER force_failure BEFORE INSERT ON notification BEGIN SELECT RAISE(ABORT, 'test_failure'); END;");
  assert.equal((await f.request('guest/complete', 'POST', submission())).status, 409);
  assert.equal(f.DB.sqlite.prepare('SELECT COUNT(*) n FROM submission').get().n, 0);
  assert.equal(f.DB.sqlite.prepare('SELECT completed_at FROM reservation').get().completed_at, null);
  assert.equal(f.DB.sqlite.prepare('SELECT COUNT(*) n FROM notification').get().n, 0);
});

test('database foreign keys reject references to another property', async () => {
  const f = await fixture();
  assert.throws(() => f.DB.sqlite.prepare('INSERT INTO guest_token VALUES (?, ?, ?, ?, NULL)').run('another-property', 'hash', 'r1', '2099-01-01'));
  for (const table of ['property', 'reservation', 'confirmation', 'notification', 'admin_user', 'audit_event']) {
    assert.ok(f.DB.sqlite.prepare(`PRAGMA table_info(${table})`).all().some(column => column.name === 'property_id'));
  }
});

test('email failures preserve completion; successful retries use an idempotency key', async () => {
  const f = await fixture(); await f.login(); await f.acknowledgeAll();
  await f.request('guest/complete', 'POST', { ...submission(), notes: 'Fictional allergy request' });
  const job = f.DB.sqlite.prepare('SELECT * FROM notification').get();
  f.env.MAIL_MODE = 'resend'; f.env.RESEND_API_KEY = 'test-only'; f.env.MAIL_FROM = 'test@example.invalid';
  f.DB.sqlite.exec("UPDATE notification SET status = 'pending', next_attempt_at = '2000-01-01'");
  await dispatchNotification(f.env, sample.propertyId, job.notification_id, async () => new Response('', { status: 500 }));
  assert.equal(f.DB.sqlite.prepare('SELECT status FROM notification').get().status, 'failed');
  assert.ok(f.DB.sqlite.prepare('SELECT completed_at FROM reservation').get().completed_at);
  f.DB.sqlite.exec("UPDATE notification SET next_attempt_at = '2000-01-01'");
  let payload;
  await dispatchNotification(f.env, sample.propertyId, job.notification_id, async (url, options) => {
    payload = JSON.parse(options.body);
    assert.equal(options.headers['Idempotency-Key'], `confirmation/${job.notification_id}`);
    return Response.json({ id: 'test-provider-id' });
  });
  assert.equal(f.DB.sqlite.prepare('SELECT status FROM notification').get().status, 'accepted');
  assert.ok(!JSON.stringify(payload).includes('Fictional allergy request'));
});

test('cancelled or superseded confirmations do not send stale notification emails', async () => {
  for (const change of ['cancel', 'reconfirm']) {
    const f = await fixture();
    await f.login();
    await f.acknowledgeAll();
    await f.request('guest/complete', 'POST', submission());
    const job = f.DB.sqlite.prepare('SELECT * FROM notification').get();
    if (change === 'cancel') {
      f.DB.sqlite.exec("UPDATE reservation SET cancelled_at = '2026-01-01T00:00:00.000Z'");
    } else {
      f.DB.sqlite.prepare('INSERT INTO property_version VALUES (?, 2, ?, ?)').run(
        sample.propertyId, JSON.stringify(sample.guide), new Date().toISOString()
      );
      f.DB.sqlite.exec('UPDATE reservation SET guide_version = 2, completed_at = NULL');
    }
    f.env.MAIL_MODE = 'resend';
    f.env.RESEND_API_KEY = 'test-only';
    f.env.MAIL_FROM = 'test@example.invalid';
    f.DB.sqlite.exec("UPDATE notification SET status = 'pending', next_attempt_at = '2000-01-01'");
    let calls = 0;
    await dispatchNotification(f.env, sample.propertyId, job.notification_id, async () => {
      calls += 1;
      return Response.json({ id: 'must-not-send' });
    });
    assert.equal(calls, 0);
    assert.equal(f.DB.sqlite.prepare('SELECT last_code FROM notification').get().last_code, 'RESERVATION_INACTIVE');
    f.DB.sqlite.close();
  }
});

test('notification outside the safe retry window requires review without contacting the mail API', async () => {
  const f = await fixture();
  await f.login();
  await f.acknowledgeAll();
  await f.request('guest/complete', 'POST', submission());
  const job = f.DB.sqlite.prepare('SELECT * FROM notification').get();
  f.env.MAIL_MODE = 'resend';
  f.env.RESEND_API_KEY = 'test-only';
  f.env.MAIL_FROM = 'test@example.invalid';
  f.DB.sqlite.exec("UPDATE notification SET status = 'pending', next_attempt_at = '2000-01-01', created_at = '2000-01-01T00:00:00.000Z'");
  await dispatchNotification(f.env, sample.propertyId, job.notification_id, async () => {
    assert.fail('must not contact the external mail API');
  });
  assert.equal(f.DB.sqlite.prepare('SELECT last_code FROM notification').get().last_code, 'MANUAL_REVIEW_REQUIRED');
  f.DB.sqlite.close();
});

test('language precedence handles unavailable storage and unsupported browser languages', () => {
  const storage = { getItem: () => 'en' };
  assert.equal(initialLanguage('?lang=ja', storage, 'en-US'), 'ja');
  assert.equal(initialLanguage('', storage, 'ja'), 'en');
  assert.equal(initialLanguage('', { getItem: () => { throw new Error(); } }, 'en-US'), 'en');
  assert.equal(initialLanguage('?lang=unknown', null, 'fr-FR'), 'ja');
  assert.deepEqual(Object.keys(dictionaries.ja).sort(), Object.keys(dictionaries.en).sort());
});

test('server fallback includes contact links and no secret Wi-Fi; errors are real HTTP errors', async () => {
  const f = await fixture();
  const property = f.DB.sqlite.prepare('SELECT * FROM property').get();
  const html = await renderPage(property).text();
  assert.ok(html.includes('<noscript>'));
  assert.ok(html.includes('tel:'));
  assert.ok(html.includes('name="robots"'));
  assert.ok(!html.includes(sample.wifi.password));
  assert.equal(notFound().status, 404);
  assert.equal((await f.request('nonexistent')).status, 404);
});

test('guest assets do not use HTML injection or external resources', async () => {
  for (const file of await readdir(new URL('../public/assets/', import.meta.url))) {
    const content = await readFile(new URL(`../public/assets/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(content, /innerHTML|outerHTML|insertAdjacentHTML|fetch\([\'"]https?:|@import\s+url/);
  }
});

test('expired links and tokens cannot establish a guest session', async () => {
  const f = await fixture();
  f.DB.sqlite.exec("UPDATE guest_token SET expires_at = '2000-01-01T00:00:00.000Z'");
  assert.equal((await f.request('guest/session', 'POST', { token: f.token, property: sample.slug })).status, 410);
});

test('two properties cannot use each other’s token and no unauthenticated API fallback exposes content', async () => {
  const f = await fixture();
  const second = 'second-property';
  await f.DB.prepare('INSERT INTO property VALUES (?, ?, ?, ?, ?, ?, 1, 0, NULL, ?, 1)').bind(
    second, 'second', JSON.stringify({ ja: '別の宿', en: 'Other property' }),
    JSON.stringify(sample.contact), JSON.stringify({ ssid: 'OTHER-NETWORK', password: 'OTHER-SECRET' }),
    'Asia/Tokyo', 'other@example.invalid'
  ).run();
  await f.login();
  const text = await (await f.request('guest/context')).text();
  assert.ok(!text.includes('OTHER-SECRET'));
  assert.equal((await f.request('guest/session', 'POST', { token: f.token, property: 'second' })).status, 404);
  assert.equal((await f.request('guest/not-an-endpoint')).status, 404);
});

test('simultaneous final submissions create a single durable receipt and notification', async () => {
  const f = await fixture(); await f.login(); await f.acknowledgeAll();
  const body = submission();
  const responses = await Promise.all([
    f.request('guest/complete', 'POST', body),
    f.request('guest/complete', 'POST', body)
  ]);
  for (const response of responses) assert.ok([200, 201].includes(response.status));
  assert.equal(f.DB.sqlite.prepare('SELECT COUNT(*) n FROM submission').get().n, 1);
  assert.equal(f.DB.sqlite.prepare('SELECT COUNT(*) n FROM notification').get().n, 1);
});

test('deployment assets exclude the legacy public Wi-Fi JSON and local-only editor', async () => {
  const script = await readFile(new URL('../scripts/build.js', import.meta.url), 'utf8');
  assert.ok(script.includes("cp('public', 'dist'"));
  const files = await readdir(new URL('../public/', import.meta.url));
  assert.ok(!files.includes('data'));
  assert.ok(!files.includes('editor.html'));
});
