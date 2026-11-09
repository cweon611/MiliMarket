import {test} from 'node:test'
import assert from 'node:assert/strict'
process.env.MILIMARKET_CLAUDE_API_KEY='test-key'
const {runAgent,runTool,ungroundedNumbers,agentReply}=await import('../api/_agent.mjs')
const products=[
 {id:1,name:'국산콩두부 300g',subcategory:'두부류',category:'두부류',ingredients:'콩',market:{unitPrice:1200,unit:'봉',packGrams:300},verifiedNutrition:{basis:{amount:100,unit:'g',text:'100g'},code:'X',nutrients:{protein:{value:8},calories:{value:80}}}},
 {id:2,name:'부침두부 500g',subcategory:'두부류',category:'두부류',ingredients:'콩',market:{unitPrice:2000,unit:'봉',packGrams:500}}
]
const msg=(content,stop='tool_use')=>({ok:true,json:async()=>({content,stop_reason:stop})})
const use=(name,input,id='t'+name)=>({type:'tool_use',id,name,input})
const fakeFetch=replies=>{const calls=[];return {calls,fn:async(url,init)=>{calls.push(JSON.parse(init.body));return replies.shift()}}}

test('ungrounded numbers are detected; tool values and user numbers are allowed',()=>{
 assert.deepEqual(ungroundedNumbers('1,200원, 8g입니다',['{"price":1200,"protein":8}']),[])
 assert.deepEqual(ungroundedNumbers('3000원 이하',['3000원 이하로 추천해줘']),[])
 assert.deepEqual(ungroundedNumbers('999원입니다',['{"price":1200}']),['999원'])
})

test('search_products returns price-sorted compact rows with verified nutrition only where it exists',()=>{
 const r=runTool('search_products',{query:'두부',sortBy:'gramPrice',direction:'asc'},{products,image:{}})
 assert.equal(r.products[0].id,1);assert.equal(r.products[0].verified.protein,8);assert.equal(r.products[1].verified,undefined)
})

test('rank_by_nutrition converts to one basis and keeps unverified image values separate',()=>{
 const image={2:{b:{amount:100,unit:'g',text:'100g'},v:[70,9,3,2],g:'full'}}
 const r=runTool('rank_by_nutrition',{query:'두부',nutrient:'protein',direction:'desc'},{products,image})
 assert.deepEqual(r.verified.map(x=>x.id),[1]);assert.deepEqual(r.imageReadUnverified.map(x=>x.id),[2])
})

test('agent: tool call then grounded reply; only tool-returned ids are shown',async()=>{
 const f=fakeFetch([msg([use('search_products',{query:'두부'})]),msg([use('reply',{text:'국산콩두부 300g은 1,200원이에요.',productIds:[1,999]})])])
 const out=await runAgent({message:'두부 알려줘',products,fetchImpl:f.fn})
 assert.equal(f.calls.length,2);assert.deepEqual(out.reply.productIds,[1]);assert.equal(out.ungrounded,undefined)
 assert.equal(agentReply(out,products).products[0].id,1)
})

test('agent: catalog_query hands meal flow back to the legacy pipeline',async()=>{
 const f=fakeFetch([msg([use('catalog_query',{intent:'plan',query:'',maxPrice:null,sort:'default',limit:5,priorityConfirmed:false})])])
 const out=await runAgent({message:'120명 식단',products,fetchImpl:f.fn})
 assert.equal(out.legacy.intent,'plan')
})

test('agent: an ungrounded number is rejected once and the corrected reply is used',async()=>{
 const f=fakeFetch([msg([use('search_products',{query:'두부'})]),msg([use('reply',{text:'두부는 777원이에요.',productIds:[1]})]),msg([use('reply',{text:'두부는 1,200원이에요.',productIds:[1]})])])
 const out=await runAgent({message:'두부 가격',products,fetchImpl:f.fn})
 assert.equal(f.calls.length,3);assert.match(out.reply.text,/1,200/)
})

test('agent: no key or API failure leaves the caller to fall back',async()=>{
 await assert.rejects(runAgent({message:'x',products,fetchImpl:async()=>({ok:false,status:500,json:async()=>({})})}))
 process.env.MILIMARKET_CLAUDE_API_KEY='';process.env.ANTHROPIC_API_KEY=''
 assert.equal(await runAgent({message:'x',products}),null)
 process.env.MILIMARKET_CLAUDE_API_KEY='test-key'
})
