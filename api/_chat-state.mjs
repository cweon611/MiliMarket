import {validateMealContext} from './_meal-request.mjs'

const normalize=s=>String(s||'').normalize('NFKC').replace(/\s+/g,'').trim()
export function hasUserEvidence(evidence,messages=[]){
  const grounded=quote=>typeof quote==='string'&&normalize(quote)&&messages.some(m=>typeof m==='string'&&normalize(m).includes(normalize(quote)))
  if(Array.isArray(evidence))return evidence.length>0&&evidence.length<=10&&evidence.every(grounded)
  if(grounded(evidence))return true
  // Older model responses sometimes joined two verbatim quotes with a separator.
  const fragments=typeof evidence==='string'?evidence.split(/\s+\/\s+|\n|;\s*/).map(s=>s.trim()).filter(Boolean):[]
  return fragments.length>1&&fragments.length<=10&&fragments.every(grounded)
}
export const mealPatchFields=['start','days','meals','composition','people','preferences','preferenceNotes','preferredIngredients','exclusions','mealBudgets','dailyTargets','mealTargets','targetSource']
const labels=['아침','점심','저녁']
export function mergePreferences(previous=[],next=[]){
  if(next.includes('선호 제한 없음'))return next
  const groups=[['한식','혼합'],['맵지 않게','매콤하게']]
  return [...new Set([...previous.filter(p=>p!=='선호 제한 없음'&&!groups.some(g=>g.includes(p)&&next.some(n=>g.includes(n)))),...next])]
}
// Only apply sparse model edits supported by a quote from an actual user message.
// Defaults and the assistant's own suggestions are not user-confirmed conditions.
export function mergeMealTurn(previous,query,{message,history=[],now=new Date()}={}){
  const messages=[...history,message].filter(x=>typeof x==='string')
  const cited=quote=>hasUserEvidence(quote,messages)
  const reset=query.resetMealContext===true&&hasUserEvidence(query.resetEvidence,[message])
  let state=validateMealContext(reset?{}:previous||{})
  const patch=query.mealPatch&&typeof query.mealPatch==='object'?query.mealPatch:{}
  const rejected=[]
  for(const key of mealPatchFields){
    if(!Object.hasOwn(patch,key))continue
    if(!cited(query.mealEvidence?.[key])){rejected.push(key);continue}
    const value=patch[key]
    if(key==='mealBudgets'){
      if(!value||typeof value!=='object'||Array.isArray(value))throw Error('끼니별 예산 형식을 확인해 주세요.')
      const budget=[...(state.mealBudgets||[4000,5000,4000])],confirmed=[...state.budgetConfirmed]
      for(const [meal,n] of Object.entries(value)){if(!labels.includes(meal)||!Number.isFinite(n)||n<100||n>100000)throw Error('1인 한 끼 예산은 100–100,000원으로 입력해 주세요.');budget[labels.indexOf(meal)]=n;confirmed.push(meal)}
      state={...state,mealBudgets:budget,budgetConfirmed:[...new Set(confirmed)]}
    }else if(key==='preferences')state={...state,preferences:query.replacePreferences===true?value:mergePreferences(state.preferences||[],Array.isArray(value)?value:[])}
    else if(key==='composition')state={...state,composition:query.replaceComposition===true?value:{...state.composition,...value}}
    else state={...state,[key]:value}
  }
  if(query.regenerate===true&&hasUserEvidence(query.regenerationEvidence,[message]))state.seed=(state.seed||0)+1
  if(!state.start)state.start=now.toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'})
  return {state:validateMealContext(state),rejected}
}

export function chatMemory(body){
  // Read the latest confirmed conditions, even when the immediately prior turn was advice.
  const memory=body.chatContext&&typeof body.chatContext==='object'?body.chatContext:{}
  const boundedIds=value=>[...new Set(Array.isArray(value)?value:[])].filter(id=>Number.isInteger(id)&&/^\d{8}$/.test(String(id))).slice(-200)
  return {meal:validateMealContext(Object.hasOwn(memory,'meal')?memory.meal:body.mealRequestContext),recommendation:Object.hasOwn(memory,'recommendation')?memory.recommendation:body.recommendationContext||null,lastPlanProductIds:boundedIds(memory.lastPlanProductIds),recommendationSeenIds:boundedIds(memory.recommendationSeenIds)}
}
