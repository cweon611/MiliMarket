import {useEffect,useRef,useState,type ReactNode} from 'react'
import type {Product} from './data'
import {NUTRIENT_META,convertNutrition,evaluateNutrition} from '../shared/nutrition.mjs'
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
 async function sync(){const version=requestVersion.current;setBusy(true);try{const response=await fetch('/api/nutrition-sync',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query,offset})}),r=await response.json();if(!response.ok)throw new Error(r.error);window.dispatchEvent(new Event('official-data-updated'));if(version!==requestVersion.current)return;setOffset(r.next);setDone(r.done);setMessage(r.failed?`${r.failed}건 조회 실패 · 다시 누르면 같은 범위를 재시도합니다.`:`${r.total.toLocaleString()}건 중 ${r.next.toLocaleString()}건 조회 · 이번 보고번호 일치 ${r.confirmed}건`)}catch(e){if(version===requestVersion.current)setMessage((e as Error).message)}finally{setBusy(false)}}
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
