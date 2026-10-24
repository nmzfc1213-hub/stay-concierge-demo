import { ApiError } from './security.js';

export function text(value, maximum = 2000, optional = false) {
  if (typeof value !== 'string' || value.length > maximum || (!optional && !value.trim()) ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new ApiError(422, 'INVALID_INPUT');
  return value.trim();
}

function pair(value, maximum = 4000) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['ja', 'en'].includes(key))) {
    throw new ApiError(422, 'TRANSLATIONS_REQUIRED');
  }
  return { ja: text(value.ja, maximum), en: text(value.en, maximum) };
}

function httpsLink(value) {
  const input = text(value || '', 1000, true);
  if (!input) return '';
  let url;
  try { url = new URL(input); } catch { throw new ApiError(422, 'INVALID_LINK'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new ApiError(422, 'INVALID_LINK');
  return url.href;
}

export function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ApiError(422, 'INVALID_DATE');
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new ApiError(422, 'INVALID_DATE');
  return value;
}

export function reservationInput(value) {
  if (!value || typeof value !== 'object') throw new ApiError(422, 'INVALID_INPUT');
  if (Object.keys(value).some(key => !['guestLabel', 'arrivalDate', 'departureDate', 'externalRef'].includes(key))) throw new ApiError(422, 'INVALID_INPUT');
  const arrivalDate = date(value.arrivalDate);
  const departureDate = date(value.departureDate);
  if (departureDate <= arrivalDate || Date.parse(departureDate) - Date.parse(arrivalDate) > 366 * 86400000) {
    throw new ApiError(422, 'INVALID_DATE');
  }
  return {
    guestLabel: text(value.guestLabel, 100), arrivalDate, departureDate,
    externalRef: value.externalRef ? text(value.externalRef, 100) : null
  };
}

export function settingsInput(value) {
  if (!value || typeof value !== 'object' || !Number.isInteger(value.expectedVersion)) throw new ApiError(422, 'INVALID_INPUT');
  const allowed = ['expectedVersion', 'name', 'contact', 'wifi', 'notificationEmail', 'guide', 'directBookingEnabled', 'directBookingUrl', 'otaReviewed'];
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new ApiError(422, 'INVALID_INPUT');
  const name = pair(value.name, 100);
  const contact = {
    phone: text(value.contact?.phone, 30), email: text(value.contact?.email || '', 254, true),
    line: text(value.contact?.line || '', 500, true), formUrl: httpsLink(value.contact?.formUrl)
  };
  if (!/^\+?[0-9 ()-]{6,30}$/.test(contact.phone) ||
    (contact.email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(contact.email))) throw new ApiError(422, 'INVALID_CONTACT');
  if (contact.line && !/^https:\/\/line\.me\/[a-zA-Z0-9_/?=.&%+-]+$/.test(contact.line)) throw new ApiError(422, 'INVALID_CONTACT');
  const notificationEmail = text(value.notificationEmail, 254);
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(notificationEmail)) throw new ApiError(422, 'INVALID_CONTACT');
  const wifi = { ssid: text(value.wifi?.ssid, 100), password: text(value.wifi?.password, 100) };
  const items = value.guide?.items;
  const slots = value.guide?.arrivalSlots;
  if (!Array.isArray(items) || items.length < 1 || items.length > 12 || !Array.isArray(slots) || slots.length < 2 || slots.length > 24) throw new ApiError(422, 'INVALID_GUIDE');
  function mapList(list, kind) {
    const ids = new Set();
    return list.map(item => {
      const idPattern = kind === 'item' ? /^[a-z][a-z0-9-]{0,39}$/ : /^[a-z0-9][a-z0-9-]{0,39}$/;
      if (!idPattern.test(item.id || '') || ids.has(item.id)) throw new ApiError(422, 'INVALID_GUIDE');
      ids.add(item.id);
      const audience = item.audience || 'all';
      if (kind === 'item' && (!['all', 'dinner', 'late'].includes(audience) ||
        (['arrival', 'charges', 'cancellation', 'rules'].includes(item.id) && audience !== 'all'))) throw new ApiError(422, 'INVALID_GUIDE');
      let notice;
      if (kind === 'item' && item.notice !== undefined) {
        if (!item.notice || !['money', 'deadline', 'info'].includes(item.notice.tone)) throw new ApiError(422, 'INVALID_GUIDE');
        notice = { tone: item.notice.tone, lead: pair(item.notice.lead, 200), sourceUrl: httpsLink(item.notice.sourceUrl) };
      }
      return kind === 'item' ? { id: item.id, title: pair(item.title, 150), body: pair(item.body), audience, ...(notice ? { notice } : {}) }
        : { id: item.id, label: pair(item.label, 150),
          ...(item.requiresContact !== undefined ? { requiresContact: item.requiresContact } : {}) };
    });
  }
  const guide = { items: mapList(items, 'item'), arrivalSlots: mapList(slots, 'slot') };
  if (guide.arrivalSlots.some(slot => slot.requiresContact !== undefined && typeof slot.requiresContact !== 'boolean')) throw new ApiError(422, 'INVALID_GUIDE');
  if (value.guide.info !== undefined) {
    if (!Array.isArray(value.guide.info) || value.guide.info.length > 8) throw new ApiError(422, 'INVALID_GUIDE');
    guide.info = mapList(value.guide.info, 'item');
    const ids = [...guide.items, ...guide.info].map(item => item.id);
    if (new Set(ids).size !== ids.length) throw new ApiError(422, 'INVALID_GUIDE');
  }
  if (!guide.items.some(item => item.audience === 'all')) throw new ApiError(422, 'INVALID_GUIDE');
  if (!guide.arrivalSlots.some(slot => slot.id === 'late') || !guide.arrivalSlots.some(slot => slot.id === 'unknown')) throw new ApiError(422, 'INVALID_GUIDE');
  if (typeof value.directBookingEnabled !== 'boolean') throw new ApiError(422, 'INVALID_INPUT');
  let directBookingUrl = text(value.directBookingUrl || '', 1000, true);
  if (directBookingUrl) {
    let url;
    try { url = new URL(directBookingUrl); } catch { throw new ApiError(422, 'INVALID_LINK'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new ApiError(422, 'INVALID_LINK');
    directBookingUrl = url.href;
  }
  if (value.directBookingEnabled && (!directBookingUrl || value.otaReviewed !== true)) throw new ApiError(422, 'OTA_REVIEW_REQUIRED');
  return { name, contact, wifi, notificationEmail, guide, directBookingEnabled: value.directBookingEnabled, directBookingUrl };
}

// RFC 4180-style quoted cells, CRLF and embedded newlines; never split CSV
// using only commas. Input is capped before parsing, and every row is revalidated.
export function parseCSV(input) {
  if (typeof input !== 'string' || new TextEncoder().encode(input).length > 200000) throw new ApiError(413, 'CSV_TOO_LARGE');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let closed = false;
  const csv = input.replace(/^\uFEFF/, '');
  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    if (quoted) {
      if (char === '"' && csv[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') { quoted = false; closed = true; }
      else cell += char;
    } else if (char === '"' && !cell && !closed) quoted = true;
    else if (char === ',' || char === '\n' || char === '\r') {
      row.push(cell); cell = ''; closed = false;
      if (char !== ',') {
        if (row.some(value => value.trim())) rows.push(row);
        row = [];
        if (char === '\r' && csv[i + 1] === '\n') i += 1;
      }
    } else {
      if (closed || char === '"') throw new ApiError(422, 'CSV_INVALID');
      cell += char;
    }
    if (rows.length > 201 || cell.length > 4000) throw new ApiError(422, 'CSV_LIMIT');
  }
  if (quoted) throw new ApiError(422, 'CSV_INVALID');
  row.push(cell);
  if (row.some(value => value.trim())) rows.push(row);
  const headers = rows.shift();
  const expected = ['external_ref', 'guest_label', 'arrival_date', 'departure_date'];
  if (!headers || headers.join(',') !== expected.join(',') || !rows.length || rows.length > 200) throw new ApiError(422, 'CSV_HEADERS');
  return rows.map((row, index) => {
    try {
      if (row.length !== 4) throw new Error();
      return { row: index + 2, value: reservationInput({
        externalRef: row[0], guestLabel: row[1], arrivalDate: row[2], departureDate: row[3]
      }) };
    } catch { return { row: index + 2, error: 'INVALID_ROW' }; }
  });
}

export function urgency(arrivalDate, completedAt, cancelledAt, timezone, now = new Date()) {
  if (cancelledAt) return 'cancelled';
  if (completedAt) return 'complete';
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: timezone }).format(now);
  if (arrivalDate < today) return 'overdue';
  if (arrivalDate === today) return 'today';
  const tomorrow = new Date(`${today}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return arrivalDate === tomorrow.toISOString().slice(0, 10) ? 'tomorrow' : 'pending';
}
