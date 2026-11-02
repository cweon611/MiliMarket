import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createDataStore} from '../api/_data-store.mjs'
class Conflict extends Error {}
function memoryBlob({conflicts=0}={}){
 const files=new Map();let revision=0,puts=0
 return {files,BlobPreconditionFailedError:Conflict,get puts(){return puts},
  async get(key){const row=files.get(key);return row?{stream:new Response(row.body).body,blob:{etag:row.etag}}:null},
  async put(key,body,options){puts++;const old=files.get(key);if(old&&options.ifMatch!==old.etag)throw new Conflict();if(conflicts>0&&old){conflicts--;const other=JSON.parse(old.body);other.entries.other={nutrition:{status:'ok'}};files.set(key,{body:JSON.stringify(other),etag:String(++revision)});throw new Conflict()}files.set(key,{body,etag:String(++revision)})},
 }
}
const ok={status:'ok',fetchedAt:new Date().toISOString()}
test('Concurrent lookup results share Blob writes instead of one write per product',async()=>{
 const sdk=memoryBlob(),store=await createDataStore('',{cloud:true,client:sdk})
 await Promise.all(Array.from({length:40},(_,i)=>store.put(10000000+i,'nutrition',ok)))
 assert.ok(sdk.puts<=2,`expected batched writes, got ${sdk.puts}`)
 assert.equal(Object.keys(JSON.parse(sdk.files.get('catalog/public-data.json').body).entries).length,40)
})
test('ETag conflicts are retried and keep the other writer data; failures never throw',async()=>{
 const sdk=memoryBlob(),seed=await createDataStore('',{cloud:true,client:sdk});await seed.put(1,'nutrition',ok)
 const retry=memoryBlob({conflicts:2});retry.files.set('catalog/public-data.json',sdk.files.get('catalog/public-data.json'))
 const store=await createDataStore('',{cloud:true,client:retry});await store.put(2,'nutrition',ok)
 assert.deepEqual(Object.keys(JSON.parse(retry.files.get('catalog/public-data.json').body).entries).sort(),['1','2','other'])
 const broken=memoryBlob({conflicts:99});broken.files.set('catalog/public-data.json',sdk.files.get('catalog/public-data.json'))
 const failing=await createDataStore('',{cloud:true,client:broken});await failing.put(3,'nutrition',ok)
 assert.ok(failing.entries()[3],'result stays in memory for the next flush')
})
