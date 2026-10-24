import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/[[path]].js';
import { makeAdminCSRF, checkAdminCSRF } from '../server/access.js';
import { randomToken } from '../server/security.js';

test('dynamic error responses retain CSP and no-store without exposing database errors', async () => {
  const request = new Request('https://demo.example/p/demo/confirm');
  for (const env of [{}, { DB: { prepare() { throw new Error('PRIVATE-DB-DETAIL'); } } }]) {
    const response = await onRequest({ request, env });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.ok(response.headers.get('Content-Security-Policy').includes("script-src 'self'"));
    assert.ok(!response.headers.get('Content-Security-Policy').includes('unsafe-inline'));
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.ok(!(await response.text()).includes('PRIVATE-DB-DETAIL'));
  }
});

test('unknown pages return true 404 instead of the guest app with HTTP 200', async () => {
  for (const path of ['/does-not-exist', '/editor.html', '/data/demo.json', '/p/demo/unknown']) {
    const response = await onRequest({ request: new Request(`https://demo.example${path}`), env: {} });
    assert.equal(response.status, 404);
  }
});

test('admin CSRF is bound to the user and property and rejects trailing token segments', async () => {
  const identity = { subject: 'demo-user', property_id: 'p1' };
  const env = { ADMIN_CSRF_SECRET: randomToken() };
  const value = await makeAdminCSRF(identity, env);
  const request = token => new Request('https://demo.example', { headers: { 'X-CSRF-Token': token } });
  await checkAdminCSRF(request(value), identity, env);
  for (const bad of [value + '.extra', value + '.', value.slice(0, -8), '']) {
    await assert.rejects(checkAdminCSRF(request(bad), identity, env), error => error.status === 403);
  }
  await assert.rejects(checkAdminCSRF(request(value), { ...identity, property_id: 'p2' }, env));
  await assert.rejects(checkAdminCSRF(request(value), { ...identity, subject: 'other-user' }, env));
});
