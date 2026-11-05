import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
process.env.ANTHROPIC_API_KEY='';process.env.MILIMARKET_CLAUDE_API_KEY=''
process.env.DATA_GO_KR_SERVICE_KEY=''
process.env.G2B_SERVICE_KEY=''
process.env.MFDS_SERVICE_KEY=''
process.env.MILIMARKET_DATA_DIR=await mkdtemp(path.join(os.tmpdir(),'milimarket-test-'))
const {server}=await import('../api-server.mjs')
test('Local API: key status, auth, isolated history, secret files and origin protection',async(t)=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)))
 const base=`http://127.0.0.1:${server.address().port}`
 async function request(route,body,cookie){const r=await fetch(base+route,{...(body?{method:'POST',body:JSON.stringify(body)}:{}),headers:{'Content-Type':'application/json',...(cookie?{cookie}:{})}});return {status:r.status,cookie:r.headers.get('set-cookie'),data:await r.json()}}
 const status=await request('/api/status');assert.equal(status.data.configured,false);assert.equal(status.data.user,null)
 assert.equal(status.data.dataProviders.nutrition.configured,false)
 assert.deepEqual((await request('/api/catalog-updates')).data.updates,{})
 assert.equal((await request('/api/nutrition-sync',{query:'두부',offset:0})).status,503)
 assert.equal((await request('/api/product-data?id=not-an-id')).status,404)
 const official=await request('/api/product-data?id=25100569');assert.equal(official.status,200);assert.equal(official.data.nutrition.status,'not_configured');assert.equal(official.data.procurement.status,'not_configured')
 const nutrition=await request('/api/chat',{message:'25100569 영양정보 알려줘'});assert.equal(nutrition.data.nutritionEvidence[0].status,'not_configured');assert.match(nutrition.data.text,/인증키/)
 assert.equal((await request('/api/history')).status,401)
 const auth=await request('/api/register',{email:'test@example.test',password:'Only-for-test-123',name:'테스트'});assert.equal(auth.status,200);assert.match(auth.cookie,/HttpOnly/)
 const cookie=auth.cookie.split(';')[0]
 const saved=await request('/api/history',{settings:{days:1}},cookie);assert.equal(saved.status,200)
 const history=await request('/api/history',undefined,cookie);assert.equal(history.data.history.length,1)
 const account2=await request('/api/register',{email:'second@example.test',password:'Only-for-test-456',name:'테스트2'});const cookie2=account2.cookie.split(';')[0]
 assert.equal((await request(`/api/history/${saved.data.id}`,undefined,cookie2)).status,404)
 assert.equal((await request(`/api/history/${saved.data.id}`,undefined,cookie)).data.days.length,1)
 assert.equal((await request('/api/login',{email:'test@example.test',password:'Wrong-pass-123'})).status,401)
 assert.equal((await request('/api/login',{email:'test@example.test',password:'Only-for-test-123'})).status,200)
 const file=await readFile(path.join(process.env.MILIMARKET_DATA_DIR,'accounts.json'),'utf8');assert.ok(!file.includes('Only-for-test'));assert.ok(!file.includes('ANTHROPIC'))
 const chat=await request('/api/chat',{message:'바나나 우유 찾아줘'});assert.equal(chat.data.mode,'demo');assert.ok(chat.data.products.length)
 const clarification=await request('/api/chat',{message:'10월 15일 아침 식단을 짜려고 하는데, 메인 메뉴 1가지와 서브 반찬 2가지를 추천해주세요',planSettings:{days:7,people:120}})
 assert.equal(clarification.status,200);assert.equal(clarification.data.needsMealDetails,true);assert.equal(clarification.data.plan,undefined);assert.equal(clarification.data.mealRequestContext.people,null)
 assert.deepEqual(clarification.data.mealRequestContext.meals,['아침']);assert.match(clarification.data.text,/선호/)
 const scoped=await request('/api/chat',{message:'150명, 맵지 않은 한식으로, 1인 한 끼 예산 5000원',mealRequestContext:clarification.data.mealRequestContext})
 assert.equal(scoped.status,200);assert.equal(scoped.data.plan.days.length,1);assert.equal(scoped.data.plan.days[0].meals.length,1)
 assert.deepEqual(scoped.data.plan.days[0].meals[0].items.map(p=>p.role),['주찬','부찬','부찬']);assert.equal(scoped.data.plan.settings.people,150)
 assert.equal(scoped.data.plan.nutrition.days[0].meals[0].itemCount,3);assert.equal(scoped.data.plan.nutritionVerified,false)
 assert.equal(scoped.data.plan.nutrition.days[0].meals[0].totals.protein,null);assert.equal(scoped.data.plan.nutrition.days[0].meals[0].sources.length,0)
 assert.equal((await fetch(base+'/.env')).status,404);assert.equal((await fetch(base+'/api-server.mjs')).status,404)
 assert.equal((await fetch(base+'/api/plan',{method:'POST',headers:{origin:'https://untrusted.example','Content-Type':'application/json'},body:'{}'})).status,403)
 await request('/api/logout',{},cookie);assert.equal((await request('/api/history',undefined,cookie)).status,401)
})
