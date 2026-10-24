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
  for (const name of ['meal-model', 'meal-ui', 'app']) vm.runInNewContext(fs.readFileSync(`samples/komorebi/${name}.js`, 'utf8'), ctx);
  const all = tag => main.all().filter(n => n.tagName === tag);
  const button = text => { const b = all('button').find(b => b.textContent === text); assert.ok(b, `Missing button: ${text}`); b.fire('click'); };
  const choose = text => { const label = all('label').find(n => n.children.some(c => c.tagName === 'span' && c.textContent === text)); assert.ok(label, `Missing choice: ${text}`); const input = label.children.find(c => c.tagName === 'input'); input.checked = true; input.fire('change'); };
  return { ctx, root, main, all, button, choose, submit: () => { const form = all('form').at(-1); assert.ok(form); form.fire('submit'); }, warnings };
}
test('fictional sample has no real property contact, uses separate other requests, and is memory-only', () => {
 const a=app(); assert.ok(a.main.textContent.includes('サンプル旅館 こもれび庵'));
 assert.ok(a.main.textContent.includes('架空の施設・規定の設定例'));
 for(const name of ['app.js','index.html','meal-ui.js']) {
  const text=fs.readFileSync(`samples/komorebi/${name}`,'utf8');
  assert.doesNotMatch(text,/ぎをん|Giwon|giwon\.cc|075-532-5333|fetch\(/);
 }
 assert.ok(fs.readFileSync('samples/komorebi/app.js','utf8').includes('確認項目に当てはまらないその他のご要望'));
 assert.equal(a.warnings.length,0);
});
test('fictional sample dietary flow supports consent and answered status without imposing real property policy', () => {
 const a=app();a.button('食事ヒアリングへ');a.button('次へ');a.choose('特になし');a.submit();a.submit();
 a.choose('回答内容・注意書き・健康情報の取扱いを確認しました（架空データのデモ送信）。');a.submit();
 assert.ok(a.main.textContent.includes('回答完了（このプレビュー内のみ）'));
 assert.equal(a.ctx.StayMealModel.stayFlag({categories:['allergy'],allergens:['egg'],allergy:{egg:{trace:'notAllowed'}}}),false);
 a.button('宿側で回答を見る');assert.ok(a.main.textContent.includes('食事ヒアリング: 回答済み'));
});
test('fictional sample English review contains no real property endorsement', () => {
 const a=app();const en=a.root.querySelector('[data-language="en"]');en.fire('click');
 assert.ok(a.main.textContent.includes('Komorebi-an'));
 assert.ok(a.main.textContent.includes('Fictional property and example rules'));
 assert.equal(a.warnings.length,0);
});
