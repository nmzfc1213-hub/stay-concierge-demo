export class ApiError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";

export function secure(response) {
  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy', CSP);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('Cache-Control', 'no-store');
  return new Response(response.body, { status: response.status, headers });
}

export function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers }
  });
}

export async function hash(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function bodyJSON(request, limit = 32768) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    throw new ApiError(415, 'JSON_REQUIRED');
  }
  if (Number(request.headers.get('content-length')) > limit) throw new ApiError(413, 'BODY_TOO_LARGE');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(422, 'INVALID_INPUT');
  let length = 0;
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      throw new ApiError(413, 'BODY_TOO_LARGE');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new ApiError(422, 'INVALID_INPUT');
  }
}

export function checkOrigin(request, env) {
  const allowed = env.APP_ORIGIN;
  if (!allowed || new URL(request.url).origin !== allowed) throw new ApiError(503, 'CONFIG_REQUIRED');
  const origin = request.headers.get('origin');
  const changing = !['GET', 'HEAD'].includes(request.method);
  if ((changing && origin !== allowed) || (origin && origin !== allowed)) {
    throw new ApiError(403, 'ORIGIN_REJECTED');
  }
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw new ApiError(403, 'ORIGIN_REJECTED');
}

export async function rateLimit(db, env, key, propertyId = '__public__', maximum = 60) {
  if (!env.RATE_LIMIT_SECRET) throw new ApiError(503, 'CONFIG_REQUIRED');
  const window = Math.floor(Date.now() / 60000);
  const digest = await hash(`${env.RATE_LIMIT_SECRET}:${key}`);
  const row = await db.prepare(`
    INSERT INTO rate_limit_bucket (property_id, bucket_key, window_start, count)
    VALUES (?, ?, ?, 1)
    ON CONFLICT (property_id, bucket_key, window_start)
    DO UPDATE SET count = count + 1 RETURNING count
  `).bind(propertyId, digest, window).first();
  if (row.count > maximum) throw new ApiError(429, 'RATE_LIMITED');
}

export function cookies(request) {
  return Object.fromEntries((request.headers.get('cookie') || '').split(';').map(part => {
    const at = part.indexOf('=');
    return [part.slice(0, at).trim(), part.slice(at + 1).trim()];
  }));
}

export function validLanguage(value) {
  if (!['ja', 'en'].includes(value)) throw new ApiError(422, 'INVALID_INPUT');
  return value;
}

export function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}
