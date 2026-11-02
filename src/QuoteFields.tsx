import { useId } from 'react'
import { parseInput, saleUnit, type Product, type QuoteInputs } from './data'
import './quote-fields.css'

export function QuoteFields({product:p, quote:q, onChange}: {product:Product;quote:QuoteInputs;onChange:(q:QuoteInputs)=>void}) {
  const id = useId()
  const count = q.mode === 'count'
  const unit = saleUnit(p)
  const fields: {key:'portion'|'pack'|'price'|'unitsPerPerson';label:string;unit:string}[] = count
    ? [{key:'unitsPerPerson',label:'1인 제공 수량',unit}, {key:'price',label:'판매 단위 단가',unit:'원'}]
    : [{key:'portion',label:'1인 배식량',unit:'g'},{key:'pack',label:'판매 단위 중량',unit:'g'},{key:'price',label:'판매 단위 단가',unit:'원'}]
  return <div className="quote-editor">
    <div className="quote-modes" role="group" aria-label="발주 계산 방식">
      <button type="button" aria-pressed={!count} onClick={()=>onChange({...q,mode:'weight'})}>중량으로 계산</button>
      <button type="button" aria-pressed={count} onClick={()=>onChange({...q,mode:'count',unitsPerPerson:q.unitsPerPerson ?? 1})}>개수로 계산</button>
    </div>
    <p className="quote-hint">{count ? `1인당 ${q.unitsPerPerson ?? '입력한 수량'}${unit} 기준 · 중량 입력 없이 계산합니다. 판매 단위가 박스라면 박스 수량입니다.` : '배식량을 선택하거나 입력하세요. 중량은 판매 규격에서 가져옵니다.'}</p>
    <div className="quote-presets" role="group" aria-label={count?'제공 수량 빠른 선택':'배식량 빠른 선택'}>
      {(count ? [0.5,1,2] : [50,100,150,200,250]).map(n=><button type="button" key={n} aria-pressed={(count?q.unitsPerPerson:q.portion)===n} onClick={()=>onChange({...q,[count?'unitsPerPerson':'portion']:n})}>{count?`1인 ${n}${unit}`:`${n}g`}</button>)}
    </div>
    <div className="quote-input-grid">{fields.map(f=><label key={f.key} htmlFor={`${id}-${f.key}`}>{f.label} ({f.unit})<input id={`${id}-${f.key}`} type="number" min="0" step="any" placeholder="입력 필요" value={q[f.key] ?? ''} onChange={e=>onChange({...q,[f.key]:parseInput(e.target.value)})}/></label>)}</div>
    {count && <p className="quote-hint">제공 수량은 편의를 위한 설정이며 공식 배식 기준이 아닙니다.</p>}
  </div>
}
