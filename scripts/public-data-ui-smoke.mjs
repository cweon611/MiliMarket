// Browser QA: the initial no-key state is real; successful API responses below are explicit fixtures.
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {normalizeNutrition,SOURCES} from '../api/_public-data.mjs'
const require=createRequire(import.meta.url)
const {chromium}=require('C:/Users/chuns/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const browser=await chromium.launch({channel:'msedge',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:1000}})
const errors=[];page.on('pageerror',e=>errors.push(e.message))
await mkdir('qa',{recursive:true})
try{
 await page.goto(process.env.DEMO_URL||'http://127.0.0.1:5184/')
 await page.getByRole('textbox',{name:'식재료 검색',exact:true}).fill('25100569')
 await page.getByRole('button',{name:'검색 결과 보기'}).click()
 await page.locator('.detail-open-button').first().click()
 const panel=page.getByRole('region',{name:'공공 API 상품 및 영양 정보'})
 await panel.getByText('인증키 발급 대기',{exact:true}).first().waitFor()
 assert.equal(await panel.getByText('인증키 발급 대기',{exact:true}).count(),2)
 await page.screenshot({path:'qa/public-data-no-key.png',fullPage:true})
 const record=normalizeNutrition({FOOD_CD:'UI-TEST-001',FOOD_NM_KR:'UI 테스트용 황태해장국',SERVING_SIZE:'100g',ITEM_REPORT_NO:'200206141791047',AMT_NUM1:'40',AMT_NUM3:'6.5',AMT_NUM4:'0',AMT_NUM6:'3',AMT_NUM13:'280',UPDATE_DATE:'2026-09-01'},'2026-10-14T00:00:00Z')
 const nutrition={status:'ok',match:'report_number',source:SOURCES.nutrition,records:[record],message:'품목제조보고번호가 일치합니다.'}
 await page.route('**/api/product-data?*',r=>r.fulfill({json:{productId:25100569,procurement:{status:'ok',source:SOURCES.procurement,message:'물품식별번호가 일치하는 계약입니다.',offers:[{id:25100569,name:'UI 테스트용 황태해장국',manufacturer:'테스트 제조사',supplier:'테스트 공급자',unitPrice:1500,unit:'봉',origin:'국내산',contractType:'일반단가',contractNumber:'TEST-CONTRACT',contractStart:'2026-01-01',contractEnd:'2026-12-31',region:'전국',fetchedAt:'2026-10-14T00:00:00Z'}]},nutrition}}))
 await panel.getByRole('button',{name:'공공 데이터 다시 불러오기'}).click()
 await panel.getByText('보고번호 일치',{exact:true}).waitFor()
 assert.match(await panel.innerText(),/100g 기준/);assert.match(await panel.innerText(),/6.5 g/);assert.match(await panel.innerText(),/0 g/);assert.match(await panel.innerText(),/미제공/)
 assert.equal(await panel.locator('a[href="https://www.data.go.kr/data/15127578/openapi.do"]').count(),1)
 await page.screenshot({path:'qa/public-data-mock-success.png',fullPage:true})
 await page.getByRole('button',{name:'AI 도우미',exact:true}).click()
 await page.getByRole('textbox',{name:'급식 도우미에게 질문'}).fill('25100569 영양정보 알려줘')
 await page.getByRole('button',{name:'질문 보내기',exact:true}).click()
 await page.locator('.chat-message.assistant').filter({hasText:'인증키'}).waitFor()
 assert.ok(await page.locator('.ai-evidence').getByText('인증키 발급 대기',{exact:true}).count()>0)
 await page.route('**/api/chat',r=>r.fulfill({json:{mode:'demo',text:'UI 테스트 응답: 공식 자료의 100g 기준 단백질은 6.5 g입니다.',products:[],nutritionEvidence:[{...nutrition,productId:25100569,productName:'UI 테스트용 황태해장국'}]}}))
 await page.getByRole('textbox',{name:'급식 도우미에게 질문'}).fill('테스트 영양정보 알려줘')
 await page.getByRole('button',{name:'질문 보내기',exact:true}).click()
 await page.locator('.ai-evidence').getByText('보고번호 일치',{exact:true}).waitFor()
 assert.match(await page.locator('.ai-evidence .official-nutrition-record').innerText(),/6.5 g/)
 await page.screenshot({path:'qa/public-data-chat-mock.png',fullPage:true})
 await page.setViewportSize({width:390,height:844})
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Mobile API evidence overflows')
 assert.deepEqual(errors,[])
 console.log('PASS: real missing-key detail/chat, fixture contract+nutrition rendering, shared evidence values/source links, mobile width; success responses were MOCKS, not live API validation.')
}finally{await browser.close()}
