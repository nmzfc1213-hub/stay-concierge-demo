import qrcode from './qrcode.js';
import { mealSummary } from './meal-summary.js';

const content = document.getElementById('admin-content');
const status = document.getElementById('admin-status');
const tabs = document.getElementById('admin-tabs');
const propertySelect = document.getElementById('property-select');
let me;
let activeTab = 'workboard';
let listFilter = 'pending';
let offset = 0;
let busy = false;
const temporaryLinks = new Map();
const tabNames = {
  workboard: '対応・引き継ぎ', reservations: '予約・確認状況', register: '予約登録', imports: 'CSV取り込み',
  settings: '案内・宿の設定', audit: '操作履歴'
};
const errors = {
  PROFILE_LOCKED: '確認・口頭説明が始まったため、案内条件は変更できません。記録を保護しています。',
  WORK_CHANGED: '別のスタッフが更新しました。再読込して最新の内容を確認してください。',
  INVALID_ASSIGNEE: 'この宿に所属する有効なスタッフを選んでください。',
  ASSIGNEE_REQUIRED: '対応中・対応済みにする場合は担当スタッフを選んでください。',
  ADMIN_LOGIN_REQUIRED: 'ログインが必要です。Cloudflare Accessから入り直してください。',
  ACCESS_CONFIG_REQUIRED: 'Cloudflare Accessが未設定です。管理機能は閉じています。',
  ADMIN_NOT_REGISTERED: 'このスタッフは宿に登録されていません。',
  PROPERTY_REJECTED: 'この宿へのアクセス権限がありません。',
  OWNER_REQUIRED: 'この操作にはオーナー権限が必要です。',
  CSRF_REJECTED: '操作の有効期限が切れた可能性があります。ページを開き直してください。',
  SETTINGS_CHANGED: '別の操作で設定が変わりました。再読込して内容を確認してください。',
  ALREADY_CURRENT: 'この予約には最新の案内がすでに設定されています。',
  INVALID_INPUT: '入力内容・文字数をご確認ください。',
  INVALID_DATE: '到着日・出発日をご確認ください。出発日は到着日より後にしてください。',
  INVALID_CONTACT: '電話・メール・LINEの形式をご確認ください。',
  INVALID_GUIDE: '確認項目や到着選択肢の件数・IDが正しくありません。',
  TRANSLATIONS_REQUIRED: '日本語と英語の両方を入力してください。',
  INVALID_LINK: '直接予約リンクにはhttps://のURLを入力してください。',
  OTA_REVIEW_REQUIRED: '直接予約を表示するにはリンクとOTA規約確認チェックが必要です。',
  CSV_HEADERS: 'CSVの列名・順序を見本に合わせ、1〜200行で取り込んでください。',
  CSV_INVALID: 'CSVの引用符や区切りが正しくありません。',
  CSV_LIMIT: 'CSVの行数・セル文字数が上限を超えています。',
  CSV_TOO_LARGE: 'CSVは200KB以内にしてください。',
  CSV_ROWS_INVALID: '登録できない行があります。先にCSVを修正してください。',
  REGISTRATION_CONFLICT: '重複や同時更新のため登録できませんでした。一覧を確認してください。',
  OPERATION_CONFLICT: '登録内容が変わりました。入力画面を開き直してください。',
  RESERVATION_EXPIRED: 'この予約のURL発行期限は過ぎています。',
  RESERVATION_CANCELLED: '取消済みの予約には操作できません。',
  NOTIFICATION_REVIEW_REQUIRED: 'この通知は自動再送できません。重複送信を避けるため個別確認が必要です。',
  RATE_LIMITED: '操作回数が多いため、1分ほど待ってからお試しください。',
  NOT_FOUND: '対象が見つかりません。',
  SERVICE_UNAVAILABLE: '一時的に利用できません。結果が不明な場合は一覧を確認してください。'
};
const notificationLabels = {
  pending: 'メール通知待ち', processing: 'メール処理中', accepted: 'メールAPI受付済み（到達未確認）',
  failed: 'メール失敗・要再試行', demo_skipped: 'デモ：実メール未送信'
};
const urgencyLabels = {
  pending: '未確認', tomorrow: '到着前日・未確認', today: '到着当日・未確認',
  overdue: '到着日超過・未確認', complete: '確認済み', cancelled: '取消済み'
};

function el(tag, text, className) {
  const result = document.createElement(tag);
  if (text !== undefined) result.textContent = text;
  if (className) result.className = className;
  return result;
}

function announce(text, error = false) {
  status.textContent = text;
  status.className = error ? 'message error' : 'message';
  status.setAttribute('role', error ? 'alert' : 'status');
}

function showError(error) {
  announce(errors[error.message] || '処理の結果を確認できません。通信状態と一覧をご確認ください。', true);
}

async function api(path, method = 'GET', body) {
  const response = await fetch(`/api/admin/${path}`, {
    method, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000),
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(me ? { 'X-Property-Id': me.propertyId } : {}),
      ...(method !== 'GET' && me ? { 'X-CSRF-Token': me.csrf } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  let result;
  try { result = await response.json(); } catch { throw new Error('SERVICE_UNAVAILABLE'); }
  if (!response.ok) throw new Error(result.error || 'SERVICE_UNAVAILABLE');
  return result;
}

function button(text, callback, secondary = false) {
  const control = el('button', text, secondary ? 'secondary' : 'primary');
  control.type = 'button';
  control.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    propertySelect.disabled = true;
    control.disabled = true;
    try { await callback(); } catch (error) { showError(error); }
    finally { busy = false; propertySelect.disabled = false; control.disabled = false; }
  });
  return control;
}

function field(parent, label, value = '', type = 'text', maximum = 2000) {
  const wrap = el('label', label);
  const input = document.createElement(type === 'textarea' ? 'textarea' : 'input');
  if (type !== 'textarea') input.type = type;
  input.value = value || '';
  input.maxLength = maximum;
  wrap.append(input);
  parent.append(wrap);
  return input;
}

function pair(parent, label, value, maximum = 4000) {
  const box = el('fieldset');
  box.append(el('legend', label));
  const row = el('div', undefined, 'pair');
  const ja = field(row, '日本語', value.ja, 'textarea', maximum);
  const en = field(row, 'English', value.en, 'textarea', maximum);
  box.append(row);
  parent.append(box);
  return () => ({ ja: ja.value, en: en.value });
}

function title(text) {
  const heading = el('h2', text);
  heading.tabIndex = -1;
  content.replaceChildren(heading);
  content.setAttribute('aria-busy', 'false');
  return heading;
}

function formatTime(value) {
  return value ? new Date(value).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) + ' JST' : '—';
}

function renderTabs() {
  tabs.replaceChildren();
  const visible = Object.entries(tabNames).filter(([key]) => key !== 'settings' || me.role === 'owner');
  for (const [key, name] of visible) {
    const control = el('button', name);
    control.id = `tab-${key}`;
    control.type = 'button';
    control.setAttribute('role', 'tab');
    control.setAttribute('aria-selected', String(key === activeTab));
    control.setAttribute('aria-controls', 'admin-content');
    control.tabIndex = key === activeTab ? 0 : -1;
    control.addEventListener('click', () => { if (!busy) openTab(key); });
    control.addEventListener('keydown', event => {
      const controls = [...tabs.querySelectorAll('[role="tab"]')];
      const index = controls.indexOf(control);
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % controls.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + controls.length) % controls.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = controls.length - 1;
      if (next !== undefined) { event.preventDefault(); controls[next].focus(); }
    });
    tabs.append(control);
  }
  content.setAttribute('aria-labelledby', `tab-${activeTab}`);
}

async function openTab(key) {
  activeTab = key;
  renderTabs();
  status.textContent = '';
  content.setAttribute('aria-busy', 'true');
  try {
    if (key === 'reservations') await renderReservations();
    if (key === 'workboard') await renderWorkboard();
    if (key === 'register') renderRegistration();
    if (key === 'imports') renderImport();
    if (key === 'settings') await renderSettings();
    if (key === 'audit') await renderAudit();
  } catch (error) { content.setAttribute('aria-busy', 'false'); showError(error); }
}

async function renderReservations() {
  const result = await api(`reservations?filter=${listFilter}&offset=${offset}`);
  title('到着前の確認状況');
  const controls = el('div', undefined, 'filters');
  for (const [value, text] of [['pending', '未確認だけ'], ['attention', '要対応'], ['all', 'すべて']]) {
    const filter = button(text, async () => { listFilter = value; offset = 0; await renderReservations(); }, true);
    filter.setAttribute('aria-pressed', String(listFilter === value));
    controls.append(filter);
  }
  content.append(controls, el('p', '到着日の早い順です。確認済みは最終送信が完了した予約です。', 'small'));
  if (result.summary.attention > 0) {
    const alert = el('p', `対応が必要な予約が${result.summary.attention}件あります。「要対応」と「対応・引き継ぎ」で確認してください。`, 'attention');
    content.append(alert);
  }
  if (!result.reservations.length) content.append(el('p', '該当する予約はありません。', 'card'));
  for (const reservation of result.reservations) {
    const warning = ['tomorrow', 'today', 'overdue'].includes(reservation.urgency);
    const card = el('article', undefined, warning ? 'reservation-card overdue' : 'reservation-card');
    card.append(el('p', urgencyLabels[reservation.urgency], 'badge'), el('h3', reservation.guest_label));
    card.append(el('p', `${reservation.arrival_date} → ${reservation.departure_date}`, 'dates'));
    card.append(el('p', `項目の確認：${reservation.checked_count}件 · 案内 第${reservation.guide_version}版`, 'small'));
    if (reservation.open_request_count) card.append(el('p', `要対応：未解決の相談・申告が${reservation.open_request_count}件あります。`, 'attention'));
    else if (reservation.needs_attention) card.append(el('p', '特記事項・夜間希望の申告記録があります。対応履歴と合わせて確認してください。', 'small'));
    if (reservation.notification_status) card.append(el('p', notificationLabels[reservation.notification_status], 'small'));
    card.append(button('予約の詳細・専用URL', () => renderDetail(reservation.reservation_id), true));
    content.append(card);
  }
  const pager = el('div');
  if (offset > 0) pager.append(button('前の50件', async () => { offset = Math.max(0, offset - 50); await renderReservations(); }, true));
  if (result.nextOffset !== null) pager.append(button('次の50件', async () => { offset = result.nextOffset; await renderReservations(); }, true));
  content.append(pager);
}

async function renderDetail(id) {
  const result = await api(`reservations/${id}`);
  const reservation = result.reservation;
  title('予約の詳細');
  const mealCard = el('section', undefined, 'card');
  mealCard.append(el('h3', '食事ヒアリング（架空データ専用）'));
  try {
    const meal = await api(`reservations/${id}/meal`);
    mealCard.append(el('p', `食事：${({unanswered:'未回答', answered:'回答済み', review:'要確認'})[meal.status]}`));
    mealCard.append(el('p', '申告は対応・安全性の確約ではありません。施設規定・英文・実運用は未承認です。'));
    if (meal.submitted) {
      const details = el('details'); details.append(el('summary', '回答内容（架空データ）'));
      details.append(el('pre', mealSummary(meal.submitted.answers), 'notes'));
      mealCard.append(el('p', `保存日時：${formatTime(meal.submitted.submittedAt)} / デモ日付：${meal.submitted.demoDate}`), details);
      if (me.role === 'owner') mealCard.append(button('この予約の食事回答を削除', async () => {
        if (!confirm('この予約のデモ用食事回答を削除しますか？')) return;
        await api(`reservations/${id}/meal`, 'DELETE'); await renderDetail(id);
      }, true));
    }
  } catch { mealCard.append(el('p', '食事回答を取得できません。デモ設定とマイグレーションを確認してください。', 'attention')); }
  content.append(mealCard);
  content.append(button('一覧に戻る', renderReservations, true));
  const card = el('section', undefined, 'card');
  card.append(el('h3', reservation.guest_label), el('p', `${reservation.arrival_date} → ${reservation.departure_date}`, 'dates'));
  card.append(el('p', `最終確認：${formatTime(reservation.completed_at)} · 案内 第${reservation.guide_version}版`));
  if (reservation.cancelled_at) card.append(el('p', '取消済み。予約URLは利用できません。', 'attention'));
  else {
    card.append(el('p', 'URLを再発行すると、以前のURLとそのログインは利用できなくなります。コピーできるのは発行した直後だけです。', 'small'));
    const linkBox = el('div');
    function showLink() {
      linkBox.replaceChildren();
      const url = temporaryLinks.get(id);
      if (!url) return;
      const input = field(linkBox, '宿泊者専用URL（宿から別途送付してください）', url, 'text', 2000);
      input.readOnly = true;
      linkBox.append(qrCanvas(url), el('p', 'このQRは予約専用です。共通掲示や公開はしないでください。', 'attention'));
      linkBox.append(button('URLをコピー', async () => {
        try { await navigator.clipboard.writeText(url); announce('専用URLをコピーしました。宿泊者へはまだ送っていません。'); }
        catch { announce('コピーできません。URL欄を長押ししてコピーしてください。', true); }
      }, true));
    }
    card.append(button('専用URLを発行・再発行', async () => {
      if (!confirm('旧URLを無効にして新しい専用URLを発行しますか？')) return;
      const link = await api(`reservations/${id}/token`, 'POST', {});
      temporaryLinks.set(id, link.url);
      showLink();
      announce('URLを発行しました。送付は宿側で行ってください。');
    }));
    showLink();
    card.append(linkBox);
    if (me.role === 'owner') card.append(button('最新の案内へ変更し、再確認対象にする', async () => {
      if (!confirm('以前の確認履歴を残したまま、最新の案内を未確認として設定しますか？宿泊者には自動通知しません。')) return;
      await api(`reservations/${id}/reconfirm`, 'POST', {});
      await renderDetail(id);
      announce('最新の案内へ変更しました。必要に応じて宿泊者へ再確認を依頼してください。');
    }, true));
    card.append(button('この予約を取消にする', async () => {
      if (!confirm('予約URLを無効にし、このシステム上で取消済みにしますか？OTA等の予約自体は取り消されません。')) return;
      await api(`reservations/${id}/cancel`, 'POST', {});
      temporaryLinks.delete(id);
      await renderDetail(id);
      announce('このシステム上で取消済みにしました。');
    }, true));
  }
  content.append(card);
  renderStayProfile(id, result, card);
  renderOralItems(id, result);
  for (const submission of result.submissions) {
    const box = el('section', undefined, 'card');
    box.append(el('h3', `送信内容 · 第${submission.guide_version}版`));
    if (submission.needs_attention) box.append(el('p', '要対応申告あり：内容を確認してください', 'attention'));
    box.append(el('p', `到着予定：${submission.arrivalLabel.ja} · 受付：${formatTime(submission.completed_at)}`));
    box.append(el('p', submission.notes, 'notes'));
    content.append(box);
  }
  const history = el('section', undefined, 'card');
  history.append(el('h3', '何を・いつ確認したか'));
  for (const answer of result.answers) {
    const detail = el('details');
    detail.append(el('summary', `第${answer.guide_version}版：${answer.item?.title.ja || answer.item_id} · ${formatTime(answer.confirmed_at)}`));
    detail.append(el('p', answer.item?.body[answer.language] || answer.item?.body.ja || '', 'content'));
    detail.append(el('p', `確認言語：${answer.language} · 確認済み`));
    history.append(detail);
  }
  if (!result.answers.length) history.append(el('p', 'まだ確認記録はありません。'));
  content.append(history);
  for (const notification of result.notifications) {
    const box = el('section', undefined, 'card');
    box.append(el('h3', notificationLabels[notification.status]), el('p', `第${notification.guide_version}版 · 試行${notification.attempts}回`));
    if (['pending', 'failed', 'processing'].includes(notification.status)) box.append(button('通知を再試行', async () => {
      await api(`notifications/${notification.notification_id}/retry`, 'POST', {});
      await renderDetail(id);
      announce('再試行の結果を更新しました。受信箱への到達とは別に確認してください。');
    }, true));
    content.append(box);
  }
}

function choice(parent, label, options, value) {
  const wrap = el('label', label);
  const select = document.createElement('select');
  for (const [key, name] of options) {
    const option = el('option', name); option.value = key; select.append(option);
  }
  select.value = value;
  wrap.append(select); parent.append(wrap);
  return select;
}

function checkbox(parent, label, value) {
  const wrap = el('label', undefined, 'checkbox-label');
  const input = document.createElement('input'); input.type = 'checkbox'; input.checked = value;
  wrap.append(input, el('span', label)); parent.append(wrap);
  return input;
}

function qrCanvas(url) {
  const qr = qrcode(0, 'M');
  qr.addData(url, 'Byte'); qr.make();
  const canvas = document.createElement('canvas');
  const count = qr.getModuleCount(), scale = 6, quiet = 4;
  canvas.width = canvas.height = (count + quiet * 2) * scale;
  canvas.className = 'qr-code';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', '案内URLを開くQRコード');
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';
  for (let y = 0; y < count; y++) for (let x = 0; x < count; x++) {
    if (qr.isDark(y, x)) ctx.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
  }
  return canvas;
}

function renderStayProfile(id, result, card) {
  if (result.reservation.cancelled_at) return;
  const profile = result.workflow.profile;
  const section = el('section', undefined, 'question-box');
  section.append(el('h3', 'お客様に合う案内'), el('p', '初回の確認・口頭説明を始める前に設定します。基本の料金・取消・館内ルールは全員に表示します。', 'small'));
  const language = choice(section, '案内の初期言語', [['ja', '日本語'], ['en', 'English']], profile.language);
  const dinner = checkbox(section, '夕食あり：夕食対象の案内を追加', profile.dinner);
  const late = checkbox(section, '夜間到着：夜間対象の案内を追加', profile.lateArrival);
  section.append(button('案内条件を保存', async () => {
    await api(`reservations/${id}/profile`, 'PUT', { expectedRevision: profile.revision,
      language: language.value, dinner: dinner.checked, lateArrival: late.checked });
    temporaryLinks.delete(id);
    await renderDetail(id);
    announce('案内条件を保存しました。専用URLを発行すると選んだ言語で開きます。');
  }, true));
  const publicUrl = `${location.origin}/p/${me.properties.find(p => p.propertyId === me.propertyId).slug}/guide`;
  // Slug is supplied by the authenticated membership API, never guessed.
  if (me.properties.find(p => p.propertyId === me.propertyId).slug) {
    section.append(el('h3', 'フロント掲示用・共通案内QR'), el('p', '入力不要。予約情報・Wi-Fiは表示しません。共通QRには予約トークンを含めません。', 'small'), qrCanvas(publicUrl));
    const link = el('a', '共通案内を開く'); link.href = publicUrl; link.target = '_blank'; link.rel = 'noreferrer'; section.append(link);
  }
  card.append(section);
}

function renderOralItems(id, result) {
  const section = el('section', undefined, 'card');
  section.append(el('h3', 'フロントの説明・確認記録'), el('p', '「宿泊者の確認」と「スタッフの口頭説明」は別の記録です。口頭説明で宿泊者の最終送信を代行しません。', 'small'));
  for (const item of result.workflow.relevantItems) {
    const guest = result.answers.find(answer => answer.item_id === item.id && answer.guide_version === result.reservation.guide_version);
    const oral = result.workflow.oral.find(answer => answer.item_id === item.id && answer.guide_version === result.reservation.guide_version);
    const row = el('section', undefined, 'request-entry');
    row.append(el('h3', item.title.ja), el('p', guest ? `宿泊者確認済み · ${formatTime(guest.confirmed_at)}` : '宿泊者は未確認', 'small'));
    if (oral) row.append(el('p', `口頭説明記録：${oral.staff_id} · ${formatTime(oral.confirmed_at)}`), el('p', oral.note, 'notes'));
    else if (!result.reservation.cancelled_at) {
      const note = field(row, '説明・引き継ぎメモ（必須）', '', 'textarea', 2000);
      const checked = checkbox(row, 'この内容を実際に口頭で説明した', false);
      row.append(button('口頭説明を記録', async () => {
        if (!checked.checked || !note.value.trim()) { announce('説明済みチェックとメモを入力してください。', true); return; }
        await api(`reservations/${id}/oral`, 'POST', { version: result.reservation.guide_version, itemId: item.id, note: note.value });
        await renderDetail(id); announce('口頭説明を記録しました。宿泊者の確認記録は変更していません。');
      }, true));
    }
    section.append(row);
  }
  content.append(section);
}

let workFilter = 'active';
let workOffset = 0;
async function renderWorkboard() {
  const result = await api(`workboard?filter=${workFilter}&offset=${workOffset}`);
  title('対応を、次の担当者へ。');
  content.append(el('p', '確認完了と対応完了は別です。未解決の質問・申告をここで引き継ぎます。新着は更新して確認してください。', 'small'));
  const filters = el('div', undefined, 'filters');
  for (const [value, label] of [['active', '未対応・対応中'], ['mine', '自分の担当'], ['all', '対応済みも表示']]) {
    const control = button(label, async () => { workFilter = value; workOffset = 0; await renderWorkboard(); }, true);
    control.setAttribute('aria-pressed', String(workFilter === value)); filters.append(control);
  }
  filters.append(button('最新の状態へ更新', renderWorkboard, true)); content.append(filters);
  for (const request of result.requests) {
    const card = el('article', undefined, 'reservation-card');
    const labels = { open: '未対応', in_progress: '対応中', resolved: '対応済み' };
    card.append(el('p', labels[request.status], request.status === 'open' ? 'attention' : 'small'),
      el('h3', request.guest_label), el('p', `到着日：${request.arrival_date} · 案内 第${request.guide_version}版`, 'small'), el('p', request.message, 'notes'));
    if (request.cancelled_at) card.append(el('p', '取消済み予約の申告です。対応要否を確認してください。', 'attention'));
    if (request.guide_version !== request.current_guide_version) card.append(el('p', '以前の案内版の申告です。未対応として引き継いでいます。', 'attention'));
    card.append(el('p', `担当：${request.assigned_to || '未割り当て'} · 更新：${formatTime(request.updated_at)}`, 'small'));
    for (const note of request.notes) card.append(el('p', `${note.author_id} · ${formatTime(note.created_at)}\n${note.body}`, 'notes'));
    const assignee = choice(card, '担当スタッフ', [['', '未割り当て'], ...result.staff.map(staff => [staff.user_id, staff.user_id])], request.assigned_to || '');
    const state = choice(card, '対応状況', Object.entries(labels), request.status);
    const note = field(card, '対応・引き継ぎメモ（必須・宿泊者には非公開）', '', 'textarea', 2000);
    card.append(button('自分が対応する', () => { assignee.value = result.currentUserId; state.value = 'in_progress'; }, true));
    card.append(button('担当・状況・メモを保存', async () => {
      if (!note.value.trim()) { announce('次の担当者が分かるメモを入力してください。', true); return; }
      await api(`requests/${request.request_id}`, 'PUT', { expectedRevision: request.revision,
        status: state.value, assignedTo: assignee.value || null, note: note.value });
      await renderWorkboard(); announce('対応状況と引き継ぎメモを保存しました。');
    }));
    card.append(button('予約の確認記録を見る', () => renderDetail(request.reservation_id), true));
    content.append(card);
  }
  if (!result.requests.length) content.append(el('p', 'この条件の対応待ちはありません。', 'card'));
  if (workOffset > 0) content.append(button('前の50件', async () => { workOffset = Math.max(0, workOffset - 50); await renderWorkboard(); }, true));
  if (result.nextOffset !== null) content.append(button('次の50件', async () => { workOffset = result.nextOffset; await renderWorkboard(); }, true));
}

function renderRegistration() {
  title('予約を登録');
  const form = el('form', undefined, 'card');
  form.noValidate = true;
  const name = field(form, '代表者の表示名（デモは架空名のみ）', '', 'text', 100);
  const ref = field(form, '取込元の予約番号（任意）', '', 'text', 100);
  const arrival = field(form, '到着日', '', 'date');
  const departure = field(form, '出発日', '', 'date');
  const operationId = crypto.randomUUID();
  const save = button('予約を登録', async () => {
    if (!name.value.trim() || !arrival.value || !departure.value) { announce('表示名・到着日・出発日を入力してください。', true); return; }
    await api('reservations', 'POST', { operationId, reservation: {
      guestLabel: name.value, arrivalDate: arrival.value, departureDate: departure.value, externalRef: ref.value
    } });
    await openTab('reservations');
    announce('予約を登録しました。詳細から専用URLを発行してください。');
  });
  form.addEventListener('submit', event => { event.preventDefault(); save.click(); });
  form.append(save);
  content.append(form);
}

function renderImport() {
  title('CSV取り込み');
  content.append(el('p', 'UTF-8、200KB・200予約まで。まず検証し、問題のないデータだけをまとめて登録します。予約番号は宿内で重複できません。'));
  const sample = el('pre', 'external_ref,guest_label,arrival_date,departure_date\nDEMO-001,架空のお客様,2027-01-10,2027-01-11');
  content.append(sample);
  const box = el('section', undefined, 'card');
  const input = field(box, 'CSVファイルを選択', '', 'file');
  input.accept = '.csv,text/csv';
  const preview = el('div');
  let csv = '';
  let operationId = crypto.randomUUID();
  input.addEventListener('change', () => { csv = ''; preview.replaceChildren(); operationId = crypto.randomUUID(); });
  box.append(button('内容を検証', async () => {
    const file = input.files[0];
    if (!file || file.size > 200000) { announce('200KB以内のCSVを選んでください。', true); return; }
    csv = await file.text();
    const result = await api('imports/preview', 'POST', { csv });
    preview.replaceChildren(el('h3', result.valid ? `${result.rows.length}予約を登録できます` : '修正が必要な行があります'));
    for (const row of result.rows) {
      preview.append(el('p', row.error ? `${row.row}行目：入力不正・予約番号の重複をご確認ください` : `${row.row}行目：${row.value.guestLabel} · ${row.value.arrivalDate} → ${row.value.departureDate}`, row.error ? 'attention' : 'small'));
    }
    if (result.valid) preview.append(button('確認したCSVを登録', async () => {
      await api('imports/commit', 'POST', { csv, operationId });
      await openTab('reservations');
      announce('CSVの予約を登録しました。宿泊者へのURL送付はまだ行っていません。');
    }));
  }, true));
  box.append(preview);
  content.append(box);
}

async function renderSettings() {
  const original = await api('settings');
  title('案内・宿の設定');
  content.append(el('p', '保存すると新しい案内版を作成します。新規予約には即反映。既存予約は詳細画面で「最新の案内へ変更」を選ぶまで当時の内容を維持します。', 'attention'));
  const form = el('form', undefined, 'card');
  form.noValidate = true;
  const name = pair(form, '宿の名称', original.name, 100);
  const phone = field(form, '電話番号', original.contact.phone, 'tel', 30);
  const email = field(form, '連絡先メール（未確認の場合は空欄）', original.contact.email, 'email', 254);
  const contactForm = field(form, 'お問い合わせフォームURL（任意・https://）', original.contact.formUrl, 'url', 1000);
  const line = field(form, 'LINEリンク（任意・https://line.me/）', original.contact.line, 'text', 500);
  const notificationEmail = field(form, '確認完了の通知先メール（デモでは送信されません）', original.notificationEmail, 'email', 254);
  const ssid = field(form, '宿泊者向けWi-Fi名', original.wifi.ssid, 'text', 100);
  const password = field(form, '宿泊者向けWi-Fiパスワード', original.wifi.password, 'text', 100);
  const itemsBox = el('section');
  const itemReaders = [];
  const infoBox = el('section');
  const infoReaders = [];
  function addItem(item, readers = itemReaders, container = itemsBox) {
    const box = el('section', undefined, 'setting-item');
    const id = field(box, '項目ID（半角英字・数字・ハイフン）', item.id, 'text', 40);
    const titleRead = pair(box, '確認項目の見出し', item.title, 150);
    const bodyRead = pair(box, '確認する本文', item.body);
    const audience = choice(box, 'この案内を表示する対象', [['all', '全員（基本の案内）'], ['dinner', '夕食あり'], ['late', '夜間到着']], item.audience || 'all');
    const tone = choice(box, '強調の種類', [['none', '通常表示'], ['money', '料金・返金・キャンセル料'], ['deadline', '時間・期限'], ['info', '利用前の確認']], item.notice?.tone || 'none');
    const lead = pair(box, '強調する短い案内（通常表示なら空欄可）', item.notice?.lead || { ja: '', en: '' }, 200);
    const source = field(box, '公式出典URL（任意）', item.notice?.sourceUrl || '', 'url', 1000);
    const reader = () => ({ id: id.value, title: titleRead(), body: bodyRead(), audience: audience.value,
      ...(tone.value !== 'none' ? { notice: { tone: tone.value, lead: lead(), sourceUrl: source.value } } : {}) });
    readers.push(reader);
    box.append(button('この項目を削除', () => {
      if (!confirm('新しい案内からこの項目を外しますか？以前の履歴は残ります。')) return;
      readers.splice(readers.indexOf(reader), 1);
      box.remove();
    }, true));
    container.append(box);
  }
  original.guide.items.forEach(item => addItem(item));
  form.append(el('h3', '確認項目（最大12件）'), itemsBox, button('確認項目を追加', () => {
    if (itemReaders.length >= 12) { announce('確認項目は12件までです。', true); return; }
    addItem({ id: `item-${crypto.randomUUID().slice(0, 8)}`, title: { ja: '', en: '' }, body: { ja: '', en: '' } });
  }, true));
  (original.guide.info || []).forEach(item => addItem(item, infoReaders, infoBox));
  form.append(el('h3', 'ご滞在ガイド（確認チェック不要・最大8件）'), infoBox, button('参照用の案内を追加', () => {
    if (infoReaders.length >= 8) { announce('参照案内は8件までです。', true); return; }
    addItem({ id: `info-${crypto.randomUUID().slice(0, 8)}`, title: { ja: '', en: '' }, body: { ja: '', en: '' } }, infoReaders, infoBox);
  }, true));
  form.append(el('h3', '到着予定の選択肢'), el('p', '夜間希望（late）と未定（unknown）は分けて維持します。時間を変える場合は案内本文も合わせて更新してください。', 'small'));
  const slotReaders = original.guide.arrivalSlots.map(slot => {
    const read = pair(form, slot.id, slot.label, 150);
    const requiresContact = checkbox(form, `${slot.id}：選択されたら対応一覧に残す`, slot.requiresContact === true || slot.id === 'late');
    return () => ({ id: slot.id, label: read(), requiresContact: requiresContact.checked });
  });
  const directLabel = el('label', undefined, 'checkbox-label');
  const direct = document.createElement('input');
  direct.type = 'checkbox'; direct.checked = original.directBookingEnabled;
  directLabel.append(direct, el('span', '確認完了後に次回の直接予約案内を表示する'));
  form.append(directLabel);
  const directUrl = field(form, '公式予約URL（https://）', original.directBookingUrl, 'url', 1000);
  const otaLabel = el('label', undefined, 'checkbox-label');
  const ota = document.createElement('input'); ota.type = 'checkbox';
  otaLabel.append(ota, el('span', '表示対象となる各OTAの規約を宿側で確認した（表示をONにする場合に必須）'));
  form.append(otaLabel, el('p', 'デモ表示と実メール無効は、この画面から解除できません。', 'small'));
  const save = button('設定を保存', async () => {
    await api('settings', 'PUT', {
      expectedVersion: original.expectedVersion, name: name(),
      contact: { phone: phone.value, email: email.value, line: line.value, formUrl: contactForm.value },
      wifi: { ssid: ssid.value, password: password.value }, notificationEmail: notificationEmail.value,
      guide: { items: itemReaders.map(read => read()), info: infoReaders.map(read => read()), arrivalSlots: slotReaders.map(read => read()) },
      directBookingEnabled: direct.checked, directBookingUrl: directUrl.value, otaReviewed: ota.checked
    });
    await renderSettings();
    announce('新しい案内版を保存しました。既存予約への適用は予約詳細から行ってください。');
  });
  form.addEventListener('submit', event => { event.preventDefault(); save.click(); });
  form.append(save);
  content.append(form);
}

let auditOffset = 0;
async function renderAudit() {
  const result = await api(`audit?offset=${auditOffset}`);
  title('操作履歴');
  content.append(el('p', '確認・設定変更・詳細閲覧・URL再発行を記録します。申告本文や予約トークンはこの履歴に保存しません。', 'small'));
  for (const event of result.events) {
    const box = el('article', undefined, 'reservation-card');
    box.append(el('strong', event.event_type), el('p', formatTime(event.created_at)));
    box.append(el('p', `${event.actor_kind} · ${event.actor_ref}`, 'small'));
    if (event.reservation_id) box.append(button('対象予約を見る', () => renderDetail(event.reservation_id), true));
    content.append(box);
  }
  if (!result.events.length) content.append(el('p', '操作履歴はまだありません。'));
  if (auditOffset > 0) content.append(button('前の50件', async () => { auditOffset = Math.max(0, auditOffset - 50); await renderAudit(); }, true));
  if (result.nextOffset !== null) content.append(button('次の50件', async () => { auditOffset = result.nextOffset; await renderAudit(); }, true));
}

propertySelect.addEventListener('change', async () => {
  if (busy) return;
  busy = true;
  propertySelect.disabled = true;
  content.replaceChildren(el('p', '宿を切り替えています…'));
  me.propertyId = propertySelect.value;
  temporaryLinks.clear();
  offset = 0;
  workOffset = 0;
  auditOffset = 0;
  try { me = await api('me'); await openTab('workboard'); } catch (error) { showError(error); }
  finally { busy = false; propertySelect.disabled = false; }
});

try {
  me = await api('me');
  for (const property of me.properties) {
    const option = el('option', property.name.ja); option.value = property.propertyId;
    propertySelect.append(option);
  }
  propertySelect.value = me.propertyId;
  document.getElementById('property-label').hidden = false;
  await openTab('workboard');
} catch (error) {
  content.setAttribute('aria-busy', 'false');
  content.replaceChildren(el('p', '管理画面に接続できません。認証・所属設定を確認してください。'));
  showError(error);
}
