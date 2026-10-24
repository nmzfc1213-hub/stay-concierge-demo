/* In-memory DOM fixture, not a browser or Safari rendering test. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.dataset = {}; this.listeners = {}; this._text = ''; this.hidden = false; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  append(...children) { for (const c of children) { c.parent = this; this.children.push(c); } }
  replaceChildren(...children) { this.children = []; this._text = ''; this.append(...children); }
  get lastChild() { return this.children.at(-1); }
  setAttribute(k, v) { this.attributes[k] = v; }
  addEventListener(k, fn) { (this.listeners[k] ||= []).push(fn); }
  fire(k) { for (const fn of this.listeners[k] || []) fn({ preventDefault() {}, target: this }); }
  focus() { this.focused = true; }
  all() { return this.children.flatMap(c => [c, ...c.all()]); }
  querySelectorAll(selector) {
    return this.all().filter(n => {
      if (selector === '[data-view]') return n.dataset.view;
      if (selector === '[data-language]') return n.dataset.language;
      const attr = selector.match(/^\[data-(view|language)="(.*?)"\]$/);
      if (attr) return n.dataset[attr[1]] === attr[2];
      return selector.startsWith('#') ? n.id === selector.slice(1) : n.tagName === selector;
    });
  }
  querySelector(s) { return this.querySelectorAll(s)[0] || null; }
}
function app() {
  const root = new Element('div'), main = new Element('main'); main.id = 'sc-main';
  for (const view of ['guest', 'admin']) { const b = new Element('button'); b.dataset.view = view; root.append(b); }
  for (const language of ['ja', 'en']) { const b = new Element('button'); b.dataset.language = language; root.append(b); }
  root.append(main);
  const warnings = [];
  const ctx = { console: { warn: (...v) => warnings.push(v.join(' ')) }, document: {
    getElementById: () => root, createElement: tag => new Element(tag),
    createTextNode: text => { const n = new Element('#text'); n.textContent = text; return n; }, documentElement: {}
  } };
  for (const name of ['meal-model', 'meal-ui', 'app']) vm.runInNewContext(fs.readFileSync(name === 'app' ? 'tests/meal-preview/fixtures/app.js' : `public/assets/${name}.js`, 'utf8'), ctx);
  const all = tag => main.all().filter(n => n.tagName === tag);
  const button = text => { const b = all('button').find(b => b.textContent === text); assert.ok(b, `Missing button: ${text}`); b.fire('click'); };
  const choose = text => { const label = all('label').find(n => n.children.some(c => c.tagName === 'span' && c.textContent === text)); assert.ok(label, `Missing choice: ${text}`); const input = label.children.find(c => c.tagName === 'input'); input.checked = true; input.fire('change'); };
  return { ctx, root, main, all, button, choose, submit: () => { const form = all('form').at(-1); assert.ok(form); form.fire('submit'); }, warnings };
}
test('None flow requires review consent; staff response appears without changing item acknowledgements', () => {
  const a = app(); a.button('食事ヒアリングへ'); a.button('次へ');
  a.choose('特になし'); a.submit(); a.submit();
  assert.ok(a.main.textContent.includes('まだ回答は完了していません'));
  a.submit(); assert.ok(!a.main.textContent.includes('回答完了（このプレビュー内のみ）'));
  a.choose('回答内容・注意書き・健康情報の取扱いを確認しました（架空データのデモ送信）。'); a.submit();
  assert.ok(a.main.textContent.includes('回答完了（このプレビュー内のみ）'));
  a.button('宿側で回答を見る'); assert.ok(a.main.textContent.includes('食事ヒアリング: 回答済み'));
  assert.ok(a.main.textContent.includes('この予約には送信完了した回答がありません'));
  a.button('予約一覧'); assert.ok(a.main.textContent.includes('宿泊者の確認：0 / 7'));
  assert.equal(a.warnings.length, 0);
});
test('Allergy soy detail, unknown foods, review edit, language switch and staff decision persist', () => {
  const a = app(); a.button('食事ヒアリングへ'); a.button('次へ'); a.choose('アレルギーがある'); a.submit();
  a.choose('大豆'); assert.ok(a.main.textContent.includes('味噌汁'));
  a.submit(); a.choose('重い'); a.submit(); a.choose('不可（許容できない）'); a.submit();
  a.choose('わからない'); a.submit(); a.choose('不可（許容できない）'); a.submit();
  for (let i = 0; i < 7; i++) { a.choose('わからない'); a.submit(); }
  a.submit(); assert.ok(a.main.textContent.includes('送信前') || a.main.textContent.includes('回答内容を確認'));
  const en = a.root.querySelector('[data-language="en"]'); en.fire('click');
  assert.ok(a.main.textContent.includes('Soy — Is cross-contamination (trace amounts) acceptable?'));
  assert.equal(a.ctx.document.documentElement.lang, 'en');
  a.button('Edit · Select all categories that apply');
  assert.ok(a.all('input').some(i => i.checked));
  // Go forward through preserved answers to review.
  for (let i = 0; i < 14; i++) a.submit();
  assert.ok(a.main.textContent.includes('Review answers'));
  a.choose('I have reviewed my answers, the notices and health information handling (fictional demo submission).'); a.submit();
  a.button('See answers in staff view');
  assert.ok(a.main.textContent.includes('Stay eligibility needs property review'));
  const select = a.all('select')[0]; select.value = 'discuss'; select.fire('change');
  assert.ok(a.main.textContent.includes('Demo decision updated'));
  a.root.querySelector('[data-language="ja"]').fire('click');
  assert.equal(a.all('select')[0].value, 'discuss');
  assert.ok(a.main.textContent.includes('要確認'));
  assert.equal(a.warnings.length, 0);
});
test('Expired simulation closes guest form; unanswered near-deadline is marked in staff view', () => {
  const a = app(); a.button('食事ヒアリングへ'); a.button('期限後');
  assert.ok(a.main.textContent.includes('受付終了。当日の対応は保証できません'));
  assert.equal(a.all('form').length, 0);
  a.button('期限間近'); a.root.querySelector('[data-view="admin"]').fire('click'); a.button('食事ヒアリング');
  assert.ok(a.main.textContent.includes('未回答・回答期限が近づいています'));
});
test('Existing seven acknowledgement items and final confirmation still work', () => {
  const a = app(); a.button('重要事項の確認へ進む');
  for (let i = 0; i < 7; i++) { a.choose('この内容を読みました'); a.button('確認しました'); }
  const select = a.all('select')[0]; select.value = '15-16'; select.fire('change');
  const notes = a.all('textarea')[0]; notes.value = 'なし'; notes.fire('input'); a.submit();
  a.choose('予約の代表者として確認します。');
  a.button('この内容で確認を完了（デモ）');
  assert.ok(a.main.textContent.includes('確認完了（デモ）'));
  a.button('宿側の一覧で結果を見る'); a.button('予約一覧'); a.button('すべて');
  assert.ok(a.main.textContent.includes('食事ヒアリング: 未回答'));
});
test('Fresh page reload clears all dietary answers and decisions', () => {
  const a = app(); a.button('食事ヒアリングへ'); a.button('次へ'); a.choose('特になし'); a.submit(); a.submit();
  a.choose('回答内容・注意書き・健康情報の取扱いを確認しました（架空データのデモ送信）。'); a.submit();
  const b = app(); b.root.querySelector('[data-view="admin"]').fire('click'); b.button('食事ヒアリング');
  assert.ok(!b.main.textContent.includes('食事ヒアリング: 回答済み'));
});
test('All four categories can be completed together, including Other descriptions and hidden ingredients', () => {
  const a = app(); a.root.querySelector('[data-language="en"]').fire('click');
  a.button('Open dietary interview'); a.button('Next');
  for (const name of ['Food allergies', 'Pregnant', 'Religious or ethical restrictions (including vegetarian / vegan)', 'Other (dislikes, health conditions or medical instructions)']) a.choose(name);
  a.submit(); a.choose('Egg'); a.choose('Other');
  let count = 0;
  while (!a.main.textContent.includes('Your response is not complete yet.')) {
    assert.ok(count++ < 60, 'Expected review within 60 steps');
    if (a.main.textContent.includes('Select everything you avoid')) { a.choose('Pork'); a.choose('Other'); }
    for (const input of a.all('textarea')) { input.value = 'Fictional detail'; input.fire('input'); }
    const radio = a.all('input').find(i => i.type === 'radio');
    if (radio) { radio.checked = true; radio.fire('change'); }
    a.submit();
  }
  a.choose('I have reviewed my answers, the notices and health information handling (fictional demo submission).'); a.submit();
  a.button('See answers in staff view');
  assert.equal(a.all('select').length, 5); // Four categories plus final additional information.
  assert.ok(a.main.textContent.includes('Kelp stock'));
  assert.ok(a.main.textContent.includes('Alcohol (including cooking sake and mirin)'));
  assert.equal(a.warnings.length, 0);
});
