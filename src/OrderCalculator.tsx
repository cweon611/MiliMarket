import { Calculator, ArrowRight, X } from 'lucide-react'
import { calculateOrder, formatValue, saleUnit, priceLabel, type Product, type QuoteInputs } from './data'

import { QuoteFields } from './QuoteFields'

const MAX_PEOPLE = 100000, PEOPLE_STEP = 500
export const clampPeople = (n: number) => Math.max(1, Math.min(MAX_PEOPLE, Math.floor(n) || 1))
// −500 / +500 buttons around the head-count input; shared by the calculator and the order review page.
export function PeopleStepper({people, onChange, id}: {people: number; onChange: (n: number) => void; id?: string}) {
  return <div className="people-stepper">
    <button type="button" aria-label="급식 인원 500명 줄이기" disabled={people <= 1} onClick={() => onChange(clampPeople(people - PEOPLE_STEP))}>−500</button>
    <span className="people-field"><input id={id} type="text" inputMode="numeric" autoComplete="off" value={people.toLocaleString('ko-KR')} onChange={e => onChange(clampPeople(Number(e.target.value.replace(/[^\d]/g, ''))))}/><span>명</span></span>
    <button type="button" aria-label="급식 인원 500명 늘리기" disabled={people >= MAX_PEOPLE} onClick={() => onChange(clampPeople(people + PEOPLE_STEP))}>+500</button>
  </div>
}

interface Props {
  product: Product; people: number; quote: QuoteInputs
  onQuoteChange: (quote: QuoteInputs) => void
  onPeopleChange: (people: number) => void
  onClose?: () => void; onDetail?: () => void; onReview: () => void
}
export function OrderCalculator({product, people, quote, onQuoteChange, onPeopleChange, onClose, onDetail, onReview}: Props) {
  const {needed, packs, total} = calculateOrder(people, quote)
  return <section className="calculator-panel" aria-labelledby="calculator-title">
    <header className="calculator-heading"><span><Calculator size={22}/><h2 id="calculator-title">스마트 발주 계산기</h2></span>{onClose && <button aria-label="계산기 닫기" onClick={onClose}><X size={21}/></button>}</header>
    <div className="calculator-product"><small>물품식별번호 {product.id}</small><h3>{product.name}</h3><p>제품명 표기 규격: {product.weightPerUnit}</p></div>
    <div className="calculator-inputs people-inputs"><label htmlFor="calculator-people">급식 인원</label><PeopleStepper id="calculator-people" people={people} onChange={onPeopleChange}/></div>
    <div className="people-presets" aria-label="급식 인원 빠른 선택">{[1000, 5000, 10000].map(n => <button key={n} className={people === n ? 'active' : ''} onClick={() => onPeopleChange(n)}>{n.toLocaleString('ko-KR')}명</button>)}</div>
    <QuoteFields product={product} quote={quote} onChange={onQuoteChange}/>
    <p className="calculator-note">{product.market && <>{priceLabel(product,quote)} · {product.market.unit}당 · 조회 {product.market.collectedAt.slice(0,10)}<br/></>}{quote.mode === 'count' ? '개수 계산은 판매 단위당 단가를 적용합니다.' : '중량은 판매 규격에서 추출한 참고값입니다. 단가의 판매 단위와 중량을 확인해 주세요.'}</p>
    <div className="calculator-results" aria-live="polite"><dl><div><dt>{quote.mode==='count'?'필요 수량':'필요 중량'}</dt><dd>{needed === null ? '제공량 입력 필요' : quote.mode==='count'?formatValue(needed,' '+saleUnit(product)):formatValue(needed / 1000, ' kg')}</dd></div><div><dt>발주 수량 <small>포장 단위 올림</small></dt><dd>{packs === null ? '제공량 입력 필요' : formatValue(packs, ' '+(product.market?.unit || '팩'))}</dd></div></dl><div className="calculator-total"><span>예상 상품 금액</span><strong>{total === null ? '입력 필요' : formatValue(total, '원')}</strong></div></div>
    <p className="calculator-note">{packs !== null && (quote.mode==='count' ? quote.unitsPerPerson + saleUnit(product) + ' × ' + people.toLocaleString('ko-KR') + '명 = ' + packs.toLocaleString('ko-KR') + saleUnit(product) + ' (올림). ' : quote.portion + 'g × ' + people.toLocaleString('ko-KR') + '명 ÷ ' + quote.pack + 'g = ' + packs.toLocaleString('ko-KR') + saleUnit(product) + ' (올림). ')}적용 단가 기준이며 배송비는 제외됩니다. 제공량·중량은 이 브라우저에 저장되며 단가는 새로고침 시 조회값으로 돌아갑니다. 실제 주문은 전송되지 않습니다.</p>
    <>{packs!==null && product.market?.minimumOrder && packs<product.market.minimumOrder ? <p className="filter-error">계산 수량이 공급업체 최소 주문량 {product.market.minimumOrder}{product.market.unit}보다 적습니다.</p> : null}</><div className="calculator-actions">{onDetail && <button className="calculator-detail" onClick={onDetail}>상세페이지 보기</button>}<button className="primary" onClick={onReview}>발주 검토에 담기 <ArrowRight size={16}/></button></div>
  </section>
}

