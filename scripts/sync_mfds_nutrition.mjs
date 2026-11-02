// 식약처 식품영양성분DB(상용제품) 전체를 페이지 단위로 받아 매칭용 색인으로 저장한다.
// 상품별 조회(약 8천 회) 대신 500건씩 약 650회 호출. 중단되면 이어받는다.
// 사용: node scripts/sync_mfds_nutrition.mjs   (DATA_GO_KR_SERVICE_KEY 또는 MFDS_SERVICE_KEY 필요)
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {normalizeNutrition} from '../api/_public-data.mjs'
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),dir=path.join(root,'.local','mfds'),pagesDir=path.join(dir,'pages')
try{for(const line of (await readFile(path.join(root,'.env'),'utf8')).split(/\r?\n/)){const m=line.match(/^([A-Z_]+)=(.*)$/);if(m&&process.env[m[1]]===undefined)process.env[m[1]]=m[2].trim()}}catch{}
const raw=(process.env.MFDS_SERVICE_KEY||process.env.DATA_GO_KR_SERVICE_KEY||'').trim()
if(!raw)throw new Error('MFDS_SERVICE_KEY 또는 DATA_GO_KR_SERVICE_KEY가 필요합니다.')
const key=(()=>{try{return decodeURIComponent(raw)}catch{return raw}})()
const ROWS=500,CONCURRENCY=3,BASE='https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo03/getFoodNtrCpntDbInq03'
async function page(no,attempt=0){
  const url=new URL(BASE);url.search=new URLSearchParams({serviceKey:key,type:'json',pageNo:String(no),numOfRows:String(ROWS),DB_CLASS_NM:'상용제품'}).toString()
  try{
    const r=await fetch(url,{signal:AbortSignal.timeout(60000)});const text=await r.text()
    if(!r.ok||text.trim().startsWith('<'))throw new Error(`HTTP ${r.status} ${text.slice(0,120)}`)
    const body=JSON.parse(text).body;if(!body||body.totalCount==null)throw new Error('응답 형식 오류')
    return body
  }catch(e){if(attempt>=4)throw e;await new Promise(r=>setTimeout(r,2000*(attempt+1)));return page(no,attempt+1)}
}
await mkdir(pagesDir,{recursive:true})
const first=await page(1),total=Number(first.totalCount),pages=Math.ceil(total/ROWS),fetchedAt=new Date().toISOString()
const compact=items=>(items||[]).map(row=>normalizeNutrition(row,fetchedAt)).filter(r=>r.code&&r.name).map(r=>({code:r.code,name:r.name,maker:r.manufacturer,reportNumber:r.reportNumber,basis:r.basis,nutrients:Object.fromEntries(Object.entries(r.nutrients).map(([k,v])=>[k,v.value])),updatedAt:r.updatedAt}))
await writeFile(path.join(pagesDir,'1.json'),JSON.stringify(compact(first.items)))
console.log(`총 ${total.toLocaleString()}건 · ${pages}페이지`)
let next=2,done=1,calls=1
const exists=async n=>{try{await readFile(path.join(pagesDir,`${n}.json`));return true}catch{return false}}
await Promise.all(Array.from({length:CONCURRENCY},async()=>{while(next<=pages){const n=next++;if(await exists(n)){done++;continue}const b=await page(n);calls++;await writeFile(path.join(pagesDir,`${n}.json`),JSON.stringify(compact(b.items)));if(++done%25===0)console.log(`${done}/${pages}`)}}))
const records=[];for(let n=1;n<=pages;n++)records.push(...JSON.parse(await readFile(path.join(pagesDir,`${n}.json`),'utf8')))
await writeFile(path.join(dir,'mfds-commercial.json'),JSON.stringify({source:'식약처 식품영양성분DB(상용제품)',url:'https://www.data.go.kr/data/15127578/openapi.do',fetchedAt,total,records}))
await rm(pagesDir,{recursive:true,force:true})
console.log(`완료: ${records.length.toLocaleString()}건 저장, 이번 실행 API 호출 ${calls}회 → .local/mfds/mfds-commercial.json`)
