import {createPlan} from './_planner.mjs'
import {convertNutrition,meetsNutrition,nutrientKeys} from '../shared/nutrition.mjs'
import {validateConditions} from './_query.mjs'
export function portionMeasure(item){
 if(item.grams>0)return {amount:item.grams,unit:'g'}
 if(item.unitsPerPerson>0&&!/[×*]|\d+\s*(?:입|팩입|개입)|박스|묶음|세트/.test(item.name)){
  const m=item.name.match(/(?:^|[^\d.])(\d+(?:\.\d+)?)\s*(mL|L)\s*$/i)
  if(m)return {amount:Number(m[1])*(m[2].toLowerCase()==='l'?1000:1)*item.unitsPerPerson,unit:'mL'}
 }
 return null
}
export function assessPlan(plan,products){
 const byId=new Map(products.map(p=>[p.id,p])),targets=validateConditions(plan.settings.dailyTargets||[]),mealTargets=validateConditions(plan.settings.mealTargets||[])
 function aggregate(items,conditions,scopeMatches=true){
  const missing=[],sources=[],subtotal=Object.fromEntries(nutrientKeys.map(k=>[k,0])),counts=Object.fromEntries(nutrientKeys.map(k=>[k,0]))
  for(const item of items){
   const record=byId.get(item.id)?.verifiedNutrition,measure=portionMeasure(item),v=convertNutrition(record,measure)
   if(item.missing||!record||!v.ok){missing.push({id:item.id||null,name:item.name||item.role,reason:item.missing?'식단 미구성':!record?'확정 영양 자료 없음':v.reason});continue}
   sources.push({id:item.id,name:item.name,code:record.code,reportNumber:record.reportNumber,basis:record.basis,portion:measure,formula:v.formula,values:v.values,source:record.source,fetchedAt:record.fetchedAt,updatedAt:record.updatedAt})
   for(const key of nutrientKeys)if(v.values[key]!=null){subtotal[key]+=v.values[key];counts[key]++}
  }
  const totals=Object.fromEntries(nutrientKeys.map(k=>[k,items.length>0&&counts[k]===items.length?subtotal[k]:null]))
  const checks=conditions.filter(t=>t.min!=null||t.max!=null).map(t=>{const value=totals[t.nutrient],comparable=scopeMatches&&value!=null;return {...t,value,status:!scopeMatches?'scope_mismatch':value==null?'unknown':meetsNutrition(totals,[t])?'met':'unmet',minRatio:comparable&&t.min>0?value/t.min*100:null,maxRatio:comparable&&t.max>0?value/t.max*100:null,shortfall:comparable&&t.min!=null?Math.max(0,t.min-value):null,excess:comparable&&t.max!=null?Math.max(0,value-t.max):null}})
  return {totals,knownSubtotal:subtotal,counts,itemCount:items.length,missing,checks,sources,coverage:items.length?sources.length/items.length*100:0}
 }
 const days=plan.days.map(day=>{
  const wholeDay=(!plan.settings.meals||plan.settings.meals.length===3)&&plan.settings.nutritionScope!=='selection'
  return {date:day.date,...aggregate(day.meals.flatMap(meal=>meal.items),targets,wholeDay),meals:day.meals.map(meal=>({name:meal.name,...aggregate(meal.items,mealTargets)}))}
 })
 const allChecks=days.flatMap(d=>[...d.checks,...d.meals.flatMap(m=>m.checks)])
 const verified=allChecks.length>0&&!plan.missing&&allChecks.every(c=>c.status==='met')
 return {...plan,nutritionVerified:verified,nutrition:{targetSource:plan.settings.targetSource||'기준 미지정',portionSource:plan.settings.portionSource||'데모 배식량',targets,mealTargets,days},warnings:[...plan.warnings,...(allChecks.length&&!verified?['입력한 영양 목표 충족을 확정할 수 없습니다. 자료 누락·목표 대비 수치·하루/끼니 범위를 확인해 주세요.']:[])]}
}
export function createNutrientPlan(products,input){
 const dailyTargets=validateConditions(input.dailyTargets||[]),mealTargets=validateConditions(input.mealTargets||[]),targets=[...dailyTargets,...mealTargets].filter(t=>t.min!=null||t.max!=null),settings={...input,dailyTargets,mealTargets,targetSource:String(input.targetSource||(targets.length?'사용자 입력 · 공식 기준 미확인':'기준 미지정')).slice(0,150)}
 if(!targets.length)return assessPlan(createPlan(products,settings),products)
 // Never fill a constrained plan using unverified ingredient nutrition.
 const pool=products.filter(p=>p.verifiedNutrition&&targets.every(t=>Number.isFinite(p.verifiedNutrition.nutrients[t.nutrient]?.value)))
 let best=null,bestScore=Infinity
 for(let i=0;i<16;i++){
  const plan=assessPlan(createPlan(pool,{...settings,seed:(settings.seed||0)+i}),pool)
  const score=plan.missing*1e6+Math.max(0,plan.total-plan.budget)+plan.nutrition.days.reduce((n,d)=>n+[...d.checks,...d.meals.flatMap(m=>m.checks)].reduce((s,c)=>s+(c.value==null?1e5:Math.max(0,(c.min??0)-c.value)/(c.min||1)+Math.max(0,c.value-(c.max??Infinity))/(c.max||1)),0),0)
  if(score<bestScore){best=plan;bestScore=score}if(plan.nutritionVerified&&plan.total<=plan.budget)break
 }
 return best
}
