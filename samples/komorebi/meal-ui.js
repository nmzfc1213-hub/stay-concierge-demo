/* Guest and staff dietary interview. All records live only in page memory. */
(() => {
  'use strict';
  const M = globalThis.StayMealModel;
  const words = {
    title: ['食事ヒアリング', 'Dietary interview'],
    intro: ['口頭では伝えにくいことも、ひとつずつ。', 'Tell us about your needs, one question at a time.'],
    start: ['食事ヒアリングへ', 'Open dietary interview'],
    deadline: ['アレルギー・食事制限は宿泊4日前までに回答が必要です。', 'Allergy and dietary information is required at least 4 days before arrival.'],
    expired: ['受付終了。当日の対応は保証できません。まず宿へご相談ください。', 'Responses are closed. Arrangements on arrival cannot be guaranteed. Please contact the property first.'],
    demo: ['試作です。宿への送信・通知はありません。架空の内容だけでお試しください。再読み込みで回答は消えます。', 'Demo only. Nothing is sent to the property and no notifications are sent. Use fictional details. Reloading clears all answers.'],
    warning: ['対応可否は最終的に宿が判断します。この回答だけで食事対応・安全性が確約されるものではありません。', 'The property makes the final decision on accommodation. These answers alone do not guarantee dietary arrangements or safety.'],
    english: ['英文は宿の確認前です。', 'English wording has not yet been approved by the property.'],
    policy: ['食事の対応条件は施設ごとに異なります。微量混入や共用設備を含め、宿への直接確認が必要です。これは架空施設の設定例です。', 'Dietary arrangements vary by property. Discuss trace amounts and shared equipment directly with the property. This is a fictional example.'],
    published: ['宗教・信条を含む食事制限は、対応可能な範囲を宿が確認します。入力だけで対応が確定することはありません。', 'The property must review religious, ethical and other dietary restrictions. Submitting answers does not confirm arrangements.'],
    examples: ['食品は原料の見落としを防ぐための例です。製品ごとに原料は異なります。「大丈夫」は安全性の判定ではありません。不明なら「わからない」を選んでください。', 'Food examples help identify overlooked ingredients; recipes and products vary. “Okay” is your answer, not a safety assessment. Select “Not sure” when uncertain.'],
    privacyTitle: ['健康情報の取り扱い（ダミー・要専門家確認）', 'Health information handling (draft — expert review required)'],
    privacy: ['本運用では、食事の相談・対応可否の確認のため、回答を必要な担当者だけで扱う想定です。対象者・保管期間・削除窓口は宿と確認予定です。この試作ではブラウザのメモリー内のみで扱い、外部送信・永続保存しません。実際の健康情報は入力しないでください。', 'The intended purpose is dietary consultation and assessing possible arrangements, with access limited to relevant staff. Recipients, retention and deletion contact require property review. This demo keeps answers only in page memory, without external submission or persistent storage. Do not enter real health information.'],
    dateTitle: ['デモ日付を切り替える', 'Change the simulated date'],
    dateHelp: ['以下はデモ上の現在日です。実際の今日や予約日を変更する操作ではありません。締切は日本時間の暦日で、宿泊4日前の当日を含みます（仮の運用）。', 'This is the simulated current date. It does not change a real booking or today’s date. The provisional cutoff includes the full calendar day 4 days before arrival, using Japan dates.'],
    today: ['デモ上の現在日', 'Simulated current date'],
    due: ['回答期限', 'Response deadline'],
    arrival: ['到着日', 'Arrival date'],
    pre: ['期限前', 'Before deadline'], near: ['期限間近', 'Due soon'],
    boundary: ['締切当日', 'Deadline day'], after: ['期限後', 'After deadline'],
    back: ['戻る', 'Back'], next: ['次へ', 'Next'], review: ['回答内容を確認', 'Review answers'],
    return: ['重要事項の画面へ戻る', 'Return to important information'],
    categories: ['該当するものをすべて選んでください', 'Select all categories that apply'],
    allergens: ['アレルゲンを選んでください', 'Select your allergens'],
    allergenOther: ['その他のアレルゲン（必須）', 'Other allergens (required)'],
    avoided: ['避けるものをすべて選んでください', 'Select everything you avoid'],
    beliefOther: ['その他、避けるもの（必須）', 'Other ingredients you avoid (required)'],
    severity: ['症状の程度を教えてください', 'How severe are your symptoms?'],
    trace: ['微量の混入（コンタミ）は許容できますか？', 'Is cross-contamination (trace amounts) acceptable?'],
    stock: ['エキス・だしは許容できますか？', 'Are extracts and stock containing this allergen acceptable?'],
    processed: ['加工品・調味料に含まれる場合は許容できますか？', 'Is this allergen acceptable in processed foods and seasonings?'],
    food: ['この食品について教えてください', 'Tell us about this food'],
    pregnancy: ['この項目を避けたいですか？', 'Would you like to avoid this item?'],
    pregnancyHelp: ['妊娠中の方ご本人の希望を伺います。宿が禁止リストや医学的な安全性を決める画面ではありません。', 'These are your personal preferences during pregnancy. This screen does not prescribe restrictions or assess medical safety.'],
    hidden: ['この原料は許容できますか？', 'Is this ingredient acceptable?'],
    pregnancyOther: ['その他、医師に止められているもの（任意）', 'Anything else your doctor has told you to avoid (optional)'],
    other: ['苦手・持病・医師の指示などを教えてください（必須）', 'Describe dislikes, health conditions or medical instructions (required)'],
    final: ['他に言い忘れていることはありませんか（任意）', 'Is there anything else you may have forgotten? (optional)'],
    textHelp: ['架空の内容のみ・2,000文字まで。対象の方や人数も必要に応じて記入してください。', 'Fictional details only, up to 2,000 characters. Include the affected person or number of guests if needed.'],
    mild: ['軽い', 'Mild'], severe: ['重い', 'Severe'], anaphylaxis: ['アナフィラキシー歴あり', 'History of anaphylaxis'],
    allowed: ['可（許容できる）', 'Acceptable'], notAllowed: ['不可（許容できない）', 'Not acceptable'],
    unknown: ['わからない', 'Not sure'], avoid: ['避けたい・食べられない', 'Avoid / cannot eat'], okay: ['大丈夫', 'Okay'],
    error: ['回答を選択・入力してください。「その他」を選んだ場合は内容も必要です。', 'Please select or enter an answer. If you select “Other”, describe it too.'],
    consentError: ['内容と注意書きを確認して、チェックしてください。', 'Please review the answers and notices, then check the box.'],
    consent: ['回答内容・注意書き・健康情報の取扱いを確認しました（架空データのデモ送信）。', 'I have reviewed my answers, the notices and health information handling (fictional demo submission).'],
    send: ['この内容で回答する（デモ）', 'Submit these answers (demo)'],
    reviewHelp: ['まだ回答は完了していません。変更する場合は各項目の「修正」から戻れます。', 'Your response is not complete yet. Use “Edit” beside a section to change it.'],
    done: ['回答完了（このプレビュー内のみ）', 'Response complete (this preview only)'],
    edit: ['修正', 'Edit'], revise: ['回答を修正する', 'Revise answers'],
    empty: ['記入なし', 'No additional details'],
    unanswered: ['未回答', 'Not answered'], answered: ['回答済み', 'Answered'], needsReview: ['要確認', 'Needs review'],
    stayFlag: ['宿泊可否の確認が必要', 'Stay eligibility needs property review'],
    nearFlag: ['未回答・回答期限が近づいています', 'Not answered — deadline approaching'],
    lateFlag: ['未回答・回答期限を過ぎています', 'Not answered — deadline passed'],
    staffTitle: ['食事の回答と対応判断', 'Dietary responses & staff decisions'],
    staffHelp: ['各判断はデモ用です。宿泊者への承認通知や食事手配は行いません。既存の重要事項の確認状況とは別管理です。', 'Decisions are for demonstration only. They do not notify guests, approve arrangements or place meal orders. These responses are separate from important-information acknowledgements.'],
    detail: ['回答内容を開く', 'View answers'],
    decisions: ['カテゴリごとの宿側判断（デモ）', 'Property decision by category (demo)'],
    pending: ['未判断', 'Not assessed'], possible: ['対応可能', 'Can accommodate'], discuss: ['要相談', 'Discussion required'], impossible: ['対応不可', 'Cannot accommodate'],
    saved: ['デモ内の判断を変更しました。通知されません。', 'Demo decision updated. No notification is sent.'],
    seeStaff: ['宿側で回答を見る', 'See answers in staff view'],
    noAnswer: ['この予約には送信完了した回答がありません。入力途中の内容は宿側へ表示しません。', 'No completed response for this booking. Draft answers are not shown in the staff view.'],
    time: ['デモ内の回答日時', 'Demo submission timestamp'],
    checks: ['確認項目1〜7とは別の食事の相談です。重要事項の確認状況は変更しません。', 'This dietary interview is separate from items 1–7 and does not change their acknowledgement status.']
  };
  globalThis.createStayMeal = function createStayMeal(api) {
    const { el, action, field, main, reservations } = api;
    let page = 'intro', index = 0;
    const text = key => {
      if (!words[key]) { console.warn('Missing dietary translation key:', key); return key; }
      return words[key][api.language() === 'en' ? 1 : 0] || words[key][0];
    };
    const label = object => object[api.language()] || object.ja;
    const record = r => r.meal || (r.meal = { draft: M.fresh(), submitted: null, decisions: {}, today: M.shift(r.arrival, -6) });
    const repaint = () => api.render();
    function navigate(nextPage, nextIndex = index) {
      page = nextPage; index = nextIndex; repaint();
      const heading = main.querySelector('h2');
      if (heading) { heading.tabIndex = -1; heading.focus(); }
    }
    function open(r) { api.open(r); page = record(r).submitted ? 'done' : 'intro'; index = 0; repaint(); }
    function statusLabel(r) { const key = M.status(record(r)); return text(key === 'review' ? 'needsReview' : key); }
    function privacy(parent) {
      const details = el('details'); details.append(el('summary', text('privacyTitle')), el('p', text('privacy'), 'sc-note')); parent.append(details);
    }
    function notices(parent, full = false) {
      parent.append(el('p', text('warning'), 'sc-alert'), el('p', text('demo'), 'sc-note'), el('p', text('english'), 'sc-note'));
      if (full) parent.append(el('p', text('policy'), 'sc-alert'), el('p', text('published'), 'sc-warning'));
      privacy(parent);
    }
    function dates(parent, r) {
      const rec = record(r), due = M.deadline(r.arrival, rec.today);
      parent.append(el('p', `${text('arrival')}: ${r.arrival} · ${text('due')}: ${due.due}`, 'sc-note'));
      parent.append(el('p', due.expired ? text('expired') : text('deadline'), due.expired ? 'sc-alert' : 'sc-warning'));
      const details = el('details', undefined, 'sc-meal-dates'); details.append(el('summary', text('dateTitle')), el('p', text('dateHelp'), 'sc-note'));
      const input = el('input'); input.type = 'date'; input.value = rec.today;
      input.addEventListener('change', () => { if (/^\d{4}-\d{2}-\d{2}$/.test(input.value)) { rec.today = input.value; repaint(); } });
      details.append(field(text('today'), input));
      const controls = el('div', undefined, 'sc-actions');
      for (const [key, offset] of [['pre', -6], ['near', -5], ['boundary', -4], ['after', -3]]) controls.append(action(text(key), () => { rec.today = M.shift(r.arrival, offset); repaint(); }));
      details.append(controls); parent.append(el('p', `${text('today')}: ${rec.today}`, 'sc-note'), details);
      return due;
    }
    function entry(parent, r) {
      const box = el('section', undefined, 'sc-bottom');
      box.append(el('h3', text('title')), el('p', text('deadline'), 'sc-warning'), el('p', statusLabel(r), 'sc-note'), el('p', text('checks'), 'sc-note'), action(text('start'), () => open(r), true)); parent.append(box);
    }
    function questionTitle(s) {
      if (s.type === 'food') return `${label(M.allergens[s.allergen])} — ${text('food')}`;
      if (s.type === 'allergy') return `${label(M.allergens[s.allergen])} — ${text(s.key)}`;
      return text(s.type === 'text' ? s.id : s.type);
    }
    function setAnswer(d, s, v) {
      if (s.type === 'allergy' || s.type === 'food') {
        const a = d.allergy[s.allergen] || (d.allergy[s.allergen] = {});
        if (s.type === 'food') (a.foods || (a.foods = {}))[s.key] = v; else a[s.key] = v;
      } else if (s.type === 'pregnancy') d.pregnancy[s.key] = v;
      else if (s.type === 'hidden') d.hidden[s.key] = v;
    }
    function checkboxes(parent, entries, selected, onChange) {
      for (const [id, name] of entries) {
        const input = el('input'); input.type = 'checkbox'; input.checked = selected.includes(id);
        input.addEventListener('change', () => onChange(id, input.checked));
        const row = el('label', undefined, 'sc-check sc-meal-choice'); row.append(input, el('span', name)); parent.append(row);
      }
    }
    function textarea(parent, name, value, update) {
      const input = el('textarea'); input.maxLength = 2000; input.value = value;
      input.addEventListener('input', () => update(input.value)); parent.append(field(name, input), el('p', text('textHelp'), 'sc-note'));
    }
    function controls(parent, d, s) {
      if (s.type === 'categories') {
        checkboxes(parent, Object.entries(M.categories).map(([id, v]) => [id, label(v)]), d.categories, (id, checked) => { M.selectCategory(d, id, checked); repaint(); }); return;
      }
      if (s.type === 'allergens' || s.type === 'avoided') {
        const values = s.type === 'allergens' ? Object.entries(M.allergens).map(([id, v]) => [id, label(v)]) : M.avoided.map(([id, ja, en]) => [id, api.language() === 'en' ? en : ja]);
        const key = s.id;
        const group = el('div', undefined, 'sc-meal-options');
        const update = (id, checked) => {
          d[key] = checked ? [...new Set([...d[key], id])] : d[key].filter(v => v !== id); repaint();
        };
        checkboxes(group, values.slice(0, 5), d[key], update);
        parent.append(group);
        if (values.length > 5) {
          const more = el('details');
          more.open = values.slice(5).some(([id]) => d[key].includes(id));
          more.append(el('summary', api.language() === 'ja' ? 'その他の選択肢を開く' : 'Show more choices'));
          const moreOptions = el('div', undefined, 'sc-meal-options');
          checkboxes(moreOptions, values.slice(5), d[key], update);
          more.append(moreOptions); parent.append(more);
        }
        if (d[key].includes('other')) {
          const detail = s.type === 'allergens' ? 'allergenOther' : 'beliefOther';
          textarea(parent, text(detail), d[detail], v => { d[detail] = v; });
        }
        if (s.type === 'allergens') {
          const selected = d.allergens.filter(a => M.foods[a]);
          if (selected.length) {
            const preview = el('details'); preview.open = true;
            preview.append(el('summary', api.language() === 'ja' ? 'この後に確認する食品の例' : 'Foods we will ask about next'), el('p', text('examples'), 'sc-note'));
            for (const a of selected) preview.append(el('p', `${label(M.allergens[a])}: ${M.foods[a].map(([, ja, en]) => api.language() === 'en' ? en : ja).join(' / ')}`, 'sc-note'));
            parent.append(preview);
          }
        } return;
      }
      if (s.type === 'text') { textarea(parent, text(s.id), d[s.id], v => { d[s.id] = v; }); return; }
      if (s.label) parent.append(el('h3', label(s.label)));
      if (s.type === 'food') parent.append(el('p', label(M.allergens[s.allergen]), 'sc-eyebrow'), el('p', text('examples'), 'sc-note'));
      if (s.type === 'pregnancy') parent.append(el('p', text('pregnancyHelp'), 'sc-note'));
      const keys = s.key === 'severity' && s.type === 'allergy' ? ['mild', 'severe', 'anaphylaxis'] : s.type === 'food' ? ['avoid', 'okay', 'unknown'] : s.type === 'pregnancy' ? ['avoid', 'okay'] : ['allowed', 'notAllowed', 'unknown'];
      const group = el('fieldset', undefined, 'sc-meal-radios'); group.append(el('legend', questionTitle(s)));
      for (const key of keys) {
        const input = el('input'); input.type = 'radio'; input.name = s.id; input.value = key; input.checked = M.value(d, s) === key;
        input.addEventListener('change', () => setAnswer(d, s, key));
        const row = el('label', undefined, 'sc-check sc-meal-choice'); row.append(input, el('span', text(key))); group.append(row);
      } parent.append(group);
    }
    function summary(parent, answers, editable) {
      const labels = answers.categories.map(k => label(M.categories[k])).join(' / ');
      parent.append(el('p', labels, 'sc-review'));
      for (const s of M.steps(answers).slice(1)) {
        const row = el('div', undefined, 'sc-meal-answer');
        const value = M.value(answers, s);
        let answer;
        if (s.type === 'allergens') answer = answers.allergens.map(k => label(M.allergens[k]) + (k === 'other' ? `: ${answers.allergenOther}` : '')).join(' / ');
        else if (s.type === 'avoided') answer = answers.avoided.map(k => {
          const v = M.avoided.find(v => v[0] === k); return (api.language() === 'en' ? v[2] : v[1]) + (k === 'other' ? `: ${answers.beliefOther}` : '');
        }).join(' / ');
        else answer = s.type === 'text' ? value || text('empty') : text(value);
        row.append(el('h3', questionTitle(s)), ...(s.label ? [el('p', label(s.label), 'sc-note')] : []), el('p', answer, 'sc-review'));
        if (editable) row.append(action(text('edit'), () => navigate('questions', M.steps(record(api.current()).draft).findIndex(x => x.id === s.id))));
        parent.append(row);
      }
    }
    function guest() {
      const r = api.current(), rec = record(r), d = rec.draft;
      main.append(el('p', 'DIETARY CARE · DEMO', 'sc-eyebrow'), el('h1', text('title')), el('p', text('intro'), 'sc-subtitle'));
      const card = el('section', undefined, 'sc-card');
      card.append(el('p', r.name, 'sc-booking'));
      const due = dates(card, r);
      if (page === 'done' && rec.submitted) {
        card.append(el('h2', text('done')), el('p', text('demo'), 'sc-warning'), el('p', statusLabel(r), 'sc-note'));
        if (M.stayFlag(rec.submitted.answers)) card.append(el('p', text('stayFlag'), 'sc-alert'));
        summary(card, rec.submitted.answers, false); notices(card);
        if (!due.expired) card.append(action(text('revise'), () => { rec.draft = JSON.parse(JSON.stringify(rec.submitted.answers)); navigate('questions', 0); }));
        card.append(action(text('seeStaff'), () => api.staff(), true));
      } else if (due.expired) {
        card.append(el('h2', text('expired'))); notices(card);
        if (rec.submitted) card.append(action(text('detail'), () => navigate('done')));
      } else if (page === 'intro') {
        card.append(el('h2', text('title')), el('p', text('checks'), 'sc-note')); notices(card, true);
        card.append(action(text('next'), () => navigate('questions', 0), true));
      } else if (page === 'questions') {
        const questions = M.steps(d); index = Math.max(0, Math.min(index, questions.length - 1));
        const s = questions[index];
        const progress = el('p', `${index + 1} / ${questions.length}`, 'sc-eyebrow'); progress.setAttribute('aria-label', api.language() === 'ja' ? '食事の質問の進み具合' : 'Dietary interview progress');
        card.append(progress, el('h2', questionTitle(s)));
        if (s.type === 'categories' || s.type === 'allergens') card.append(el('p', text('policy'), 'sc-alert'));
        if (s.type === 'avoided') card.append(el('p', text('published'), 'sc-warning'));
        const form = el('form'); form.noValidate = true; controls(form, d, s);
        const error = el('p', '', 'sc-alert'); error.hidden = true; error.setAttribute('role', 'alert');
        const actions = el('div', undefined, 'sc-actions');
        actions.append(action(text('back'), () => navigate(index ? 'questions' : 'intro', Math.max(0, index - 1))));
        const next = action(text(index === questions.length - 1 ? 'review' : 'next'), () => {}, true); next.type = 'submit';
        actions.append(next); form.append(error, actions);
        form.addEventListener('submit', e => {
          e.preventDefault();
          if (!M.valid(d, s)) { error.hidden = false; error.textContent = text('error'); error.tabIndex = -1; error.focus(); return; }
          navigate(index === M.steps(d).length - 1 ? 'review' : 'questions', index + 1);
        }); card.append(form, el('p', text('demo'), 'sc-note'), el('p', text('english'), 'sc-note'));
      } else {
        card.append(el('h2', text('review')), el('p', text('reviewHelp'), 'sc-warning'));
        card.append(action(text('edit') + ' · ' + text('categories'), () => navigate('questions', 0)));
        summary(card, M.snapshot(d), true); notices(card, true);
        const form = el('form'); form.noValidate = true;
        const check = el('input'); check.type = 'checkbox';
        const consent = el('label', undefined, 'sc-check'); consent.append(check, el('span', text('consent')));
        const error = el('p', '', 'sc-alert'); error.hidden = true; error.setAttribute('role', 'alert');
        const send = action(text('send'), () => {}, true); send.type = 'submit';
        form.append(consent, error, send);
        form.addEventListener('submit', e => {
          e.preventDefault();
          const result = M.submit(d, r.arrival, rec.today, check.checked);
          if (result.error) { error.hidden = false; error.textContent = text(result.error === 'expired' ? 'expired' : result.error === 'consent' ? 'consentError' : 'error'); return; }
          rec.submitted = result; rec.decisions = {}; navigate('done');
        }); card.append(form);
      }
      card.append(el('div', undefined, 'sc-actions')); card.lastChild.append(action(text('return'), () => api.returnGuest()));
      main.append(card); api.contact();
    }
    function badge(parent, r) {
      const rec = record(r), state = M.status(rec), due = M.deadline(r.arrival, rec.today);
      parent.append(el('p', `${text('title')}: ${statusLabel(r)}`, state === 'review' ? 'sc-alert' : 'sc-note'));
      if (rec.submitted && M.stayFlag(rec.submitted.answers)) parent.append(el('p', text('stayFlag'), 'sc-alert'));
      if (!rec.submitted && (due.near || due.expired)) parent.append(el('p', text(due.expired ? 'lateFlag' : 'nearFlag'), due.expired ? 'sc-alert' : 'sc-warning'));
    }
    function admin() {
      main.append(el('h2', text('staffTitle')), el('p', text('staffHelp'), 'sc-note'), el('p', text('demo'), 'sc-warning'));
      for (const r of [...reservations].sort((a, b) => a.arrival.localeCompare(b.arrival))) {
        const rec = record(r), card = el('section', undefined, 'sc-card');
        card.append(el('h3', r.name)); badge(card, r); dates(card, r);
        if (rec.submitted) {
          const details = el('details'); details.append(el('summary', text('detail')));
          summary(details, rec.submitted.answers, false);
          details.append(el('p', `${text('time')}: ${rec.submitted.submittedAt} · ${text('today')}: ${rec.submitted.demoDate}`, 'sc-note')); card.append(details, el('h3', text('decisions')));
          const categories = rec.submitted.answers.categories.filter(k => k !== 'none');
          if (rec.submitted.answers.final.trim()) categories.push('final');
          for (const category of categories) {
            const input = el('select');
            for (const key of ['pending', 'possible', 'discuss', 'impossible']) { const option = el('option', text(key)); option.value = key; input.append(option); }
            input.value = rec.decisions[category] || 'pending';
            const saved = el('p', '', 'sc-note'); saved.setAttribute('role', 'status');
            input.addEventListener('change', () => { rec.decisions[category] = input.value; saved.textContent = text('saved'); });
            card.append(field(category === 'final' ? text('final') : label(M.categories[category]), input), saved);
          }
          card.append(el('p', text('warning'), 'sc-alert'));
        } else card.append(el('p', text('noAnswer'), 'sc-note'));
        card.append(action(text('start'), () => open(r))); main.append(card);
      }
    }
    return { open, guest, admin, entry, badge, text };
  };
})();
