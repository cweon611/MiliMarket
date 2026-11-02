import {publicProduct,gramPrice} from '../shared/catalog.mjs'
import {NUTRIENTS} from './_public-data.mjs'
import {candidates,lookupBatch} from './_retrieval.mjs'
import {verifiedRecord,evaluateNutrition,nutrientKeys,NUTRIENT_META} from '../shared/nutrition.mjs'
import {validateQuery} from './_query.mjs'
const valueText=n=>n?.value!=null?n.value.toLocaleString('ko-KR')+' '+n.unit:n?.raw?n.raw+' '+n.unit+' (원문)':'미제공'
const fmt=n=>n.toLocaleString('ko-KR',{maximumFractionDigits:3})
export async function answerNutrition(products,input,service){
 const q=validateQuery(input)
 if(!q.productIds.length&&!q.query&&!q.queries.length)return {products:[],nutritionEvidence:[],count:0,text:'어떤 상품의 영양 정보가 필요한가요? 상품명 또는 물품식별번호를 알려 주세요.'}
 let matches=candidates(products,q)
 if(q.intent==='alternative'&&matches[0]){const current=matches[0];matches=products.filter(p=>p.id!==current.id&&p.subcategory===current.subcategory)}
 const comparison=q.intent==='compare'||q.conditions.length>0||nutrientKeys.includes(q.sort)
 if(comparison&&(!q.basis||q.basis.unit==='serving'&&!q.serving))return {products:[],nutritionEvidence:[],count:matches.length,blocked:true,needsBasis:true,text:'비교 기준량을 지정해 주세요. 예: 100g당, 100mL당 또는 1인분 200g. 서로 다른 기준량이나 g·mL를 섞어 비교하지 않습니다.'}
 const lookups=await lookupBatch(matches,service,{max:comparison?40:Math.min(q.limit,8)})
 if(!matches.length&&q.query)lookups.push({productId:null,productName:null,...await service.searchNutrition(q.query.slice(0,80)),match:'reference'})
 const mapped=new Map(lookups.map(e=>[e.productId,e])),enriched=matches.filter(p=>mapped.has(p.id)).map(p=>({...p,verifiedNutrition:verifiedRecord(mapped.get(p.id))}))
 const coverage={matched:matches.length,queried:lookups.filter(x=>x.productId).length,confirmed:enriched.filter(p=>p.verifiedNutrition).length,partial:lookups.filter(x=>x.productId).length<matches.length}
 const base={products:enriched.slice(0,q.limit).map(publicProduct),nutritionEvidence:lookups.slice(0,8),count:matches.length,coverage}
 if(lookups.length&&lookups.every(x=>x.status==='not_configured'))return {...base,text:'식약처 영양 API 인증키가 아직 설정되지 않아 공식 영양 정보를 조회하지 못했습니다. 기존 상품 정보만 표시하며 미제공은 0이 아닙니다.'}
 if(comparison){
  const evaluated=enriched.map(p=>({product:p,...evaluateNutrition(p,q)}))
  let eligible=evaluated.filter(x=>x.ok)
  if(nutrientKeys.includes(q.sort))eligible.sort((a,b)=>(a.values[q.sort]-b.values[q.sort])*(q.direction==='desc'?-1:1)||a.product.id-b.product.id)
  if(['price','gramPrice'].includes(q.sort)){const price=p=>q.sort==='gramPrice'?gramPrice(p):p.market?.unitPrice??null;eligible=eligible.filter(x=>price(x.product)!=null).sort((a,b)=>(price(a.product)-price(b.product))*(q.direction==='desc'?-1:1)||a.product.id-b.product.id)}
  const results=eligible.slice(0,q.limit)
  // Recompute from the exact source record and assert every returned condition and ordering.
  for(const row of results){const check=evaluateNutrition(row.product,q);if(!check.ok||JSON.stringify(check.values)!==JSON.stringify(row.values))throw new Error('영양 계산 재검증에 실패했습니다.')}
  if(nutrientKeys.includes(q.sort)&&results.some((r,i)=>i&&(r.values[q.sort]-results[i-1].values[q.sort])*(q.direction==='desc'?-1:1)<0))throw new Error('정렬 재검증에 실패했습니다.')
  const excluded=evaluated.filter(x=>!x.ok).map(x=>({id:x.product.id,name:x.product.name,reason:x.reason}))
  const scope='검색 '+coverage.matched+'건 중 '+coverage.queried+'건 조회 · 보고번호 일치 '+coverage.confirmed+'건. '+(coverage.partial?'조회한 범위에서만 비교했습니다. 전체 상품 순위가 아닙니다.':'')
  const requestedKeys=[q.nutrient,...q.conditions.map(c=>c.nutrient),...(nutrientKeys.includes(q.sort)?[q.sort]:[])].filter(Boolean)
  const keys=requestedKeys.length?[...new Set(requestedKeys)]:nutrientKeys
  const lines=results.map((r,i)=>(i+1)+'. '+r.product.name+'\n'+keys.map(k=>NUTRIENT_META[k][0]+' '+(r.values[k]==null?'미제공':fmt(r.values[k])+' '+NUTRIENT_META[k][1])).join(' / ')+'\n'+r.formula+' · 원자료 '+r.sourceCode)
  const basis=q.basis.unit==='serving'?'1인분 '+q.serving.amount+q.serving.unit:q.basis.amount+q.basis.unit
  return {...base,products:results.map(r=>publicProduct(r.product)),nutritionEvidence:lookups.filter(e=>results.some(r=>r.product.id===e.productId)).slice(0,20),comparison:results.map(({product,...r})=>({id:product.id,name:product.name,...r})),excluded,verified:true,blocked:false,text:scope+'\n'+basis+' 기준 '+(results.length?results.length+'개 결과입니다.':'조건을 만족하는 확정 상품이 없습니다. 기준·검색어를 조정하거나 영양 데이터를 더 가져와 주세요.')+'\n'+lines.join('\n\n')+(excluded.length?'\n제외 '+excluded.length+'건: '+[...new Set(excluded.map(e=>e.reason))].join(', '):'')+'\n자료 출처: 식약처 식품영양성분DB. 이름만 유사한 참고 자료는 계산하지 않았습니다.'}
 }
 const confirmed=lookups.filter(x=>verifiedRecord(x)).length
 return {...base,text:(confirmed?'보고번호가 일치한 공식 영양 자료 '+confirmed+'건을 확인했습니다.':'확정할 수 있는 상품별 영양 자료가 없어 참고 자료와 조회 상태를 안내합니다.')+'\n'+describe(lookups,q.nutrient)+(coverage.partial?'\n검색 '+coverage.matched+'건 중 '+coverage.queried+'건만 조회했습니다.':'')+'\n자료 출처: 식약처 식품영양성분DB. 1일 영양 충족은 식단 계획에 지정한 기준으로 별도 검증합니다.'}
}
function describe(lookups,nutrient){
 if(!lookups.length)return '조건에 맞는 등록 상품이 없습니다. 검색어나 가격 조건을 바꿔 주세요.'
 return lookups.map(x=>{
  const heading=x.productName||'식품명 검색'
  if(x.status!=='ok')return heading+': '+(x.message||(x.status==='empty'?'공식 영양 자료 없음':'조회할 수 없음'))
  const records=(x.records||[]).slice(0,2).map(r=>{
   const keys=nutrient?[nutrient]:['calories','protein','fat','carbs','sodium']
   return r.name+' · '+r.basis.text+' 기준\n'+keys.filter(k=>NUTRIENTS[k]).map(k=>NUTRIENTS[k][1]+' '+valueText(r.nutrients[k])).join(' / ')+'\n자료 수정 '+(r.updatedAt||'미제공')+' · 조회 '+r.fetchedAt.slice(0,10)
  }).join('\n')
  return heading+' ['+(x.match==='report_number'?'보고번호 일치':x.match==='ambiguous'?'복수 자료 · 확인 필요':'참고 자료 · 상품 일치 미확인')+']\n'+records
 }).join('\n\n')
}

