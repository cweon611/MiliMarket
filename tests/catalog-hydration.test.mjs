import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {hydrateCatalog} from '../src/catalog-hydration.ts'
import {mergeCatalog} from '../shared/catalog.mjs'
import {officialEntries,imageEntries,isFresh} from '../shared/official-nutrition.mjs'
import {verifiedRecord} from '../shared/nutrition.mjs'
const read=name=>readFile(new URL(`../public/data/${name}.json`,import.meta.url),'utf8').then(JSON.parse)

test('deferred catalog preserves every original hydrated record without changing source data',async()=>{
 const [rows,market,bulk,imageFile]=await Promise.all(['products','market-enrichment','official-nutrition','image-nutrition'].map(read))
 const before=JSON.stringify([rows,market,bulk,imageFile])
 const entries=officialEntries(bulk),images=imageEntries(imageFile)
 const expected=mergeCatalog(rows,market).map(p=>{
  const n=entries[p.id]?.nutrition
  const base=n&&isFresh(n)?{...p,verifiedNutrition:verifiedRecord(n),officialNutritionState:'verified'}:p
  return !base.verifiedNutrition&&images[p.id]?{...base,imageNutrition:images[p.id]}:base
 })
 const actual=hydrateCatalog(rows,market,bulk,imageFile)
 assert.equal(actual.length,7902)
 assert.deepEqual(actual,expected)
 assert.equal(JSON.stringify([rows,market,bulk,imageFile]),before)
})
test('catalog remains available when optional nutrition files are unavailable',async()=>{
 const [rows,market]=await Promise.all(['products','market-enrichment'].map(read))
 assert.deepEqual(hydrateCatalog(rows,market,null,null),mergeCatalog(rows,market))
})
test('missing required product data is rejected instead of showing a false empty result',()=>{
 assert.throws(()=>hydrateCatalog([],{},null,null),/Empty catalog/)
 assert.throws(()=>hydrateCatalog(null,{},null,null),/Empty catalog/)
})
