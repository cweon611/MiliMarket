import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createPlan} from '../api/_planner.mjs'
import {mealRequest} from '../api/_meal-request.mjs'
const record=protein=>({code:'T',name:'테스트',basis:{text:'100g',amount:100,unit:'g'},nutrients:{protein:{label:'단백질',unit:'g',value:protein}}})
const row=(id,name,protein)=>({id,name,ingredients:'소고기',market:{name,unitPrice:1000,packGrams:1000,itemType:'식육가공품',unit:'개'},...(protein==null?{}:{verifiedNutrition:record(protein)})})
const rows=[row(20000001,'소불고기',null),row(20000002,'떡갈비',12),row(20000003,'수육',25)]
const settings={days:1,people:100,mealBudgets:[5000,5000,5000],meals:['아침'],composition:{주찬:1},cuisine:'혼합'}
test('High-protein preference ranks main dishes by official protein per 100g only',()=>{
 const plan=createPlan(rows,{...settings,preferenceLabels:['고단백']}),chosen=plan.days[0].meals[0].items[0]
 assert.equal(chosen.id,20000003)
 assert.ok(chosen.reasons.some(r=>r.includes('100g당 단백질 25g')))
 assert.match(plan.warnings.join(' '),/고단백 우선/)
 assert.doesNotMatch(createPlan(rows,settings).warnings.join(' '),/고단백/)
})
test('Chat intake recognizes a high-protein request',()=>{
 assert.ok(JSON.stringify(mealRequest('120명 일주일 식단 짜줘, 한식 고단백으로')).includes('고단백'))
})

test('exclusions cover synonyms: beef as 쇠고기/사골 and soy as 간장/된장/두부',async()=>{
 const {excludes}=await import('../api/_planner.mjs')
 const item=ingredients=>({name:'테스트',ingredients})
 assert.equal(excludes(item('정제수, 사골, 쇠고기, 마늘'),['소고기']),true)
 assert.equal(excludes(item('정제수, 간장(탈지대두, 밀), 설탕'),['대두']),true)
 assert.equal(excludes(item('국산 두부, 소금'),['대두']),true)
 assert.equal(excludes(item('닭고기 82%, 정제수, 마늘분말'),['소고기','대두']),false)
})
