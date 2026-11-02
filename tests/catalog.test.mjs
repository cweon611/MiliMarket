import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {mergeCatalog,searchCatalog,gramPrice,CATEGORY_NAMES,alternatives} from '../shared/catalog.mjs'
import {interpretWithClaude,interpretDemo,validateQuery} from '../api/_claude.mjs'
import {answerCatalog} from '../api/_catalog-service.mjs'
import {createPlan,excludes,menuFamily,planSettings} from '../api/_planner.mjs'
const rows=JSON.parse(await readFile(new URL('../public/data/products.json',import.meta.url),'utf8'))
const market=JSON.parse(await readFile(new URL('../public/data/market-enrichment.json',import.meta.url),'utf8'))
const products=mergeCatalog(rows,market)
test('Whitespace variants return identical actual product IDs',()=>{
 const a=searchCatalog(products,'바나나우유').map(p=>p.id),b=searchCatalog(products,' 바나나  우유 ').map(p=>p.id)
 assert.ok(a.length>0);assert.deepEqual(a,b)
})
test('Every product is mapped to one of 13 groups without altering source objects',()=>{
 assert.equal(CATEGORY_NAMES.length,14);assert.equal(products.length,7902)
 assert.ok(products.every(p=>CATEGORY_NAMES.includes(p.category)))
 assert.equal(products.find(p=>p.id===21717141).category,'음료류')
 assert.equal(rows[0].category,'육류')
})
test('Price per gram needs real mass, never treats mL as g',()=>{
 assert.equal(gramPrice({market:{unitPrice:600,packGrams:200}}),3)
 assert.equal(gramPrice({market:{unitPrice:600,packGrams:null}}),null)
 assert.equal(gramPrice({market:{unitPrice:600,packGrams:0}}),null)
 assert.equal(gramPrice(products.find(p=>p.id===21717141)),null)
})
test('Alternatives always have same source subtype and a lower comparable price',()=>{
 const current=products.find(p=>gramPrice(p)>10)
 for(const p of alternatives(products,current)){assert.equal(p.subcategory,current.subcategory);assert.ok(gramPrice(p)<gramPrice(current));assert.notEqual(p.id,current.id)}
})
test('Missing nutrition basis blocks threshold and ranking requests',()=>{
 const q=interpretDemo('단백질 높은 닭갈비 추천해줘'),a=answerCatalog(products,q)
 assert.equal(a.blocked,true);assert.match(a.text,/비교·추천할 수 없습니다/)
 assert.ok(a.products.every(p=>products.some(row=>row.id===p.id)))
})
test('No API key never issues a network request',async()=>{
 assert.equal(await interpretWithClaude('test',[],{key:'',fetchImpl:()=>{throw Error('network called')}}),null)
})
test('Claude server call uses structured tool and server-only credentials',async()=>{
 const q=interpretDemo('저렴한 두부 찾아줘');let request
 const result=await interpretWithClaude('저렴한 두부 찾아줘',[],{key:'test-secret',fetchImpl:async(url,opts)=>{request={url,...opts};return {ok:true,json:async()=>({content:[{type:'tool_use',name:'catalog_query',input:q}]})}}})
 assert.equal(result.query,'두부');assert.equal(request.headers['x-api-key'],'test-secret');assert.equal(JSON.parse(request.body).tools[0].name,'catalog_query')
 assert.equal(request.url,'https://api.anthropic.com/v1/messages')
})
test('Invalid model output and API failures do not silently become successful demo answers',async()=>{
 assert.throws(()=>validateQuery({intent:'delete_database'}))
 await assert.rejects(interpretWithClaude('test',[],{key:'test',fetchImpl:async()=>({ok:false,status:401})}),/키/)
 await assert.rejects(interpretWithClaude('test',[],{key:'test',fetchImpl:async()=>({ok:true,json:async()=>({content:[]})})}),/올바른/)
})
test('Plans use actual catalog IDs and do not invent nutrition or g conversions',()=>{
 const plan=createPlan(products,{start:'2026-10-13'})
 assert.equal(plan.days.length,7);assert.equal(plan.nutritionVerified,false);assert.equal(plan.missing,0)
 assert.equal(plan.days.reduce((n,d)=>n+d.meals.length,0),21)
 for(const day of plan.days)for(const meal of day.meals){assert.ok(meal.cost<=meal.budget);for(const p of meal.items){if(!p.missing)assert.ok(products.some(x=>x.id===p.id))}}
 assert.equal(plan.total,plan.purchase.reduce((n,p)=>n+p.total,0))
 for(const p of plan.purchase){assert.ok(Number.isInteger(p.packs));assert.ok(p.packs>=p.minimumOrder);assert.equal(p.total,p.packs*p.unitPrice)}
 console.log('Default plan:',plan.purchase.length,'products;',plan.missing,'unfilled slots; total',plan.total,'budget',plan.budget)
})
test('Exclusion uses ingredients and drops unknown ingredients; protein is not guessed',()=>{
 assert.equal(excludes({ingredients:'돈육 80%',name:'불고기'},['돼지고기']),true)
 assert.equal(excludes({ingredients:'미제공',name:'불고기'},['돼지고기']),true)
 const plan=createPlan(products,{days:3,exclusions:['돼지고기']})
 for(const p of plan.purchase){assert.equal(excludes(products.find(x=>x.id===p.id),['돼지고기']),false)}
})
test('Menu families do not repeat within 3 days except staples; shortages stay visible',()=>{
 assert.equal(menuFamily({market:{itemType:'조미김',name:'조미김, A, 자반볶음, 250g'}}),menuFamily({market:{itemType:'조미김',name:'조미김, B, 김자반볶음, 500g'}}))
 const plan=createPlan(products,{days:7});const last=new Map()
 for(let d=0;d<plan.days.length;d++)for(const m of plan.days[d].meals)for(const p of m.items){
  if(p.missing||['밥','김치'].includes(p.role))continue
  const family=menuFamily(products.find(x=>x.id===p.id));assert.ok(!last.has(family)||d-last.get(family)>=3);last.set(family,d)
 }
 const impossible=createPlan(products,{days:1,exclusions:['정제수','소금','설탕','쌀']})
 assert.ok(impossible.missing>0);assert.ok(impossible.warnings.length>0)
 assert.throws(()=>planSettings({days:0}));assert.throws(()=>planSettings({people:NaN}));assert.throws(()=>planSettings({start:'2026-02-30'}))
})
