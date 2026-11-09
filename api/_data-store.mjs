import {readFile,writeFile,mkdir,rename} from 'node:fs/promises'
import path from 'node:path'
import {verifiedRecord} from '../shared/nutrition.mjs'
import {isFresh} from '../shared/official-nutrition.mjs'
// Blob은 캐시일 뿐이다: 저장소가 막히거나 한도를 넘어도 서버는 메모리 값으로 계속 동작한다.
const REFRESH_MS=5*60000,PAUSE_MS=10*60000
export async function createDataStore(directory,{cloud=false,client,now=Date.now}={}){
 const file=path.join(directory,'public-data.json'),key='catalog/public-data.json'
 const sdk=cloud?(client||await import('@vercel/blob')):null
 let entries={},pending={},writing=null,pausedUntil=0,refreshedAt=0
 const paused=()=>!!sdk&&now()<pausedUntil
 const pause=e=>{pausedUntil=now()+PAUSE_MS;console.error('공공데이터 저장소 10분간 중지:',e.message)}
 async function read(){if(sdk){const r=await sdk.get(key,{access:'private',useCache:false});return r?{entries:(await new Response(r.stream).json()).entries||{},etag:r.blob.etag}:{entries:{}}}try{return JSON.parse(await readFile(file,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;return {entries:{}}}}
 const patched=(base,batch)=>{const out={...base};for(const [id,patch] of Object.entries(batch))out[id]={...out[id],...patch};return out}
 // One writer per instance: lookups queue patches and many of them share one conditional Blob write.
 async function write(batch){
  if(!sdk){await mkdir(directory,{recursive:true});await writeFile(file+'.tmp',JSON.stringify({entries}),{mode:0o600});await rename(file+'.tmp',file);return}
  for(let attempt=0;;attempt++){
   const current=await read(),merged=patched(current.entries,batch)
   try{await sdk.put(key,JSON.stringify({entries:merged}),{access:'private',addRandomSuffix:false,allowOverwrite:!!current.etag,...(current.etag?{ifMatch:current.etag}:{}),contentType:'application/json'});entries=patched({...entries,...merged},pending);return}
   catch(e){if(attempt>=5||current.etag&&!(e instanceof sdk.BlobPreconditionFailedError)||!current.etag&&!(await read()).etag)throw e}
   await new Promise(r=>setTimeout(r,(attempt+1)*(60+Math.random()*120)))
  }
 }
 // Never throws: a failed batch stays pending and is retried by the next flush.
 async function flush(){
  while(writing||Object.keys(pending).length){
   if(paused())return
   if(!writing){const batch=pending;pending={};writing=write(batch).catch(e=>{pending=patched(batch,pending);throw e}).finally(()=>{writing=null})}
   try{await writing}catch(e){if(sdk)pause(e);else console.error('공공데이터 저장 실패:',e.message);return}
  }
 }
 try{entries=(await read()).entries;refreshedAt=now()}catch(e){if(!sdk)throw e;pause(e)}
 return {
  entries:()=>entries,
  // 다른 인스턴스가 저장한 결과는 5분에 한 번만 다시 읽는다.
  async refresh(){
   if(!sdk||paused()||now()-refreshedAt<REFRESH_MS)return
   try{entries=patched({...entries,...(await read()).entries},pending);refreshedAt=now()}catch(e){pause(e)}
  },
  flush,
  async put(id,provider,value){
   if(!['ok','empty'].includes(value.status))return
   const patch={[provider]:value};entries=patched(entries,{[id]:patch});pending=patched(pending,{[id]:patch})
   await flush()
  }
 }
}
export function applyOfficialData(products,entries,now=Date.now()){
 const today=new Date(now).toISOString().slice(0,10)
 return products.map(p=>{
  const e=entries[p.id];if(!e)return p
  // 실시간 조회는 24시간, 일괄 매칭 자료는 validDays 동안 유효
  const fresh=value=>value?.fetchedAt&&isFresh(value,now)
  const record=fresh(e.nutrition)?verifiedRecord(e.nutrition):null
  const offers=fresh(e.procurement)?(e.procurement.offers||[]).filter(o=>(!o.contractStart||o.contractStart<=today)&&(!o.contractEnd||o.contractEnd>=today)):[]
  const makers=[...new Set(offers.map(o=>o.manufacturer).filter(Boolean))]
  // Update price only for one unambiguous offer in the known sale unit.
  const offer=!e.procurement?.partial&&offers.length===1&&offers[0].unit===p.market?.unit&&offers[0].unitPrice>0?offers[0]:null
  return {...p,verifiedNutrition:record,officialNutritionState:record?'verified':e.nutrition?.match||e.nutrition?.status||'unqueried',manufacturer:makers.length===1?makers[0]:p.manufacturer,...(offer?{market:{...p.market,unitPrice:offer.unitPrice,supplier:offer.supplier,origin:offer.origin,collectedAt:offer.fetchedAt,contractEnd:offer.contractEnd,sourceName:'나라장터 공식 API',offerCount:1}}:{})}
 })
}
