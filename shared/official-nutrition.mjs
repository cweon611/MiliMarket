import {NUTRIENT_META,nutrientKeys,verifiedRecord} from './nutrition.mjs'
// 식약처 상용제품 일괄 매칭 결과(public/data/official-nutrition.json)를 앱의 공식 영양 자료 형식으로 펼친다.
// 파일에는 품목제조보고번호가 정확히 일치한 상품만 들어 있다(scripts/match_mfds_nutrition.mjs).
export const BULK_VALID_DAYS=35
const SOURCE={name:'식약처 식품영양성분DB',url:'https://www.data.go.kr/data/15127578/openapi.do'}
export function compactRecord(r){return {c:r.code,n:r.name,m:r.maker,r:r.reportNumber,b:r.basis,u:r.updatedAt,v:nutrientKeys.map(k=>r.nutrients[k]??null)}}
export function officialEntries(file){
  if(!file?.records)return {}
  const fetchedAt=file.fetchedAt,validDays=file.validDays??BULK_VALID_DAYS
  return Object.fromEntries(Object.entries(file.records).map(([id,x])=>{
    const record={code:x.c,name:x.n,manufacturer:x.m,reportNumber:x.r,basis:x.b,updatedAt:x.u,fetchedAt,source:SOURCE,reference:'',classification:'상용제품',
      nutrients:Object.fromEntries(nutrientKeys.map((k,i)=>[k,{label:NUTRIENT_META[k][0],unit:NUTRIENT_META[k][1],value:x.v[i],raw:x.v[i]==null?'':String(x.v[i])}]))}
    return [id,{nutrition:{status:'ok',match:'report_number',partial:false,records:[record],fetchedAt,validDays,source:SOURCE,bulk:true}}]
  }))
}
export function isFresh(value,now=Date.now()){
  const age=now-Date.parse(value?.fetchedAt)
  return age>=0&&age<(value?.validDays??1)*86400000
}
// 실시간 조회 결과가 확정·유효하면 그것을, 아니면 일괄 매칭 자료를 쓴다.
export function mergeOfficialEntries(bulk,live,now=Date.now()){
  const out={...bulk}
  for(const [id,e] of Object.entries(live||{})){
    const liveOk=e.nutrition&&verifiedRecord(e.nutrition)&&isFresh(e.nutrition,now)
    out[id]={...bulk[id],...e,nutrition:liveOk||!bulk[id]?.nutrition?e.nutrition:bulk[id].nutrition}
  }
  return out
}
