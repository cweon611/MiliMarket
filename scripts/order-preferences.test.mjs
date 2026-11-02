import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateOrder, defaultQuote } from '../src/data.ts'
import { decodePreferences, restoreQuote, saveQuote } from '../src/order-preferences.ts'
const soy={id:21717141,name:'두유',packGrams:null,market:{name:'두유음료, 정식품, 달콤한베지밀비, 190mL/팩',unit:'개',packGrams:null,unitPrice:590}}
test('individual drinks calculate by count without converting mL to grams',()=>{
 const q=defaultQuote(soy)
 assert.equal(q.mode,'count')
 assert.equal(q.pack,null)
 assert.deepEqual(calculateOrder(150,q),{needed:150,packs:150,total:88500})
 assert.deepEqual(calculateOrder(151,{...q,unitsPerPerson:.5}),{needed:75.5,packs:76,total:44840})
 assert.equal(calculateOrder(150,{...q,unitsPerPerson:null}).total,null)
 assert.equal(calculateOrder(150,{...q,price:null}).total,null)
})
test('bulk, multipacks, and large drinks never default to one individual serving',()=>{
 for(const market of [{...soy.market,unit:'박스'},{...soy.market,name:'두유음료 190mL 24개입'},{...soy.market,name:'두유음료 1000mL'}]) assert.notEqual(defaultQuote({...soy,market}).mode,'count')
 const cup={...soy,market:{name:'면류, 농심, 육개장큰사발, 110g',unit:'개',packGrams:110,unitPrice:912}}
 assert.equal(calculateOrder(150,defaultQuote(cup)).total,136800)
})
test('saved serving settings restore but stale prices and changed specifications do not',()=>{
 const saved=saveQuote(soy,{portion:100,pack:190,price:9999,mode:'count',unitsPerPerson:2})
 const prefs=decodePreferences(JSON.stringify({version:1,people:150,quotes:{21717141:saved}}))
 assert.equal(prefs.people,150)
 const q=restoreQuote(soy,prefs)
 assert.equal(q.unitsPerPerson,2)
 assert.equal(q.price,590)
 assert.equal(restoreQuote({...soy,market:{...soy.market,name:'두유음료 250mL'}},prefs).unitsPerPerson,1)
 const weight=restoreQuote(soy,decodePreferences(JSON.stringify({version:1,quotes:{21717141:{...saved,mode:'weight'}}})))
 assert.equal(calculateOrder(150,weight).packs,79)
})
test('invalid stored preferences are ignored safely',()=>{
 for(const raw of ['broken','null','{"version":9}','{"version":1,"people":-1,"quotes":{"1":null}}']) assert.equal(decodePreferences(raw).people,1000)
 const prefs=decodePreferences('{"version":1,"people":150,"quotes":{"1":{"signature":"x","mode":"count","unitsPerPerson":-1}}}')
 assert.equal(prefs.quotes[1].unitsPerPerson,null)
})
