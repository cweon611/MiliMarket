import {useEffect,useState} from 'react'
import {NutrientConditions, type NutrientCondition} from './NutritionTools'
import {DEFAULT_ENERGY,STANDARD_SOURCES,compareToStandard,rescaleTargets,ruleSources,standardTargetSource,standardTargets,validEnergy} from '../shared/nutrition-standards.mjs'
type Change={dailyTargets:NutrientCondition[];targetSource:string;standardEnergy?:number}
const range=(t:{min:number|null;max:number|null})=>[t.min!=null&&`${t.min.toLocaleString('ko-KR')} 이상`,t.max!=null&&`${t.max.toLocaleString('ko-KR')} 이하`].filter(Boolean).join(' · ')
// 1인 하루 영양 기준: 통합 기준(국방부·식약처·보건복지부)을 불러오고, 영양소별로 출처와 사용자 수정 여부를 보여준다.
export function DailyStandardTargets({targets,source,energy,onChange}:{targets:NutrientCondition[];source:string;energy?:number;onChange:(c:Change)=>void}){
 const [energyText,setEnergyText]=useState(String(energy??DEFAULT_ENERGY))
 useEffect(()=>{setEnergyText(String(energy??DEFAULT_ENERGY))},[energy])
 const load=(e:number)=>{const dailyTargets=standardTargets(e);onChange({dailyTargets,standardEnergy:e,targetSource:standardTargetSource(dailyTargets,e)})}
 if(energy==null)return <><p>기관에서 받은 기준을 입력하거나 통합 기준을 불러오면 확정 영양 자료로 검증합니다. 비워두면 충족 여부를 판정하지 않습니다.</p><button type="button" className="standard-load" onClick={()=>load(DEFAULT_ENERGY)}>통합 기준 불러오기 · {DEFAULT_ENERGY.toLocaleString('ko-KR')}kcal</button><label>기준 출처<input aria-label="하루 영양 기준 출처" value={source} placeholder="예: 기관 급식 기준 2026" onChange={e=>onChange({dailyTargets:targets,targetSource:e.target.value})}/></label><NutrientConditions value={targets} onChange={dailyTargets=>onChange({dailyTargets,targetSource:source})}/></>
 const rows=new Map(compareToStandard(targets,energy).map(r=>[r.nutrient,r]))
 const notes=Object.fromEntries([...rows].map(([k,r])=>[k,r.rule?<small className={`standard-note ${r.state}`}>{r.state==='standard'?'기준':r.state==='edited'?'사용자 수정':'목표 해제'} · {r.rule.basis}{r.state!=='standard'&&r.expected?` (기준 ${range(r.expected)})`:''} · {ruleSources(r.rule).map(s=>STANDARD_SOURCES[s as keyof typeof STANDARD_SOURCES].name).join(', ')}</small>:<small className="standard-note custom">사용자 추가</small>]))
 const changeEnergy=(raw:string)=>{setEnergyText(raw);const next=Number(raw);if(!validEnergy(next))return;const dailyTargets=rescaleTargets(targets,energy,next);onChange({dailyTargets,standardEnergy:next,targetSource:standardTargetSource(dailyTargets,next)})}
 return <><p>통합 기준을 적용했습니다. 열량을 바꾸면 단백질·탄수화물·지방은 열량 비율로 다시 계산하고, 나트륨·당류·칼슘은 그대로 둡니다. 직접 고친 값은 유지합니다.</p>
  <p className="standard-warning">영양 목표가 있으면 공식 영양 자료가 확인된 상품만으로 식단을 구성하므로 후보가 크게 줄 수 있습니다.</p>
  <label>기준 열량 (kcal)<input aria-label="기준 열량" type="number" min="1000" max="6000" step="50" value={energyText} onChange={e=>changeEnergy(e.target.value)}/></label>
  {!validEnergy(Number(energyText))&&<small role="alert">기준 열량은 1,000–6,000kcal로 입력해 주세요.</small>}
  <p className="standard-source">{standardTargetSource(targets,energy)}</p>
  <NutrientConditions value={targets} notes={notes} onChange={dailyTargets=>onChange({dailyTargets,standardEnergy:energy,targetSource:standardTargetSource(dailyTargets,energy)})}/>
  <div className="standard-actions"><button type="button" onClick={()=>load(energy)}>기준값으로 되돌리기</button><button type="button" onClick={()=>onChange({dailyTargets:[],targetSource:'',standardEnergy:undefined})}>기준 해제</button></div>
  <details className="standard-sources"><summary>기준 출처</summary>{Object.entries(STANDARD_SOURCES).map(([k,s])=><p key={k}><b>{s.name}</b> {s.edition}{s.verified?'':' · 공식 원문 확인 필요'}<br/><small>{s.note} <a href={s.url} target="_blank" rel="noreferrer">원문</a></small></p>)}</details></>
}
