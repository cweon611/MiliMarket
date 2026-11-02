import {useEffect,useState} from 'react'
import {NUTRIENT_META} from '../shared/nutrition.mjs'
import type {Plan} from './AssistantWorkspace'

export interface NutritionCheck {nutrient:string;min:number|null;max:number|null;minExclusive?:boolean;maxExclusive?:boolean;value:number|null;status:string;minRatio?:number|null;maxRatio?:number|null;shortfall?:number|null;excess?:number|null}
export interface NutritionAggregate {
  totals:Record<string,number|null>;knownSubtotal:Record<string,number>;counts:Record<string,number>;itemCount:number;coverage:number
  missing:{name:string;reason:string}[];checks:NutritionCheck[]
  sources:{id:number;name:string;code:string;reportNumber:string;basis:{text:string};portion:{amount:number;unit:string};formula:string;source?:{name:string;url:string};fetchedAt:string;updatedAt:string}[]
}
const number=(n:number)=>n.toLocaleString('ko-KR',{maximumFractionDigits:1})
const statusLabel:Record<string,string>={met:'충족',unmet:'미충족',unknown:'자료 부족',scope_mismatch:'하루 전체 아님'}
export function MealNutritionEvidence({plan}:{plan:Plan}){
  const [dayIndex,setDayIndex]=useState(0),[mealIndex,setMealIndex]=useState(0)
  useEffect(()=>{setDayIndex(0);setMealIndex(0)},[plan])
  const nutrition=plan.nutrition,day=nutrition?.days[dayIndex]
  if(!nutrition||!day)return <p>식단의 영양 자료를 확인하지 못했습니다.</p>
  const aggregate=mealIndex<0?day:day.meals?.[mealIndex]||day
  const scope=mealIndex<0?'선택한 끼니 합계':day.meals?.[mealIndex]?.name||'선택한 구성'
  const checks=aggregate.checks,matched=checks.filter(c=>c.status==='met').length
  return <section className="meal-nutrition-evidence" aria-label="식단 영양 적합도">
    <div className="nutrition-evidence-title"><span>공공데이터 기반</span><h3>식단 영양 적합도</h3><p>1인 배식량 기준 · {plan.settings.nutritionScope==='selection'?'요청한 메뉴만 합산':'선택한 끼니 기준'}</p></div>
    <div className="nutrition-evidence-select"><label>날짜<select value={dayIndex} onChange={e=>{setDayIndex(Number(e.target.value));setMealIndex(0)}}>{nutrition.days.map((d,i)=><option key={d.date} value={i}>{d.date}</option>)}</select></label><label>확인 범위<select value={mealIndex} onChange={e=>setMealIndex(Number(e.target.value))}>{day.meals?.map((m,i)=><option key={m.name} value={i}>{m.name}</option>)}<option value={-1}>선택한 끼니 합계 / 하루 목표</option></select></label></div>
    <div className="nutrition-coverage"><div><span>공식 자료 연결</span><b>{aggregate.sources?.length||0}<small> / {aggregate.itemCount}개 구성품</small></b></div><div className="metric-track"><i style={{width:`${aggregate.coverage||0}%`}}/></div><p>품목보고번호 일치 + 배식량 환산 가능 자료만 계산</p></div>
    <div className="nutrition-target-summary"><b>{checks.length?`${matched} / ${checks.length}개 목표 충족`:'영양 목표 미설정'}</b><p>{checks.length?nutrition.targetSource:'기관의 끼니별 목표나 원하는 영양 조건을 알려주시면 달성률을 비교합니다.'}</p></div>
    <p className="nutrition-scope-label">{scope} · 1인분 영양 지표</p>
    <div className="nutrition-metrics">{Object.entries(NUTRIENT_META).map(([key,[label,unit]])=>{
      const value=aggregate.totals[key],check=checks.find(c=>c.nutrient===key),known=aggregate.counts[key]||0
      return <article key={key} className="nutrition-metric"><header><b>{label}</b><span className={`metric-status ${check?.status||'neutral'}`}>{check?statusLabel[check.status]:value==null?'자료 부족':'기준 미설정'}</span></header><div className="metric-value">{value==null?<><strong>합계 미확정</strong><small>{known?`확인된 소계 ${number(aggregate.knownSubtotal[key])}${unit}`:'확인된 수치 없음'}</small></>:<strong>{number(value)}<small>{unit}</small></strong>}<small>{known}/{aggregate.itemCount}개 수치 확인</small></div>{check&&<>
        <p className="metric-target">목표 {check.min!=null?`${number(check.min)}${unit} ${check.minExclusive?'초과':'이상'}`:''}{check.min!=null&&check.max!=null?' · ':''}{check.max!=null?`${number(check.max)}${unit} ${check.maxExclusive?'미만':'이하'}`:''}</p>
        {([['최소 목표 대비',check.minRatio],['상한 사용률',check.maxRatio]] as const).map(([title,ratio])=>ratio!=null?<div className="metric-ratio" key={title}><span>{title}<b>{number(ratio)}%</b></span><div className={`metric-track ${check.status==='unmet'?'attention':''}`}><i style={{width:`${Math.min(100,Math.max(0,ratio))}%`}}/></div></div>:null)}
        {check.shortfall!=null&&check.shortfall>0&&<p className="metric-alert">목표보다 {number(check.shortfall)}{unit} 부족</p>}{check.excess!=null&&check.excess>0&&<p className="metric-alert">상한보다 {number(check.excess)}{unit} 초과</p>}
        {check.status==='scope_mismatch'&&<p className="metric-alert">일부 끼니·메뉴만으로 하루 기준 충족을 판정하지 않아요.</p>}
      </>}</article>
    })}</div>
    <p className="nutrition-calculation-note">배식량: {plan.settings.portionSource||'데모 배식량'}<br/>{Object.entries(plan.settings.portions||{}).filter(([role])=>!plan.settings.composition||plan.settings.composition[role]).map(([role,n])=>`${role} ${n}g`).join(' · ')}<br/>영양값이 없는 구성품은 0으로 계산하지 않습니다. 목표 대비 비율은 전체 수치가 확인된 경우에만 표시합니다.</p>
    {!!aggregate.missing.length&&<details className="nutrition-source-details"><summary>계산하지 못한 구성품 {aggregate.missing.length}개</summary>{aggregate.missing.map((x,i)=><p key={i}><b>{x.name}</b><br/>{x.reason}</p>)}</details>}
    <details className="nutrition-source-details"><summary>원자료와 계산 근거 {aggregate.sources?.length||0}건</summary>{aggregate.sources?.map((s,i)=><p key={`${s.id}-${i}`}><b>{s.name}</b><br/>식품코드 {s.code} · 보고번호 {s.reportNumber}<br/>{s.basis.text} 원자료 → 1인 {s.portion.amount}{s.portion.unit}<br/>{s.formula}<br/>조회 {s.fetchedAt?new Date(s.fetchedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'미확인'}{s.source?.url&&<><br/><a href={s.source.url} target="_blank" rel="noreferrer">{s.source.name}</a></>}</p>)}{!aggregate.sources?.length&&<p>상품과 일치하는 환산 가능 영양 원자료가 아직 없습니다.</p>}</details>
    <a className="nutrition-source-link" href="https://www.data.go.kr/data/15127578/openapi.do" target="_blank" rel="noreferrer">공공데이터포털 · 식약처 식품영양성분DB ↗</a>
  </section>
}
