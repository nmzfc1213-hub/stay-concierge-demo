import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LocalD1 } from './d1-local.js';

test('upgrade preserves old special requests as actionable tasks without altering confirmation history', async t => {
  const DB = new LocalD1();
  t.after(() => DB.sqlite.close());
  for (const file of ['0001_stage2.sql', '0002_admin.sql']) {
    DB.sqlite.exec(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
  const sample = JSON.parse(await readFile(new URL('../seeds/demo-stage2.json', import.meta.url), 'utf8'));
  const guide = { ...sample.guide, items: sample.guide.items.filter(item => item.audience === 'all') };
  DB.sqlite.prepare('INSERT INTO property VALUES (?, ?, ?, ?, ?, ?, 1, 0, NULL, ?, 1)').run(
    'p1', 'demo', JSON.stringify(sample.name), JSON.stringify(sample.contact), JSON.stringify(sample.wifi), 'Asia/Tokyo', sample.notificationEmail
  );
  DB.sqlite.prepare('INSERT INTO property_version VALUES (?, 1, ?, ?)').run('p1', JSON.stringify(guide), '2026-01-01');
  DB.sqlite.prepare('INSERT INTO reservation VALUES (?, ?, ?, ?, ?, 1, NULL, NULL, NULL)').run('p1', 'r1', 'Fictional', '2027-01-01', '2027-01-02');
  for (const item of guide.items) DB.sqlite.prepare('INSERT INTO confirmation VALUES (?, ?, 1, ?, 1, ?, ?)').run('p1', 'r1', item.id, 'en', '2026-01-01');
  DB.sqlite.prepare('INSERT INTO submission VALUES (?, ?, 1, ?, ?, ?, ?, ?, 1, ?)').run(
    'p1', 'r1', crypto.randomUUID(), 'existing-hash', 'late', 'Original fictional request', 'en', '2026-01-01'
  );
  DB.sqlite.exec("UPDATE reservation SET completed_at = '2026-01-01'");
  DB.sqlite.exec(await readFile(new URL('../migrations/0003_frontdesk.sql', import.meta.url), 'utf8'));
  const task = DB.sqlite.prepare('SELECT * FROM service_request').get();
  assert.equal(task.status, 'open');
  assert.equal(task.client_request_id, 'completion:1');
  assert.equal(task.property_id, 'p1');
  assert.match(task.request_id, /^[a-f0-9-]{36}$/);
  assert.ok(task.message.includes('Original fictional request'));
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM confirmation').get().n, 4);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM notification').get().n, 0);
  assert.deepEqual(DB.sqlite.prepare('PRAGMA foreign_key_check').all(), []);
});
