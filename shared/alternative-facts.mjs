import {gramPrice} from './catalog.mjs'
import {convertNutrition} from './nutrition.mjs'
// 대체 상품 비교에 쓰는 검증된 사실만 만든다. 값이 없거나 기준이 다르면 문장을 만들지 않는다.
const won=v=>`${Math.round(v).toLocaleString('ko-KR')}원`
const num=v=>(Math.round(v*10)/10).toLocaleString('ko-KR')
const NUTRIENTS=[['protein','단백질','g','높음','낮음'],['sodium','나트륨','mg','많음','적음'],['calories','열량','kcal','높음','낮음']]
export function officialPer100g(p){
  const c=p?.verifiedNutrition?convertNutrition(p.verifiedNutrition,{amount:100,unit:'g'}):null
  return c?.ok?c.values:null
}
export function nutritionDiffs(current,option){
  const a=officialPer100g(current),b=officialPer100g(option)
  if(!a||!b)return []
  return NUTRIENTS.filter(([k])=>Number.isFinite(a[k])&&Number.isFinite(b[k])).map(([key,label,unit])=>({key,label,unit,current:a[key],option:b[key],diff:b[key]-a[key]}))
}
export function alternativeFacts(current,option){
  const facts=[],ga=gramPrice(current),gb=gramPrice(option)
  if(ga!=null&&gb!=null){
    facts.push(`100g당 가격은 대체 상품 ${won(gb*100)}, 현재 상품 ${won(ga*100)}입니다.`)
    if(ga>gb)facts.push(`대체 상품이 100g당 ${won((ga-gb)*100)}(${num((ga-gb)/ga*100)}%) 저렴합니다.`)
  }
  if(option.market?.packGrams&&current.market?.packGrams)facts.push(`판매 단위 중량은 대체 상품 ${num(option.market.packGrams)}g, 현재 상품 ${num(current.market.packGrams)}g입니다.`)
  const diffs=nutritionDiffs(current,option)
  for(const d of diffs)facts.push(d.diff===0?`공식 영양 자료 100g당 ${d.label}은 두 상품이 ${num(d.option)}${d.unit}로 같습니다.`:`공식 영양 자료 100g당 ${d.label}은 대체 상품 ${num(d.option)}${d.unit}, 현재 상품 ${num(d.current)}${d.unit}로 대체 상품이 ${num(Math.abs(d.diff))}${d.unit} ${d.diff>0?NUTRIENTS.find(n=>n[0]===d.key)[3]:NUTRIENTS.find(n=>n[0]===d.key)[4]}.`)
  if(!diffs.length)facts.push('두 상품 중 공식 영양 자료(품목제조보고번호 일치)가 없는 상품이 있어 영양은 비교하지 않았습니다.')
  if(option.manufacturer&&option.manufacturer!=='미제공')facts.push(`대체 상품 제조사는 ${option.manufacturer}입니다.`)
  if(option.market?.origin)facts.push(`대체 상품 원산지 표기는 ${option.market.origin}입니다.`)
  facts.push('같은 나라장터 세부 품목이며, 맛·원재료의 동등성은 확인하지 않았습니다.')
  return facts
}
