import {createWriteBuffer,mergePatches as patched,sameValue} from './_write-buffer.mjs'
// Postgres 저장소(Neon 등): 계정·세션·식단 기록·공공데이터 캐시. DATABASE_URL이 있으면 Vercel Blob 대신 사용한다.
// 접속 URL 예: postgresql://user:pass@host/db?sslmode=require
import {createHash,randomBytes} from 'node:crypto'

const hash=value=>createHash('sha256').update(value).digest('hex')
const conflict=()=>Object.assign(new Error('이미 등록된 이메일입니다.'),{statusCode:409})
const isDuplicate=e=>e?.code==='23505'
const asJson=v=>typeof v==='string'?JSON.parse(v):v

export async function createPostgresPool(url,{driver}={}){
 const pg=driver||(await import('pg')).default
 const ssl=/sslmode=disable/.test(url)||process.env.PG_SSL?.trim()==='off'?false:{rejectUnauthorized:true}
 // pg 8.x는 sslmode=require를 verify-full로 취급하며 경고를 낸다. 의미는 같으므로 명시해 경고를 없앤다.
 return new pg.Pool({connectionString:url.replace(/sslmode=(require|prefer|verify-ca)/,'sslmode=verify-full'),ssl,max:3,idleTimeoutMillis:30000,connectionTimeoutMillis:8000})
}

export async function ensureSchema(pool){
 for(const sql of [
  `CREATE TABLE IF NOT EXISTS users (email VARCHAR(190) PRIMARY KEY, id CHAR(36) NOT NULL, data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS sessions (token_hash CHAR(64) PRIMARY KEY, email VARCHAR(190) NOT NULL, expires BIGINT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS history (id CHAR(36) PRIMARY KEY, email VARCHAR(190) NOT NULL, created_at VARCHAR(32) NOT NULL, plan JSONB NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS history_email ON history (email, created_at)`,
  `CREATE TABLE IF NOT EXISTS public_data (product_id VARCHAR(16) NOT NULL, provider VARCHAR(32) NOT NULL, value JSONB NOT NULL, PRIMARY KEY (product_id, provider))`,
 ])await pool.query(sql)
}

// api-server.mjs가 기대하는 계정 저장소 인터페이스(createLocalStore/createBlobStore와 동일).
export function createPostgresAccountStore(pool){
 async function history(email){
  const {rows}=await pool.query('SELECT id, created_at, plan FROM history WHERE email=$1 ORDER BY created_at DESC LIMIT 20',[email])
  return rows.map(r=>({id:r.id,createdAt:r.created_at,plan:asJson(r.plan)}))
 }
 const store={
  async findUser(email,{includeHistory=true}={}){
   const {rows}=await pool.query('SELECT data FROM users WHERE email=$1',[email])
   if(!rows.length)return null
   return {...asJson(rows[0].data),history:includeHistory?await history(email):[]}
  },
  async createUser(user){
   const {history:_ignored,...data}=user
   try{await pool.query('INSERT INTO users (email, id, data) VALUES ($1, $2, $3)',[user.email,user.id,JSON.stringify(data)])}
   catch(e){if(isDuplicate(e))throw conflict();throw e}
   return user
  },
  async createSession(user){
   const token=randomBytes(32).toString('hex')
   await pool.query('INSERT INTO sessions (token_hash, email, expires) VALUES ($1, $2, $3)',[hash(token),user.email,Date.now()+86400000])
   return token
  },
  async getSession(token,options){
   if(!/^[a-f0-9]{64}$/.test(token||''))return null
   const {rows}=await pool.query('SELECT email, expires FROM sessions WHERE token_hash=$1',[hash(token)])
   if(!rows.length)return null
   if(Number(rows[0].expires)<Date.now()){await store.deleteSession(token);return null}
   return store.findUser(rows[0].email,options)
  },
  async deleteSession(token){if(/^[a-f0-9]{64}$/.test(token||''))await pool.query('DELETE FROM sessions WHERE token_hash=$1',[hash(token)])},
  async saveHistory(user,entry){
   const {rows}=await pool.query('SELECT 1 FROM users WHERE email=$1',[user.email]);if(!rows.length)throw new Error('계정을 찾을 수 없습니다.')
   await pool.query('INSERT INTO history (id, email, created_at, plan) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET created_at=EXCLUDED.created_at, plan=EXCLUDED.plan',[entry.id,user.email,entry.createdAt,JSON.stringify(entry.plan)])
   const old=await pool.query('SELECT id FROM history WHERE email=$1 ORDER BY created_at DESC OFFSET 20 LIMIT 100',[user.email])
   if(old.rows.length)await pool.query('DELETE FROM history WHERE id = ANY($1)',[old.rows.map(r=>r.id)])
  },
 }
 return store
}

// 공공데이터(식약처·나라장터) 조회 결과 캐시. _data-store.mjs의 createDataStore와 같은 인터페이스.
// 실패해도 서버를 멈추지 않는다: 결과는 메모리에 남고 10분 뒤 다시 시도한다.
const REFRESH_MS=5*60000,PAUSE_MS=10*60000
export async function createPostgresDataStore(pool,{now=Date.now,deferWrites=false}={}){
 let entries={},refreshedAt=0,pausedUntil=0,refreshing=null
 const paused=()=>now()<pausedUntil
 const pause=e=>{pausedUntil=now()+PAUSE_MS;console.error('공공데이터 저장소 10분간 중지:',e.message)}
 async function read(){
  const {rows}=await pool.query('SELECT product_id, provider, value FROM public_data')
  const out={};for(const r of rows)out[r.product_id]={...out[r.product_id],[r.provider]:asJson(r.value)}
  return out
 }
 async function write(batch){
  const rows=Object.entries(batch).flatMap(([id,patch])=>Object.entries(patch).map(([provider,value])=>[id,provider,JSON.stringify(value)]))
  if(!rows.length)return
  // 한 문장으로 일괄 upsert: unnest로 세 배열을 행으로 펼친다.
  await pool.query('INSERT INTO public_data (product_id, provider, value) SELECT * FROM unnest($1::text[], $2::text[], $3::jsonb[]) ON CONFLICT (product_id, provider) DO UPDATE SET value=EXCLUDED.value',[rows.map(r=>r[0]),rows.map(r=>r[1]),rows.map(r=>r[2])])
 }
 const buffer=createWriteBuffer({write,paused,onError:pause})
 try{entries=await read();refreshedAt=now()}catch(e){pause(e)}
 return {
  entries:()=>entries,
  async refresh(){
   if(paused()||now()-refreshedAt<REFRESH_MS)return
   if(refreshing)return refreshing
   refreshing=(async()=>{
    try{entries=patched({...entries,...await read()},buffer.pending());refreshedAt=now()}catch(e){pause(e)}
   })().finally(()=>{refreshing=null})
   return refreshing
  },
  flush:buffer.flush,
  async put(id,provider,value){
   if(!['ok','empty'].includes(value.status))return
   if(!sameValue(entries[id]?.[provider],value)){
    const patch={[provider]:value};entries=patched(entries,{[id]:patch});buffer.queue({[id]:patch})
   }
   if(!deferWrites)await buffer.flush()
  }
 }
}
