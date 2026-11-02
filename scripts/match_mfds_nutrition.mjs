// .local/mfds/mfds-commercial.json(식약처 상용제품 전체)과 상품 7,902개를 대조해 매칭률을 보고한다.
// 확정은 품목제조보고번호가 정확히 일치하고 자료가 하나로 좁혀질 때만. 이름 후보는 '검토 대기'로만 둔다.
// 사용: node scripts/match_mfds_nutrition.mjs
import {readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {mergeCatalog,normalize} from '../shared/catalog.mjs'
import {compactRecord,BULK_VALID_DAYS} from '../shared/official-nutrition.mjs'
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const load=f=>readFile(path.join(root,f),'utf8').then(JSON.parse)
const [rows,market,db]=await Promise.all([load('public/data/products.json'),load('public/data/market-enrichment.json'),load('.local/mfds/mfds-commercial.json')])
const products=mergeCatalog(rows.products||rows,market)
// 보고번호 표기: '19790532001240, 20080502002328', '…(경주공장) / …', 'F3:197603110013', 하이픈 포함 등
export function reportNumbers(raw){
  return [...new Set(String(raw??'').split(/[,/;\s]+/).map(s=>s.replace(/^[A-Za-z]\d*:/,'').replace(/\(.*?\)/g,'').replace(/-/g,'')).filter(s=>/^\d{10,16}$/.test(s)))]
}
const byReport=new Map()
for(const r of db.records)if(r.reportNumber){const k=r.reportNumber.replace(/-/g,'');(byReport.get(k)||byReport.set(k,[]).get(k)).push(r)}
// 상품명 핵심부: '분류, 제조사, 제품명, 규격' 형식의 세 번째 칸
const coreName=p=>{const parts=String(p.market?.name||p.name).split(',').map(s=>s.trim());return normalize((parts.length>=3?parts[2]:parts[0]).replace(/\d+(?:\.\d+)?\s*(?:kg|g|ml|l)\b/gi,''))}
const sameName=(a,b)=>a.length>=2&&b.length>=2&&(a.includes(b)||b.includes(a))
const result={verified:[],ambiguous:[],reportNotFound:[],noReport:[]},counts={}
for(const p of products){
  const nums=reportNumbers(p.reportNumber)
  if(!nums.length){result.noReport.push(p.id);continue}
  const found=nums.flatMap(n=>byReport.get(n)||[])
  const uniq=[...new Map(found.map(r=>[r.code,r])).values()]
  if(!uniq.length){result.reportNotFound.push(p.id);continue}
  const named=uniq.length===1?uniq:uniq.filter(r=>sameName(normalize(r.name),coreName(p)))
  if(named.length===1)result.verified.push({id:p.id,code:named[0].code,via:uniq.length===1?(nums.length>1?'multi_report':'report'):'report_name'})
  else result.ambiguous.push({id:p.id,candidates:uniq.length})
}
for(const [k,v] of Object.entries(result))counts[k]=v.length
const via={};for(const v of result.verified)via[v.via]=(via[v.via]||0)+1
console.log(`식약처 상용제품 ${db.records.length.toLocaleString()}건 (보고번호 있음 ${byReport.size.toLocaleString()}종) · 조회 ${db.fetchedAt}`)
console.log(`상품 ${products.length}개 중`)
console.log(`  확정(보고번호 일치)  ${counts.verified} (${(counts.verified/products.length*100).toFixed(1)}%)  ← 단일 번호 ${via.report||0} · 복수 번호 ${via.multi_report||0} · 이름으로 좁힘 ${via.report_name||0}`)
console.log(`  보류(같은 번호에 여러 자료) ${counts.ambiguous}`)
console.log(`  보고번호가 식약처 DB에 없음 ${counts.reportNotFound}`)
console.log(`  보고번호 없음/형식 오류 ${counts.noReport}`)
await writeFile(path.join(root,'.local','mfds','match-report.json'),JSON.stringify(result))
// 확정분만 앱 배포용 파일로 낸다. 이름 후보·보류는 넣지 않는다.
const byCode=new Map(db.records.map(r=>[r.code,r]))
const records=Object.fromEntries(result.verified.map(v=>[v.id,compactRecord(byCode.get(v.code))]))
await writeFile(path.join(root,'public','data','official-nutrition.json'),JSON.stringify({source:db.source,url:db.url,fetchedAt:db.fetchedAt,validDays:BULK_VALID_DAYS,count:result.verified.length,records}))
console.log(`public/data/official-nutrition.json 갱신: 확정 ${result.verified.length}개`)
