import test from 'node:test'
import assert from 'node:assert/strict'
import {createWriteBuffer} from '../api/_write-buffer.mjs'
import {productIndex} from '../shared/product-index.mjs'
import {lookupBatch,candidates} from '../api/_retrieval.mjs'

test('ID index preserves strict types, first duplicate and missing-product behavior',()=>{
 const first={id:1},duplicate={id:1},string={id:'1'},rows=[first,duplicate,string]
 const index=productIndex(rows)
 assert.equal(index.get(1),first);assert.equal(index.get('1'),string);assert.equal(index.get(2),undefined)
 assert.equal(productIndex(rows),index)
 assert.deepEqual(candidates(rows,{productIds:[1,'1',1,2]}),[first,string,first])
})

test('lookup batching keeps requested order despite out-of-order completions and respects max',async()=>{
 const rows=Array.from({length:8},(_,i)=>({id:i+1,name:'상품'+i})),completed=[]
 const result=await lookupBatch(rows,{nutrition:async p=>{await new Promise(resolve=>setTimeout(resolve,(5-p.id%5)*3));completed.push(p.id);return {status:'ok'}}},{max:6})
 assert.notDeepEqual(completed,[1,2,3,4,5,6])
 assert.deepEqual(result.map(r=>r.productId),[1,2,3,4,5,6])
 assert.equal(completed.length,6)
})

test('failed writer restores pending data while preserving newer values queued during the write',async()=>{
 let release,started,fail=true,paused=false,saved={},failures=0
 const gate=new Promise(r=>release=r),began=new Promise(r=>started=r)
 const buffer=createWriteBuffer({paused:()=>paused,onError:()=>{failures++;paused=true},write:async batch=>{
  if(fail){started();await gate;throw new Error('storage unavailable')}
  saved={...saved,...batch}
 }})
 buffer.queue({1:{nutrition:{value:'old'}}})
 const flushing=buffer.flush();await began
 buffer.queue({1:{nutrition:{value:'new'},procurement:{value:'offer'}},2:{nutrition:{value:'second'}}})
 release();await flushing;await buffer.flush()
 assert.equal(failures,1);assert.deepEqual(saved,{})
 fail=false;paused=false;await Promise.all([buffer.flush(),buffer.flush()])
 assert.equal(saved[1].nutrition.value,'new');assert.equal(saved[1].procurement.value,'offer');assert.equal(saved[2].nutrition.value,'second')
 assert.deepEqual(buffer.pending(),{})
})
