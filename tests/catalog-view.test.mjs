import test from 'node:test'
import assert from 'node:assert/strict'
import {createCatalogView} from '../api/_catalog-view.mjs'
import {applyOfficialData} from '../api/_data-store.mjs'
import {mergeOfficialEntries} from '../shared/official-nutrition.mjs'
const DAY=86400000,START=Date.parse('2026-11-09T10:00:00Z')
const product={id:10000001,name:'두부',market:{unit:'개',unitPrice:1000,packGrams:200},manufacturer:'원본'}
const nutrition=(at,protein=10,validDays=1)=>({status:'ok',match:'report_number',partial:false,fetchedAt:new Date(at).toISOString(),validDays,records:[{code:'test',reportNumber:'test',basis:{amount:100,unit:'g'},nutrients:{protein:{value:protein}}}]})
const procurement=(at,extra={})=>({status:'ok',fetchedAt:new Date(at).toISOString(),offers:[{unit:'개',unitPrice:900,manufacturer:'공식 제조사',...extra}]})
const expected=(rows,bulk,live,time)=>applyOfficialData(rows,mergeOfficialEntries(bulk,live,time),time)

test('catalog snapshot reuses unchanged input and refreshes immediately on a store update',()=>{
 let time=START,live={};const rows=[product],bulk={}
 const original=JSON.stringify(rows),view=createCatalogView(rows,bulk,()=>live,{now:()=>time})
 const first=view.products();time+=100
 assert.equal(view.products(),first)
 live={10000001:{nutrition:nutrition(time)}}
 const updated=view.products();assert.notEqual(updated,first)
 assert.deepEqual(updated,expected(rows,bulk,live,time));assert.equal(updated[0].verifiedNutrition.nutrients.protein.value,10)
 assert.equal(JSON.stringify(rows),original)
})

test('nutrition is refreshed exactly at start/expiry boundaries and bulk fallback remains identical',()=>{
 let time=START,live={10000001:{nutrition:nutrition(START+1000,20,0.0001)}}
 const rows=[product],bulk={10000001:{nutrition:nutrition(START-DAY,5,35)}}
 const view=createCatalogView(rows,bulk,()=>live,{now:()=>time})
 for(const t of [START,START+999,START+1000,START+9639,START+9640,START+DAY,START+34*DAY-1,START+34*DAY,START-1]){
  time=t;assert.deepEqual(view.products(),expected(rows,bulk,live,time),new Date(t).toISOString())
 }
})

test('procurement prices update at UTC contract boundaries without an extra cache lifetime',()=>{
 let time=Date.parse('2026-11-09T23:59:59.999Z')
 const rows=[product],bulk={},live={10000001:{procurement:procurement(time,{contractStart:'2026-11-10',contractEnd:'2026-11-10'})}}
 const view=createCatalogView(rows,bulk,()=>live,{now:()=>time})
 for(const t of [time,time+1,Date.parse('2026-11-10T12:00:00Z'),Date.parse('2026-11-11T00:00:00Z')]){
  time=t;assert.deepEqual(view.products(),expected(rows,bulk,live,time))
 }
})

test('clock reversal and invalid evidence dates never leave stale verified data',()=>{
 let time=START,live={10000001:{nutrition:nutrition(START-1)}}
 const view=createCatalogView([product],{},()=>live,{now:()=>time})
 assert.ok(view.products()[0].verifiedNutrition)
 time=START-1000;assert.deepEqual(view.products(),expected([product],{},live,time))
 live={10000001:{nutrition:{...nutrition(START),fetchedAt:'invalid'}}}
 assert.deepEqual(view.products(),expected([product],{},live,time))
})
