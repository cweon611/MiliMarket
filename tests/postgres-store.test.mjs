import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createPostgresAccountStore,createPostgresDataStore,ensureSchema,createPostgresPool} from '../api/_postgres.mjs'

// 이 저장소가 쓰는 SQL 문장만 흉내 내는 가짜 풀. 문장이 바뀌면 여기도 같이 바뀌어야 한다.
function fakePool(){
 const users=new Map(),sessions=new Map(),history=[],publicData=new Map();let fail=false,queries=0
 const dup=()=>Object.assign(new Error('duplicate key value violates unique constraint'),{code:'23505'})
 const byDate=(a,b)=>b.created_at.localeCompare(a.created_at)
 return {users,sessions,history,publicData,get queries(){return queries},failNext(){fail=true},
  async query(sql,params=[]){
   queries++
   if(fail){fail=false;throw new Error('ECONNREFUSED')}
   sql=sql.replace(/\s+/g,' ').trim()
   if(sql.startsWith('CREATE TABLE')||sql.startsWith('CREATE INDEX'))return {rows:[]}
   if(sql.startsWith('SELECT data FROM users')){const u=users.get(params[0]);return {rows:u?[{data:JSON.parse(u.data)}]:[]}}
   if(sql.startsWith('SELECT 1 FROM users'))return {rows:users.has(params[0])?[{'?column?':1}]:[]}
   if(sql.startsWith('INSERT INTO users')){if(users.has(params[0]))throw dup();users.set(params[0],{id:params[1],data:params[2]});return {rows:[]}}
   if(sql.startsWith('INSERT INTO sessions')){sessions.set(params[0],{email:params[1],expires:params[2]});return {rows:[]}}
   if(sql.startsWith('SELECT email, expires FROM sessions')){const s=sessions.get(params[0]);return {rows:s?[s]:[]}}
   if(sql.startsWith('DELETE FROM sessions')){sessions.delete(params[0]);return {rows:[]}}
   if(sql.startsWith('INSERT INTO history')){const i=history.findIndex(h=>h.id===params[0]);const row={id:params[0],email:params[1],created_at:params[2],plan:JSON.parse(params[3])};if(i>=0)history[i]=row;else history.push(row);return {rows:[]}}
   if(sql.startsWith('SELECT id, created_at, plan FROM history'))return {rows:history.filter(h=>h.email===params[0]).sort(byDate).slice(0,20)}
   if(sql.startsWith('SELECT id FROM history'))return {rows:history.filter(h=>h.email===params[0]).sort(byDate).slice(20,120).map(h=>({id:h.id}))}
   if(sql.startsWith('DELETE FROM history')){const ids=new Set(params[0]);for(let i=history.length-1;i>=0;i--)if(ids.has(history[i].id))history.splice(i,1);return {rows:[]}}
   if(sql.startsWith('SELECT product_id, provider, value FROM public_data'))return {rows:[...publicData.values()]}
   if(sql.startsWith('INSERT INTO public_data')){const [ids,providers,values]=params;assert.equal(ids.length,providers.length);ids.forEach((id,i)=>publicData.set(id+'/'+providers[i],{product_id:id,provider:providers[i],value:JSON.parse(values[i])}));return {rows:[]}}
   throw new Error('unexpected SQL: '+sql)
  }
 }
}

test('Postgres account store: users, hashed session tokens, history capped at 20, duplicate email → 409',async()=>{
 const pool=fakePool();await ensureSchema(pool)
 const a=createPostgresAccountStore(pool),b=createPostgresAccountStore(pool)
 const user={id:'u1',email:'one@example.test',name:'One',salt:'s',hash:'h',history:[]}
 await a.createUser(user);await assert.rejects(b.createUser(user),e=>e.statusCode===409)
 const token=await a.createSession(user)
 assert.ok(![...pool.sessions.keys()].includes(token),'raw token is never stored')
 assert.equal((await b.getSession(token)).id,'u1');assert.equal(await b.getSession('nope'),null)
 for(let i=0;i<25;i++)await b.saveHistory(user,{id:'p'+i,createdAt:new Date(2026,0,1+i).toISOString(),plan:{settings:{days:i}}})
 const loaded=await a.getSession(token)
 assert.equal(loaded.history.length,20);assert.equal(loaded.history[0].id,'p24');assert.equal(loaded.history[0].plan.settings.days,24)
 assert.equal(pool.history.length,20,'old rows are trimmed in the table too')
 await assert.rejects(a.saveHistory({email:'ghost@example.test'},{id:'x',createdAt:'t',plan:{}}),/계정을 찾을 수 없습니다/)
 await b.deleteSession(token);assert.equal(await a.getSession(token),null)
 const expired=await a.createSession(user);pool.sessions.get([...pool.sessions.keys()][0]).expires=Date.now()-1
 assert.equal(await a.getSession(expired),null);assert.equal(pool.sessions.size,0)
})

test('Postgres data store: one batched upsert, shared reads, failures pause for 10 minutes without throwing',async()=>{
 let t=0;const pool=fakePool(),ok={status:'ok',fetchedAt:'2026-11-09T00:00:00.000Z'}
 const store=await createPostgresDataStore(pool,{now:()=>t})
 const before=pool.queries
 await Promise.all(Array.from({length:40},(_,i)=>store.put(10000000+i,'nutrition',ok)))
 assert.ok(pool.queries-before<=3,`expected batched writes, got ${pool.queries-before}`)
 assert.equal(pool.publicData.size,40)
 await store.put(1,'nutrition',{status:'error'});assert.equal(pool.publicData.has('1/nutrition'),false,'errors are not cached')
 const other=await createPostgresDataStore(pool,{now:()=>t});assert.equal(Object.keys(other.entries()).length,40)
 pool.failNext();const q=pool.queries;await store.put(2,'nutrition',ok)
 assert.equal(store.entries()[2].nutrition.status,'ok','kept in memory');await store.put(3,'nutrition',ok);await store.refresh()
 assert.equal(pool.queries,q+1,'paused after the first failure')
 t+=11*60000;await store.flush();assert.ok(pool.publicData.has('2/nutrition')&&pool.publicData.has('3/nutrition'),'pending rows are written after the pause')
})

test('Postgres pool: TLS on by default, small pool for serverless',async()=>{
 let opts;const driver={Pool:class{constructor(o){opts=o}}}
 await createPostgresPool('postgresql://u:p@db.example.test/mili?sslmode=require',{driver})
 assert.equal(opts.connectionString,'postgresql://u:p@db.example.test/mili?sslmode=verify-full','require is upgraded to verify-full to silence the pg warning');assert.equal(opts.ssl.rejectUnauthorized,true);assert.ok(opts.max<=5)
 await createPostgresPool('postgresql://u:p@localhost/mili?sslmode=disable',{driver});assert.equal(opts.ssl,false)
})
