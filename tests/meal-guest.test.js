import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { initialLanguage, localized, translate } from '../public/assets/i18n.js';
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


async function setup(failSave = false) {
  const originalQuery = Element.prototype.querySelectorAll;
  Element.prototype.querySelectorAll = function(selector) {
    if (selector.startsWith('.')) return this.all().filter(n => (n.className || '').split(' ').includes(selector.slice(1)));
    return originalQuery.call(this, selector);
  };
  const main = new Element('main'); main.dataset.property = 'demo';
  const ids = Object.fromEntries(['app','status','page-title','subtitle','contact-title','privacy-link'].map(id => [id,new Element('div')]));
  const seed = JSON.parse(await readFile(new URL('../seeds/giwon-demo.json', import.meta.url), 'utf8'));
  const context = { property: {name:seed.name, demo:true, wifi:seed.wifi}, reservation:{guestLabel:'Fictional guest',arrivalDate:'2027-01-01'}, version:1, guide:seed.guide, answers:seed.guide.items.map(v=>({item_id:v.id})), requests:[] };
  let saved = null, writes = 0;
  const sandbox = { console, URL, URLSearchParams, AbortSignal, structuredClone, crypto, initialLanguage, localized, translate,
    location: {search:'',hash:'',pathname:'/p/demo/confirm',href:'https://demo.example/p/demo/confirm'},
    history:{replaceState(){}}, navigator:{language:'ja'}, window:{localStorage:{getItem(){return null;}}},
    document:{documentElement:{},getElementById:id=>ids[id], querySelector:()=>main,querySelectorAll:()=>[], createElement:tag=>new Element(tag),createTextNode:text=>{const n=new Element('#text');n.textContent=text;return n;}},
    fetch:async (url, options) => {
      let body = {};
      if (url.endsWith('/csrf')) body={csrf:'demo'};
      if (url.endsWith('/context')) body=context;
      if (url.endsWith('/receipt')) body={completed:false};
      if (url.endsWith('/meal')) {
        if (options.method==='PUT') {writes++; if(failSave) throw Error('network'); const payload=JSON.parse(options.body); saved={answers:payload.answers,submittedAt:'2026-10-20T00:00:00Z',demoDate:payload.demoDate};}
        body={status:saved?'answered':'unanswered',revision:saved?1:0,submitted:saved};
      }
      return {ok:true,json:async()=>structuredClone(body)};
    }
  };
  vm.createContext(sandbox);
  for(const name of ['meal-model','meal-ui']) vm.runInContext(await readFile(new URL(`../public/assets/${name}.js`,import.meta.url),'utf8'),sandbox);
  const guest=(await readFile(new URL('../public/assets/guest.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
  await vm.runInContext(`(async()=>{${guest}\n})()`,sandbox);
  const all = tag => ids.app.all().filter(n=>n.tagName===tag);
  async function fire(element,event) { assert.ok(element); for(const fn of element.listeners[event]||[]) await fn({preventDefault(){},target:element}); }
  async function click(text) { const b=all('button').find(b=>b.textContent===text);assert.ok(b,text);await fire(b,'click'); }
  return {ids,all,fire,click,get writes(){return writes;}};
}

test('Cloudflare guest adapter separates notes and dietary answers and saves before showing answered',async()=>{
  const a=await setup();assert.ok(a.ids.app.textContent.includes('確認項目に当てはまらないその他のご要望'), a.ids.app.textContent);
  assert.ok(a.ids.app.textContent.includes('未回答'));
  await a.click('食事ヒアリングへ'); await a.click('次へ');
  const label=a.all('label').find(n=>n.textContent.includes('特になし'));
  const check=label.children.find(n=>n.tagName==='input');check.checked=true;await a.fire(check,'change');
  await a.fire(a.all('form').at(-1),'submit');await a.fire(a.all('form').at(-1),'submit');
  const consent=a.all('input').find(n=>n.type==='checkbox');consent.checked=true;
  await a.fire(a.all('form').at(-1),'submit');assert.equal(a.writes,1);
  assert.ok(a.ids.app.textContent.includes('回答済み（デモ用DB保存）'));
  await a.click('確認画面へ戻る');assert.ok(a.ids.app.textContent.includes('食事ヒアリング'));
});

test('failed dietary save is not shown as completed',async()=>{
  const a=await setup(true);await a.click('食事ヒアリングへ');await a.click('次へ');
  const label=a.all('label').find(n=>n.textContent.includes('特になし'));
  const check=label.children.find(n=>n.tagName==='input');check.checked=true;await a.fire(check,'change');
  await a.fire(a.all('form').at(-1),'submit');await a.fire(a.all('form').at(-1),'submit');
  const consent=a.all('input').find(n=>n.type==='checkbox');consent.checked=true;
  await a.fire(a.all('form').at(-1),'submit');assert.equal(a.writes,1);
  assert.ok(a.ids.app.textContent.includes('保存結果を確認できません'));
  assert.ok(!a.ids.app.textContent.includes('回答済み（デモ用DB保存）'));
});
