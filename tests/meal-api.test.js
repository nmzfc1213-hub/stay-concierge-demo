import { handleAdminMeal, readMeal } from '../server/meal.js';
import '../public/assets/meal-model.js';
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
  for (const name of ['0001_stage2.sql', '0002_admin.sql', '0003_frontdesk.sql', '0004_meal_demo.sql']) {
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
  return { DB, request, env, identity: { property_id: sample.propertyId, reservation_id: 'sample-reservation', guide_version: 1 } };
}

const M = globalThis.StayMealModel;
function payload(categories = ['none']) {
  const answers = M.fresh(); answers.categories = categories;
  return { answers, version: 1, expectedRevision: 0, demoDate: '2026-12-26', consent: true };
}
test('meal response saves separately, survives reload, revisions protect concurrent overwrites', async t => {
  const { DB, request } = await fixture(t);
  assert.equal((await (await request('meal')).json()).status, 'unanswered');
  let response = await request('meal', 'PUT', payload()); assert.equal(response.status, 200);
  const saved = await response.json(); assert.equal(saved.status, 'answered'); assert.equal(saved.revision, 1);
  assert.equal((await (await request('meal')).json()).revision, 1);
  assert.equal((await request('meal', 'PUT', payload())).status, 409);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM confirmation').get().n, 0);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM notification').get().n, 0);
  const next = payload(['other']); next.expectedRevision = 1; next.answers.other = 'Fictional request';
  response = await request('meal', 'PUT', next); assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'review');
});
test('meal validation rejects unknown categories, incomplete allergy, missing consent, deadline and oversized text', async t => {
  const { request } = await fixture(t);
  const cases = [
    b => {b.consent = false;}, b => {b.answers.categories = ['constructor'];},
    b => {b.answers.categories = ['none','allergy'];}, b => {b.answers.categories = ['allergy']; b.answers.allergens = ['buckwheat'];},
    b => {b.demoDate = '2026-12-29';}, b => {b.demoDate = '2026-02-31';},
    b => {b.answers.final = 'x'.repeat(2001);}, b => {b.answers.hidden.bad = 'allowed';},
    b => {b.answers.categories = ['belief']; b.answers.avoided = ['bad'];}, b => {b.staffApproval = true;}
  ];
  for (const change of cases) {const b = payload(); change(b); assert.equal((await request('meal','PUT',b)).status,422);}
  const b = payload(); b.version = 2; assert.equal((await request('meal','PUT',b)).status,409);
});
test('allergy trace mixing and symptoms are retained as review, never approved automatically', async t => {
  const { request } = await fixture(t); const b = payload(['allergy']);
  b.answers.allergens = ['buckwheat']; b.answers.allergy.buckwheat = {severity:'anaphylaxis', trace:'notAllowed', stock:'notAllowed', processed:'unknown'};
  const response = await request('meal','PUT',b); assert.equal(response.status,200);
  const result = await response.json(); assert.equal(result.status,'review'); assert.equal(result.submitted.answers.allergy.buckwheat.trace,'notAllowed');
  assert.equal(result.approved, undefined);
});
test('meal data is tenant scoped, demo only, and expired answers are removed on access', async t => {
  const { DB, request, identity } = await fixture(t);
  await request('meal','PUT',payload());
  assert.equal((await readMeal(DB, {...identity,property_id:'other'})).status,'unanswered');
  const row = DB.sqlite.prepare('SELECT expires_at FROM meal_response').get();
  assert.equal((await readMeal(DB, identity, row.expires_at)).status,'unanswered');
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM meal_response').get().n,0);
  DB.sqlite.prepare('UPDATE property SET demo = 0').run();
  assert.equal((await request('meal','PUT',payload())).status,403);
});
test('only property owner can delete meal answers; guest cannot submit approval; other tenant cannot view', async t => {
  const { DB, request, identity, env } = await fixture(t); await request('meal','PUT',payload());
  const req = new Request('https://demo.example/api/admin/reservations/sample-reservation/meal',{method:'DELETE'});
  await assert.rejects(handleAdminMeal(req,env,{property_id:'other',role:'owner'},identity.reservation_id),e=>e.status===404);
  await assert.rejects(handleAdminMeal(req,env,{property_id:identity.property_id,role:'staff'},identity.reservation_id),e=>e.status===403);
  const response = await handleAdminMeal(req,env,{property_id:identity.property_id,role:'owner',user_id:'demo-owner'},identity.reservation_id);
  assert.equal(response.status,200); assert.equal((await request('meal','DELETE')).status,405);
  const read = await (await request('meal')).json(); assert.equal(read.status,'unanswered');
});
