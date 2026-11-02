import {createCatalogSearch} from './search.mjs'
export {createCatalogSearch} from './search.mjs'
// The 13 groups transcribed from the supplied revision deck (slide 7).
export const CATEGORY_TYPES = {
  '가루/조미료/오일': ['가공소금및정제소금','고춧가루및실고추','밀가루','복합조미식품','설탕','소금','식물성기름','유지식물류','향미유','향신료가공품'],
  '국/탕류': ['국탕류'],
  '김치류': ['갓김치','깍두기','배추김치','백김치','열무김치','오이소박이김치','총각김치','파김치'],
  '두부류': ['두부류','콩류가공품'],
  '분식류': ['냉동만두','냉동밥류','떡','면류'],
  '빵식류': ['건빵','냉동빵','상온보관용빵','케이크또는파이또는페이스트리','케이크또는파이또는패스트리','쿠키'],
  '수육류': ['베이컨류','소시지류','순대','식육가공품','식육함유가공품','알가공품','양념육류','햄류'],
  '양념/소스류': ['당시럽','드레싱','식초','엿류','요리용소스','잼류','카레','토마토케첩'],
  '어패류': ['새우패티','수산물가공품','어육가공품','조개통조림','조미김','참치통조림'],
  '음료류': ['가공우유','두유음료','발효유류','상온주스','스포츠음료또는에너지음료','차음료','청량음료','커피음료'],
  '장류': ['간장','고추장','된장','청국장','혼합장'],
  '특수식량': ['장기보존도시락','전투식량','즉석건조식품'],
  '기타': ['가공치즈','간편조리세트','기타즉석조리식품','냉동감자','단무지','땅콩또는견과류가공품','묵류','빙과류','아이스크림류','자연치즈','젤리류','조리된곡물'],
}
export const CATEGORY_NAMES = ['전체', ...Object.keys(CATEGORY_TYPES)]
export const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, '')
const typeCategory = new Map(Object.entries(CATEGORY_TYPES).flatMap(([c, types]) => types.map(t => [normalize(t), c])))
// 엑셀 원본의 분류명이 나라장터 세부품명과 다른 경우만 연결한다. 상품명으로 분류를 추정하지 않는다.
const EXCEL_TYPE_ALIASES = {'김치':'김치류','빵류':'빵식류','만두':'분식류','갈비가공품':'수육류','고춧가루':'가루/조미료/오일','커피':'음료류'}
for (const [t, c] of Object.entries(EXCEL_TYPE_ALIASES)) typeCategory.set(normalize(t), c)
export function classify(p) {
  for (const v of [p.market?.itemType, p.name?.split(',')[0], p.subcategory, p.foodType?.split('(')[0]]) {
    const c = typeCategory.get(normalize(v))
    if (c) return {category:c, subcategory:v, classification:'품명 일치'}
  }
  return {category:'기타', subcategory:p.market?.itemType || p.subcategory || '분류 확인 필요', classification:'분류 확인 필요'}
}
// "240g(15g×16개)": accept the stated total only when it equals item weight × count.
const grams = (n, unit) => Number(n) * (/k|㎏/i.test(unit) ? 1000 : 1)
export function multipackGrams(name) {
  const found = [...String(name ?? '').matchAll(/(\d+(?:\.\d+)?)\s*(kg|㎏|g)\s*\(\s*(\d+(?:\.\d+)?)\s*(kg|㎏|g)\s*[×xX*]\s*(\d+)/gi)]
  if (found.length !== 1) return null
  const [, total, totalUnit, each, eachUnit, count] = found[0], value = grams(total, totalUnit)
  return value > 0 && Math.abs(value - grams(each, eachUnit) * Number(count)) <= value * 0.02 ? value : null
}
function withPackGrams(market) {
  if (!market || market.packGrams > 0) return market
  const packGrams = multipackGrams(market.name)
  return packGrams ? {...market, packGrams} : market
}
export function mergeCatalog(rows, market) { return rows.map(p => { const merged = {...p, market:withPackGrams(market[String(p.id)])}; return {...merged,...classify(merged)} }) }
export const gramPrice = p => p.market?.packGrams > 0 && Number.isFinite(p.market?.unitPrice) ? p.market.unitPrice / p.market.packGrams : null
export const searchable = p => normalize([p.id,p.name,p.foodType,p.ingredients,p.category,p.subcategory,p.market?.name,p.market?.supplier].join(' '))
const searchIndexes = new WeakMap()
const searchIndex = products => { if(!searchIndexes.has(products))searchIndexes.set(products,createCatalogSearch(products)); return searchIndexes.get(products) }
export function searchCatalog(products, query) {
  return searchIndex(products).search(query).matches.map(result=>result.product)
}
// Only the most on-topic matches; used when results are ranked by price or nutrients.
export function searchCatalogFocused(products, query) {
  return searchIndex(products).focused(query).map(result=>result.product)
}
export function alternatives(products, current, limit = 3) {
  const price=gramPrice(current)
  if(price===null) return []
  return products.filter(p=>p.id!==current.id && p.subcategory===current.subcategory && gramPrice(p)!==null && gramPrice(p)<price)
    .sort((a,b)=>gramPrice(a)-gramPrice(b)).slice(0,Math.min(20,Math.max(1,limit)))
}
export function publicProduct(p) {
  return {id:p.id,name:p.name,category:p.category,subcategory:p.subcategory,imageUrl:p.market?.imageUrl || null,unitPrice:p.market?.unitPrice??null,gramPrice:gramPrice(p),packGrams:p.market?.packGrams??null,unit:p.market?.unit||'',sourceUrl:p.market?.sourceUrl||null,collectedAt:p.market?.collectedAt||null,nutritionBasis:p.nutritionBasis,protein:p.protein,sodium:p.sodium,calories:p.calories,ingredients:p.ingredients,verifiedNutrition:p.verifiedNutrition||null}
}
