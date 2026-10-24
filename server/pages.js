import { escapeHTML, secure } from './security.js';

export function contactMarkup(contact) {
  const tel = /^\+?[0-9 ()-]{6,30}$/.test(contact.phone || '') ? contact.phone.replace(/[ ()-]/g, '') : '';
  const email = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(contact.email || '') ? contact.email : '';
  const line = /^https:\/\/line\.me\//.test(contact.line || '') ? contact.line : '';
  let form = '';
  try {
    const url = new URL(contact.formUrl);
    if (url.protocol === 'https:' && !url.username && !url.password) form = url.href;
  } catch { /* Optional contact form; no invented address. */ }
  return [
    tel ? `<a href="tel:${escapeHTML(tel)}">電話 / Call：${escapeHTML(contact.phone)}</a>` : '',
    email ? `<a href="mailto:${escapeHTML(email)}">メール / Email</a>` : '',
    line ? `<a href="${escapeHTML(line)}" rel="noreferrer">LINE</a>` : '',
    form ? `<a href="${escapeHTML(form)}" rel="noreferrer">お問い合わせフォーム / Contact form</a>` : ''
  ].join(' ');
}

export function renderPage(property, kind = 'confirm') {
  const name = JSON.parse(property.name_json);
  const contact = JSON.parse(property.contact_json);
  const contacts = contactMarkup(contact);
  const privacy = kind === 'privacy';
  const title = `${name.ja} | ${privacy ? 'プライバシー / Privacy' : '到着前の最終確認 / Pre-arrival confirmation'}`;
  const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${property.demo ? '<meta name="robots" content="noindex, nofollow">' : ''}
  <title>${escapeHTML(title)}</title>
  <link rel="stylesheet" href="/assets/confirmation.css">
  <link rel="stylesheet" href="/assets/meal.css">
  ${privacy ? '' : '<script type="module" src="/assets/guest.js"></script>'}
</head>
<body>
  <header class="site-header">
    <a href="/p/${escapeHTML(property.slug)}/" class="brand">STAY CONCIERGE<span>PRE-ARRIVAL · KYOTO</span></a>
    ${privacy ? '' : '<div class="languages" aria-label="言語 / Language"><button type="button" data-lang="ja" lang="ja" aria-label="日本語に切り替え" aria-pressed="true">日本語</button><button type="button" data-lang="en" lang="en" aria-label="Switch to English" aria-pressed="false">EN</button></div>'}
  </header>
  <main data-property="${escapeHTML(property.slug)}">
    <p class="eyebrow">${property.demo ? 'DEMO · 架空の予約 / FICTIONAL BOOKING' : 'PRE-ARRIVAL CONFIRMATION'}</p>
    <h1 id="page-title">${escapeHTML(name.ja)}</h1>
    ${privacy ? `<section class="card"><h2>個人情報の取扱い / Privacy</h2><p>【ダミー・要・専門家確認】到着前の確認、施設からの対応、操作履歴の記録のために情報を利用する想定です。保存期間・取得同意・委託先への提供等は、実運用前に専門家の確認が必要です。</p><p>Dummy policy — expert review required. Information is intended for pre-arrival confirmation, property support and operational records. Retention, consent and processing arrangements require review before real use.</p><p>宿泊者名簿・旅券番号の入力は行いません。 / No passport or statutory guest-register information is collected here.</p></section>` : `<p id="subtitle">到着前の大切なご案内を、ひとつずつ。 / Please review the important information before your stay.</p>
    <p id="status" role="status" aria-live="polite"></p>
    <div id="app" aria-busy="true"></div>
    <noscript><section class="card"><h2>JavaScriptが無効です / JavaScript is disabled</h2><p>このページから確認を送信できません。次の連絡先から宿へご連絡ください。 / You cannot submit confirmation on this page. Please contact the property below.</p>${contacts}</section></noscript>`}
    <section class="contact card"><h2 id="contact-title">宿への連絡 / Contact the property</h2><div id="contact-links">${contacts}</div></section>
    <p class="privacy"><a id="privacy-link" href="/p/${escapeHTML(property.slug)}/privacy">個人情報の取扱い（ダミー・要・専門家確認） / Privacy (draft, expert review required)</a></p>
  </main>
  <footer>Stay Concierge · ${property.demo ? 'Demo — 実際の宿泊者情報は入力しないでください' : 'Guest confirmation'}</footer>
</body>
</html>`;
  return secure(new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
}

export function notFound() {
  return secure(new Response('<!doctype html><html lang="ja"><meta charset="utf-8"><title>404 | Stay Concierge</title><h1>404 — ページが見つかりません / Page not found</h1><p>予約時に案内されたURLをご確認ください。 / Please check the link provided with your booking.</p></html>', {
    status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' }
  }));
}

export function renderPublicGuide(property, guide) {
  const name = JSON.parse(property.name_json);
  const contact = JSON.parse(property.contact_json);
  const items = [...guide.items, ...(guide.info || [])].filter(item => !['dinner', 'late'].includes(item.audience));
  const bodyMarkup = text => text.split(/(\d{1,2}:\d{2}[–〜-]\d{1,2}:\d{2})/g)
    .map(part => /^\d{1,2}:\d{2}[–〜-]\d{1,2}:\d{2}$/.test(part)
      ? `<span class="time-range">${escapeHTML(part)}</span>` : escapeHTML(part)).join('');
  const noticeMarkup = (item, language) => {
    if (!item.notice) return '';
    const tone = ['money', 'deadline', 'info'].includes(item.notice.tone) ? item.notice.tone : 'info';
    const labels = { ja: { money: '重要 · 料金', deadline: '重要 · 時間・期限', info: 'ご利用前の確認' },
      en: { money: 'Important · charges', deadline: 'Important · times', info: 'Before your visit' } };
    return `<aside class="policy-notice policy-${tone}" data-language="${language}" lang="${language}">
      <p class="policy-label">${labels[language][tone]}</p>
      <p class="policy-lead">${bodyMarkup(item.notice.lead[language] || item.notice.lead.ja)}</p></aside>`;
  };
  const sections = items.map(item => `<section class="card">
    <h2 data-language="ja" lang="ja">${escapeHTML(item.title.ja)}</h2>
    <h2 data-language="en" lang="en">${escapeHTML(item.title.en || item.title.ja)}</h2>
    ${noticeMarkup(item, 'ja')}${noticeMarkup(item, 'en')}
    <p class="content" data-language="ja" lang="ja">${bodyMarkup(item.body.ja)}</p>
    <p class="content" data-language="en" lang="en">${bodyMarkup(item.body.en || item.body.ja)}</p>
  </section>`).join('');
  return secure(new Response(`<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  ${property.demo ? '<meta name="robots" content="noindex, nofollow">' : ''}
  <title>${escapeHTML(name.ja)} | 館内案内 / Guest guide</title>
  <link rel="stylesheet" href="/assets/confirmation.css">
  <link rel="stylesheet" href="/assets/meal.css"><script type="module" src="/assets/guide.js"></script>
</head><body>
  <header class="site-header"><div class="brand">STAY CONCIERGE<span>GUEST GUIDE · KYOTO</span></div>
    <div class="languages" aria-label="言語 / Language"><button type="button" data-lang="ja" lang="ja" aria-label="日本語に切り替え">日本語</button><button type="button" data-lang="en" lang="en" aria-label="Switch to English">EN</button></div>
  </header><main>
    <p class="eyebrow">${property.demo ? 'DEMO · 試作・架空の予約' : 'GUEST GUIDE'}</p>
    <h1 data-language="ja" lang="ja">${escapeHTML(name.ja)}</h1><h1 data-language="en" lang="en">${escapeHTML(name.en || name.ja)}</h1>
    <p data-language="ja" lang="ja">共通の館内案内です。入力は不要です。予約内容やWi-Fiは表示されません。予約ごとの確認が必要な場合はフロントへお申し出ください。</p>
    <p data-language="en" lang="en">General guest information. No form is required. Private booking details and Wi-Fi credentials are not displayed. Ask reception if you need your private confirmation link.</p>
    ${sections}<section class="contact card"><h2>宿への連絡 / Contact</h2>${contactMarkup(contact)}</section>
    <p class="privacy"><a href="/p/${escapeHTML(property.slug)}/privacy">個人情報の取扱い（ダミー・要・専門家確認） / Privacy (draft)</a></p>
  </main><footer>Stay Concierge · ${property.demo ? 'DEMO' : 'Guest guide'}</footer>
</body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
}
