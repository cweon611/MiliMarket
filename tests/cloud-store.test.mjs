import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createBlobStore} from '../account-store.mjs'
class Conflict extends Error {}
function memoryBlob(){
 const files=new Map();let revision=0,collide=false
 return {files,BlobPreconditionFailedError:Conflict,
  conflictOnce(){collide=true},
  async get(key,options){assert.equal(options.access,'private');assert.equal(options.useCache,false);const row=files.get(key);return row?{stream:new Response(row.body).body,blob:{etag:row.etag}}:null},
  async put(key,body,options){assert.equal(options.access,'private');const old=files.get(key);if(old&&!options.allowOverwrite)throw Error('exists');if(options.ifMatch&&options.ifMatch!==old.etag)throw new Conflict();if(collide&&options.ifMatch){collide=false;const value=JSON.parse(old.body);value.history.unshift({id:'concurrent'});files.set(key,{body:JSON.stringify(value),etag:String(++revision)});throw new Conflict()}files.set(key,{body,etag:String(++revision)})},
  async del(key){files.delete(key)},
 }
}
test('Private sessions and saved history survive independent function instances',async()=>{
 const sdk=memoryBlob(),a=await createBlobStore(sdk),b=await createBlobStore(sdk)
 const user={id:'one',email:'one@example.test',name:'One',salt:'salt',hash:'hash',history:[]}
 await a.createUser(user);await assert.rejects(b.createUser(user),e=>e.statusCode===409)
 const token=await a.createSession(user);assert.equal((await b.getSession(token)).id,user.id)
 await b.saveHistory(user,{id:'plan1',plan:{settings:{days:7}}});assert.equal((await a.getSession(token)).history[0].id,'plan1')
 assert.ok([...sdk.files.keys()].every(k=>!k.includes(user.email)))
 await b.deleteSession(token);assert.equal(await a.getSession(token),null)
})
test('Concurrent history writes preserve both updates with conditional retry',async()=>{
 const sdk=memoryBlob(),a=await createBlobStore(sdk),user={id:'two',email:'two@example.test',history:[]}
 await a.createUser(user);sdk.conflictOnce();await a.saveHistory(user,{id:'own'})
 assert.deepEqual((await a.findUser(user.email)).history.map(h=>h.id),['own','concurrent'])
})

test('Saving an identical history entry skips Blob upload but changed history is persisted',async()=>{
 const sdk=memoryBlob(),put=sdk.put;let uploads=0
 sdk.put=async(...args)=>{uploads++;return put(...args)}
 const store=await createBlobStore(sdk),user={id:'dedupe',email:'dedupe@example.test',history:[]}
 await store.createUser(user)
 const entry={id:'plan',createdAt:'2026-11-09',plan:{settings:{days:7}}}
 await store.saveHistory(user,entry)
 const before=uploads
 await store.saveHistory(user,structuredClone(entry));assert.equal(uploads,before)
 await store.saveHistory(user,{...entry,plan:{settings:{days:3}}});assert.equal(uploads,before+1)
 assert.equal((await store.findUser(user.email)).history[0].plan.settings.days,3)
})
