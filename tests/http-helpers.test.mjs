import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {readBody,serveStatic,createRateLimiter} from '../api/_http.mjs'
import {readJsonResponse} from '../shared/http-response.mjs'

test('API response helper preserves JSON and server messages, and handles non-JSON failures',async()=>{
 assert.deepEqual(await readJsonResponse(Response.json({ok:true,value:0})),{ok:true,value:0})
 assert.equal(await readJsonResponse(Response.json(null)),null)
 await assert.rejects(readJsonResponse(Response.json({error:'계정 오류'},{status:401})),/^Error: 계정 오류$/)
 await assert.rejects(readJsonResponse(new Response('A server error occurred',{status:500})),/HTTP 500/)
 await assert.rejects(readJsonResponse(new Response('<html>error</html>',{status:502})),/HTTP 502/)
 await assert.rejects(readJsonResponse(new Response('broken',{status:200})),/서버 응답 형식/)
 const abort=Object.assign(new Error('aborted'),{name:'AbortError'})
 await assert.rejects(readJsonResponse({json:async()=>{throw abort}}),e=>e===abort)
})

test('request JSON parsing preserves pre-parsed/stream bodies and rejects wrong types and oversized input',async()=>{
 const headers={'content-type':'application/json; charset=utf-8'}
 assert.deepEqual(await readBody({headers,body:{message:'테스트'}}),{message:'테스트'})
 assert.deepEqual(await readBody({headers,body:'{"n":0}'}),{n:0})
 const stream={headers,async *[Symbol.asyncIterator](){yield '{"message":';yield '"테스트"}'}}
 assert.deepEqual(await readBody(stream),{message:'테스트'})
 await assert.rejects(readBody({headers:{'content-type':'text/plain'},body:'{}'}),/JSON 형식/)
 await assert.rejects(readBody({headers,body:'broken'}),SyntaxError)
 await assert.rejects(readBody({headers,body:'"'+'가'.repeat(50000)+'"'}),/너무 깁니다/)
})

test('rate limiting matches the original decision sequence at expiry and across clients and actions',()=>{
 let time=0;const limit=createRateLimiter({now:()=>time}),original=new Map()
 function old(req,key,max){const id=`${req.socket.remoteAddress}:${key}`,entry=original.get(id);if(!entry||entry.until<time){original.set(id,{n:1,until:time+60000});return true}return ++entry.n<=max}
 for(const clock of [0,1,59999,60000,60001,120000,120001]){
  time=clock
  for(let i=0;i<300;i++){
   const req={socket:{remoteAddress:'client'+i%17}},key=i%3?'all':'auth',max=key==='all'?90:10
   assert.equal(limit(req,key,max),old(req,key,max),`${clock}/${i}`)
  }
 }
})

test('static delivery preserves GET/HEAD, cache headers, missing files and private-path rejection',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'mm-static-'))
 await mkdir(path.join(root,'dist'));await writeFile(path.join(root,'dist/index.html'),'<h1>확인</h1>')
 function response(){return {status:null,headers:null,body:null,writeHead(status,headers){this.status=status;this.headers=headers},end(body){this.body=body}}}
 const res=response();await serveStatic({method:'GET'},res,new URL('http://localhost/'),root)
 assert.equal(res.status,200);assert.equal(String(res.body),'<h1>확인</h1>');assert.equal(res.headers['Cache-Control'],'no-cache')
 const head=response();await serveStatic({method:'HEAD'},head,new URL('http://localhost/'),root)
 assert.equal(head.status,200);assert.equal(head.body,undefined)
 for(const pathname of ['/.env','/%2e%2e%2foutside','/nested/.secret']){
  const forbidden=response();await serveStatic({method:'GET'},forbidden,new URL('http://localhost'+pathname),root);assert.equal(forbidden.status,404)
 }
 const post=response();await serveStatic({method:'POST'},post,new URL('http://localhost/'),root);assert.equal(post.status,405)
 await assert.rejects(serveStatic({method:'GET'},response(),new URL('http://localhost/missing.js'),root),e=>e.code==='ENOENT')
})
