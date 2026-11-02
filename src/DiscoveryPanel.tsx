import {useMemo,type ReactNode} from 'react'
import {type Product} from './data'
import {emptyDiscovery,matchesDiscovery,productCompanies,type DiscoveryFilters} from './discovery'
interface Props {products:Product[];value:DiscoveryFilters;onChange:(v:DiscoveryFilters)=>void;more?:ReactNode;moreActive?:number}
// 기본 필터는 업체(제조사·계약업체)·포장 단위·원재료·가격(카테고리는 상단). 나머지는 '필터 자세히 보기'에 둔다.
export function DiscoveryPanel({products,value:f,onChange,more,moreActive=0}:Props){
 const set=(key:keyof DiscoveryFilters,value:string)=>onChange({...f,[key]:value})
 const select=(key:keyof DiscoveryFilters,label:string,values:string[]) => {
   const base=products.filter(p=>matchesDiscovery(p,{...f,[key]:emptyDiscovery[key]}))
   const choices=Array.from(new Set([...values,f[key]]))
     .map(value=>({value,count:value==='전체'?base.length:base.filter(p=>matchesDiscovery(p,{...emptyDiscovery,[key]:value})).length}))
     .filter(o=>o.value==='전체'||o.value===f[key]||o.count>0)
   return <label className="discovery-select">{label}<select aria-label={label} value={f[key]} onChange={e=>set(key,e.target.value)}>{choices.map(o=><option key={o.value} value={o.value}>{o.value} ({o.count.toLocaleString()}건)</option>)}</select></label>
 }
 const supplierChoices=useMemo(()=>{
   const counts=new Map<string,number>()
   for(const p of products.filter(p=>matchesDiscovery(p,{...f,company:''})))for(const c of productCompanies(p))counts.set(c,(counts.get(c)||0)+1)
   return [...counts].sort((a,b)=>b[1]-a[1])
 },[products,f])
 const input=(key:keyof DiscoveryFilters,label:string,placeholder:string)=><label className="discovery-select">{label}<input aria-label={label} placeholder={placeholder} value={f[key]} onChange={e=>set(key,e.target.value)}/></label>
 const hiddenActive=moreActive+(f.event!=='전체'?1:0)+(f.availability!=='전체'?1:0)
 return <div className="discovery-panel">
 <details open><summary>업체</summary>{input('company','업체 검색','제조사·계약업체명 입력')}<div className="supplier-facets" aria-label="검색 결과의 업체">{supplierChoices.slice(0,8).map(([name,count])=><button key={name} aria-pressed={f.company===name} onClick={()=>set('company',f.company===name?'':name)}><span>{name}</span><small>{count}</small></button>)}</div><p className="discovery-hint">제조사와 계약업체를 함께 찾습니다.</p></details>
 <details open><summary>포장 단위</summary>{select('packSize','포장 중량',['전체','1kg 미만','1–3kg','3kg 초과'])}<p className="discovery-hint">중량이 확인된 판매 규격만 적용합니다. mL는 g으로 환산하지 않습니다.</p></details>
 <details open><summary>원재료</summary>{input('ingredient','포함 원재료','예: 소고기')}{input('excludeIngredient','제외 원재료','예: 돼지고기')}<p className="discovery-hint">원문 포함 여부로 조회합니다. 제외 시 원재료 미제공 상품도 제외됩니다.</p></details>
 <details open><summary>가격</summary><label className="discovery-select">가격 비교 기준<select aria-label="가격 비교 기준" value={f.priceBasis} onChange={e=>set('priceBasis',e.target.value)}><option value="unit">판매 단위 가격</option><option value="g">g당 환산 가격</option><option value="kg">kg당 환산 가격</option></select></label><div className="price-range"><label>최소<input aria-label="최소 가격" type="number" min="0" step="any" value={f.minPrice} placeholder="0" onChange={e=>set('minPrice',e.target.value)}/></label><span>~</span><label>최대<input aria-label="최대 가격" type="number" min="0" step="any" value={f.maxPrice} placeholder="제한 없음" onChange={e=>set('maxPrice',e.target.value)}/></label></div>{f.minPrice!==''&&f.maxPrice!==''&&Number(f.minPrice)>Number(f.maxPrice)&&<p className="filter-error" role="alert">최소 가격이 최대 가격보다 큽니다.</p>}<p className="discovery-hint">{f.priceBasis==='g'?'원/g':f.priceBasis==='kg'?'원/kg':'원/판매단위'} 기준. 가격 미확인 상품은 가격 조건 적용 시 제외됩니다.</p></details>
 <details className="more-filters" open={hiddenActive>0||undefined}><summary>필터 자세히 보기{hiddenActive>0&&<b> · {hiddenActive}개 적용 중</b>}</summary>
  <div className="more-filter-block"><h4>행사 · 자료 제공</h4>{select('event','행사 · 할인',['전체','진행 중 할인','예정된 할인'])}{select('availability','자료 제공 여부',['전체','가격 있음','사진 있음','가격·사진 모두','가격 미확인'])}</div>
  {more}</details>
 <button className="discovery-reset" onClick={()=>onChange({...emptyDiscovery})}>추가 필터 초기화</button></div>
}

