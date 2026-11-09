import {categoryLabel} from './category-label'
import {PriceUnitToggle,usePriceUnit} from './PriceUnit'
import {VerifiedNutrition,DailyShare,ImageNutrition} from './NutritionTools'
import { useEffect, useId, useState, type ReactNode, type KeyboardEvent } from 'react'
import { ArrowLeft, GitCompareArrows, ClipboardList } from 'lucide-react'
import { formatValue, servingLabel, nutritionRows, marketPrice, marketKgPrice, priceLabel, saleStatus, type Product, type QuoteInputs } from './data'
import { OrderCalculator } from './OrderCalculator'
import './product-detail.css'
import {ProductGallery, AlternativeProducts} from './ProductExtras'
import {gramPrice} from '../shared/catalog.mjs'
import {ProductPublicData} from './PublicData'
interface Props {
  backLabel?:string; products: Product[]; onChoose: (p:Product)=>void; onComparePair:(p:Product)=>void; product: Product; image: ReactNode; people: number; quote: QuoteInputs
  onPeopleChange: (n: number) => void; onQuoteChange: (q: QuoteInputs) => void
  onBack: () => void; onCompare: () => void; onReview: () => void
}
const detailTabs = [['product','제품 정보'],['nutrition','영양 정보'],['purchase','구매·계약 정보']] as const
type DetailTab = typeof detailTabs[number][0]

export function ProductDetail({backLabel, products, onChoose, onComparePair, product: p, image, people, quote, onPeopleChange, onQuoteChange, onBack, onCompare, onReview}: Props) {
  const {unit,price}=usePriceUnit()
  const [activeTab,setActiveTab]=useState<DetailTab>('product')
  const [calculatorOpen,setCalculatorOpen]=useState(false)
  const tabId=useId()
  useEffect(()=>{setActiveTab('product');setCalculatorOpen(false)},[p.id])
  function moveTab(event:KeyboardEvent<HTMLButtonElement>,current:DetailTab) {
    const index=detailTabs.findIndex(([value])=>value===current)
    const next=event.key==='ArrowRight'?(index+1)%detailTabs.length:event.key==='ArrowLeft'?(index+detailTabs.length-1)%detailTabs.length:event.key==='Home'?0:event.key==='End'?detailTabs.length-1:null
    if(next===null)return
    event.preventDefault()
    setActiveTab(detailTabs[next][0])
    document.getElementById(`${tabId}-tab-${detailTabs[next][0]}`)?.focus()
  }
  return <section className="product-detail-page">
    <div className="detail-toolbar"><button className="detail-back" onClick={onBack}><ArrowLeft size={16}/> {backLabel||'검색 결과로'}</button><div><button className="detail-outline" onClick={onCompare}><GitCompareArrows size={15}/> 다른 상품과 비교</button><button className="primary" onClick={onReview}><ClipboardList size={15}/> 발주 검토</button></div></div>
    <div className="detail-layout">
        <header className="detail-summary-body"><div className="detail-tags">{p.tags.filter(Boolean).map(t => <span key={t}>{categoryLabel(t)}</span>)}</div><h1>{p.name}</h1><p className="detail-maker">물품식별번호 {p.id}</p><dl className="detail-quick-facts">{[['제조사',p.manufacturer],['규격',p.weightPerUnit],['보관 방식',p.specType]].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v || '미제공'}</dd></div>)}</dl></header>
      <section className="detail-box detail-price-section"><h2>구매 단가 정보</h2><PriceUnitToggle/><div className="detail-price-box"><span>{p.market ? '나라장터 조회 단가' : '조회 가격 미확인'}</span><strong>{formatValue(marketPrice(p), '원')}</strong><p>{p.market ? `${p.market.unit}당 · ${p.market.offerCount>1?'복수 공급 중 최저 표시단가':'조회 시점 가격'}` : '계산기에 단가를 직접 입력해 주세요.'}</p></div><dl><div><dt>{unit}당 환산 단가</dt><dd>{formatValue(price(gramPrice(p)), `원 / ${unit}`)}</dd></div><div><dt>1인 제공량 (설정값)</dt><dd>{servingLabel(p,quote)}</dd></div></dl><p className="detail-price-note">{p.market ? `조회일 ${p.market.collectedAt.slice(0,10)} · 계약종료 ${p.market.contractEnd || '미확인'}. 공급 지역과 인도 조건에 따라 구매 가능 여부를 확인해 주세요.` : '원본 엑셀에는 가격이 없습니다. 조회되지 않은 상품은 직접 단가를 입력할 수 있습니다.'}</p></section>
      <div className="detail-main-column">
        <section className="detail-box detail-summary"><ProductGallery product={p} image={image}/></section>
    <div className="detail-information">
      <div className="detail-tab-list" role="tablist" aria-label="상품 상세 정보">{detailTabs.map(([value,label])=><button key={value} id={`${tabId}-tab-${value}`} type="button" role="tab" aria-selected={activeTab===value} aria-controls={`${tabId}-panel-${value}`} tabIndex={activeTab===value?0:-1} onClick={()=>setActiveTab(value)} onKeyDown={e=>moveTab(e,value)}>{label}</button>)}</div>
      <div key={p.id}>
        <div className="detail-tab-panel" role="tabpanel" id={`${tabId}-panel-product`} aria-labelledby={`${tabId}-tab-product`} hidden={activeTab!=='product'} tabIndex={0}>
      <section className="detail-box"><h2>제품 사양</h2><dl>{[['분류 (자동)',categoryLabel(p.category)],['식품유형 (원본)',p.foodType],['품목제조보고번호',p.reportNumber],['제조사',p.manufacturer],['원산지',p.market?.origin || p.origin],['제품명 표기 규격',p.weightPerUnit],['보관 방식 (문구 추출)',p.specType],['구매 방식',p.market?.purchaseMethod || p.purchaseMethod]].map(([k,v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl><details className="detail-disclosure ingredients-block"><summary>원재료명 원문 보기</summary><p>{p.ingredients}</p></details></section>
      <details className="detail-box detail-disclosure"><summary>데이터 출처 보기</summary><p className="nutrition-basis">1. 통합본_최종.xlsx + 2. 통합본_DB적용.xlsx<br/>DB 적용본 {p.sourceRow}행 · 식별번호 {p.id}<br/>식품유형 기반 자동분류이며 실시간 조달 정보가 아닙니다.</p></details>
        </div>
        <div className="detail-tab-panel" role="tabpanel" id={`${tabId}-panel-nutrition`} aria-labelledby={`${tabId}-tab-nutrition`} hidden={activeTab!=='nutrition'} tabIndex={0}>
          <section className="detail-box"><h2>영양 정보</h2><VerifiedNutrition product={p}/><DailyShare product={p} portion={quote.mode==='count'?null:quote.portion}/><ImageNutrition product={p} portion={quote.mode==='count'?null:quote.portion}/></section>
<details className="detail-box detail-disclosure"><summary>DB 적용 영양성분 원문 보기</summary><p className="section-caption">2. 통합본_DB적용.xlsx · 원본 수치</p><dl>{nutritionRows(p).map(([k,v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl><p className="nutrition-basis">기준 중량이 제공되지 않아 100g당 또는 1인분 값으로 해석할 수 없습니다. 미제공은 0과 다르며 배식량에 따라 환산하지 않습니다. DB 매칭 결과의 적합성은 별도 확인이 필요합니다.</p></details>
      <details className="detail-box detail-disclosure"><summary>최종본 영양성분 원문 보기</summary><p className="section-caption">1. 통합본_최종.xlsx · 정리 전 표현 보존</p><dl>{Object.entries(p.rawNutrition).map(([k,v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl><p className="nutrition-basis">미만 표기와 텍스트를 원문 그대로 표시합니다. 단위나 수치가 불명확한 표현은 계산에 사용하지 않습니다.</p></details>
        </div>
        <div className="detail-tab-panel" role="tabpanel" id={`${tabId}-panel-purchase`} aria-labelledby={`${tabId}-tab-purchase`} hidden={activeTab!=='purchase'} tabIndex={0}>
{p.market && <section className="detail-box market-source"><h2>나라장터 조회 정보</h2><p className="section-caption">물품식별번호 {p.id} 일치</p><h3>{p.market.name}</h3><dl>{[['계약업체',p.market.supplier],['원산지',p.market.origin],['조달 분류',categoryLabel(p.market.category)],['판매 단위',p.market.unit],['계약 방식',p.market.purchaseMethod],['인도 조건',p.market.delivery],['공급 지역',p.market.region],['최소 주문량',p.market.minimumOrder===null?'별도 표시 없음':formatValue(p.market.minimumOrder,p.market.unit)],['행사',saleStatus(p)==='active'?`할인 ${p.market.discount}`:saleStatus(p)==='upcoming'?'할인 예정':'확인된 행사 없음']].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>{p.market.saleStart && <p className="nutrition-basis">행사 기간 {p.market.saleStart} ~ {p.market.saleEnd}</p>}<a href={p.market.sourceUrl} target="_blank" rel="noreferrer">나라장터에서 식별번호로 확인 ↗</a><p className="nutrition-basis">계산기 적용 기준: {priceLabel(p,quote)}. 원본 엑셀과 조회 정보의 상품명·규격이 다르면 최신 판매 규격을 확인해 주세요.</p></section>}
          <ProductPublicData id={p.id}/>
        </div>
      </div>
    </div>
      </div>
        <div className={`detail-box detail-calculator ${calculatorOpen?'is-open':''}`}><button type="button" className="detail-calculator-toggle" aria-expanded={calculatorOpen} aria-controls={`${tabId}-calculator`} onClick={()=>setCalculatorOpen(open=>!open)}><span>{calculatorOpen?'발주 계산기 접기':'발주 계산기 열기'}</span><span aria-hidden="true">{calculatorOpen?'−':'+'}</span></button><div id={`${tabId}-calculator`} className="detail-calculator-content"><OrderCalculator compact product={p} people={people} quote={quote} onPeopleChange={onPeopleChange} onQuoteChange={onQuoteChange} onReview={onReview}/></div></div>
    </div>
    <AlternativeProducts products={products} current={p} onChoose={onChoose} onCompare={onComparePair}/>
  </section>
}

