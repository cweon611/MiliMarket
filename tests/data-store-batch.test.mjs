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
test('A suspended Blob store (403) never crashes the server and is not retried for 10 minutes',async()=>{
 let calls=0,t=0
 const sdk={BlobPreconditionFailedError:Conflict,async get(){calls++;throw Object.assign(new Error('Vercel Blob: Failed to fetch blob: 403 Forbidden'),{name:'BlobError'})},async put(){calls++;throw new Error('Vercel Blob: 403')}}
 const store=await createDataStore('',{cloud:true,client:sdk,now:()=>t})
 assert.deepEqual(store.entries(),{})
 await store.put(1,'nutrition',ok);await store.refresh();await store.flush()
 assert.equal(calls,1,'paused after the first failure')
 assert.equal(store.entries()[1].nutrition.status,'ok','results stay in memory')
 t+=11*60000;await store.refresh()
 assert.equal(calls,2,'tries again after the pause')
})

test('Sequential lookup completions are queued until the response boundary and persisted in one write',async()=>{
 const sdk=memoryBlob(),store=await createDataStore('',{cloud:true,client:sdk,deferWrites:true})
 for(let i=0;i<40;i++)await store.put(10000000+i,'nutrition',ok)
 assert.equal(sdk.puts,0,'lookups do not upload one file per result')
 assert.equal(Object.keys(store.entries()).length,40,'results are immediately available for answers')
 await Promise.all([store.flush(),store.flush()])
 assert.equal(sdk.puts,1)
 const loaded=await createDataStore('',{cloud:true,client:sdk})
 assert.deepEqual(loaded.entries(),store.entries(),'all completed lookups survive a fresh instance')
 await store.flush();assert.equal(sdk.puts,1,'unrelated API responses do not write again')
})

test('Identical results skip uploads in memory and when another instance has already stored them',async()=>{
 const sdk=memoryBlob(),a=await createDataStore('',{cloud:true,client:sdk,deferWrites:true}),b=await createDataStore('',{cloud:true,client:sdk,deferWrites:true})
 await a.put(1,'nutrition',ok);await a.flush()
 await a.put(1,'nutrition',structuredClone(ok));await a.flush()
 assert.equal(sdk.puts,1)
 await b.put(1,'nutrition',structuredClone(ok));await b.flush()
 assert.equal(sdk.puts,1,'fresh ETag read avoids uploading an already-persisted result')
 const newer={...ok,fetchedAt:new Date(Date.parse(ok.fetchedAt)+1000).toISOString()}
 await a.put(1,'nutrition',newer);await a.flush()
 assert.equal(sdk.puts,2,'freshness changes are not discarded as duplicates')
})

test('Concurrent cache refreshes share one read and honor the existing refresh interval',async()=>{
 let t=0,reads=0
 const sdk=memoryBlob(),get=sdk.get
 sdk.get=async(...args)=>{reads++;return get(...args)}
 const store=await createDataStore('',{cloud:true,client:sdk,now:()=>t,deferWrites:true})
 assert.equal(reads,1)
 await store.refresh();assert.equal(reads,1)
 t=6*60000
 await Promise.all(Array.from({length:10},()=>store.refresh()))
 assert.equal(reads,2)
 await store.refresh();assert.equal(reads,2)
})

test('Results queued during an upload are flushed afterwards without being lost',async()=>{
 const sdk=memoryBlob(),put=sdk.put
 let release,started
 const gate=new Promise(resolve=>release=resolve),uploadStarted=new Promise(resolve=>started=resolve)
 let first=true
 sdk.put=async(...args)=>{if(first){first=false;started();await gate}return put(...args)}
 const store=await createDataStore('',{cloud:true,client:sdk,deferWrites:true})
 await store.put(1,'nutrition',ok)
 const uploading=store.flush();await uploadStarted
 await store.put(2,'nutrition',ok);release();await uploading
 assert.equal(sdk.puts,2)
 assert.deepEqual(Object.keys(JSON.parse(sdk.files.get('catalog/public-data.json').body).entries),['1','2'])
})

test('Concurrent first creation retries a generic exists error and keeps both writers',async()=>{
 const sdk=memoryBlob(),put=sdk.put
 sdk.put=async(key,body,options)=>{
  if(sdk.files.has(key)&&!options.allowOverwrite)throw new Error('blob already exists')
  return put(key,body,options)
 }
 const a=await createDataStore('',{cloud:true,client:sdk,deferWrites:true}),b=await createDataStore('',{cloud:true,client:sdk,deferWrites:true})
 await a.put(1,'nutrition',ok);await b.put(2,'nutrition',ok)
 await Promise.all([a.flush(),b.flush()])
 assert.deepEqual(Object.keys(JSON.parse(sdk.files.get('catalog/public-data.json').body).entries),['1','2'])
})

test('Failed deferred uploads retain the entire batch and retry after the existing pause',async()=>{
 const sdk=memoryBlob(),put=sdk.put
 let t=0,broken=true,attempts=0
 sdk.put=async(...args)=>{attempts++;if(broken)throw new Error('Vercel Blob: 403');return put(...args)}
 const store=await createDataStore('',{cloud:true,client:sdk,now:()=>t,deferWrites:true})
 for(let i=1;i<=40;i++)await store.put(i,'nutrition',ok)
 await store.flush();await store.flush();assert.equal(attempts,1)
 assert.equal(Object.keys(store.entries()).length,40)
 t=11*60000;broken=false;await store.flush()
 assert.equal(attempts,2)
 assert.equal(Object.keys(JSON.parse(sdk.files.get('catalog/public-data.json').body).entries).length,40)
})
