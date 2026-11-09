import test from 'node:test'
import assert from 'node:assert/strict'
import {createProductImageLoader} from '../shared/product-image-loader.mjs'
const response=(id,images=['https://shop.g2b.go.kr/static/CataAttach/current.jpg'])=>({ok:true,json:async()=>({id,images})})
test('cards and galleries share concurrent image lookups and successful cache',async()=>{
 let calls=0,finish
 const load=createProductImageLoader(()=>{calls++;return new Promise(resolve=>{finish=resolve})})
 const card=load(12345678),gallery=load(12345678)
 assert.equal(card,gallery)
 await Promise.resolve();finish(response(12345678))
 assert.deepEqual(await card,await gallery)
 await load(12345678);assert.equal(calls,1)
})
test('failed or mismatched lookups can be retried without caching another product images',async()=>{
 let calls=0
 const load=createProductImageLoader(async()=>++calls===1?{ok:false}:calls===2?response(87654321):response(12345678))
 await assert.rejects(load(12345678),/lookup failed/)
 await assert.rejects(load(12345678),/Invalid image list/)
 assert.equal((await load(12345678)).id,12345678)
 assert.equal(calls,3)
})
test('expired and explicit refresh requests fetch a new image list',async()=>{
 let time=0,calls=0
 const load=createProductImageLoader(async()=>{calls++;return response(12345678)},()=>time)
 await load(12345678);await load(12345678);assert.equal(calls,1)
 time=3600001;await load(12345678);assert.equal(calls,2)
 await load(12345678,true);assert.equal(calls,3)
})
