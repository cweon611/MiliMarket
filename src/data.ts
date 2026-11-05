export interface Product {
  verifiedNutrition?:import('./PublicData').NutritionRecord|null
  officialNutritionState?:string
  // 상품 상세 이미지에서 읽은 영양 정보(검증 전). 비교·식단 계산에는 쓰지 않고 상세 화면에만 표기한다.
  imageNutrition?:{basis:{text:string;amount:number;unit:string};grade:'full'|'partial';image:string|null;extractedAt:string;model:string;nutrients:Record<string,{label:string;unit:string;value:number|null}>}|null
  market?: MarketInfo
  id: number; name: string; category: string; subcategory: string
  foodType: string; ingredients: string; reportNumber: string
  manufacturer: string; origin: string; specType: string; purchaseMethod: string
  weightPerUnit: string; packGrams: number | null; unitPrice: number | null
  pricePerKg: number | null; perPersonGram: number | null; calories: number | null
  protein: number | null; fat: number | null; carbs: number | null
  sugars: number | null; sodium: number | null; calcium: number | null
  tags: string[]; nutritionBasis: string; sourceRow: number
  rawNutrition: Record<string, string>
}
export interface MarketInfo {
  labelImageUrl?: string | null; name: string; unitPrice: number | null; imageUrl: string | null; unit: string
  packGrams: number | null; supplier: string; origin: string; purchaseMethod: string
  category: string; itemType: string; collectedAt: string; contractEnd: string
  sourceUrl: string; sourceName: string; delivery: string; region: string
  offerCount: number; saleStart: string | null; saleEnd: string | null
  discount: string | null; originalPrice: number | null; minimumOrder: number | null
}
export const marketPrice = (p: Product) => p.market?.unitPrice ?? null
export const marketKgPrice = (p: Product) => p.market?.packGrams && marketPrice(p) !== null ? marketPrice(p)! / p.market.packGrams * 1000 : null
export const priceLabel = (p: Product, quote: QuoteInputs) => quote.price === null ? '단가 입력 필요' : p.market && quote.price === p.market.unitPrice ? '나라장터 조회 단가' : '직접 입력한 단가'
// Formatting a KST date is slow; reuse it for a minute instead of formatting once per product.
const kstFormat = new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Seoul'})
let cachedToday = {at: 0, value: ''}
export function todayKST() {
  const now = Date.now()
  if (now - cachedToday.at > 60_000) cachedToday = {at: now, value: kstFormat.format(now)}
  return cachedToday.value
}
export function saleStatus(p: Product, today?: string): 'active' | 'upcoming' | null {
  const m = p.market
  if (!m?.saleStart || !m.saleEnd || !m.discount) return null
  today ??= todayKST()
  if (!m?.saleStart || !m.saleEnd || !m.discount || m.saleEnd < today) return null
  return m.saleStart <= today ? 'active' : 'upcoming'
}
export const CATEGORIES = ['전체', '육류', '수산물', '두류/채소', '곡류', '유제품', '가공식품', '기타']
export const SPEC_TYPES = ['전체', '냉동', '냉장', '상온', '미제공']
export const formatValue = (value: number | null, unit = '') => value === null ? '미제공' : value.toLocaleString('ko-KR', {maximumFractionDigits: 3}) + unit
export const hasNutrition = (p: Product) => [p.protein, p.fat, p.carbs, p.sugars, p.sodium, p.calcium].some(v => v !== null)
export function nutritionRows(p: Product): [string, string][] {
  return [['단백질', formatValue(p.protein, ' g')], ['지방', formatValue(p.fat, ' g')], ['탄수화물', formatValue(p.carbs, ' g')], ['당류', formatValue(p.sugars, ' g')], ['나트륨', formatValue(p.sodium, ' mg')], ['칼슘', formatValue(p.calcium, ' mg')]]
}
export interface QuoteInputs { portion: number | null; pack: number | null; price: number | null; mode?: 'weight' | 'count'; unitsPerPerson?: number | null }
export const saleUnit = (p: Product) => p.market?.unit || '판매단위'
export function isIndividualServing(p: Product) {
  const name = p.market?.name || ''
  return p.market?.unit === '개' && /두유|우유|음료|사발|컵라면/.test(name)
    && !/[×*]|\d\s*[xX]\s*\d|\d+\s*(개입|입|팩입|봉입)|박스|묶음|세트/.test(name)
    && ((p.market.packGrams !== null && p.market.packGrams <= 300) || /(?:^|[^\d.])(?:[1-2]?\d{1,2}|300)\s*m[lL]/.test(name))
}
export const servingLabel = (p: Product, q: QuoteInputs) => q.mode === 'count' ? formatValue(q.unitsPerPerson ?? null, ' '+saleUnit(p)+'/인') : formatValue(q.portion, 'g/인')
export const defaultQuote = (p: Product): QuoteInputs => ({portion: null, pack: p.market ? p.market.packGrams : p.packGrams, price: marketPrice(p), ...(isIndividualServing(p) ? {mode: 'count' as const, unitsPerPerson: 1} : {})})
export function calculateOrder(people: number, quote: QuoteInputs) {
  const positive = (n: number | null): n is number => n !== null && Number.isFinite(n) && n > 0
  if (quote.mode === 'count') {
    const units = quote.unitsPerPerson ?? null
    const needed = positive(people) && positive(units) ? people * units : null
    const packs = needed === null ? null : Math.max(1, Math.ceil(needed - 1e-9))
    const total = packs !== null && positive(quote.price) ? packs * quote.price : null
    return {needed, packs, total}
  }
  const needed = positive(people) && positive(quote.portion) ? people * quote.portion : null
  const packs = needed !== null && positive(quote.pack) ? Math.ceil(needed / quote.pack) : null
  const total = packs !== null && positive(quote.price) ? packs * quote.price : null
  return {needed, packs, total}
}
export function parseInput(value: string): number | null {
  const n = Number(value)
  return value.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null
}

