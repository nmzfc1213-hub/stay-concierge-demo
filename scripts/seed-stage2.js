import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomToken, hash } from '../server/security.js';

const selection = process.argv[2] || 'demo';
const configs = { demo: 'demo-stage2.json', giwon: 'giwon-demo.json' };
if (!Object.hasOwn(configs, selection)) throw new Error('Choose demo or giwon.');
const config = JSON.parse(await readFile(new URL(`../seeds/${configs[selection]}`, import.meta.url), 'utf8'));
const token = randomToken();
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const now = new Date().toISOString();
const arrival = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const departure = new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 10);
const expires = new Date(Date.now() + 10 * 86400000).toISOString();
const sql = [
  `INSERT INTO property VALUES (${[
    config.propertyId, config.slug, JSON.stringify(config.name), JSON.stringify(config.contact),
    JSON.stringify(config.wifi), 'Asia/Tokyo', 1, 0, null, config.notificationEmail, 1
  ].map(value => value === null ? 'NULL' : quote(value)).join(', ')});`,
  `INSERT INTO property_version VALUES (${[config.propertyId, 1, JSON.stringify(config.guide), now].map(quote).join(', ')});`,
  `INSERT INTO reservation (property_id, reservation_id, guest_label, arrival_date, departure_date, guide_version, cancelled_at, completed_at) VALUES (${[config.propertyId, 'reservation-demo-1', 'デモ代表者 / Demo guest', arrival, departure, 1].map(quote).join(', ')}, NULL, NULL);`,
  `INSERT INTO guest_token VALUES (${[config.propertyId, await hash(token), 'reservation-demo-1', expires].map(quote).join(', ')}, NULL);`
].join('\n');
await mkdir('.local', { recursive: true });
const sqlPath = selection === 'giwon' ? '.local/seed-giwon.sql' : '.local/seed.sql';
const linkPath = selection === 'giwon' ? '.local/giwon-link.txt' : '.local/demo-link.txt';
await writeFile(sqlPath, sql + '\n', { mode: 0o600 });
await writeFile(linkPath, `/p/${config.slug}/confirm#token=${token}\n`, { mode: 0o600 });
console.log(`Created ${selection} local seed and private link under .local/ (not tracked). No live service was contacted.`);
