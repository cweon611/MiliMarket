import {readJsonResponse} from '../shared/http-response.mjs'
import { Flame, Beef, Wheat, Droplets, Candy, Waves, Bone, Info, type LucideIcon } from 'lucide-react'
import {useEffect,useRef,useState,type ReactNode} from 'react'
import type {Product} from './data'
import {NUTRIENT_META,convertNutrition,evaluateNutrition} from '../shared/nutrition.mjs'
import {DEFAULT_ENERGY,dailyShare,describeTarget,standardTargets} from '../shared/nutrition-standards.mjs'
import './nutrition-tools.css'
export interface NutrientCondition {nutrient:string;min:number|null;max:number|null;minExclusive?:boolean;maxExclusive?:boolean}
export interface NutrientFilterState {basis:string;conditions:NutrientCondition[];sort:string;direction:string;verifiedOnly:boolean}
export const emptyNutrientFilter:NutrientFilterState={basis:'g',conditions:[],sort:'default',direction:'desc',verifiedOnly:false}
export function nutrientFilterMatch(p:Product,f:NutrientFilterState){
 if(!f.verifiedOnly&&!f.conditions.length&&f.sort==='default')return true
 return evaluateNutrition(p,{basis:{amount:100,unit:f.basis},conditions:f.conditions,sort:f.sort}).ok
}
export function nutrientFilterOrder(a:Product,b:Product,f:NutrientFilterState){
 if(f.sort==='default')return 0
 const av=convertNutrition(a.verifiedNutrition,{amount:100,unit:f.basis}).values?.[f.sort],bv=convertNutrition(b.verifiedNutrition,{amount:100,unit:f.basis}).values?.[f.sort]
 return av==null?1:bv==null?-1:(av-bv)*(f.direction==='desc'?-1:1)||a.id-b.id
}
export function NutrientConditions({value,onChange,notes={}}:{value:NutrientCondition[];onChange:(v:NutrientCondition[])=>void;notes?:Record<string,ReactNode>}){
 return <div className="nutrient-condition-list">{Object.entries(NUTRIENT_META).map(([key,[label,unit]])=>{const current=value.find(v=>v.nutrient===key);const change=(field:'min'|'max',raw:string)=>{const row={nutrient:key,min:current?.min??null,max:current?.max??null,[field]:raw===''?null:Number(raw)};onChange([...value.filter(v=>v.nutrient!==key),...(row.min===null&&row.max===null?[]:[row])])};return <div key={key}><span>{label} ({unit})</span><input aria-label={`${label} 최소`} type="number" min="0" step="any" placeholder="최소" value={current?.min??''} onChange={e=>change('min',e.target.value)}/><input aria-label={`${label} 최대`} type="number" min="0" step="any" placeholder="최대" value={current?.max??''} onChange={e=>change('max',e.target.value)}/>{current?.min!=null&&current?.max!=null&&current.min>current.max&&<small role="alert">최솟값이 더 큽니다.</small>}{notes[key]}</div>})}</div>
}
export function NutritionFilter({value:f,onChange}:{value:NutrientFilterState;onChange:(f:NutrientFilterState)=>void}){
 return <details className="nutrition-filter"><summary>공식 영양 조건 {f.conditions.length?`· ${f.conditions.length}개`:''}</summary><p>가져온 자료 중 보고번호가 일치하는 상품만 계산합니다.</p><label>비교 기준<select aria-label="영양 비교 기준" value={f.basis} onChange={e=>onChange({...f,basis:e.target.value})}><option value="g">100g당</option><option value="mL">100mL당</option></select></label><label><input type="checkbox" checked={f.verifiedOnly} onChange={e=>onChange({...f,verifiedOnly:e.target.checked})}/> 확정 영양 자료만</label><NutrientConditions value={f.conditions} onChange={conditions=>onChange({...f,conditions})}/><label>영양 정렬<select aria-label="영양 정렬" value={f.sort} onChange={e=>onChange({...f,sort:e.target.value})}><option value="default">사용 안 함</option>{Object.entries(NUTRIENT_META).map(([k,[label]])=><option key={k} value={k}>{label}</option>)}</select></label><select aria-label="영양 정렬 방향" value={f.direction} onChange={e=>onChange({...f,direction:e.target.value})}><option value="desc">높은 순</option><option value="asc">낮은 순</option></select><button type="button" onClick={()=>onChange({...emptyNutrientFilter})}>영양 조건 초기화</button></details>
}
export function NutritionSync({query}:{query:string}){
 const [busy,setBusy]=useState(false),[offset,setOffset]=useState(0),[done,setDone]=useState(false),[message,setMessage]=useState('')
 const requestVersion=useRef(0)
 useEffect(()=>{requestVersion.current++;setOffset(0);setDone(false);setMessage('')},[query])
 async function sync(){const version=requestVersion.current;setBusy(true);try{const response=await fetch('/api/nutrition-sync',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query,offset})}),r=await readJsonResponse(response);window.dispatchEvent(new Event('official-data-updated'));if(version!==requestVersion.current)return;setOffset(r.next);setDone(r.done);setMessage(r.failed?`${r.failed}건 조회 실패 · 다시 누르면 같은 범위를 재시도합니다.`:`${r.total.toLocaleString()}건 중 ${r.next.toLocaleString()}건 조회 · 이번 보고번호 일치 ${r.confirmed}건`)}catch(e){if(version===requestVersion.current)setMessage((e as Error).message)}finally{setBusy(false)}}
 return <div className="nutrition-sync"><div><strong>공식 영양 데이터</strong><small>{message||'검색어에 해당하는 상품을 20개씩 확인하고 모든 화면에 반영합니다.'}</small></div><button type="button" disabled={busy||done} onClick={()=>void sync()}>{busy?'영양 자료 확인 중…':done?'조회 완료':offset?'다음 20개 가져오기':'영양 자료 가져오기'}</button></div>
}
export function VerifiedNutrition({product:p}:{product:Product}){
 const record=p.verifiedNutrition;if(!record)return <p className="nutrition-basis">상품과 일치하는 공식 영양 자료가 아직 없습니다. 원본 영양값은 참고용이며 계산에서 제외합니다.</p>
 return <section className="verified-values"><strong>공식 영양 자료 · {record.basis.text} 기준</strong><dl>{Object.entries(record.nutrients).map(([k,n])=><div key={k}><dt>{n.label}</dt><dd>{n.value==null?'미제공':n.value.toLocaleString('ko-KR')+' '+n.unit}</dd></div>)}</dl><small>식약처 · 보고번호 {record.reportNumber} · 자료 {record.updatedAt||'날짜 미제공'}</small></section>
}
export function VerifiedComparison({products}:{products:Product[]}){
 const [unit,setUnit]=useState('g')
 return <section className="verified-comparison"><h2>같은 기준으로 영양 비교</h2><select aria-label="선택 상품 영양 비교 기준" value={unit} onChange={e=>setUnit(e.target.value)}><option value="g">100g당</option><option value="mL">100mL당</option></select><div className="verified-compare-grid">{products.map(p=>{const r=convertNutrition(p.verifiedNutrition,{amount:100,unit});return <article key={p.id}><h3>{p.name}</h3>{!p.verifiedNutrition?<p>확정 영양 자료 없음</p>:!r.ok?<p>{r.reason}</p>:<><dl>{Object.entries(NUTRIENT_META).map(([k,[label,u]])=><div key={k}><dt>{label}</dt><dd>{r.values?.[k]==null?'미제공':r.values![k].toLocaleString('ko-KR',{maximumFractionDigits:3})+' '+u}</dd></div>)}</dl><small>{r.formula} · 식약처 {r.sourceCode}</small></>}</article>})}</div></section>
}
// 확정 영양 자료가 있는 상품만 1인 하루 통합 기준(3,000kcal) 대비 비율을 보여준다. 기준량이 없거나 g/mL가 다르면 환산하지 않는다.
export function DailyShare({product:p,portion,record:given,unverified}:{product:Product;portion?:number|null;record?:any;unverified?:boolean}){
 const record=given??p.verifiedNutrition;if(!record)return null
 const unit=record.basis?.unit as string,base=convertNutrition(record,{amount:100,unit}),serving=portion&&unit==='g'?convertNutrition(record,{amount:portion,unit:'g'}):null
 if(!base.ok)return null
 const shares=dailyShare(base.values),perServing=serving?.ok?new Map(dailyShare(serving.values).map(r=>[r.nutrient,r])):null
 if(!shares.length)return null
 return <section className="daily-share"><strong>1일 영양 기준 대비 · {DEFAULT_ENERGY.toLocaleString('ko-KR')}kcal</strong><table><thead><tr><th>영양소</th><th>1일 기준</th><th>100{unit}당</th>{perServing&&<th>{portion}g/인</th>}</tr></thead><tbody>{shares.map(r=>{const [label,u]=NUTRIENT_META[r.nutrient as keyof typeof NUTRIENT_META],s=perServing?.get(r.nutrient);return <tr key={r.nutrient}><th scope="row">{label}</th><td>{r.target.toLocaleString('ko-KR')}{u} {r.kind==='limit'?'이하':'이상'}</td><td>{r.percent.toLocaleString('ko-KR')}%</td>{perServing&&<td>{s?s.percent.toLocaleString('ko-KR')+'%':'미제공'}</td>}</tr>})}</tbody></table><small>{base.formula} · 나트륨·당류는 상한 대비, 나머지는 하한 대비입니다. 미제공 영양소는 0으로 계산하지 않았습니다.{unverified&&' 이미지에서 읽은 검증 전 값으로 계산한 참고용 비율입니다.'}</small></section>
}
export function ImageNutrition({product:p,portion}:{product:Product;portion?:number|null}){
 const r=p.imageNutrition;if(!r||p.verifiedNutrition)return null
 return <section className="verified-values image-nutrition"><strong>이미지에서 읽은 영양정보 · {r.basis.text} 기준 · 검증 전</strong><dl>{Object.entries(r.nutrients).map(([k,n])=><div key={k}><dt>{n.label}</dt><dd>{n.value==null?'미확인':n.value.toLocaleString('ko-KR')+' '+n.unit}</dd></div>)}</dl><small>상품 상세 이미지의 영양성분표를 AI가 읽은 값입니다. 오인식 가능성이 있어 식약처 확정 자료가 아니며 비교·식단 계산에는 쓰지 않습니다.{r.grade==='partial'?' 일부 항목만 읽혔습니다.':''} {r.image&&<a href={r.image} target="_blank" rel="noreferrer">원본 이미지 ↗</a>}</small><DailyShare product={p} portion={portion} record={r} unverified/></section>
}
const standardIcons:Record<string,LucideIcon>={protein:Beef,carbs:Wheat,fat:Droplets,sugars:Candy,sodium:Waves,calcium:Bone}
export function StandardSummary(){
 const rows=standardTargets(),energy=rows.find(t=>t.nutrient==='calories')!
 const format=(value:number)=>value.toLocaleString('ko-KR')
 return <section className="standard-summary" aria-label="1인 하루 영양 기준">
  <header className="standard-summary-heading"><div><span className="standard-eyebrow">1인 하루 영양 기준</span><h2>균형 잡힌 하루, 한눈에.</h2></div><p>식재료 선택부터 식단 구성까지<br/>하루 영양 기준을 확인하세요.</p></header>
  <div className="standard-summary-body">
   <div className="standard-energy"><div className="standard-energy-top"><span>하루 열량 기준</span><Flame size={24} strokeWidth={1.6} aria-hidden="true"/></div><div className="standard-energy-value"><strong>{format(energy.min!)}</strong><span>kcal 이상</span></div><p>장병 1인 · 하루 기준</p><div className="standard-energy-caption">든든한 한 끼의 시작,<br/>하루의 균형을 생각합니다.</div></div>
   <ul className="standard-nutrient-grid">{rows.filter(t=>t.nutrient!=='calories').map(t=>{
    const [label,unit]=NUTRIENT_META[t.nutrient as keyof typeof NUTRIENT_META],Icon=standardIcons[t.nutrient]
    const range=t.min!=null&&t.max!=null
    const value=range?`${format(t.min!)}–${format(t.max!)}`:format((t.min??t.max)!)
    return <li key={t.nutrient} className={t.min==null?'standard-nutrient is-limit':'standard-nutrient'} aria-label={describeTarget(t)}><div className="standard-nutrient-top"><span className="standard-nutrient-icon"><Icon size={18} strokeWidth={1.7} aria-hidden="true"/></span><span>{label}</span><small>{range?'섭취 범위':t.min==null?'상한 기준':'하한 기준'}</small></div><div className="standard-nutrient-value"><strong>{value}</strong><span>{unit}{range?'':t.min==null?' 이하':' 이상'}</span></div></li>
   })}</ul>
  </div>
  <p className="standard-summary-note"><Info size={16} aria-hidden="true"/><span>국방부·식약처·보건복지부 통합 기준<span className="standard-note-divider" aria-hidden="true"> · </span><span className="standard-note-help">상품 상세에서 기준 대비 비율을 확인할 수 있어요.</span></span></p>
 </section>
}
