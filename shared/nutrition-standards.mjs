// 1인 하루 영양 기준 DB: 국방부·식약처·보건복지부 기준을 영양소별로 출처를 남겨 통합한다.
// 원문 값(REFERENCE_VALUES)과 통합 규칙(STANDARD_RULES)을 분리하고, 규칙에 없는 숫자는 만들지 않는다.
export const STANDARD_VERSION='2026-10-23'
export const STANDARD_SOURCES={
  mnd:{name:'국방부 장병 영양섭취기준',edition:'2017 개정 (언론 보도)',url:'https://www.segye.com/newsView/20170124003767',verified:false,
    note:'공식 원문 미확인. 하루 3,100→3,000kcal, 단백질 에너지비율 15→17% 보도. 제안팀에서 원문을 받으면 교체한다.'},
  mfds:{name:'식약처 1일 영양성분 기준치',edition:'식품 등의 표시·광고에 관한 법률 시행규칙 [별표 5] (2020. 9. 9. 개정)',url:'https://www.law.go.kr/LSW/flDownload.do?gubun=&flSeq=76612387&bylClsCd=110201',verified:true,
    note:'2,000kcal 기준 식품 표시용 기준치. 상한 성격의 나트륨·당류에만 사용한다.'},
  kdri:{name:'2025 한국인 영양소 섭취기준',edition:'보건복지부·한국영양학회 2025 요약본 (발간등록번호 11-1352000-100416-13), 남자 19–29세',url:'https://health.seoulmc.or.kr/uploadFiles/2025_%ED%95%9C%EA%B5%AD%EC%9D%B8%EC%98%81%EC%96%91%EC%86%8C%EC%84%AD%EC%B7%A8%EA%B8%B0%EC%A4%80_%ED%99%9C%EC%9A%A9.pdf',verified:true,
    note:'에너지적정비율과 칼슘 권장·상한섭취량에 사용한다.'},
}
// 출처 원문 그대로의 값. 앱 영양소(열량·단백질·지방·탄수화물·당류·나트륨·칼슘)에 해당하는 항목만 둔다.
export const REFERENCE_VALUES=[
  {source:'mnd',nutrient:'calories',kind:'energy',value:3000,unit:'kcal',label:'1일 섭취열량'},
  {source:'mnd',nutrient:'protein',kind:'energy_ratio',value:17,unit:'%',label:'단백질 에너지비율'},
  {source:'mfds',nutrient:'carbs',kind:'daily_value',value:324,unit:'g',label:'1일 영양성분 기준치'},
  {source:'mfds',nutrient:'sugars',kind:'daily_value',value:100,unit:'g',label:'1일 영양성분 기준치'},
  {source:'mfds',nutrient:'protein',kind:'daily_value',value:55,unit:'g',label:'1일 영양성분 기준치'},
  {source:'mfds',nutrient:'fat',kind:'daily_value',value:54,unit:'g',label:'1일 영양성분 기준치'},
  {source:'mfds',nutrient:'sodium',kind:'daily_value',value:2000,unit:'mg',label:'1일 영양성분 기준치'},
  {source:'mfds',nutrient:'calcium',kind:'daily_value',value:700,unit:'mg',label:'1일 영양성분 기준치'},
  {source:'kdri',nutrient:'calories',kind:'eer',value:2600,unit:'kcal',label:'에너지필요추정량'},
  {source:'kdri',nutrient:'carbs',kind:'amdr',min:50,max:65,unit:'%',label:'에너지적정비율'},
  {source:'kdri',nutrient:'protein',kind:'amdr',min:10,max:20,unit:'%',label:'에너지적정비율'},
  {source:'kdri',nutrient:'fat',kind:'amdr',min:15,max:30,unit:'%',label:'에너지적정비율'},
  {source:'kdri',nutrient:'protein',kind:'rni',value:65,unit:'g',label:'권장섭취량'},
  {source:'kdri',nutrient:'sugars',kind:'limit_ratio',max:20,unit:'%',label:'총당류 에너지비율 상한'},
  {source:'kdri',nutrient:'sodium',kind:'cdrr',value:2300,unit:'mg',label:'만성질환위험감소섭취량'},
  {source:'kdri',nutrient:'calcium',kind:'rni',value:800,unit:'mg',label:'권장섭취량'},
  {source:'kdri',nutrient:'calcium',kind:'ul',value:3000,unit:'mg',label:'상한섭취량'},
]
const KCAL_PER_G={protein:4,carbs:4,fat:9}
// 통합 규칙. ratio는 열량에 비례해 g으로 환산하고, limit·absolute는 열량과 무관하게 고정한다.
export const STANDARD_RULES=[
  {nutrient:'calories',type:'energy',min:{source:'mnd'},basis:'열량 목표 이상'},
  {nutrient:'protein',type:'ratio',minPercent:{value:17,source:'mnd'},maxPercent:{value:20,source:'kdri'},basis:'국방부 17% 이상, 한국인 영양소 섭취기준 상한 20% 이하'},
  {nutrient:'carbs',type:'ratio',minPercent:{value:50,source:'kdri'},maxPercent:{value:65,source:'kdri'},basis:'에너지적정비율 50–65%'},
  {nutrient:'fat',type:'ratio',minPercent:{value:15,source:'kdri'},maxPercent:{value:30,source:'kdri'},basis:'에너지적정비율 15–30%'},
  {nutrient:'sugars',type:'limit',max:{value:100,source:'mfds'},basis:'식약처 기준치 100g 이하 (열량에 비례해 늘리지 않음)'},
  {nutrient:'sodium',type:'limit',max:{value:2000,source:'mfds'},basis:'식약처 기준치 2,000mg 이하 (열량에 비례해 늘리지 않음)'},
  {nutrient:'calcium',type:'absolute',min:{value:800,source:'kdri'},max:{value:3000,source:'kdri'},basis:'권장섭취량 800mg 이상, 상한섭취량 3,000mg 이하'},
]
export const DEFAULT_ENERGY=3000
const grams=(energy,percent,nutrient)=>Math.round(energy*percent/100/KCAL_PER_G[nutrient])
export function standardTarget(rule,energy=DEFAULT_ENERGY){
  if(rule.type==='energy')return {nutrient:rule.nutrient,min:energy,max:null}
  if(rule.type==='ratio')return {nutrient:rule.nutrient,min:grams(energy,rule.minPercent.value,rule.nutrient),max:grams(energy,rule.maxPercent.value,rule.nutrient)}
  return {nutrient:rule.nutrient,min:rule.min?.value??null,max:rule.max?.value??null}
}
export function validEnergy(value){return Number.isFinite(value)&&value>=1000&&value<=6000}
export function standardTargets(energy=DEFAULT_ENERGY){
  if(!validEnergy(energy))throw new Error('기준 열량은 1,000–6,000kcal로 입력해 주세요.')
  return STANDARD_RULES.map(r=>standardTarget(r,energy))
}
export function ruleSources(rule){return [...new Set([rule.min,rule.max,rule.minPercent,rule.maxPercent].filter(Boolean).map(x=>x.source))]}
// 현재 목표를 통합 기준과 비교해 영양소별 상태를 돌려준다: standard | edited | removed | custom
export function compareToStandard(targets=[],energy=DEFAULT_ENERGY){
  const expected=new Map(standardTargets(energy).map(t=>[t.nutrient,t])),current=new Map(targets.map(t=>[t.nutrient,t]))
  const rows=STANDARD_RULES.map(rule=>{const e=expected.get(rule.nutrient),c=current.get(rule.nutrient);return {nutrient:rule.nutrient,rule,expected:e,state:!c?'removed':(c.min??null)===e.min&&(c.max??null)===e.max?'standard':'edited'}})
  for(const t of targets)if(!expected.has(t.nutrient))rows.push({nutrient:t.nutrient,rule:null,expected:null,state:'custom'})
  return rows
}
export function standardTargetSource(targets,energy=DEFAULT_ENERGY){
  const changed=compareToStandard(targets,energy).filter(r=>r.state!=='standard').length
  return `통합 기준 ${STANDARD_VERSION} · ${energy.toLocaleString('ko-KR')}kcal (국방부·식약처·보건복지부)${changed?` · ${changed}개 사용자 수정`:''}`
}
// 영양값이 1일 기준에서 차지하는 비율. 하한이 있는 항목은 하한 대비(goal), 상한뿐인 항목은 상한 대비(limit)다.
// 값이 없는 영양소는 0으로 보지 않고 건너뛴다.
export function dailyShare(values={},energy=DEFAULT_ENERGY){
  return standardTargets(energy).flatMap(t=>{
    const value=values?.[t.nutrient];if(!Number.isFinite(value))return []
    const goal=t.min!=null,target=goal?t.min:t.max;if(!(target>0))return []
    return [{nutrient:t.nutrient,value,kind:goal?'goal':'limit',target,percent:Math.round(value/target*1000)/10}]
  })
}
const NUTRIENT_LABEL={calories:['열량','kcal'],protein:['단백질','g'],carbs:['탄수화물','g'],fat:['지방','g'],sugars:['당류','g'],sodium:['나트륨','mg'],calcium:['칼슘','mg']}
const n=v=>v.toLocaleString('ko-KR')
// 목표 한 줄 요약. 예: "단백질 128–150g"
export function describeTarget(t){
  const [label,unit]=NUTRIENT_LABEL[t.nutrient]||[t.nutrient,'']
  const range=t.min!=null&&t.max!=null?`${n(t.min)}–${n(t.max)}${unit}`:t.min!=null?`${n(t.min)}${unit} 이상`:`${n(t.max)}${unit} 이하`
  return `${label} ${range}`
}
export function describeStandard(energy=DEFAULT_ENERGY){return standardTargets(energy).map(describeTarget).join(' / ')}
// 열량을 바꿀 때 사용자가 직접 고친 영양소는 유지하고, 기준을 따르던 영양소만 다시 계산한다.
export function rescaleTargets(targets,fromEnergy,toEnergy){
  const next=new Map(standardTargets(toEnergy).map(t=>[t.nutrient,t]))
  for(const row of compareToStandard(targets,fromEnergy))if(row.state==='edited')next.set(row.nutrient,targets.find(t=>t.nutrient===row.nutrient));else if(row.state==='removed')next.delete(row.nutrient)
  for(const t of targets)if(!STANDARD_RULES.some(r=>r.nutrient===t.nutrient))next.set(t.nutrient,t)
  return [...next.values()]
}
