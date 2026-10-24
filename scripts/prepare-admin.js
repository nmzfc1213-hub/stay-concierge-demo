import { mkdir, writeFile } from 'node:fs/promises';

// Run only with the verified Access subject and email for the approved
// property. This does not create a Cloudflare account or bypass Access.
const { ADMIN_PROPERTY_ID, ADMIN_ACCESS_SUB, ADMIN_EMAIL } = process.env;
if (!/^[a-z0-9-]{1,80}$/.test(ADMIN_PROPERTY_ID || '') ||
  typeof ADMIN_ACCESS_SUB !== 'string' || !ADMIN_ACCESS_SUB || ADMIN_ACCESS_SUB.length > 300 ||
  !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(ADMIN_EMAIL || '')) {
  throw new Error('Set verified ADMIN_PROPERTY_ID, ADMIN_ACCESS_SUB and ADMIN_EMAIL locally. Do not put real identity data in Git.');
}
const quote = value => `'${value.replaceAll("'", "''")}'`;
const sql = `INSERT INTO admin_user (property_id, user_id, access_subject, email, role, active) VALUES (${[
  ADMIN_PROPERTY_ID, crypto.randomUUID(), ADMIN_ACCESS_SUB, ADMIN_EMAIL, 'owner'
].map(quote).join(', ')}, 1);\n`;
await mkdir('.local', { recursive: true });
await writeFile('.local/admin-user.sql', sql, { mode: 0o600 });
console.log('Prepared ignored local admin seed. No remote database or Access settings were changed.');
