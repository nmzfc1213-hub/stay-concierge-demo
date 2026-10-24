import { adminIdentity } from '../server/access.js';
import { renderAdmin } from '../server/admin-page.js';
import { secure } from '../server/security.js';
import { handleApi } from '../server/api.js';
import { notFound, renderPage, renderPublicGuide } from '../server/pages.js';

export async function onRequest(context) {
  const { request, env } = context;
  const path = new URL(request.url).pathname;
  if (path.startsWith('/api/')) return handleApi(request, env, promise => context.waitUntil(promise));
  if (path.startsWith('/assets/')) return context.next();
  if (path === '/admin/' && request.method === 'GET') {
    try {
      if (!env.DB) return secure(new Response('DB設定が必要です。', { status: 503 }));
      await adminIdentity(request, env);
      return renderAdmin();
    } catch (error) {
      return secure(new Response('管理画面を開けません。Cloudflare Accessのログイン・設定・所属登録を確認してください。', {
        status: [401, 403, 503].includes(error.status) ? error.status : 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      }));
    }
  }
  const match = path.match(/^\/p\/([a-z0-9-]{1,40})\/(confirm|privacy|guide)?$/);
  if (match && request.method === 'GET') {
    if (!env.DB) return secure(new Response('設定が必要です / Configuration required', { status: 503 }));
    try {
      const property = await env.DB.prepare('SELECT * FROM property WHERE slug = ?').bind(match[1]).first();
      if (property && match[2] === 'guide') {
        const version = await env.DB.prepare('SELECT guide_json FROM property_version WHERE property_id = ? AND version = ?')
          .bind(property.property_id, property.current_version).first();
        return renderPublicGuide(property, JSON.parse(version.guide_json));
      }
      if (property) return renderPage(property, match[2]);
    } catch {
      return secure(new Response('一時的に利用できません / Temporarily unavailable', { status: 503 }));
    }
  }
  return notFound();
}
