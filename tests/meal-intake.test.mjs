import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mealRequest,mealRequestReply,mealRequestSettings} from '../api/_meal-request.mjs'
import {createPlan} from '../api/_planner.mjs'
import {assessPlan} from '../api/_plan-nutrition.mjs'

const now=new Date('2026-10-15T01:00:00Z')
const ask='10월 15일 아침 식단을 짜려고 하는데, 메인 메뉴 1가지와 서브 반찬 2가지를 추천해주세요'
const first=()=>mealRequest(ask,null,{now})
function ready(){const r=mealRequestReply(first());return mealRequest('150명, 맵지 않은 한식으로, 1인 한 끼 예산 5000원',r.mealRequestContext,{now})}
const record={code:'TEST',reportNumber:'200001010001',basis:{amount:100,unit:'g',text:'100g'},nutrients:{protein:{value:10},calories:{value:150},sodium:{value:200}},source:{name:'테스트 영양 자료',url:'https://www.data.go.kr/data/15127578/openapi.do'},fetchedAt:'2026-10-15T01:00:00Z'}
const product=(id,name,type)=>({id,name,ingredients:'대두, 계란',market:{name,itemType:type,unitPrice:1000,packGrams:1000,unit:'개',sourceUrl:'https://shop.g2b.go.kr/'},verifiedNutrition:record})
const products=[product(10000001,'불고기, 테스트, 간장불고기, 1kg','양념육류'),product(10000002,'알가공품, 테스트, 계란말이, 1kg','알가공품'),product(10000003,'묵류, 테스트, 도토리묵, 1kg','묵류'),product(10000004,'양념육류, 테스트, 매운제육, 1kg','양념육류')]

test('Exact user request keeps the date, breakfast and 1 main / 2 sides; never invents people or taste',()=>{
 const request=first(),reply=mealRequestReply(request)
 assert.equal(request.start,'2026-10-15');assert.equal(request.days,1);assert.deepEqual(request.meals,['아침']);assert.deepEqual(request.composition,{주찬:1,부찬:2})
 assert.equal(request.people,null);assert.equal(request.preferences,null);assert.equal(reply.needsMealDetails,true);assert.deepEqual(reply.products,[])
 assert.match(reply.text,/몇 명/);assert.match(reply.text,/선호/);assert.throws(()=>mealRequestSettings(request),/먼저/)
})
test('Missing details are collected across turns and only confirmed conditions reach the planner',()=>{
 let ctx=mealRequestReply(first()).mealRequestContext
 ctx=mealRequest('150명이요',ctx,{now});assert.equal(ctx.people,150);assert.equal(mealRequestReply(ctx).needsMealDetails,true)
 ctx=mealRequest('한식에 맵지 않게 해줘',ctx,{now});assert.equal(mealRequestReply(ctx).needsMealDetails,true)
 ctx=mealRequest('1인 한 끼 5000원',ctx,{now});const reply=mealRequestReply(ctx)
 assert.equal(reply.needsMealDetails,false);const s=mealRequestSettings(ctx)
 assert.equal(s.start,'2026-10-15');assert.deepEqual(s.meals,['아침']);assert.equal(s.mealBudgets[0],5000);assert.equal(s.people,150)
 assert.ok(s.preferenceLabels.includes('맵지 않게'));assert.equal(s.dessert,false)
})
test('Single-meal creation keeps exactly three slots and calculates budget for breakfast only',()=>{
 const plan=createPlan(products,mealRequestSettings(ready()))
 assert.equal(plan.days.length,1);assert.equal(plan.days[0].date,'2026-10-15');assert.equal(plan.days[0].meals.length,1)
 const meal=plan.days[0].meals[0];assert.equal(meal.name,'아침');assert.deepEqual(meal.items.map(p=>p.role),['주찬','부찬','부찬']);assert.equal(plan.missing,0)
 assert.equal(plan.budget,150*5000);assert.equal(new Set(meal.items.map(p=>p.family)).size,3)
 assert.ok(meal.items.every(p=>!p.name.includes('매운')));assert.ok(meal.items.every(p=>p.reasons.length>1))
})
test('Changing headcount keeps scope; a new explicit meal request starts fresh',()=>{
 const ctx=mealRequestReply(ready()).mealRequestContext,changed=mealRequest('이 조건에서 인원만 200명으로 바꿔줘',ctx,{now})
 assert.equal(changed.people,200);assert.deepEqual(changed.composition,{주찬:1,부찬:2});assert.deepEqual(changed.meals,['아침'])
 const fresh=mealRequest('10월 20일 저녁 식단 추천해줘',ctx,{now});assert.equal(fresh.people,null);assert.equal(fresh.preferences,null);assert.deepEqual(fresh.meals,['저녁'])
 assert.equal(mealRequest('두부 추천해줘',ctx,{now}),null);assert.equal(mealRequest('식단 중복을 줄이려면 어떻게 해야 해?',ctx,{now}),null)
})
test('Weekly planning still works but asks meal scope and menu composition instead of silently filling them',()=>{
 const r=mealRequest('120명 일주일 식단 추천해줘',null,{now});assert.equal(r.days,7);assert.equal(r.people,120);assert.equal(r.meals,null)
 const complete=mealRequest('세 끼 기본 구성, 한식, 기본 예산',mealRequestReply(r).mealRequestContext,{now})
 assert.equal(mealRequestReply(complete).needsMealDetails,false);assert.deepEqual(complete.meals,['아침','점심','저녁']);assert.equal(complete.composition.밥,1)
 assert.throws(()=>mealRequest('2월 30일 아침 식단 추천해줘',null,{now}),/날짜/)
})
test('Date-only edits preserve duration and a newly selected meal needs its own confirmed budget',()=>{
 const week=mealRequest('120명 일주일 식단 추천해줘',null,{now}),complete=mealRequest('세 끼 기본 구성, 한식, 기본 예산',mealRequestReply(week).mealRequestContext,{now})
 const dateOnly=mealRequest('시작 날짜만 10월 20일로 바꿔줘',mealRequestReply(complete).mealRequestContext,{now})
 assert.equal(dateOnly.days,7);assert.equal(dateOnly.start,'2026-10-20')
 const dinner=mealRequest('저녁으로 바꿔줘',mealRequestReply(ready()).mealRequestContext,{now})
 assert.equal(mealRequestReply(dinner).needsMealDetails,true);assert.match(mealRequestReply(dinner).text,/예산/)
})
test('Meal nutrient targets are separate from daily targets',()=>{
 const ctx=mealRequest('이 구성 1인분 단백질 20g 이상 나트륨 600mg 이하',mealRequestReply(ready()).mealRequestContext,{now})
 assert.equal(ctx.dailyTargets.length,0);assert.equal(ctx.mealTargets.length,2);assert.match(ctx.targetSource,/요청한 구성/)
 const daily=mealRequest('하루 단백질 60g 이상',ctx,{now});assert.equal(daily.dailyTargets[0].min,60);assert.equal(daily.mealTargets[0].min,20)
})
test('Nutrition evidence calculates portions, target ratios, shortfalls, excess and official source trace',()=>{
 const settings={...mealRequestSettings(ready()),mealTargets:[{nutrient:'protein',min:30},{nutrient:'sodium',max:400}]}
 const plan=assessPlan(createPlan(products,settings),products),m=plan.nutrition.days[0].meals[0]
 assert.equal(m.itemCount,3);assert.equal(m.coverage,100);assert.equal(m.totals.protein,24);assert.equal(m.totals.sodium,480)
 assert.equal(m.checks[0].minRatio,80);assert.equal(m.checks[0].shortfall,6);assert.equal(m.checks[1].maxRatio,120);assert.equal(m.checks[1].excess,80)
 assert.equal(plan.nutritionVerified,false);assert.equal(m.sources[0].code,'TEST');assert.equal(m.sources[0].portion.amount,120)
 assert.match(m.sources[0].formula,/120\/100/)
})
test('Incomplete and unconfigured nutrition never becomes zero, 100% compliance or a daily certification',()=>{
 const base=createPlan(products,mealRequestSettings(ready())),partial=assessPlan({...base,settings:{...base.settings,mealTargets:[{nutrient:'protein',min:20}]}},products.slice(0,1)),m=partial.nutrition.days[0].meals[0]
 assert.equal(m.totals.protein,null);assert.equal(m.knownSubtotal.protein,12);assert.equal(m.checks[0].status,'unknown');assert.equal(m.checks[0].minRatio,null);assert.equal(m.missing.length,2)
 const unconfigured=assessPlan(base,products);assert.equal(unconfigured.nutritionVerified,false);assert.equal(unconfigured.nutrition.days[0].meals[0].checks.length,0)
 const day=assessPlan({...base,settings:{...base.settings,dailyTargets:[{nutrient:'protein',min:20}]}},products)
 assert.equal(day.nutrition.days[0].checks[0].status,'scope_mismatch');assert.equal(day.nutrition.days[0].checks[0].minRatio,null);assert.equal(day.nutritionVerified,false)
})
