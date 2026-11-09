import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {mergeMealTurn,chatMemory} from '../api/_chat-state.mjs'
import {mealRequestReply} from '../api/_meal-request.mjs'
import {clarifyMeal} from '../api/_claude.mjs'

const query=(patch,text)=>({intent:'plan',mealPatch:patch,mealEvidence:Object.fromEntries(Object.keys(patch).map(k=>[k,text]))})
const initial='10월 15일 아침 메인 1개와 반찬 2개 추천해줘'
const base=()=>mergeMealTurn(null,query({start:'2026-10-15',days:1,meals:['아침'],composition:{주찬:1,부찬:2}},initial),{message:initial}).state
test('Sparse Claude edits preserve existing fields, merge preferences and reject invented evidence',()=>{
 let s=mergeMealTurn(base(),query({people:150,preferences:['한식']},'백오십 명이고 한식이 좋아요'),{message:'백오십 명이고 한식이 좋아요'}).state
 s=mergeMealTurn(s,query({preferences:['맵지 않게']},'맵지만 않으면 돼요'),{message:'맵지만 않으면 돼요'}).state
 assert.deepEqual(s.preferences,['한식','맵지 않게']);assert.equal(s.people,150)
 const corrected=mergeMealTurn(s,{...query({preferences:['맵지 않게']},'한식 선호만 취소하고 순한 맛은 유지해줘'),replacePreferences:true},{message:'한식 선호만 취소하고 순한 맛은 유지해줘'}).state
 assert.deepEqual(corrected.preferences,['맵지 않게']);assert.equal(corrected.people,150)
 s=mergeMealTurn(s,query({mealBudgets:{아침:5000}},'5천 원이요'),{message:'5천 원이요'}).state
 assert.equal(mealRequestReply(s).needsMealDetails,false);assert.equal(s.days,1);assert.deepEqual(s.composition,{주찬:1,부찬:2})
 const rejected=mergeMealTurn(s,query({people:120,mealBudgets:{아침:4000}},'기본 설정'),{message:'다시 해줘'})
 assert.equal(rejected.state.people,150);assert.equal(rejected.state.mealBudgets[0],5000);assert.deepEqual(rejected.rejected,['people','mealBudgets'])
 const same=mergeMealTurn(s,{intent:'plan',mealPatch:{}},{message:'아까와 같은 조건으로 해줘'}).state
 assert.equal(mealRequestReply(same).needsMealDetails,false)
})
test('Confirmed memory survives advice and longer conversations; only explicit reset clears it',()=>{
 const s=mergeMealTurn(base(),query({people:150,preferences:['선호 제한 없음'],mealBudgets:{아침:5000}},'150명 선호 없음 예산5000원'),{message:'150명 선호 없음 예산5000원'}).state
 const memory=chatMemory({chatContext:{meal:s,recommendation:null}})
 const next=mergeMealTurn(memory.meal,query({start:'2026-10-20'},'날짜를 10월20일로'),{message:'날짜를 10월20일로'}).state
 assert.equal(next.people,150);assert.equal(next.mealBudgets[0],5000)
 assert.equal(mergeMealTurn(next,{resetMealContext:true,resetEvidence:'초기화'},{message:'그대로',history:['초기화']}).state.people,150)
 const reset=mergeMealTurn(next,{resetMealContext:true,resetEvidence:'조건을 초기화해줘'},{message:'조건을 초기화해줘'}).state
 assert.equal(reset.people,null);assert.equal(reset.preferences,null)
})
test('Composition corrections update the requested role, and alternative menus can change their seed',()=>{
 const s=mergeMealTurn(base(),query({composition:{부찬:3}},'반찬만 세 개로'),{message:'반찬만 세 개로'}).state
 assert.deepEqual(s.composition,{주찬:1,부찬:3})
 assert.equal(mergeMealTurn(s,{regenerate:true,regenerationEvidence:'다른 메뉴로 다시 추천해줘'},{message:'다른 메뉴로 다시 추천해줘'}).state.seed,1)
 const replaced=mergeMealTurn(s,{...query({composition:{국:1}},'이번에는 국 하나만'),replaceComposition:true},{message:'이번에는 국 하나만'}).state
 assert.deepEqual(replaced.composition,{국:1})
})
test('Freeform preferences are remembered without repeatedly requiring a preset taste',()=>{
 const s=mergeMealTurn(base(),query({people:150,preferenceNotes:['조리가 간편한 메뉴'],preferredIngredients:['닭고기'],mealBudgets:{아침:5000}},'150명, 닭고기로 조리가 간편하면 좋겠고 예산은5000원'),{message:'150명, 닭고기로 조리가 간편하면 좋겠고 예산은5000원'}).state
 assert.equal(mealRequestReply(s).needsMealDetails,false);assert.deepEqual(s.preferredIngredients,['닭고기'])
 const exclusions=mergeMealTurn(base(),query({people:150,exclusions:['새우'],mealBudgets:{아침:5000}},'150명, 새우 빼고 예산5000원'),{message:'150명, 새우 빼고 예산5000원'}).state
 assert.equal(mealRequestReply(exclusions).needsMealDetails,false)
})
test('Clarification can ask only missing fields; hallucinated repeated questions fall back',async()=>{
 const intake=mealRequestReply(mergeMealTurn(base(),query({people:150,preferences:['맵지 않게']},'150명 순하게'),{message:'150명 순하게'}).state)
 assert.deepEqual(intake.missingFields,['mealBudgets'])
 const result=await clarifyMeal(intake,{message:'150명 순하게'},{key:'test-only',fetchImpl:async()=>Response.json({content:[{type:'tool_use',name:'ask_missing',input:{acknowledgement:'알겠어요.',questions:[{field:'people',text:'몇 명인가요?'}]}}]})})
 assert.equal(result.text,intake.text);assert.doesNotMatch(result.text,/몇 명인가요/)
})

test('HTTP chat always uses Claude when configured, keeps state through advice and handles a short budget reply',async(t)=>{
 process.env.MILIMARKET_AGENT='off';process.env.ANTHROPIC_API_KEY='test-only';process.env.MILIMARKET_CLAUDE_API_KEY='';process.env.DATA_GO_KR_SERVICE_KEY='';process.env.G2B_SERVICE_KEY='';process.env.MFDS_SERVICE_KEY=''
 process.env.MILIMARKET_DATA_DIR=await mkdtemp(path.join(os.tmpdir(),'mm-chat-test-'))
 const originalFetch=globalThis.fetch,calls=[]
 const turns=[
  {query:query({start:'2026-10-15',days:1,meals:['아침'],composition:{주찬:1,부찬:2}},initial)},
  {query:query({people:150,preferences:['맵지 않게']},'백오십 명, 맵지만 않으면 돼')},
  {query:{intent:'advice'},advice:'말씀하신 백오십 명과 순한 맛 조건을 기억하고 있어요. 영양 목표는 비교 기준이고 성분은 식품의 측정값입니다.'},
  {query:query({mealBudgets:{아침:5000}},'5천 원이요')},
  {query:query({people:200},'인원만 이백 명으로 바꿔줘')},
  {query:{intent:'recommend',query:'두부',maxPrice:3000,priorityConfirmed:false}},
  {query:{intent:'recommend',query:'두부',maxPrice:3000,sort:'price',direction:'asc',limit:2,priorityConfirmed:true,recommendationBasis:'가격이 제일 중요해. 두 가지만 골라줘.'}},
  {query:query({exclusions:['새우','계란']},'사용자가 말하지 않은 조건')},
  {query:{intent:'advice',resetContext:true,resetEvidence:'조건은 다 잊고 처음부터 얘기하자'},advice:'이전 조건을 지웠어요. 새로 시작할게요.'},
  {query:{intent:'recommend',query:'두부',priorityConfirmed:false}},
 ]
 let turn=0
 globalThis.fetch=async(url,options)=>{
   if(String(url)!=='https://api.anthropic.com/v1/messages')return originalFetch(url,options)
   const body=JSON.parse(options.body),name=body.tools[0].name,data=JSON.parse(body.messages[0].content);calls.push({name,data})
   if(name==='catalog_query')return Response.json({content:[{type:'tool_use',name,input:turns[turn].query}]})
   if(name==='ask_missing')return Response.json({content:[{type:'tool_use',name,input:{acknowledgement:'좋아요.',questions:data.missingFields.slice(0,2).map(field=>({field,text:field==='mealBudgets'?'한 끼 예산은 어느 정도인가요?':field==='people'?'몇 명이 드시나요?':'좋아하는 맛이 있나요?'}))}}]})
   if(name==='meal_guidance')return Response.json({content:[{type:'tool_use',name,input:{text:turns[turn].advice,productIds:[],followUps:[]}}]})
   if(name==='explain_verified')return Response.json({content:[{type:'tool_use',name,input:{indexes:[0]}}]})
   throw Error('Unexpected tool '+name)
 }
 const {server}=await import('../api-server.mjs');await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 t.after(async()=>{globalThis.fetch=originalFetch;await new Promise(resolve=>server.close(resolve))})
 const url=`http://127.0.0.1:${server.address().port}/api/chat`,history=[],conversation=[];let memory
 async function send(message){const response=await originalFetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message,chatContext:memory,history,conversation,planSettings:{people:120,days:7}})});const r=await response.json();assert.equal(response.status,200,r.error);history.push(message);conversation.push({role:'user',text:message},{role:'assistant',text:r.text});memory=r.chatContext;turn++;return r}
 const first=await send(initial);assert.equal(first.mode,'claude');assert.equal(first.plan,undefined)
 const second=await send('백오십 명, 맵지만 않으면 돼');assert.deepEqual(second.missingFields,['mealBudgets']);assert.equal(memory.meal.people,150)
 const advice=await send('잠깐, 영양 목표와 성분이 어떻게 달라?');assert.equal(advice.answerKind,'guidance');assert.equal(memory.meal.people,150);assert.equal(advice.plan,undefined)
 const plan=await send('5천 원이요');assert.equal(plan.plan.settings.people,150);assert.deepEqual(plan.plan.settings.meals,['아침']);assert.equal(plan.plan.settings.days,1);assert.equal(plan.plan.days[0].meals[0].items.length,3);assert.equal(plan.plan.settings.mealBudgets[0],5000)
 const amended=await send('인원만 이백 명으로 바꿔줘');assert.equal(amended.plan.settings.people,200);assert.deepEqual(amended.plan.settings.composition,{주찬:1,부찬:2});assert.equal(amended.plan.settings.mealBudgets[0],5000)
 const recommendation=await send('식단 말고 두부 상품을 추천해줘. 3천 원 안쪽이면 좋겠어.');assert.equal(recommendation.needsPreference,true);assert.equal(memory.meal.people,200)
 const selected=await send('가격이 제일 중요해. 두 가지만 골라줘.');assert.equal(selected.needsPreference,undefined);assert.equal(selected.products.length,2);assert.equal(memory.meal.people,200);assert.equal(memory.recommendation.maxPrice,3000)
 const rejected=await send('계란도 제외해줘');assert.equal(rejected.answerKind,'meal_clarification');assert.equal(rejected.plan,undefined);assert.match(rejected.text,/정확히 확인하지 못했어요/)
 const reset=await send('조건은 다 잊고 처음부터 얘기하자');assert.equal(reset.contextReset,true);assert.equal(memory.meal,null);assert.equal(memory.recommendation,null);assert.deepEqual(memory.recommendationSeenIds,[])
 const fresh=await send('두부 추천해줘');assert.equal(fresh.needsPreference,true);assert.equal(memory.meal,null)
 const classifications=calls.filter(x=>x.name==='catalog_query');assert.equal(classifications.length,10);assert.equal(classifications[3].data.confirmedMealRequest.people,150)
 assert.equal(classifications.at(-1).data.recommendationContext,null)
})
