import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createPublicDataService,normalizeNutrition,nutrientBasis,numberValue,reportId} from '../api/_public-data.mjs'
import {answerNutrition} from '../api/_nutrition-answer.mjs'
const row={FOOD_CD:'TEST-001',FOOD_NM_KR:'테스트 우유',ITEM_REPORT_NO:'200206141791047',MAKER_NM:'테스트 제조사',SERVING_SIZE:'200mL',AMT_NUM1:'150',AMT_NUM3:'6.5',AMT_NUM4:'0',AMT_NUM6:'12',AMT_NUM7:'<0.1',AMT_NUM13:'',UPDATE_DATE:'2026-09-01'}
const product={id:25100569,name:'가공우유, 테스트 제조사, 테스트 우유, 200mL',reportNumber:'200206141791047',market:{name:'가공우유, 테스트 제조사, 테스트 우유, 200mL'},protein:999,sodium:999,calories:999}
const response=(rows=[],total=rows.length,nested=true)=>new Response(JSON.stringify(nested?{response:{header:{resultCode:'00'},body:{items:{item:rows},totalCount:total}}}:{header:{resultCode:'00'},body:{items:rows,totalCount:total}}))
const query={intent:'nutrition',query:'',productId:product.id,limit:5,maxPrice:null,sort:'default',nutrient:null,minNutrient:null,maxNutrient:null}
test('no credentials makes no external request and never claims connected',async()=>{
 const s=createPublicDataService({env:{},fetchImpl:()=>{throw new Error('must not fetch')}})
 const result=await s.productData(product)
 assert.equal(s.status().nutrition.configured,false)
 assert.equal(result.nutrition.status,'not_configured');assert.equal(result.procurement.status,'not_configured')
 const reply=await answerNutrition([product],query,s);assert.match(reply.text,/인증키/);assert.ok(!reply.text.includes('999'))
})
test('MFDS v03 query uses report id, encoded keys once, shared cache and provenance',async()=>{
 let calls=0
 const s=createPublicDataService({env:{DATA_GO_KR_SERVICE_KEY:'a%2Bb%2Fc%3D'},fetchImpl:async u=>{calls++;assert.equal(u.searchParams.get('serviceKey'),'a+b/c=');assert.equal(u.searchParams.get('ITEM_REPORT_NO'),product.reportNumber);assert.match(u.pathname,/FoodNtrCpntDbInfo03\/getFoodNtrCpntDbInq03$/);return response([row])}})
 const [a,b]=await Promise.all([s.nutrition(product),s.nutrition(product)])
 assert.equal(calls,1);assert.equal(a.match,'report_number');assert.deepEqual(a,b)
 const reply=await answerNutrition([product],query,s);assert.equal(calls,1);assert.match(reply.text,/200mL 기준/);assert.match(reply.text,/6.5 g/);assert.ok(!reply.text.includes('999'));assert.match(reply.text,/2026-09-01/)
 assert.ok(!JSON.stringify(reply).includes('a+b/c='))
})
test('nutrition basis keeps volume separate, unknown values and less-than text intact',()=>{
 assert.deepEqual(nutrientBasis('0.2 L'),{text:'0.2 L',amount:200,unit:'mL'})
 assert.equal(nutrientBasis('1kg').amount,1000);assert.equal(nutrientBasis('1회분').amount,null)
 assert.equal(nutrientBasis('100g').unit,'g');assert.equal(numberValue(''),null);assert.equal(numberValue('0'),0)
 const r=normalizeNutrition(row,'2026-10-14T00:00:00Z')
 assert.equal(r.nutrients.fat.value,0);assert.equal(r.nutrients.sodium.value,null);assert.equal(r.nutrients.sugars.value,null);assert.equal(r.nutrients.sugars.raw,'<0.1')
 assert.equal(reportId('20120262095-89'),'2012026209589');assert.equal(reportId('미제공'),null);assert.equal(reportId('12345678901,12345678902'),null)
})
test('matching rejects wrong report id, ambiguous and truncated result sets',async()=>{
 const make=(rows,total)=>createPublicDataService({env:{MFDS_SERVICE_KEY:'test'},fetchImpl:async()=>response(rows,total)})
 const wrong=await make([{...row,ITEM_REPORT_NO:'1111111111111'}],1).nutrition(product);assert.equal(wrong.match,'reference')
 const duplicate=await make([row,{...row,FOOD_CD:'TEST-002'}],2).nutrition(product);assert.equal(duplicate.match,'ambiguous')
 const truncated=await make([row],100).nutrition(product);assert.equal(truncated.match,'ambiguous')
 const noReport=await make([row],1).nutrition({...product,reportNumber:'미제공'});assert.equal(noReport.match,'reference')
})
test('JSON and XML provider errors are sanitized and cached briefly',async()=>{
 let calls=0,time=0
 const s=createPublicDataService({env:{MFDS_SERVICE_KEY:'secret-example'},now:()=>time,fetchImpl:async()=>{calls++;return new Response('<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>30</returnReasonCode><returnAuthMsg>secret-example</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>')}})
 const first=await s.nutrition(product);assert.equal(first.status,'error');assert.match(first.message,/인증키/);assert.ok(!JSON.stringify(first).includes('secret-example'))
 await s.nutrition(product);assert.equal(calls,1);time=16000;await s.nutrition(product);assert.equal(calls,1);time=61000;await s.nutrition(product);assert.equal(calls,2)
 for(const fixture of [new Response('{bad JSON'),new Response(JSON.stringify({response:{header:{resultCode:'21',resultMsg:'secret-example'}}})),new Response('',{status:403})]){
   const p=createPublicDataService({env:{MFDS_SERVICE_KEY:'secret-example'},fetchImpl:async()=>fixture});const r=await p.nutrition(product);assert.equal(r.status,'error');assert.ok(!JSON.stringify(r).includes('secret-example'))
 }
})
test('singleton/flat response shapes and upstream outages handled without fake nutrition',async()=>{
 const singleton=createPublicDataService({env:{MFDS_SERVICE_KEY:'test'},fetchImpl:async()=>response(row,1)})
 assert.equal((await singleton.nutrition(product)).match,'report_number')
 const flat=createPublicDataService({env:{MFDS_SERVICE_KEY:'test'},fetchImpl:async()=>response([row],1,false)})
 assert.equal((await flat.nutrition(product)).match,'report_number')
 const outage=createPublicDataService({env:{MFDS_SERVICE_KEY:'test'},fetchImpl:async()=>{throw new DOMException('private-url-with-key','TimeoutError')}})
 const r=await outage.nutrition(product);assert.equal(r.status,'error');assert.ok(!JSON.stringify(r).includes('private-url'))
})
test('G2B queries each contract type, validates item IDs, and retains separate offer units',async()=>{
 const requests=[]
 const s=createPublicDataService({env:{G2B_SERVICE_KEY:'test'},fetchImpl:async u=>{requests.push(u);assert.equal(u.searchParams.get('prdctIdntNo'),String(product.id));return response([
   {prdctIdntNo:product.id,prdctSpecNm:'테스트 우유',cntrctPrceAmt:'590',prdctUnit:'개',cntrctCorpNm:'공급자 A',shopngCntrctNo:'CONTRACT-A',prdctImgUrl:'https://www.g2b.go.kr/test.jpg'},
   {prdctIdntNo:product.id,prdctSpecNm:'테스트 우유',cntrctPrceAmt:'20000',prdctUnit:'상자',cntrctCorpNm:'공급자 B',shopngCntrctNo:'CONTRACT-B',prdctImgUrl:'javascript:alert(1)'},
   {prdctIdntNo:99999999,cntrctPrceAmt:'1',prdctUnit:'개'},
 ])}})
 const result=await s.procurement(product);assert.equal(result.status,'ok');assert.equal(requests.length,3);assert.equal(result.offers.length,6)
 assert.ok(result.offers.every(o=>o.id===product.id));assert.equal(result.offers[1].imageUrl,null);assert.equal(result.offers[1].unit,'상자');assert.equal(result.offers[0].unitPrice,590)
})
test('G2B partial failures do not hide successful contracts or imply a complete list',async()=>{
 const s=createPublicDataService({env:{G2B_SERVICE_KEY:'test'},fetchImpl:async u=>u.pathname.includes('getMAS')?response([{prdctIdntNo:product.id,cntrctPrceAmt:'500'}]):new Response('',{status:503})})
 const r=await s.procurement(product);assert.equal(r.status,'ok');assert.equal(r.partial,true);assert.equal(r.offers.length,1)
})
test('nutrition answers distinguish reference food from catalog items; comparisons require an explicit basis',async()=>{
 const s=createPublicDataService({env:{MFDS_SERVICE_KEY:'test'},fetchImpl:async()=>response([row])})
 const reply=await answerNutrition([], {...query,query:'테스트 우유',productId:null},s)
 assert.equal(reply.products.length,0);assert.match(reply.text,/상품 일치 미확인/);assert.equal(reply.nutritionEvidence[0].productId,null)
 const filtered=await answerNutrition([product],{...query,nutrient:'protein',minNutrient:10},s);assert.equal(filtered.blocked,true);assert.match(filtered.text,/비교 기준량/)
 const empty=await answerNutrition([product],{...query,productId:null},s);assert.equal(empty.products.length,0);assert.match(empty.text,/상품명/)
})
