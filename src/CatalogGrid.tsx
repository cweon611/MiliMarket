import {ProductCardName} from './ProductCardName'
import {ProductImage} from './ProductImage'
import {categoryLabel} from './category-label'
import {usePriceUnit} from './PriceUnit'
import {massPrice} from '../shared/price.mjs'
import {Check,GitCompareArrows,Maximize2,MousePointerClick} from 'lucide-react'
import {formatValue,marketPrice,marketKgPrice,saleStatus,type Product} from './data'
import {gramPrice} from '../shared/catalog.mjs'
const money=(n:number)=>n.toLocaleString('ko-KR')
function listFacts(p: Product, unit:'g'|'kg'): [string, string][] {
  const m = p.market, kg = marketKgPrice(p)
  const nutrition = [p.calories !== null && `${formatValue(p.calories)}kcal`, p.protein !== null && `단백질 ${formatValue(p.protein, 'g')}`, p.sodium !== null && `나트륨 ${formatValue(p.sodium, 'mg')}`].filter(Boolean).join(' · ')
  const facts: [string, string | null | undefined][] = [
    ['분류', [categoryLabel(p.category), categoryLabel(p.subcategory)].filter(v => v && v !== '미제공').join(' › ')],
    ['보관', p.specType],
    ['원산지', m?.origin || p.origin],
    ['제조사', p.manufacturer],
    ['구매방식', m?.purchaseMethod || p.purchaseMethod],
    ['납품지역', m?.region],
    ['배송', m?.delivery],
    ['최소주문', m?.minimumOrder ? `${money(m.minimumOrder)}${m.unit}` : null],
    [`${unit}당 가격`, kg !== null ? `${formatValue(massPrice(kg/1000,unit))}원` : null],
    ['계약종료', m?.contractEnd],
    ['영양', nutrition],
  ]
  return facts.filter((f): f is [string, string] => !!f[1] && f[1] !== '미제공')
}
interface Props {
  visibleProducts: Product[]
  calculator: Product | null
  selected: number[]
  columns: 1 | 2 | 4
  clickProduct: (product: Product, count: number) => void
  openDetail: (product: Product) => void
  toggle: (id: number) => void
  cancelProductClick: () => void
}

export function CatalogGrid({visibleProducts, calculator, selected, columns, clickProduct, openDetail, toggle, cancelProductClick}: Props) {
  const {unit, price: displayPrice} = usePriceUnit()
  const selectedIds = new Set(selected)
  return <div className="product-grid">
    {visibleProducts.map(product => {
      const selected = selectedIds.has(product.id)
      const price = marketPrice(product)
      const perGram = gramPrice(product)
      return <article
        className={`product-card${calculator?.id === product.id ? ' calculator-selected' : ''}`}
        key={product.id}
        onClick={event => clickProduct(product, event.detail)}
        onDoubleClick={() => openDetail(product)}
      >
        <div className="art-wrap">
          <button className="art-button" aria-label={`${product.name} 스마트 발주 계산기 열기`}>
            <ProductImage key={product.id} product={product}/>
            <span className="storage">{saleStatus(product) === 'active' ? `할인 ${product.market?.discount}` : product.specType === '미제공' ? categoryLabel(product.category) : product.specType}</span>
          </button>
          <span className="card-hover-hint" aria-hidden="true"><MousePointerClick size={11}/>더블클릭 <b>상세</b></span>
          <button
            type="button"
            className="detail-open-button"
            aria-label={`${product.name} 상세 페이지 보기`}
            onClick={event => { event.stopPropagation(); cancelProductClick(); openDetail(product) }}
            onDoubleClick={event => event.stopPropagation()}
          ><Maximize2 size={12}/>상세보기</button>
        </div>
        <div className="product-info">
          <div className="manufacturer">{product.market?.supplier || `식별번호 ${product.id}`}</div>
          <ProductCardName product={product}/>
          {columns === 1 && <>
            <p className="list-ingredients">원재료: {product.ingredients}</p>
            <dl className="list-facts">{listFacts(product, unit).map(([label, value]) =>
              <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
            )}</dl>
          </>}
          <div className="price">
            <strong>{price === null ? '가격 미확인' : formatValue(price, '원')}</strong>
            {perGram !== null && <span className="g-price">{unit}당 {formatValue(displayPrice(perGram), '원')}</span>}
          </div>
          <button
            className={`compare-button ${selected ? 'checked' : ''}`}
            onClick={event => { event.stopPropagation(); cancelProductClick(); toggle(product.id) }}
            onDoubleClick={event => event.stopPropagation()}
          >
            {selected ? <Check size={15}/> : <GitCompareArrows size={15}/>}
            {selected ? ' 비교함에 담김' : ' 비교함에 담기'}
          </button>
        </div>
      </article>
    })}
  </div>
}
