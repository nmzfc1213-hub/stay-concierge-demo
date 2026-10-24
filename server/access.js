import { ApiError, hash } from './security.js';
import { statement } from './repository.js';

const keyCache = new Map();
const utf8 = new TextEncoder();

function decode(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid');
  const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function encode(value) {
  return btoa(String.fromCharCode(...value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export async function verifyAccess(request, env, fetcher = fetch) {
  const issuer = env.ACCESS_TEAM_DOMAIN;
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer || '') || !env.ACCESS_AUD) {
    throw new ApiError(503, 'ACCESS_CONFIG_REQUIRED');
  }
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || token.length > 16384) throw new ApiError(401, 'ADMIN_LOGIN_REQUIRED');
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error();
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error();
    const seconds = Date.now() / 1000;
    if (claims.iss !== issuer || !Number.isFinite(claims.exp) || claims.exp <= seconds ||
      (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > seconds)) ||
      !Number.isFinite(claims.iat) || claims.iat > seconds + 30 ||
      typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 300 ||
      typeof claims.email !== 'string' || !claims.email || claims.email.length > 254) throw new Error();
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(env.ACCESS_AUD)) throw new Error();
    let cached = keyCache.get(issuer);
    if (!cached || cached.until < Date.now()) {
      const response = await fetcher(`${issuer}/cdn-cgi/access/certs`, {
        signal: AbortSignal.timeout(5000), redirect: 'error'
      });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!Array.isArray(data.keys) || data.keys.length > 20) throw new Error();
      cached = { until: Date.now() + 300000, keys: data.keys };
      keyCache.set(issuer, cached);
    }
    const jwk = cached.keys.find(key => key.kid === header.kid && key.kty === 'RSA' && (!key.alg || key.alg === 'RS256'));
    if (!jwk) {
      keyCache.delete(issuer);
      throw new Error();
    }
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(parts[2]), utf8.encode(`${parts[0]}.${parts[1]}`))) {
      throw new Error();
    }
    return { subject: claims.sub, email: claims.email };
  } catch {
    throw new ApiError(401, 'ADMIN_LOGIN_REQUIRED');
  }
}

export async function adminIdentity(request, env) {
  const identity = await verifyAccess(request, env);
  const users = await statement(env.DB, `
    SELECT u.property_id, u.user_id, u.role, p.name_json, p.timezone, p.slug
    FROM admin_user u JOIN property p ON p.property_id = u.property_id
    WHERE u.access_subject = ? AND lower(u.email) = lower(?) AND u.active = 1
    ORDER BY u.property_id
  `, identity.subject, identity.email).all();
  if (!users.results.length) throw new ApiError(403, 'ADMIN_NOT_REGISTERED');
  const requested = request.headers.get('X-Property-Id');
  const user = requested ? users.results.find(user => user.property_id === requested) : users.results[0];
  if (!user) throw new ApiError(403, 'PROPERTY_REJECTED');
  return { ...user, subject: identity.subject, properties: users.results.map(row => ({
    propertyId: row.property_id, name: JSON.parse(row.name_json), slug: row.slug
  })) };
}

async function signingKey(env) {
  if (!env.ADMIN_CSRF_SECRET || env.ADMIN_CSRF_SECRET.length < 32) throw new ApiError(503, 'CONFIG_REQUIRED');
  return crypto.subtle.importKey('raw', utf8.encode(env.ADMIN_CSRF_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function makeAdminCSRF(identity, env) {
  const expires = Math.floor(Date.now() / 1000) + 1800;
  const payload = encode(utf8.encode(JSON.stringify({
    subject: await hash(identity.subject), property: identity.property_id, expires
  })));
  const signature = await crypto.subtle.sign('HMAC', await signingKey(env), utf8.encode(payload));
  return `${payload}.${encode(new Uint8Array(signature))}`;
}

export async function checkAdminCSRF(request, identity, env) {
  try {
    const raw = request.headers.get('X-CSRF-Token') || '';
    if (raw.length > 2048) throw new Error();
    const parts = raw.split('.');
    if (parts.length !== 2) throw new Error();
    const [payload, signature] = parts;
    if (!await crypto.subtle.verify('HMAC', await signingKey(env), decode(signature), utf8.encode(payload))) throw new Error();
    const data = JSON.parse(new TextDecoder().decode(decode(payload)));
    if (data.subject !== await hash(identity.subject) || data.property !== identity.property_id ||
      !Number.isFinite(data.expires) || data.expires <= Date.now() / 1000) throw new Error();
  } catch {
    throw new ApiError(403, 'CSRF_REJECTED');
  }
}
