import {productIndex} from '../shared/product-index.mjs'
import {excludes} from './_planner.mjs'
import {answerCatalog} from './_catalog-service.mjs'
import {answerNutrition} from './_nutrition-answer.mjs'
import {candidates} from './_retrieval.mjs'
import {publicProduct} from '../shared/catalog.mjs'
import {nutrientKeys,NUTRIENT_META} from '../shared/nutrition.mjs'
import {validateQuery} from './_query.mjs'
import {hasUserEvidence} from './_chat-state.mjs'

// These are wording in a product name, not a sensory evaluation or safety claim.
export const TASTES={spicy:{label:'매운맛',pattern:/매운|매콤|얼큰|불닭/},mild:{label:'순한맛',pattern:/순한|안매운|맵지않은/},unsweetened:{label:'무가당',pattern:/무가당/},grilled:{label:'구이',pattern:/구이|그릴|구운/}}
const fmt=n=>n.toLocaleString('ko-KR',{maximumFractionDigits:3})
const norm=s=>String(s).normalize('NFKC').replace(/\s+/g,'')
function supportsPriority(q){
 const quote=norm(q.recommendationBasis)
 if(q.sort==='price'||q.sort==='gramPrice')return /저렴|싼|저가|낮은|낮게|비싼|높은|높게|가격(?:우선|중심|이중요|이요|으로)|가성비/.test(quote)
 if(nutrientKeys.includes(q.sort))return /고단백|저염|저당|저지방|저칼로리|높|낮|많|적|우선/.test(quote)
 return q.tastePreferences.length>0
}
// Resolve common answers to our own question without losing the user's earlier constraints.
export function continueRecommendation(message,context){
 if(!context||!['recommend','alternative'].includes(context.intent))return null
 const value=norm(message).replace(/[.!?。]/g,'')
 let choice
 if(/^(?:가장)?(?:저렴한걸로|저렴한거|싼걸로|가격이요|가격으로|가격우선)(?:요|부탁해)?$/.test(value))choice={sort:'price',direction:'asc'}
 else if(/^(?:g|kg)당(?:가격|단가)(?:이)?(?:낮은순|저렴한걸로)(?:으로|요)?$/.test(value))choice={sort:'gramPrice',direction:'asc'}
 else if(/^(?:단백질)(?:이)?(?:높은걸로|많은걸로|높은순)(?:요)?$/.test(value))choice={sort:'protein',direction:'desc',nutrient:'protein'}
 else if(/^(?:매운걸로|매콤한걸로|매운맛)(?:요)?$/.test(value))choice={sort:'default',tastePreferences:['spicy']}
 else if(/^(?:순한걸로|안매운걸로|순한맛)(?:요)?$/.test(value))choice={sort:'default',tastePreferences:['mild']}
 if(!choice)return null
 return validateQuery({...context,...choice,recommendationBasis:message})
}
function ask(q,text,count=0){
 const topic=q.query||q.queries.join(' / ')||q.productIds.join(', ')
 const filters=[q.minPrice!=null?`${q.minPrice}원 ${q.minPriceExclusive?'초과':'이상'}`:'',q.maxPrice!=null?`${q.maxPrice}원 ${q.priceExclusive?'미만':'이하'}`:'',q.exclusions.length?`${q.exclusions.join(', ')} 제외`:''].filter(Boolean).join(' · ')
 return {answerKind:'recommendation',needsPreference:true,products:[],recommendations:[],count,recommendationContext:q,text:`${filters?`말씀하신 조건(${filters})은 유지할게요.\n`:''}${text}`,followUps:topic?[`${topic} ${filters} 판매 단위 가격이 낮은 순으로 추천해줘`,`${topic} ${filters} g당 가격이 낮은 순으로 추천해줘`]:[]}
}
export async function recommend(products,input,service,{userMessages,semanticInterpretation=false,excludedProductIds=[]}={}){
 const q=validateQuery(input),limit=q.limit===1?1:2
 const excluded=new Set(excludedProductIds)
 products=products.filter(p=>!excluded.has(p.id))
 if(!q.query&&!q.queries.length&&!q.productIds.length)return ask(q,'어떤 식재료를 찾으세요? 좋아하는 맛이나 중요하게 보는 조건도 알려주시면 1~2개만 골라드릴게요.')
 if(!candidates(products,q).length)return {...ask(q,excluded.size?'앞서 보여드린 상품을 제외하면 같은 조건에 맞는 새 후보가 없어요. 가격 조건이나 품목을 바꿔볼까요?':'입력하신 상품·가격 조건에 맞는 등록 상품이 없어요. 상품명이나 가격 조건을 바꿔볼까요?'),followUps:[]}
 // At the HTTP boundary, priorities must cite the user's words, not an invented profile.
 const cited=hasUserEvidence(q.recommendationBasis,userMessages)
 // Claude identifies meaning; the server checks its quote against actual user messages.
 // Keyword recognition is reserved for the no-key demo, never a second natural-language gate.
 const priorityConfirmed=semanticInterpretation?q.priorityConfirmed===true:supportsPriority(q)
 if(userMessages&&(!cited||!priorityConfirmed)){q.sort='default';q.tastePreferences=[]}
 if(userMessages&&!semanticInterpretation)q.tastePreferences=q.tastePreferences.filter(k=>TASTES[k].pattern.test(norm(q.recommendationBasis)))
 if(q.sort==='default'&&!q.tastePreferences.length)return ask(q,'어떤 기준을 가장 중요하게 볼까요? 가격, 영양 조건, 좋아하는 맛 중 하나를 알려주시면 비교해서 1~2개만 추천할게요. 맛·인기도를 판단할 리뷰 데이터는 아직 없어요.',candidates(products,q).length)
 let pool=products.filter(p=>!excludes(p,q.exclusions)),reference=null,selection={...q,limit}
 if(q.intent==='alternative'){
   const matches=candidates(products,q)
   if(matches.length!==1)return {...ask(q,'대체할 기준 상품을 하나 정해 주세요. 상품명 전체나 물품식별번호로 알려주시면 같은 품목에서 비교할게요.',matches.length),followUps:[]}
   reference=matches[0];pool=pool.filter(p=>p.id!==reference.id&&p.subcategory===reference.subcategory)
   selection={...selection,intent:'recommend',query:'',queries:[],productId:null,productIds:[]}
 }
 const preferences=q.tastePreferences.map(k=>TASTES[k])
 pool=pool.filter(p=>preferences.every(t=>t.pattern.test(norm(p.name+' '+(p.market?.name||'')))))
 const nutrition=q.conditions.length||nutrientKeys.includes(q.sort)||q.nutrient
 let answer
 if(nutrition)answer=await answerNutrition(pool,selection,service)
 else if(q.sort==='default'){
   const eligible=candidates(pool,selection)
   // Prefer explainable choices when the user gave a taste but no price/nutrient order.
   eligible.sort((a,b)=>Number(Number.isFinite(b.market?.unitPrice))-Number(Number.isFinite(a.market?.unitPrice))||a.id-b.id)
   answer={products:eligible.slice(0,limit).map(publicProduct),count:eligible.length}
 }else answer=answerCatalog(pool,selection)
 if(answer.blocked||answer.needsBasis||(nutrition&&!answer.verified))return {...answer,products:[],answerKind:'recommendation',recommendations:[],recommendationContext:q}
 const selected=answer.products.slice(0,limit)
 const priority=q.sort==='price'?'판매 단위 가격':q.sort==='gramPrice'?'중량 대비 단가':nutrientKeys.includes(q.sort)?NUTRIENT_META[q.sort][0]:preferences.map(t=>t.label).join('·')+' 표기'
 const recommendations=selected.map((p,i)=>{
   const row=answer.comparison?.find(r=>r.id===p.id),original=productIndex(products).get(p.id)
   const reasons=[
     ...(q.sort==='price'?[`요청하신 ${q.direction==='desc'?'높은':'낮은'} 가격 기준 ${i+1}순위 · ${fmt(p.unitPrice)}원/${p.unit||'판매 단위'}`]:[]),
     ...(q.sort==='gramPrice'?[`요청하신 ${q.direction==='desc'?'높은':'낮은'} 환산 단가 기준 ${i+1}순위 · ${fmt(p.gramPrice)}원/g`]:[]),
     ...(row&&nutrientKeys.includes(q.sort)?[`${row.basis.amount}${row.basis.unit}당 ${NUTRIENT_META[q.sort][0]} ${fmt(row.values[q.sort])}${NUTRIENT_META[q.sort][1]} · 조회·검증된 후보 중 ${i+1}순위`]:[]),
     ...preferences.map(t=>`상품명에서 '${norm(original.name+' '+(original.market?.name||'')).match(t.pattern)?.[0]}' 표기 확인 · 요청하신 ${t.label} 선호 반영`),
     ...(q.maxPrice!=null?[`판매 단위 가격 ${fmt(q.maxPrice)}원 ${q.priceExclusive?'미만':'이하'} 충족`]:[]),
     ...(q.conditions.length?['입력한 영양 수치 조건 모두 충족']:[]),
     ...(q.exclusions.length?[`원재료 원문의 ${q.exclusions.join('·')} 제외 조건 반영`]:[])
   ]
   return {id:p.id,reasons}
 })
 const scope=answer.coverage?`검색 ${answer.coverage.matched}개 중 ${answer.coverage.queried}개 조회 · 영양 자료 일치 ${answer.coverage.confirmed}개. ${answer.coverage.partial?'조회한 후보 안에서 비교했으며 전체 순위는 아닙니다.':''}`:`조건에 맞는 ${answer.count}개 후보를 비교했어요.`
 const text=selected.length?`말씀하신 '${priority}' 기준으로 ${selected.length}개만 골랐어요.\n${scope}\n${selected.map((p,i)=>`${i+1}. ${p.name}\n${recommendations[i].reasons.join('\n')}`).join('\n\n')}${preferences.length?'\n맛은 상품명 표기에서 확인한 단서이며, 실제 시식·리뷰 평가는 아닙니다. 같은 선호 조건에서는 가격 정보가 있는 상품을 우선했어요.':''}`:answer.text||'말씀하신 선호를 확인할 수 있는 상품이 없어요. 선호 조건을 바꾸거나 다른 식재료로 찾아볼까요?'
 return {...answer,products:selected,answerKind:'recommendation',recommendations,recommendationContext:q,reference:reference?publicProduct(reference):null,text}
}
