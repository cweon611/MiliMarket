import test from 'node:test'
import assert from 'node:assert/strict'
import {productCardLabel} from '../src/product-card-label.ts'
const product=(name,extra={})=>({name,subcategory:'식물성기름',...extra})
test('card label separates item and brand without mutating search data',()=>{
 const p=Object.freeze(product('식물성기름, 씨제이제일제당, 100%통참깨참기름, 1.5L'))
 assert.deepEqual(productCardLabel(p),{title:'100%통참깨참기름, 1.5L',itemName:'식물성기름'})
 assert.equal(p.name,'식물성기름, 씨제이제일제당, 100%통참깨참기름, 1.5L')
})
test('commas inside product descriptions and numeric sizes are preserved',()=>{
 assert.deepEqual(productCardLabel({name:'냉동감자, 에이치지, 모둠감자(크링클컷,슈스트링), 1,000g',subcategory:'냉동감자'}),{title:'모둠감자(크링클컷,슈스트링), 1,000g',itemName:'냉동감자'})
})
test('structured procurement name can supply display fields for an unstructured original',()=>{
 assert.deepEqual(productCardLabel(product('참기름 한 병',{market:{name:'식물성기름, 브랜드, 고소한참기름, 1L',itemType:'식물성기름'}})),{title:'고소한참기름, 1L',itemName:'식물성기름'})
})
test('ambiguous names are not blindly truncated as if their first fields were item and brand',()=>{
 assert.deepEqual(productCardLabel(product('(주)한승, 간장불고기-전지, 양념육, 1kg',{subcategory:'양념육'})),{title:'(주)한승, 간장불고기-전지, 양념육, 1kg',itemName:'양념육'})
})

test('reviewed irregular names recover volume and multipack specifications',()=>{
 assert.deepEqual(productCardLabel({id:25371070,name:'고집쟁이국산콩현미두부',subcategory:'두부',market:{name:'고집쟁이국산콩현미두부/3kg'}}),{title:'고집쟁이국산콩현미두부, 3kg',itemName:'두부'})
 assert.equal(productCardLabel({id:25210074,name:'푸드코아',subcategory:'빵류',market:{name:'푸드코아 / 우유생크림빵 / 105gx3개/봉 / 냉동'}}).title,'우유생크림빵, 105g×3개/봉')
 assert.equal(productCardLabel({id:25625857,name:'참치통조림, 화남코퍼레이션, 삼포참치살코기 1,880g, 1880g',subcategory:'참치통조림',market:{name:'참치통조림.삼포참치 살코기 1,880g'}}).title,'삼포참치살코기, 1,880g')
})
test('reviewed labels do not override a product whose original name has changed',()=>{
 assert.equal(productCardLabel({id:25210074,name:'새로 등록된 다른 제품, 2kg',subcategory:'빵류'}).title,'새로 등록된 다른 제품, 2kg')
})
test('products without supplied quantities get a product name without invented sizes',()=>{
 assert.equal(productCardLabel({id:25183749,name:'양념육류, 대운에프앤비, 양념무뼈불닭발',subcategory:'양념육'}).title,'양념무뼈불닭발')
})

test('changed procurement specifications invalidate a reviewed card label',()=>{
 assert.notEqual(productCardLabel({id:25210074,name:'푸드코아',subcategory:'빵류',market:{name:'푸드코아 / 새 제품 / 200g'}}).title,'우유생크림빵, 105g×3개/봉')
})

test('duplicate capacity attached to the product name is displayed once',()=>{
 assert.equal(productCardLabel({name:'복합조미식품, 디아이, 매콤떡볶이분말1kg, 1kg',subcategory:'복합조미식품'}).title,'매콤떡볶이분말, 1kg')
 assert.equal(productCardLabel({name:'국탕류, 회사, 황장군1KG갈비탕, 1kg',subcategory:'국탕류'}).title,'황장군갈비탕, 1kg')
 assert.equal(productCardLabel({name:'면류, 회사, 링귀네(1000g), 1kg',subcategory:'면류'}).title,'링귀네, 1kg')
 assert.equal(productCardLabel({name:'국탕류, 회사, 도가니탕(600g,멸균), 600g',subcategory:'국탕류'}).title,'도가니탕(멸균), 600g')
})
test('total weight and different portion or nutrition amounts are preserved',()=>{
 for(const title of ['제품, 1kg(100g×10개)','치즈, 240g(15g×16개)','김말이40g, 1.5kg','단백질드링크40g딸기, 350mL'])assert.equal(productCardLabel({name:title,subcategory:'기타'}).title,title)
})
test('name-side pack counts and decimal quantities are not lost',()=>{
 assert.equal(productCardLabel({name:'소스 1kg*20EA, 1kg',subcategory:'기타'}).title,'소스 1kg*20EA')
 assert.equal(productCardLabel({name:'제품2.1kg, 2.1kg',subcategory:'기타'}).title,'제품, 2.1kg')
 assert.equal(productCardLabel({name:'요구르트, 520mL(130mL×4입)mL',subcategory:'기타'}).title,'요구르트, 520mL(130mL×4입)')
})
