import assert from 'node:assert/strict'
import test from 'node:test'
import { matchesDiscovery, emptyDiscovery } from '../src/discovery.ts'
import { defaultQuote, marketKgPrice, saleStatus } from '../src/data.ts'
const item={id:1,subcategory:'햄',packGrams:500,market:{unitPrice:6000,packGrams:1000,supplier:'테스트 식품',origin:'대한민국',category:'육가공품',itemType:'훈제오리',purchaseMethod:'다수공급자계약',imageUrl:'https://example.test/product.jpg',saleStart:'2026-09-01',saleEnd:'2026-09-30',discount:'10%'}}
const filter=(change)=>({...emptyDiscovery,...change})
test('price ranges are inclusive; missing prices never count as zero',()=>{
 assert.equal(matchesDiscovery(item,filter({minPrice:'6000',maxPrice:'6000'})),true)
 assert.equal(matchesDiscovery(item,filter({maxPrice:'5999'})),false)
 assert.equal(matchesDiscovery({...item,market:undefined},filter({maxPrice:'10000'})),false)
 assert.equal(matchesDiscovery(item,filter({minPrice:'7000',maxPrice:'6000'})),false)
})
test('kg pricing and initial calculator use the same sale-unit mass',()=>{
 assert.equal(marketKgPrice(item),6000)
 assert.deepEqual(defaultQuote(item),{portion:null,pack:1000,price:6000})
 assert.equal(matchesDiscovery({...item,market:{...item.market,packGrams:null}},filter({priceBasis:'kg',maxPrice:'10000'})),false)
})
test('event state requires a verified interval and discount',()=>{
 assert.equal(saleStatus(item,'2026-09-29'),'active')
 assert.equal(saleStatus(item,'2026-08-29'),'upcoming')
 assert.equal(saleStatus(item,'2026-10-01'),null)
 assert.equal(saleStatus({...item,market:{...item.market,discount:null}},'2026-09-29'),null)
 assert.equal(matchesDiscovery(item,filter({event:'진행 중 할인'}),'2026-10-01'),false)
})
test('category, company, origin, availability and package filters combine',()=>{
 assert.equal(matchesDiscovery(item,filter({company:'테스트',origin:'대한민국',marketCategory:'육가공품',itemType:'햄',packSize:'1–3kg',availability:'가격·사진 모두'})),true)
 assert.equal(matchesDiscovery(item,filter({origin:'미국'})),false)
 assert.equal(matchesDiscovery(item,filter({packSize:'1kg 미만'})),false)
 assert.equal(matchesDiscovery({...item,market:{...item.market,imageUrl:null}},filter({availability:'가격·사진 모두'})),false)
})
test('company filter matches manufacturer, contract supplier or the maker in the product name',()=>{
 const noodle={...item,name:'면류, 농심, 새우탕큰사발, 115g',manufacturer:'미제공',market:{...item.market,supplier:'(주)농심대리점'}}
 assert.equal(matchesDiscovery(noodle,filter({company:'농심'})),true)
 assert.equal(matchesDiscovery(noodle,filter({company:'대리점'})),true)
 assert.equal(matchesDiscovery({...noodle,manufacturer:'공식 제조사'},filter({company:'공식'})),true)
 assert.equal(matchesDiscovery(noodle,filter({company:'오뚜기'})),false)
 assert.equal(matchesDiscovery(noodle,filter({company:'미제공'})),false)
})
