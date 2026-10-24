import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadProperty,STORAGE_KEY} from '../assets/model.js';
const sample=JSON.parse(await readFile(new URL('../data/demo.json',import.meta.url),'utf8'));
test('published property loading and preview isolation',async t=>{
 const originals={location:globalThis.location,localStorage:globalThis.localStorage,fetch:globalThis.fetch};
 t.after(()=>{for(const [key,value] of Object.entries(originals)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
 let calls=[];
 globalThis.localStorage={getItem:()=>{throw new Error('Published guide must not read browser preview');}};
 globalThis.location={search:'?property=demo&lang=en'};
 globalThis.fetch=async(path,options)=>{calls.push({path,options});return {ok:true,json:async()=>structuredClone(sample)};};
 const normal=await loadProperty();assert.equal(normal.preview,false);assert.equal(normal.data.id,'demo');assert.equal(calls[0].path,'data/demo.json');
 await t.test('rejects path traversal before network access',async()=>{globalThis.location.search='?property=..%2Fprivate';calls=[];await assert.rejects(loadProperty(),/Invalid property ID/);assert.equal(calls.length,0);});
 await t.test('unknown property fails rather than displaying another property',async()=>{globalThis.location.search='?property=unknown';globalThis.fetch=async()=>({ok:false});await assert.rejects(loadProperty(),/Property not found/);});
 await t.test('mismatched property data is rejected',async()=>{globalThis.location.search='?property=another';globalThis.fetch=async()=>({ok:true,json:async()=>sample});await assert.rejects(loadProperty(),/mismatch/);});
 await t.test('preview only loads with an explicit preview URL',async()=>{globalThis.location.search='?preview=1';globalThis.fetch=async()=>{throw new Error('Preview must not fetch property data');};globalThis.localStorage={getItem:key=>{assert.equal(key,STORAGE_KEY);return JSON.stringify(sample);}};const result=await loadProperty();assert.equal(result.preview,true);});
 await t.test('missing preview produces an explicit error',async()=>{globalThis.localStorage={getItem:()=>null};await assert.rejects(loadProperty(),/Save a preview/);});
});
