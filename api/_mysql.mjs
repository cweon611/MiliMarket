// MySQL 저장소: 계정·세션·식단 기록·공공데이터 캐시. MYSQL_URL이 있으면 Vercel Blob 대신 사용한다.
// 접속 URL 예: mysql://user:pass@host:4000/milimarket  (TLS 기본 사용, MYSQL_SSL=off로 끌 수 있다)
import {createHash,randomBytes} from 'node:crypto'

const hash=value=>createHash('sha256').update(value).digest('hex')
const conflict=()=>Object.assign(new Error('이미 등록된 이메일입니다.'),{statusCode:409})
const isDuplicate=e=>e?.code==='ER_DUP_ENTRY'||e?.errno===1062
const asJson=v=>typeof v==='string'?JSON.parse(v):v

export async function createMysqlPool(url,{driver}={}){
 const mysql=driver||await import('mysql2/promise')
 const u=new URL(url)
 const ssl=process.env.MYSQL_SSL?.trim()==='off'?undefined:{minVersion:'TLSv1.2',rejectUnauthorized:true}
 return mysql.createPool({host:u.hostname,port:Number(u.port)||3306,user:decodeURIComponent(u.username),password:decodeURIComponent(u.password),database:u.pathname.replace(/^\//,''),ssl,waitForConnections:true,connectionLimit:3,maxIdle:3,idleTimeout:60000,enableKeepAlive:true,charset:'utf8mb4',supportBigNumbers:true})
}

export async function ensureSchema(pool){
 for(const sql of [
  `CREATE TABLE IF NOT EXISTS users (email VARCHAR(190) NOT NULL PRIMARY KEY, id CHAR(36) NOT NULL, data JSON NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS sessions (token_hash CHAR(64) NOT NULL PRIMARY KEY, email VARCHAR(190) NOT NULL, expires BIGINT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS history (id CHAR(36) NOT NULL PRIMARY KEY, email VARCHAR(190) NOT NULL, created_at VARCHAR(32) NOT NULL, plan JSON NOT NULL, INDEX history_email (email, created_at))`,
  `CREATE TABLE IF NOT EXISTS public_data (product_id VARCHAR(16) NOT NULL, provider VARCHAR(32) NOT NULL, value JSON NOT NULL, PRIMARY KEY (product_id, provider))`,
 ])await pool.query(sql)
}

// api-server.mjs가 기대하는 계정 저장소 인터페이스(createLocalStore/createBlobStore와 동일).
export function createMysqlAccountStore(pool){
 async function history(email){
  const [rows]=await pool.query('SELECT id, created_at, plan FROM history WHERE email=? ORDER BY created_at DESC LIMIT 20',[email])
  return rows.map(r=>({id:r.id,createdAt:r.created_at,plan:asJson(r.plan)}))
 }
 const store={
  async findUser(email){
   const [rows]=await pool.query('SELECT data FROM users WHERE email=?',[email])
   if(!rows.length)return null
   return {...asJson(rows[0].data),history:await history(email)}
  },
  async createUser(user){
   const {history:_ignored,...data}=user
   try{await pool.query('INSERT INTO users (email, id, data) VALUES (?, ?, ?)',[user.email,user.id,JSON.stringify(data)])}
   catch(e){if(isDuplicate(e))throw conflict();throw e}
   return user
  },
  async createSession(user){
   const token=randomBytes(32).toString('hex')
   await pool.query('INSERT INTO sessions (token_hash, email, expires) VALUES (?, ?, ?)',[hash(token),user.email,Date.now()+86400000])
   return token
  },
  async getSession(token){
   if(!/^[a-f0-9]{64}$/.test(token||''))return null
   const [rows]=await pool.query('SELECT email, expires FROM sessions WHERE token_hash=?',[hash(token)])
   if(!rows.length)return null
   if(Number(rows[0].expires)<Date.now()){await store.deleteSession(token);return null}
   return store.findUser(rows[0].email)
  },
  async deleteSession(token){if(/^[a-f0-9]{64}$/.test(token||''))await pool.query('DELETE FROM sessions WHERE token_hash=?',[hash(token)])},
  async saveHistory(user,entry){
   const [rows]=await pool.query('SELECT 1 FROM users WHERE email=?',[user.email]);if(!rows.length)throw new Error('계정을 찾을 수 없습니다.')
   await pool.query('INSERT INTO history (id, email, created_at, plan) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE created_at=VALUES(created_at), plan=VALUES(plan)',[entry.id,user.email,entry.createdAt,JSON.stringify(entry.plan)])
   const [old]=await pool.query('SELECT id FROM history WHERE email=? ORDER BY created_at DESC LIMIT 100 OFFSET 20',[user.email])
   if(old.length)await pool.query('DELETE FROM history WHERE id IN (?)',[old.map(r=>r.id)])
  },
 }
 return store
}

// 공공데이터(식약처·나라장터) 조회 결과 캐시. _data-store.mjs의 createDataStore와 같은 인터페이스.
// 실패해도 서버를 멈추지 않는다: 결과는 메모리에 남고 10분 뒤 다시 시도한다.
const REFRESH_MS=5*60000,PAUSE_MS=10*60000
export async function createMysqlDataStore(pool,{now=Date.now}={}){
 let entries={},pending={},writing=null,refreshedAt=0,pausedUntil=0
 const patched=(base,batch)=>{const out={...base};for(const [id,patch] of Object.entries(batch))out[id]={...out[id],...patch};return out}
 const paused=()=>now()<pausedUntil
 const pause=e=>{pausedUntil=now()+PAUSE_MS;console.error('공공데이터 저장소 10분간 중지:',e.message)}
 async function read(){
  const [rows]=await pool.query('SELECT product_id, provider, value FROM public_data')
  const out={};for(const r of rows)out[r.product_id]={...out[r.product_id],[r.provider]:asJson(r.value)}
  return out
 }
 async function write(batch){
  const values=Object.entries(batch).flatMap(([id,patch])=>Object.entries(patch).map(([provider,value])=>[id,provider,JSON.stringify(value)]))
  if(!values.length)return
  await pool.query('INSERT INTO public_data (product_id, provider, value) VALUES ? ON DUPLICATE KEY UPDATE value=VALUES(value)',[values])
 }
 async function flush(){
  if(paused())return
  while(writing||Object.keys(pending).length){
   if(!writing){const batch=pending;pending={};writing=write(batch).catch(e=>{pending=patched(batch,pending);throw e}).finally(()=>{writing=null})}
   try{await writing}catch(e){pause(e);return}
  }
 }
 try{entries=await read();refreshedAt=now()}catch(e){pause(e)}
 return {
  entries:()=>entries,
  async refresh(){
   if(paused()||now()-refreshedAt<REFRESH_MS)return
   try{entries=patched({...entries,...await read()},pending);refreshedAt=now()}catch(e){pause(e)}
  },
  flush,
  async put(id,provider,value){
   if(!['ok','empty'].includes(value.status))return
   const patch={[provider]:value};entries=patched(entries,{[id]:patch});pending=patched(pending,{[id]:patch})
   await flush()
  }
 }
}
