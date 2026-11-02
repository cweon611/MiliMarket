import {normalize, gramPrice} from '../shared/catalog.mjs'
import { marketPrice, marketKgPrice, saleStatus, type Product } from './data.ts'
export interface DiscoveryFilters {
  minPrice: string; maxPrice: string; priceBasis: string; company: string; ingredient: string; excludeIngredient: string
  marketCategory: string; itemType: string; origin: string
  purchaseMethod: string; availability: string; event: string; packSize: string
}
export const emptyDiscovery: DiscoveryFilters = {company:'',ingredient:'',excludeIngredient:'',minPrice:'',maxPrice:'',priceBasis:'unit',marketCategory:'전체',itemType:'전체',origin:'전체',purchaseMethod:'전체',availability:'전체',event:'전체',packSize:'전체'}
// "(주)오뚜기"·"주식회사 농심"처럼 법인 표기만 다른 이름은 같은 업체로 묶는다.
const companyName=(v?:string|null)=>String(v??'').replace(/\(주\)|㈜|\(유\)|\(재\)|주식회사|유한회사|농업회사법인|영농조합법인|\(주문자상표부착\)/g,'').replace(/\s+/g,' ').trim()
const known=(v?:string|null)=>{const name=companyName(v);return name&&!['미제공','미확인','표기 없음'].includes(name)?name:''}
// 제조사·계약업체·상품명의 제조사 칸("분류, 제조사, 제품명, 규격")을 하나의 업체 목록으로 본다.
export function productCompanies(p: Product): string[] {
  const fromName=[p.name,p.market?.name].map(n=>{const parts=String(n??'').split(',');return parts.length>=3?parts[1]:''})
  return [...new Set([p.manufacturer,p.market?.supplier,...fromName].map(known).filter(Boolean))]
}
export function matchesDiscovery(p: Product, f: DiscoveryFilters, today?: string) {
  if(f.company.trim()&&!productCompanies(p).some(c=>c.toLowerCase().includes((companyName(f.company)||f.company.trim()).toLowerCase())))return false
  if(f.ingredient.trim()&&!normalize(p.ingredients).includes(normalize(f.ingredient)))return false
  if(f.excludeIngredient.trim()&&(p.ingredients==='미제공'||normalize(p.ingredients).includes(normalize(f.excludeIngredient))))return false
  const price = f.priceBasis === 'g' ? gramPrice(p) : f.priceBasis === 'kg' ? marketKgPrice(p) : marketPrice(p)
  if (f.minPrice !== '' && (!Number.isFinite(Number(f.minPrice)) || Number(f.minPrice) < 0 || price === null || price < Number(f.minPrice))) return false
  if (f.maxPrice !== '' && (!Number.isFinite(Number(f.maxPrice)) || Number(f.maxPrice) < 0 || price === null || price > Number(f.maxPrice))) return false
  if (f.marketCategory !== '전체' && p.market?.category !== f.marketCategory) return false
  if (f.itemType !== '전체' && p.subcategory !== f.itemType) return false
  if (f.origin !== '전체' && (p.market?.origin || '미확인') !== f.origin) return false
  if (f.purchaseMethod !== '전체' && p.market?.purchaseMethod !== f.purchaseMethod) return false
  if (f.availability === '가격 있음' && marketPrice(p) === null) return false
  if (f.availability === '사진 있음' && !p.market?.imageUrl) return false
  if (f.availability === '가격·사진 모두' && (marketPrice(p) === null || !p.market?.imageUrl)) return false
  if (f.availability === '가격 미확인' && marketPrice(p) !== null) return false
  if (f.event === '진행 중 할인' && saleStatus(p,today) !== 'active') return false
  if (f.event === '예정된 할인' && saleStatus(p,today) !== 'upcoming') return false
  const grams = p.market ? p.market.packGrams : p.packGrams
  if (f.packSize !== '전체' && (grams === null || (f.packSize === '1kg 미만' && grams >= 1000) || (f.packSize === '1–3kg' && (grams < 1000 || grams > 3000)) || (f.packSize === '3kg 초과' && grams <= 3000))) return false
  return true
}
