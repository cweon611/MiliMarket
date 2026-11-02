import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {mergeCatalog,searchCatalog,searchCatalogFocused,createCatalogSearch,gramPrice,multipackGrams} from '../shared/catalog.mjs'
import {recommend} from '../api/_recommendation.mjs'
import {validateQuery} from '../api/_query.mjs'
import {interpretDemo} from '../api/_claude.mjs'
import {answerCatalog} from '../api/_catalog-service.mjs'
const rows=JSON.parse(await readFile(new URL('../public/data/products.json',import.meta.url),'utf8'))
const market=JSON.parse(await readFile(new URL('../public/data/market-enrichment.json',import.meta.url),'utf8'))
const products=mergeCatalog(rows,market), engine=createCatalogSearch(products)
const ids=q=>searchCatalog(products,q).map(p=>p.id).sort((a,b)=>a-b)

test('Flavor connectors and spaces include real flavored milks, including Binggrae',()=>{
  for(const query of ['바나나우유','바나나 우유','바나나맛우유','바 나 나 우 유']) {
    const found=ids(query)
    for(const id of [24960167,24960173,24960169,24946802])assert.ok(found.includes(id),`${query}: missing ${id}`)
    assert.deepEqual(found,ids('바나나우유'))
  }
  assert.ok(ids('딸기우유').includes(24960172))
  assert.ok(ids('초코우유').includes(25004319))
  assert.ok(!ids('초코우유').includes(25677316))
  for(const query of ['바나나우유','딸기우유','초코우유'])assert.equal(searchCatalog(products,query)[0].subcategory,'가공우유')
})

test('Common Korean variants use the same actual catalog set',()=>{
  for(const [a,b] of [['돈가스','돈까스'],['달걀','계란'],['요거트','요구르트'],['쭈꾸미','주꾸미'],['소세지','소시지'],['케찹','케첩'],['쇠고기','소고기'],['초콜릿','초코']]) {
    assert.ok(ids(a).length>0,a);assert.deepEqual(ids(a),ids(b),`${a} / ${b}`)
  }
})

test('Multiple food and brand terms may be reordered but all remain required',()=>{
  const found=ids('빙그레 바나나 우유')
  assert.ok(found.includes(24960173));assert.ok(!found.includes(24946802))
  assert.deepEqual(found,ids('우유 바나나 빙그레'))
  assert.deepEqual(ids('치즈 돈가스'),ids('돈까스 치즈'))
  assert.equal(ids('존재하지않는브랜드 바나나 우유').length,0)
  assert.deepEqual(searchCatalog([{id:1,name:'치즈, 우리식품, 행복한치즈'}],'행복한 우리식품').map(p=>p.id),[1])
})

test('Exact names rank above related names, then ingredient-only hits; input is unchanged',()=>{
  const list=[{id:1,name:'바나나맛우유'},{id:2,name:'바나나우유'},{id:3,name:'과자',ingredients:'바나나우유분말'}]
  const before=structuredClone(list)
  assert.deepEqual(searchCatalog(list,'바나나우유').map(p=>p.id),[2,1,3])
  assert.deepEqual(list,before)
})

test('No cross-ingredient false match, arbitrary character skipping or identifier correction',()=>{
  const list=[{id:12345678,name:'바나나맛우유'},{id:2,name:'바나나 케이크',ingredients:'바나나, 우유, 밀가루'},{id:3,name:'맛살'},{id:4,name:'가공우유',reportNumber:'ABC-123'}]
  assert.deepEqual(searchCatalog(list,'바나나우유').map(p=>p.id),[12345678])
  assert.equal(searchCatalog(list,'바유').length,0)
  assert.deepEqual(searchCatalog(list,'맛살').map(p=>p.id),[3])
  assert.deepEqual(searchCatalog(list,'12345678').map(p=>p.id),[12345678])
  assert.deepEqual(searchCatalog(list,'ABC-123').map(p=>p.id),[4])
  assert.equal(createCatalogSearch(list).search('12345679').suggestions.length,0)
})

test('Typo suggestions come from the catalog; they do not silently change results',()=>{
  const result=engine.search('바나나우뮤')
  assert.equal(result.matches.length,0)
  assert.ok(result.suggestions.some(s=>s.term==='바나나우유'))
  for(const s of result.suggestions)assert.equal(s.count,ids(s.term).length)
  const related=engine.search('우유').suggestions
  assert.ok(related.length>0)
  for(const s of related)assert.ok(s.count>0)
})

test('Demo chat uses the shared retrieval including brand constraints and unknown queries',()=>{
  for(const question of ['빙그레 바나나우유 찾아줘','치즈 돈가스 찾아줘','달걀말이 검색해줘','소세지 추천해줘','초콜릿우유 찾아줘']) {
    const query=interpretDemo(question),reply=answerCatalog(products,query)
    // Recommendations rank only on-topic products; plain searches keep every match.
    const expected=(query.intent==='recommend'?searchCatalogFocused:searchCatalog)(products,query.query)
    assert.ok(query.query);assert.ok(reply.products.length,question)
    assert.deepEqual(reply.products.map(p=>p.id),expected.slice(0,query.limit).map(p=>p.id))
  }
  assert.equal(answerCatalog(products,interpretDemo('없는상품XYZ 찾아줘')).count,0)
})

test('라면 includes instant noodles without 라면 in the name; plain noodles stay out',()=>{
  const found=ids('라면'),cup=ids('컵라면')
  // 새우탕큰사발, 큰컵불닭볶음면, 튀김우동컵, 짜파게티큰사발, 왕뚜껑, 오뚜기새우탕면
  for(const id of [22672664,24188939,26132657,22672669,23215740,25409823])assert.ok(found.includes(id),`missing ${id}`)
  for(const id of [22672664,26132657,23215740])assert.ok(cup.includes(id),`cup missing ${id}`)
  assert.ok(!cup.includes(25409823))
  // 소면, 칼국수, 스파게티, 즉석쌀국수
  for(const id of [25655612,24955306,25618403,23904079])assert.ok(!found.includes(id),`unexpected ${id}`)
})

const recommendByGram=async term=>(await recommend(products,validateQuery({intent:'recommend',query:term,sort:'gramPrice',direction:'asc',recommendationBasis:'g당 단가 낮은 순',priorityConfirmed:true}),{},{userMessages:['g당 단가 낮은 순'],semanticInterpretation:true}))

test('g-price recommendations pick the requested item, never a cheaper sauce or ingredient-only hit',async()=>{
  for(const [term,subcategories] of [['돈까스',['양념육류']],['참치',['참치통조림']],['햄',['햄류']],['김치',['배추김치','깍두기','백김치']],['라면',['면류']]]){
    const reply=await recommendByGram(term)
    assert.ok(reply.products.length,term)
    for(const p of reply.products)assert.ok(subcategories.includes(p.subcategory),`${term}: ${p.name}`)
  }
})

test('g-price recommendation is the cheapest on-topic product',async()=>{
  for(const term of ['두부','어묵','고추장','라면']){
    const reply=await recommendByGram(term)
    const cheapest=Math.min(...searchCatalogFocused(products,term).map(gramPrice).filter(v=>v!=null))
    assert.equal(reply.products[0].gramPrice,cheapest,term)
  }
})

test('items sold only by volume explain why g price is unavailable instead of recommending something else',async()=>{
  const reply=await recommendByGram('간장')
  assert.equal(reply.products.length,0)
  assert.match(reply.text,/g 중량이 확인되지 않아/)
})

test('multipack names with a consistent total weight get a pack weight',()=>{
  assert.equal(multipackGrams('가공치즈, 임실, 포션치즈, 240g(15g×16개)'),240)
  assert.equal(multipackGrams('깍두기, 남경, 깍두기, 10kg(5kg×2봉지)'),10000)
  assert.equal(multipackGrams('면류, 오뚜기, 참라면업소용, 115g×48개'),null)
  assert.equal(multipackGrams('1kg(200g×6개)'),null)
  assert.ok(products.filter(p=>p.market&&multipackGrams(p.market.name)===p.market.packGrams).length>200)
})
