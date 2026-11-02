export const NUTRIENT_META={calories:['열량','kcal'],protein:['단백질','g'],fat:['지방','g'],carbs:['탄수화물','g'],sugars:['당류','g'],sodium:['나트륨','mg'],calcium:['칼슘','mg']}
export const nutrientKeys=Object.keys(NUTRIENT_META)
export function verifiedRecord(e){return e?.status==='ok'&&e.match==='report_number'&&!e.partial&&e.records?.length===1?e.records[0]:null}
export function convertNutrition(record,basis,serving){
  if(!record?.basis?.amount||!record.basis.unit)return {ok:false,reason:'영양 기준량 미제공'}
  const target=basis?.unit==='serving'?serving:basis
  if(!target?.amount||!['g','mL'].includes(target.unit))return {ok:false,reason:'비교 기준량 또는 1인 배식량 필요'}
  if(record.basis.unit!==target.unit)return {ok:false,reason:'g와 mL는 밀도 없이 환산할 수 없음'}
  const factor=target.amount/record.basis.amount
  const values=Object.fromEntries(nutrientKeys.map(k=>[k,Number.isFinite(record.nutrients?.[k]?.value)?record.nutrients[k].value*factor:null]))
  return {ok:true,values,basis:target,sourceCode:record.code,formula:`${record.basis.amount}${record.basis.unit} 원자료 × ${target.amount}/${record.basis.amount}`,record}
}
export function meetsNutrition(values,conditions=[]){return conditions.every(c=>{
  const v=values[c.nutrient];if(!Number.isFinite(v))return false
  return (c.min==null||(c.minExclusive?v>c.min:v>=c.min))&&(c.max==null||(c.maxExclusive?v<c.max:v<=c.max))
})}
export function evaluateNutrition(product,query){
  const record=product.verifiedNutrition
  if(!record)return {ok:false,reason:'상품과 일치하는 확정 영양 자료 없음'}
  const converted=convertNutrition(record,query.basis,query.serving)
  if(!converted.ok)return converted
  if(!meetsNutrition(converted.values,query.conditions))return {...converted,ok:false,reason:'영양 수치 조건 불충족'}
  if(nutrientKeys.includes(query.sort)&&!Number.isFinite(converted.values[query.sort]))return {...converted,ok:false,reason:'정렬할 영양값 미제공'}
  return converted
}
