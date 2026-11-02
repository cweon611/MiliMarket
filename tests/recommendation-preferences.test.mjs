import {test} from 'node:test'
import assert from 'node:assert/strict'
import {recommend,continueRecommendation} from '../api/_recommendation.mjs'
import {validateQuery} from '../api/_query.mjs'
import {answerCatalog} from '../api/_catalog-service.mjs'
const products=Array.from({length:8},(_,i)=>({id:10000001+i,name:`테스트두부 ${i+1}`,ingredients:i===7?'콩, 새우':'콩',category:'두부류',subcategory:'두부류',market:{name:`테스트두부 ${i+1}`,unitPrice:2000-i*100,packGrams:200,unit:'개'}}))
test('Unspecified taste or only a budget asks a question with zero recommended products',async()=>{
 for(const input of [{intent:'recommend',query:'테스트두부'},{intent:'recommend',query:'테스트두부',maxPrice:2000}]){
   const answer=await recommend(products,validateQuery(input),{}, {userMessages:['테스트두부 2000원 이하 추천해줘']})
   assert.equal(answer.needsPreference,true);assert.equal(answer.products.length,0);assert.equal(answer.recommendations.length,0)
   assert.ok(answer.followUps.every(s=>s.includes('테스트두부')))
 }
})
test('Model-generated price preference without an actual user basis cannot trigger recommendations',async()=>{
 const input=validateQuery({intent:'recommend',query:'테스트두부',maxPrice:2000,sort:'price',recommendationBasis:'2000원 이하'})
 assert.equal((await recommend(products,input,{}, {userMessages:['테스트두부 2000원 이하 추천해줘']})).needsPreference,true)
 assert.equal((await recommend(products,{...input,recommendationBasis:'저렴한 걸 좋아함'}, {},{userMessages:['테스트두부 추천해줘']})).needsPreference,true)
})
test('Short answers preserve the budget and exclusions and rank at most two actual candidates',async()=>{
 const previous=validateQuery({intent:'recommend',query:'테스트두부',maxPrice:1800,exclusions:['새우'],limit:20})
 const next=continueRecommendation('저렴한 걸로',previous)
 assert.equal(next.query,'테스트두부');assert.equal(next.maxPrice,1800);assert.deepEqual(next.exclusions,['새우'])
 const answer=await recommend(products,next,{}, {userMessages:['테스트두부 1800원 이하 새우 제외 추천해줘','저렴한 걸로']})
 assert.deepEqual(answer.products.map(p=>p.id),[10000007,10000006]);assert.equal(answer.products.length,2)
 assert.ok(answer.recommendations.every(r=>r.reasons.some(s=>s.includes('가격 기준'))))
 assert.ok(answer.text.includes('2개만'));assert.equal(answer.count,5)
 assert.equal(continueRecommendation('이번에는 우유 추천해줘',previous),null)
})
test('One requested candidate stays one; ordinary search can still return more than two',async()=>{
 const input=validateQuery({intent:'recommend',query:'테스트두부',sort:'price',limit:1,recommendationBasis:'저렴한'})
 assert.equal((await recommend(products,input,{}, {userMessages:['저렴한 테스트두부 1개 추천해줘']})).products.length,1)
 const search=validateQuery({intent:'search',query:'테스트두부',limit:5})
 assert.equal(answerCatalog(products,search).products.length,5)
})
test('Taste preference is supported by product wording and never fabricated reviews',async()=>{
 const rows=products.map((p,i)=>({...p,name:(i<4?'매콤':'순한')+' 테스트두부 '+i}))
 const input=validateQuery({intent:'recommend',query:'테스트두부',tastePreferences:['spicy'],recommendationBasis:'매콤한 걸 좋아해',limit:20})
 const answer=await recommend(rows,input,{}, {userMessages:['매콤한 걸 좋아해. 테스트두부 추천해줘']})
 assert.equal(answer.products.length,2);assert.ok(answer.products.every(p=>p.name.startsWith('매콤')))
 assert.ok(answer.recommendations.every(r=>r.reasons.some(s=>s.includes('상품명에서'))));assert.match(answer.text,/실제 시식·리뷰 평가는 아닙니다/)
 const unsupported=await recommend(rows,{...input,tastePreferences:['mild']},{},{userMessages:['매콤한 걸 좋아해']})
 assert.equal(unsupported.needsPreference,true)
})
test('An explicit nutrient preference asks for a basis instead of dumping unqualified products',async()=>{
 const previous=validateQuery({intent:'recommend',query:'테스트두부',maxPrice:1800})
 const next=continueRecommendation('단백질 높은 걸로',previous)
 const answer=await recommend(products,next,{nutrition:()=>{throw Error('must ask for basis before lookup')}},{userMessages:['단백질 높은 걸로']})
 assert.equal(answer.needsBasis,true);assert.equal(answer.products.length,0);assert.equal(answer.recommendations.length,0)
})

test('Claude-understood everyday preferences are not rejected by the demo keyword gate',async()=>{
 const base={intent:'recommend',query:'테스트두부',maxPrice:1800,sort:'price',limit:2,priorityConfirmed:true}
 for(const message of ['가격이 제일 중요해. 두 가지만 골라줘.','돈을 좀 아끼고 싶어','경제적인 걸로']){
   const answer=await recommend(products,{...base,recommendationBasis:message},{},{userMessages:[message],semanticInterpretation:true})
   assert.equal(answer.products.length,2);assert.equal(answer.needsPreference,undefined)
   assert.ok(answer.products.every(p=>p.unitPrice<=1800));assert.equal(answer.recommendationContext.maxPrice,1800)
 }
 const fake=await recommend(products,{...base,recommendationBasis:'경제적인 걸로'},{},{userMessages:['두부 추천해줘'],semanticInterpretation:true})
 assert.equal(fake.needsPreference,true)
 const budgetOnly=await recommend(products,{...base,priorityConfirmed:false,recommendationBasis:'1800원 이하'},{},{userMessages:['1800원 이하'],semanticInterpretation:true})
 assert.equal(budgetOnly.needsPreference,true)
 const rows=products.map(p=>({...p,name:'순한 '+p.name}))
 const mild=await recommend(rows,{...base,sort:'default',tastePreferences:['mild'],recommendationBasis:'매운 건 못 먹어요'},{},{userMessages:['매운 건 못 먹어요'],semanticInterpretation:true})
 assert.equal(mild.products.length,2);assert.ok(mild.recommendations.every(r=>r.reasons.some(s=>s.includes('순한맛'))))
})
