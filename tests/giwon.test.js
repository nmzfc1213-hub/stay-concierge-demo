import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LocalD1 } from './d1-local.js';
import { settingsInput } from '../server/admin-validation.js';
import { handleApi } from '../server/api.js';
import { randomToken, hash } from '../server/security.js';
import { renderPage, renderPublicGuide } from '../server/pages.js';

const sample = JSON.parse(await readFile(new URL('../seeds/giwon-demo.json', import.meta.url), 'utf8'));
const input = () => structuredClone({ expectedVersion: 1, name: sample.name, contact: sample.contact,
  wifi: sample.wifi, notificationEmail: sample.notificationEmail, guide: structuredClone(sample.guide),
  directBookingEnabled: false, directBookingUrl: '' });

async function fixture(t, dinner = false) {
  const DB = new LocalD1();
  t.after(() => DB.sqlite.close());
  for (const name of ['0001_stage2.sql', '0002_admin.sql', '0003_frontdesk.sql']) {
    DB.sqlite.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
  }
  DB.sqlite.prepare('INSERT INTO property VALUES (?, ?, ?, ?, ?, ?, 1, 0, NULL, ?, 1)').run(
    sample.propertyId, sample.slug, JSON.stringify(sample.name), JSON.stringify(sample.contact),
    JSON.stringify(sample.wifi), 'Asia/Tokyo', sample.notificationEmail
  );
  DB.sqlite.prepare('INSERT INTO property_version VALUES (?, 1, ?, ?)').run(sample.propertyId, JSON.stringify(sample.guide), new Date().toISOString());
  DB.sqlite.prepare('INSERT INTO reservation VALUES (?, ?, ?, ?, ?, 1, NULL, NULL, NULL)').run(sample.propertyId, 'sample-reservation', 'Fictional guest', '2027-01-01', '2027-01-02');
  if (dinner) DB.sqlite.prepare('INSERT INTO stay_profile VALUES (?, ?, 1, ?, 1, 0, 1, ?)').run(sample.propertyId, 'sample-reservation', 'en', crypto.randomUUID());
  const token = randomToken(), origin = 'https://demo.example';
  DB.sqlite.prepare('INSERT INTO guest_token VALUES (?, ?, ?, ?, NULL)').run(sample.propertyId, await hash(token), 'sample-reservation', '2099-01-01T00:00:00.000Z');
  const env = { DB, APP_ORIGIN: origin, RATE_LIMIT_SECRET: randomToken(), MAIL_MODE: 'disabled' };
  let cookie = '', csrf = '';
  async function request(path, method = 'GET', body) {
    return handleApi(new Request(`${origin}/api/guest/${path}`, {
      method, headers: { Origin: origin, Cookie: cookie, 'X-CSRF-Token': csrf, 'CF-Connecting-IP': '192.0.2.201',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    }), env);
  }
  const response = await request('session', 'POST', { token, property: sample.slug });
  assert.equal(response.status, 200);
  cookie = response.headers.get('set-cookie').split(';')[0];
  csrf = (await response.json()).csrf;
  return { DB, request };
}

test('Giwon configuration preserves bilingual financial emphasis, sources and optional reference content', () => {
  const validated = settingsInput(input());
  assert.equal(validated.guide.items.length, 7);
  assert.equal(validated.guide.info.length, 3);
  assert.equal(validated.contact.email, '');
  assert.equal(validated.contact.formUrl, 'https://giwon.cc/contact.html');
  const cancel = validated.guide.items.find(item => item.id === 'cancellation');
  assert.equal(cancel.notice.tone, 'money');
  assert.ok(cancel.notice.lead.ja.includes('100'));
  assert.ok(cancel.notice.lead.en.includes('100'));
  assert.equal(cancel.notice.sourceUrl, 'https://giwon.cc/terms.html');
  assert.equal(validated.guide.arrivalSlots.find(slot => slot.id === '18-20').requiresContact, true);
});

test('invalid emphasis, unsafe links and missing English are rejected server-side', () => {
  for (const change of [
    value => { value.guide.items[0].notice.tone = 'untrusted-class'; },
    value => { value.guide.items[0].notice.sourceUrl = 'javascript:alert(1)'; },
    value => { value.guide.items[0].notice.lead.en = ''; },
    value => { value.contact.formUrl = 'https://user:password@example.com'; },
    value => { value.guide.arrivalSlots[0].requiresContact = 'true'; },
    value => { value.guide.info[0].id = 'arrival'; }
  ]) {
    const value = input(); change(value); assert.throws(() => settingsInput(value));
  }
});

test('unverified staff examples and conflicting curfew rules are kept outside the guest acknowledgement flow', () => {
  const guestContent = JSON.stringify(sample.guide);
  assert.ok(!guestContent.includes('料理提供不可・減額なし'));
  assert.ok(!guestContent.includes('門限'));
  assert.ok(sample.research.pending.some(item => item.id === 'late-dinner'));
  assert.ok(sample.research.pending.some(item => item.id === 'curfew'));
  assert.ok(sample.name.ja.includes('非公式試作'));
});

test('Giwon guidance is meal-specific and optional reference topics do not block confirmation', async t => {
  const f = await fixture(t, true);
  const context = await (await f.request('context')).json();
  assert.equal(context.guide.items.length, 7);
  assert.equal(context.guide.info.length, 3);
  for (const item of context.guide.items) {
    assert.equal((await f.request(`answers/${item.id}`, 'PUT', { version: 1, language: 'en', answer: true })).status, 200);
  }
  const response = await f.request('complete', 'POST', { version: 1, language: 'en', arrivalSlot: '18-20', notes: 'None', requestId: crypto.randomUUID() });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).notificationStatus, 'demo_skipped');
  const task = f.DB.sqlite.prepare('SELECT * FROM service_request').get();
  assert.equal(task.status, 'open');
  assert.ok(task.message.includes('Arrival time needs staff review'));
  assert.equal(f.DB.sqlite.prepare('SELECT COUNT(*) n FROM confirmation').get().n, 7);
});

test('Giwon shared guide highlights charges but exposes neither Wi-Fi nor unfinished policy drafts', async t => {
  const f = await fixture(t);
  const context = await (await f.request('context')).json();
  assert.equal(context.guide.items.length, 4);
  assert.equal(context.guide.info.length, 2);
  const property = f.DB.sqlite.prepare('SELECT * FROM property').get();
  const html = await renderPublicGuide(property, sample.guide).text();
  assert.ok(html.includes('policy-money'));
  assert.ok(html.includes('100％'));
  assert.ok(html.includes('tel:0755325333'));
  assert.ok(html.includes('https://giwon.cc/contact.html'));
  assert.ok(!html.includes(sample.wifi.password));
  assert.ok(!html.includes('料理提供不可・減額なし'));
  const guestHtml = await renderPage(property).text();
  assert.ok(guestHtml.includes('<noscript>'));
  assert.ok(guestHtml.includes('noindex'));
});
