import {test} from 'node:test'
import assert from 'node:assert/strict'
import {hasUserEvidence,mergeMealTurn,chatMemory} from '../api/_chat-state.mjs'
import {chatRequestContext} from '../shared/chat-history.mjs'
import {createPlan,excludes} from '../api/_planner.mjs'
import {recommend} from '../api/_recommendation.mjs'
import {answerCatalog} from '../api/_catalog-service.mjs'
import {explainVerified} from '../api/_claude.mjs'
import {validateQuery} from '../api/_query.mjs'

test('Cross-turn exclusion quotes are grounded individually; ungrounded additions stay rejected',()=>{
 const messages=['새우는 빼줘','계란도 제외해줘']
 for(const evidence of [messages,'새우는 빼줘 / 계란도 제외해줘','계란도 제외해줘']){
  const result=mergeMealTurn({people:150,exclusions:['새우']},{mealPatch:{exclusions:['새우','계란']},mealEvidence:{exclusions:evidence}},{message:messages[1],history:[messages[0]]})
  assert.deepEqual(result.state.exclusions,['새우','계란']);assert.equal(result.state.people,150);assert.deepEqual(result.rejected,[])
 }
 assert.equal(hasUserEvidence(['새우는 빼줘','우유도 제외해줘'],messages),false)
 assert.equal(hasUserEvidence([],messages),false)
 assert.equal(hasUserEvidence('새우와 계란 제외',messages),false)
})

test('Alternative and reset actions use current evidence without a second keyword gate',()=>{
 const old={people:150,seed:2}
 assert.equal(mergeMealTurn(old,{regenerate:true,regenerationEvidence:'대안을 보여줘'},{message:'대안을 보여줘'}).state.seed,3)
 assert.equal(mergeMealTurn(old,{regenerate:true,regenerationEvidence:'대안을 보여줘'},{message:'그대로',history:['대안을 보여줘']}).state.seed,2)
 assert.equal(mergeMealTurn(old,{resetMealContext:true,resetEvidence:'이전 조건은 더 이상 적용하지 마'},{message:'이전 조건은 더 이상 적용하지 마'}).state.people,null)
})

test('Explicit empty canonical memory cannot be resurrected by legacy fields or old UI history',()=>{
 const memory=chatMemory({chatContext:{meal:null,recommendation:null},mealRequestContext:{people:150},recommendationContext:{query:'우유'}})
 assert.equal(memory.meal,null);assert.equal(memory.recommendation,null)
 const messages=[{role:'user',text:'150명 우유'},{role:'assistant',text:'이전 추천',reply:{products:[{id:10000001}],planSettings:{people:150},chatContext:{meal:{people:150},recommendation:{query:'우유'}}}},{role:'user',text:'다 잊어줘'},{role:'assistant',text:'새로 시작할게요',reply:{contextReset:true,chatContext:memory,products:[]}}]
 const payload=chatRequestContext(messages,{people:200})
 assert.deepEqual(payload.history,[]);assert.deepEqual(payload.productIds,[]);assert.equal(payload.planSettings,null);assert.equal(payload.chatContext.recommendation,null)
 assert.deepEqual(payload.conversation,[{role:'assistant',text:'새로 시작할게요'}])
 messages.push({role:'user',text:'두부 추천해줘'})
 assert.deepEqual(chatRequestContext(messages).history,['두부 추천해줘'])
 assert.equal(messages.length,5,'visible transcript remains intact')
})

const products=Array.from({length:5},(_,i)=>({id:10000001+i,name:`테스트두부 ${i+1}`,ingredients:'콩',subcategory:'두부류',market:{name:`테스트두부 ${i+1}`,unitPrice:500+i*100,packGrams:200,unit:'개'}}))
test('Different recommendations exclude previously displayed IDs and preserve price constraints',async()=>{
 const query={intent:'recommend',query:'테스트두부',sort:'price',maxPrice:800,limit:2,priorityConfirmed:true,recommendationBasis:'가격 우선'}
 const result=await recommend(products,query,{}, {userMessages:['가격 우선'],semanticInterpretation:true,excludedProductIds:[10000001,10000002]})
 assert.deepEqual(result.products.map(p=>p.id),[10000003,10000004]);assert.equal(result.count,2)
 const empty=await recommend(products,query,{}, {userMessages:['가격 우선'],semanticInterpretation:true,excludedProductIds:products.map(p=>p.id)})
 assert.deepEqual(empty.products,[]);assert.match(empty.text,/새 후보가 없어요/)
})

test('A name and price follow-up responds from exact catalog facts without nutrition lookup',()=>{
 const result=answerCatalog(products,validateQuery({intent:'product_info',productIds:[10000002],limit:1}))
 assert.equal(result.text,'테스트두부 2\n600원 / 개');assert.equal(result.products[0].id,10000002)
 assert.equal(result.nutritionEvidence,undefined)
 assert.deepEqual(answerCatalog(products,validateQuery({intent:'product_info'})).products,[])
})

test('Structured recommendation highlights need no extra model call and preserve exact reasons',async()=>{
 const reply={answerKind:'recommendation',text:'검증 결과',recommendations:[{id:10000001,reasons:['500원/개']},{id:10000002,reasons:['600원/개']}],products:[]}
 const result=await explainVerified(reply,{key:'test-only',fetchImpl:()=>{throw Error('must not call model')}})
 assert.deepEqual(result.highlights,['500원/개','600원/개']);assert.equal(result.explanationMode,'verified_template')
 const noEvidence=await explainVerified({...reply,recommendations:[],needsBasis:true},{key:'test-only',fetchImpl:()=>{throw Error('must not call model')}})
 assert.equal(noEvidence.highlights,undefined)
})

test('Alternative meals prefer different menu families; scarce alternatives disclose reuse',()=>{
 const rows=['소불고기','떡갈비','함박스테이크'].map((name,i)=>({id:20000001+i,name,ingredients:'소고기',market:{name,unitPrice:1000+i*100,packGrams:1000,itemType:'식육가공품',unit:'개'}}))
 const settings={days:1,people:150,mealBudgets:[5000,5000,5000],meals:['아침'],composition:{주찬:1},cuisine:'혼합',preferenceLabels:['가격 우선']}
 const original=createPlan(rows,settings),alternative=createPlan(rows,{...settings,avoidProductIds:original.purchase.map(p=>p.id)})
 assert.notEqual(original.purchase[0].family,alternative.purchase[0].family)
 assert.ok(alternative.days[0].meals[0].cost<=5000)
 const scarce=createPlan(rows.slice(0,1),{...settings,avoidProductIds:[rows[0].id]})
 assert.match(scarce.warnings.join(' '),/새 후보가 부족/)
})

test('Egg exclusions also match common ingredient synonyms, and unknown ingredients remain excluded',()=>{
 for(const ingredients of ['달걀','난백액','난황','전란액','정보없음'])assert.equal(excludes({name:'테스트',ingredients},['계란']),true)
 assert.equal(excludes({name:'테스트',ingredients:'콩'},['계란']),false)
})
