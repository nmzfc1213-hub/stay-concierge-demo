import './meal-model.js';
import './meal-ui.js';
import { initialLanguage, localized, translate } from './i18n.js';

const app = document.getElementById('app');
const status = document.getElementById('status');
const property = document.querySelector('main').dataset.property;
let storage;
try { storage = window.localStorage; } catch { storage = null; }
let language = initialLanguage(location.search, storage, navigator.language);
let csrf = '';
let context;
let step = 0;
let screen = 'loading';
let busy = false;
let arrivalSlot = '';
let notes = '';
let receipt;
let resultUnknown = false;
let requestId = crypto.randomUUID();
let questionOpen = false;
let questionText = '';
let questionRequestId = crypto.randomUUID();
const t = key => translate(language, key);
const l = value => localized(value, language);

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function message(key, error = false) {
  status.textContent = t(key);
  status.className = error ? 'message error' : 'message';
  status.setAttribute('role', error ? 'alert' : 'status');
}

function focusHeading() {
  const heading = app.querySelector('h2');
  if (heading) {
    heading.tabIndex = -1;
    heading.focus();
  }
}

function button(key, callback, secondary = false) {
  const result = node('button', t(key), secondary ? 'secondary' : 'primary');
  result.type = 'button';
  result.disabled = busy;
  result.addEventListener('click', callback);
  return result;
}

async function api(path, method = 'GET', body) {
  const response = await fetch(`/api/guest/${path}`, {
    method, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000),
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(method !== 'GET' && csrf ? { 'X-CSRF-Token': csrf } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  let value;
  try { value = await response.json(); } catch { throw new Error('NETWORK'); }
  if (!response.ok) {
    const error = new Error(value.error || 'NETWORK');
    error.status = response.status;
    throw error;
  }
  return value;
}

function errorKey(error) {
  if ([401, 404, 410].includes(error.status)) return 'invalid';
  if (error.status === 409) return 'changed';
  if (error.status === 429) return 'limited';
  return 'error';
}

async function refreshContext() {
  const next = await api('context');
  const changed = next.version !== context.version;
  if (changed || next.reservation.completedAt) {
    const nextReceipt = await api('receipt');
    context = next;
    receipt = nextReceipt;
    if (nextReceipt.completed) screen = 'done';
    else {
      step = context.guide.items.findIndex(item => !context.answers.some(answer => answer.item_id === item.id));
      screen = step < 0 ? 'arrival' : 'item';
      if (step < 0) step = 0;
    }
    if (changed) {
      arrivalSlot = ''; notes = ''; resultUnknown = false; requestId = crypto.randomUUID();
    }
  } else context = next;
  return changed;
}

function renderChrome() {
  document.documentElement.lang = language;
  const name = context ? l(context.property.name) : 'Stay Concierge';
  document.title = `${name} | ${t('title')}`;
  document.getElementById('page-title').textContent = context ? name : t('title');
  document.getElementById('subtitle').textContent = t('subtitle');
  document.getElementById('contact-title').textContent = t('contact');
  document.getElementById('privacy-link').textContent = t('privacy');
  document.querySelectorAll('[data-lang]').forEach(control => {
    control.setAttribute('aria-pressed', String(control.dataset.lang === language));
    control.setAttribute('aria-label', control.dataset.lang === 'ja' ? '日本語に切り替え' : 'Switch to English');
    control.lang = control.dataset.lang;
    control.disabled = busy;
  });
}

function readableText(parent, text) {
  const pieces = text.split(/(\d{1,2}:\d{2}[–〜-]\d{1,2}:\d{2})/g);
  for (const piece of pieces) {
    if (/^\d{1,2}:\d{2}[–〜-]\d{1,2}:\d{2}$/.test(piece)) {
      parent.append(node('span', piece, 'time-range'));
    } else parent.append(document.createTextNode(piece));
  }
}

function contactLink(parent) {
  const link = node('a', t('contact'), 'contact-action');
  link.href = '#contact-links';
  parent.append(link);
}

function progress(parent) {
  const list = node('ol', undefined, 'steps');
  list.setAttribute('aria-label', t('steps'));
  const labels = [...context.guide.items.map(item => l(item.title)), t('arrival'), t('review')];
  labels.forEach((label, index) => {
    const item = node('li', `${index + 1}. ${label}`);
    const current = screen === 'item' ? step : screen === 'arrival' ? labels.length - 2 : labels.length - 1;
    if (index === current) item.setAttribute('aria-current', 'step');
    list.append(item);
  });
  parent.append(list);
}

async function acknowledge(checkbox) {
  if (!checkbox.checked) { message('requiredCheck', true); return; }
  busy = true;
  render();
  message('saving');
  try {
    const item = context.guide.items[step];
    await api(`answers/${item.id}`, 'PUT', { version: context.version, language, answer: true });
    const changed = await refreshContext();
    if (!changed && screen !== 'done') {
      step += 1;
      if (step >= context.guide.items.length) screen = 'arrival';
    }
    message(changed ? 'changed' : 'saved');
  } catch (error) { message(errorKey(error), true); }
  busy = false;
  render();
  focusHeading();
}

function renderItem(parent) {
  const item = context.guide.items[step];
  parent.append(node('p', `${t('step')} ${step + 1} / ${context.guide.items.length}`, 'eyebrow'));
  const content = node('p', undefined, 'content');
  readableText(content, l(item.body));
  parent.append(node('h2', l(item.title)));
  renderNotice(parent, item);
  parent.append(content);
  if (item.id === 'arrival' || item.id === 'charges' || item.id === 'cancellation') contactLink(parent);
  const label = node('label', undefined, 'checkbox-label');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = context.answers.some(answer => answer.item_id === item.id);
  checkbox.disabled = busy;
  label.append(checkbox, node('span', t('understood')));
  parent.append(label, button('acknowledge', () => acknowledge(checkbox)));
  if (step > 0) parent.append(button('back', () => { step -= 1; render(); focusHeading(); }, true));
}

function renderArrival(parent) {
  parent.append(node('h2', t('arrival')));
  const form = document.createElement('form');
  form.noValidate = true;
  const label = node('label', t('arrivalLabel'));
  const select = document.createElement('select');
  select.name = 'arrival';
  select.setAttribute('aria-required', 'true');
  const placeholder = node('option', t('choose'));
  placeholder.value = '';
  select.append(placeholder);
  for (const slot of context.guide.arrivalSlots) {
    const option = node('option', l(slot.label));
    option.value = slot.id;
    select.append(option);
  }
  select.value = arrivalSlot;
  const requiresContact = value => value === 'late' || context.guide.arrivalSlots.find(slot => slot.id === value)?.requiresContact;
  select.addEventListener('change', () => {
    arrivalSlot = select.value;
    late.hidden = !requiresContact(arrivalSlot);
  });
  label.append(select);
  const late = node('p', t('arrivalContact'), 'attention');
  late.hidden = !requiresContact(arrivalSlot);
  contactLink(late);
  const notesLabel = node('label', t('notes'));
  const textarea = document.createElement('textarea');
  textarea.maxLength = 2000;
  textarea.value = notes;
  textarea.name = 'notes';
  textarea.setAttribute('aria-required', 'true');
  textarea.setAttribute('aria-describedby', 'notes-help');
  textarea.addEventListener('input', () => { notes = textarea.value; });
  notesLabel.append(textarea);
  const help = node('p', t('notesHelp'), 'small');
  help.id = 'notes-help';
  const mealLink = node('a', language === 'ja' ? '下の食事ヒアリングへ進む' : 'Go to the dietary interview below');
  mealLink.href = '#dietary-interview';
  if (context.property.demo) help.append(document.createTextNode(' '), mealLink);
  const next = button('next', async () => {
    if (!arrivalSlot) { select.setAttribute('aria-invalid', 'true'); message('arrivalError', true); select.focus(); return; }
    if (!notes.trim() || notes.length > 2000) { textarea.setAttribute('aria-invalid', 'true'); message('notesError', true); textarea.focus(); return; }
    busy = true;
    renderChrome();
    next.disabled = true;
    try {
      context = await api('review');
      if (!context.guide.items.every(item => context.answers.some(answer => answer.item_id === item.id))) {
        screen = 'item';
        step = context.guide.items.findIndex(item => !context.answers.some(answer => answer.item_id === item.id));
        message('changed', true);
      } else { screen = 'review'; status.textContent = ''; }
    } catch (error) { message(errorKey(error), true); }
    busy = false;
    render();
    focusHeading();
  });
  form.addEventListener('submit', event => { event.preventDefault(); next.click(); });
  form.append(label, late, notesLabel, help, node('p', t('purpose'), 'small'), next);
  form.append(button('back', () => { screen = 'item'; step = context.guide.items.length - 1; render(); focusHeading(); }, true));
  parent.append(form);
}

function renderReview(parent) {
  parent.append(node('h2', t('review')), node('p', t('reviewHelp'), 'attention'));
  for (const item of context.guide.items) {
    const saved = context.answers.find(answer => answer.item_id === item.id);
    const block = node('section', undefined, 'review-item');
    const content = node('p');
    readableText(content, l(item.body));
    block.append(node('h3', l(item.title)));
    renderNotice(block, item);
    block.append(content, node('small', saved ? t('confirmed') : t('notConfirmed')));
    parent.append(block);
  }
  const slot = context.guide.arrivalSlots.find(value => value.id === arrivalSlot);
  parent.append(node('h3', t('arrivalLabel')), node('p', slot ? l(slot.label) : ''));
  parent.append(node('h3', t('notes')), node('p', notes, 'notes'), node('p', t('representative'), 'small'));
  if (resultUnknown) {
    parent.append(button('checkReceipt', checkReceipt));
  } else {
    parent.append(button('submit', submit));
    parent.append(button('back', () => { screen = 'arrival'; render(); focusHeading(); }, true));
  }
}

async function submit() {
  busy = true;
  render();
  message('sending');
  try {
    receipt = await api('complete', 'POST', { version: context.version, language, arrivalSlot, notes, requestId });
    if (!receipt.completed) throw new Error('NETWORK');
    screen = 'done';
    status.textContent = '';
  } catch (error) {
    if (error.status && error.status < 500) message(errorKey(error), true);
    else {
      resultUnknown = true;
      message('uncertain', true);
    }
  }
  busy = false;
  render();
  focusHeading();
}

async function checkReceipt() {
  busy = true;
  render();
  try {
    receipt = await api('receipt');
    if (receipt.completed) { screen = 'done'; status.textContent = ''; }
    else { resultUnknown = false; message('receiptMissing'); }
  } catch { message('uncertain', true); }
  busy = false;
  render();
  focusHeading();
}

function renderDone(parent) {
  parent.append(node('p', '✓', 'success-symbol'), node('h2', t('done')), node('p', t('doneHelp')));
  const mailKey = receipt.notificationStatus === 'demo_skipped' ? 'mailDemo'
    : receipt.notificationStatus === 'accepted' ? 'mailAccepted' : 'mailPending';
  parent.append(node('p', t(mailKey), 'attention'));
  parent.append(node('p', `${t('receipt')}: ${new Date(receipt.completedAt).toLocaleString(language === 'ja' ? 'ja-JP' : 'en-GB', { timeZone: 'Asia/Tokyo' })} JST`, 'small'));
  if (receipt.directBookingUrl) {
    const box = node('section', undefined, 'direct');
    const link = node('a', t('directLink'));
    link.href = receipt.directBookingUrl;
    link.rel = 'noreferrer';
    box.append(node('h3', t('direct')), link);
    parent.append(box);
  }
}

function wifi(parent) {
  const detail = document.createElement('details');
  detail.className = 'wifi';
  detail.append(node('summary', t('wifi')));
  for (const [key, label] of [['ssid', 'network'], ['password', 'password']]) {
    const value = context.property.wifi[key];
    const row = node('div');
    row.append(node('span', t(label)), node('strong', value));
    row.append(button('copy', async () => {
      try { await navigator.clipboard.writeText(value); message('copied'); }
      catch { message('copyFailed', true); }
    }, true));
    detail.append(row);
  }
  parent.append(detail);
}

function renderNotice(parent, item) {
  if (!item.notice) return;
  const tone = ['money', 'deadline', 'info'].includes(item.notice.tone) ? item.notice.tone : 'info';
  const box = node('aside', undefined, `policy-notice policy-${tone}`);
  const lead = node('p', undefined, 'policy-lead');
  readableText(lead, l(item.notice.lead));
  box.append(node('p', t(`notice_${tone}`), 'policy-label'), lead);
  if (item.notice.sourceUrl) {
    try {
      const url = new URL(item.notice.sourceUrl);
      if (url.protocol === 'https:' && !url.username && !url.password) {
        const link = node('a', t('noticeSource'));
        link.href = url.href; link.target = '_blank'; link.rel = 'noreferrer'; box.append(link);
      }
    } catch { /* Invalid optional source never becomes a link. */ }
  }
  parent.append(box);
}

function referenceGuide(parent) {
  if (!context.guide.info?.length) return;
  const section = node('section', undefined, 'question-box');
  section.append(node('h3', t('referenceTitle')), node('p', t('referenceHelp'), 'small'));
  for (const item of context.guide.info) {
    const detail = node('details'); detail.append(node('summary', l(item.title)));
    renderNotice(detail, item);
    const body = node('p', undefined, 'content'); readableText(body, l(item.body)); detail.append(body); section.append(detail);
  }
  parent.append(section);
}

function questions(parent) {
  const box = node('section', undefined, 'question-box');
  box.append(node('h3', t('questionsTitle')), node('p', t('questionsHelp'), 'small'));
  box.append(button('askQuestion', () => { questionOpen = !questionOpen; render(); }, true));
  if (questionOpen) {
    const form = document.createElement('form');
    form.noValidate = true;
    const label = node('label', t('questionText'));
    const input = document.createElement('textarea');
    input.maxLength = 2000;
    input.value = questionText;
    input.disabled = busy;
    input.setAttribute('aria-required', 'true');
    input.addEventListener('input', () => { questionText = input.value; });
    label.append(input);
    const send = button('sendQuestion', async () => {
      if (!questionText.trim()) { message('questionRequired', true); input.focus(); return; }
      busy = true;
      render();
      try {
        await api('requests', 'POST', {
          requestId: questionRequestId, version: context.version,
          itemId: screen === 'item' ? context.guide.items[step].id : null,
          message: questionText, language
        });
        await refreshContext();
        questionText = '';
        questionRequestId = crypto.randomUUID();
        questionOpen = false;
        message('questionSaved');
      } catch (error) { message('questionFailed', true); }
      busy = false;
      render();
    });
    form.append(label, send);
    form.addEventListener('submit', event => { event.preventDefault(); send.click(); });
    box.append(form);
  }
  for (const request of context.requests || []) {
    const entry = node('div', undefined, 'request-entry');
    entry.append(node('p', request.message, 'notes'), node('p', t(`request_${request.status}`), 'small'));
    box.append(entry);
  }
  box.append(button('refreshRequests', async () => {
    if (busy) return;
    busy = true;
    render();
    try { await refreshContext(); } catch (error) { message(errorKey(error), true); }
    busy = false;
    render();
  }, true));
  contactLink(box);
  parent.append(box);
}

let mealReservation;
let mealUI;
let mealScreen = false;
let mealStaff = false;
let mealMount;
let savedMeal;
let mealLoadError = false;
function dietary(parent) {
  if (!context.property.demo) return;
  if (mealLoadError) { parent.append(node('p', language === 'ja' ? '食事ヒアリングを読み込めません。再読み込みするか宿へ直接ご相談ください。' : 'Unable to load dietary interview. Reload or contact the property.', 'attention')); return; }
  if (!mealReservation) {
    mealReservation = { name: context.reservation.guestLabel, arrival: context.reservation.arrivalDate };
    const submitted = savedMeal?.submitted || null;
    mealReservation.meal = { draft: submitted ? structuredClone(submitted.answers) : globalThis.StayMealModel.fresh(), submitted, decisions: {}, today: submitted?.demoDate || globalThis.StayMealModel.shift(mealReservation.arrival, -6) };
  }
  if (!mealUI) {
    mealMount = node('div');
    mealMount.id = 'giwon-stay';
    const shell = node('section', undefined, 'sc-shell');
    const main = node('div', undefined, 'sc-main');
    shell.append(main); mealMount.append(shell);
    const action = (label, callback, primary = false) => {
      const b = node('button', label, primary ? 'sc-primary' : ''); b.type = 'button';
      b.addEventListener('click', callback); return b;
    };
    mealUI = globalThis.createStayMeal({
      el: node, action, main, reservations: [mealReservation], savedDemo: true,
      savedWords: {
        demo: ['架空データ専用デモです。回答はデモ用DBに保存され、宿側の管理画面から確認できます。実メール・通知は送りません。実際の健康情報は入力しないでください。', 'Fictional demo only. Answers are stored in the demo database and visible to staff. No real emails or notifications. Do not enter real health information.'],
        privacy: ['架空データのみを予約別に保存します。担当施設の管理者・スタッフだけが閲覧できます。保存から7日で閲覧対象外となり、次回アクセス時に削除します。一括消去は管理者によるローカル保守が必要です。管理者は予約詳細から削除できます。本運用の同意・保持期間・窓口は未確定です。', 'Fictional answers are stored per booking, visible only to staff of the property. Records expire after 7 days and are deleted on next access. Bulk cleanup requires local administrator maintenance. Owners can delete from booking details. Production consent, retention and contact arrangements remain unapproved.'],
        done: ['回答済み（デモ用DB保存）', 'Answered (saved to demo database)'],
        consent: ['架空データであること、注意書き、デモ用DBへの保存と健康情報の取扱いを確認しました。', 'I confirm these are fictional details and have reviewed the notices, demo database storage and health information handling.']
      },
      save: async value => {
        savedMeal = await api('meal', 'PUT', { version: context.version, expectedRevision: savedMeal?.revision || 0, answers: value.answers, demoDate: value.demoDate, consent: true });
        return savedMeal.submitted;
      },
      field: (label, input) => { const wrap = node('label', undefined, 'sc-field'); wrap.append(node('span', label), input); return wrap; },
      language: () => language, current: () => mealReservation,
      open: () => { mealScreen = true; mealStaff = false; },
      returnGuest: () => { mealScreen = false; mealStaff = false; render(); focusHeading(); },
      staff: () => { mealStaff = true; render(); },
      contact: () => {}, render: () => render()
    });
  }
  if (mealScreen) {
    mealMount.querySelector('.sc-main').replaceChildren();
    if (mealStaff) mealUI.admin(); else mealUI.guest();
    const back = node('button', language === 'ja' ? '確認画面へ戻る' : 'Return to confirmation', 'secondary');
    back.type = 'button'; back.addEventListener('click', () => { mealScreen = false; mealStaff = false; render(); });
    parent.append(back, mealMount);
  } else {
    const box = node('section', undefined, 'question-box');
    box.id = 'dietary-interview';
    mealUI.entry(box, mealReservation);
    box.append(node('p', mealUI.text('warning'), 'attention'), node('p', mealUI.text('demo'), 'small'));
    parent.append(box);
  }
}

function render() {
  renderChrome();
  app.replaceChildren();
  app.setAttribute('aria-busy', String(busy || screen === 'loading'));
  const panel = node('section', undefined, 'card');
  if (screen === 'loading') panel.append(node('p', t('loading')));
  else if (screen === 'invalid') { panel.append(node('h2', t('title')), node('p', t('invalid'))); contactLink(panel); }
  else if (screen === 'entry') { panel.append(node('h2', t('title')), node('p', t('noToken'))); contactLink(panel); }
  else if (screen === 'unavailable') { panel.append(node('h2', t('title')), node('p', t('unavailable'))); contactLink(panel); }
  else {
    const booking = node('div', undefined, 'booking');
    booking.append(node('span', context.reservation.guestLabel), node('strong', context.reservation.arrivalDate));
    panel.append(booking);
    if (screen !== 'done') {
      panel.append(node('p', t('purpose'), 'small'));
      progress(panel);
    }
    if (mealScreen) { dietary(panel); app.append(panel); return; }
    if (screen === 'item') renderItem(panel);
    if (screen === 'arrival') renderArrival(panel);
    if (screen === 'review') renderReview(panel);
    if (screen === 'done') renderDone(panel);
    dietary(panel);
    referenceGuide(panel);
    questions(panel);
    wifi(panel);
  }
  app.append(panel);
}

for (const control of document.querySelectorAll('[data-lang]')) {
  control.addEventListener('click', () => {
    language = control.dataset.lang;
    try { storage?.setItem('sc-language', language); } catch { /* optional preference only */ }
    const url = new URL(location.href);
    url.searchParams.set('lang', language);
    history.replaceState(null, '', url);
    status.textContent = '';
    render();
  });
}

render();
try {
  const token = new URLSearchParams(location.hash.slice(1)).get('token');
  if (token) {
    history.replaceState(null, '', location.pathname + location.search);
    ({ csrf } = await api('session', 'POST', { token, property }));
  } else {
    ({ csrf } = await api('csrf'));
  }
  context = await api('context');
  if (context.property.demo) {
    try { savedMeal = await api('meal'); } catch { mealLoadError = true; }
  }
  receipt = await api('receipt');
  if (receipt.completed) screen = 'done';
  else {
    step = context.guide.items.findIndex(item => !context.answers.some(answer => answer.item_id === item.id));
    screen = step < 0 ? 'arrival' : 'item';
  }
} catch (error) {
  screen = error.status === 401 ? 'entry'
    : [404, 410].includes(error.status) ? 'invalid' : 'unavailable';
}
render();
