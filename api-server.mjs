import http from 'node:http'
import {readFile,stat} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomBytes,scrypt as scryptCallback,timingSafeEqual,randomUUID} from 'node:crypto'
import {promisify} from 'node:util'
import {createLocalStore,createBlobStore} from './account-store.mjs'
import {mergeCatalog} from './shared/catalog.mjs'
import {interpretDemo,interpretWithClaude,explainVerified,answerAdvice,clarifyMeal,validateQuery,claudeKey} from './api/_claude.mjs'
import {answerCatalog} from './api/_catalog-service.mjs'
import {planSettings,createPlan} from './api/_planner.mjs'
import {recommend,continueRecommendation} from './api/_recommendation.mjs'
import {conversationContext,contextIds} from './api/_conversation.mjs'
import {publicProduct} from './shared/catalog.mjs'
import {getProductImages} from './api/_product-images.mjs'
import {createPublicDataService} from './api/_public-data.mjs'
import {answerNutrition} from './api/_nutrition-answer.mjs'
import {createDataStore,applyOfficialData} from './api/_data-store.mjs'
import {candidates,lookupBatch} from './api/_retrieval.mjs'
import {nutrientKeys} from './shared/nutrition.mjs'
import {alternativeFacts} from './shared/alternative-facts.mjs'
import {officialEntries,mergeOfficialEntries} from './shared/official-nutrition.mjs'
import {alternatives} from './shared/catalog.mjs'
import {createNutrientPlan,assessPlan} from './api/_plan-nutrition.mjs'
import {mealRequest,mealRequestReply,mealRequestSettings,validateMealContext} from './api/_meal-request.mjs'
import {chatMemory,mergeMealTurn,hasUserEvidence} from './api/_chat-state.mjs'
const scrypt=promisify(scryptCallback),root=process.env.VERCEL?process.cwd():path.dirname(fileURLToPath(import.meta.url))
try {for(const line of (await readFile(path.join(root,'.env'),'utf8')).split(/\r?\n/)){const m=line.match(/^([A-Z_]+)=(.*)$/);if(m&&process.env[m[1]]===undefined)process.env[m[1]]=m[2].trim().replace(/^['"]|['"]$/g,'')}}catch(e){if(e.code!=='ENOENT')throw e}
const rows=JSON.parse(await readFile(path.join(root,'public/data/products.json'),'utf8'))
const market=JSON.parse(await readFile(path.join(root,'public/data/market-enrichment.json'),'utf8'))
const products=mergeCatalog(rows,market)
const dataStore=await createDataStore(process.env.MILIMARKET_DATA_DIR||path.join(root,'.local'),{cloud:!!process.env.VERCEL})
const publicData=createPublicDataService({saved:()=>officialData(),onResult:(id,provider,value)=>dataStore.put(id,provider,value)})
// 식약처 일괄 매칭 확정분(배포 포함) 위에 실시간 조회 결과를 겹친다.
const bulkOfficial=officialEntries(await readFile(path.join(root,'public/data/official-nutrition.json'),'utf8').then(JSON.parse).catch(()=>null))
const officialData=()=>mergeOfficialEntries(bulkOfficial,dataStore.entries())
const currentProducts=()=>applyOfficialData(products,officialData())
async function generatePlan(input){
  const initial=createNutrientPlan(currentProducts(),input)
  const constrained=[...(input.dailyTargets||[]),...(input.mealTargets||[])].some(t=>t.min!=null||t.max!=null)
  if(constrained&&initial.nutritionVerified)return initial
  const seed=constrained?createPlan(currentProducts(),input):initial
  // data.go.kr can take ~10s per call: plan with what arrives quickly; the rest keeps loading and is saved for later plans.
  const lookups=lookupBatch(seed.purchase.map(p=>products.find(x=>x.id===p.id)).filter(Boolean),publicData,{max:40,deadlineMs:10000}).catch(()=>{})
  await Promise.race([lookups,new Promise(r=>setTimeout(r,2500))])
  return constrained?createNutrientPlan(currentProducts(),input):assessPlan(initial,currentProducts())
}
const rates=new Map()
const cloud=!!process.env.VERCEL
const store=cloud?await createBlobStore():await createLocalStore(process.env.MILIMARKET_DATA_DIR||path.join(root,'.local'))
// Lookup results are written once per response instead of once per product.
const json=async(res,status,data,headers={})=>{await dataStore.flush();res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(data))}
async function readBody(req){
  if(!String(req.headers['content-type']).startsWith('application/json'))throw new Error('JSON 형식으로 요청해 주세요.')
  if(req.body!==undefined){const body=typeof req.body==='string'?req.body:JSON.stringify(req.body);if(Buffer.byteLength(body)>128000)throw new Error('입력 내용이 너무 깁니다.');return JSON.parse(body)}
  let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>128000)throw new Error('입력 내용이 너무 깁니다.')}return JSON.parse(body)
}
const cookieToken=req=>req.headers.cookie?.match(/(?:^|;\s*)mm_session=([a-f0-9]+)/)?.[1]
const userOf=req=>store.getSession(cookieToken(req))
const safeUser=u=>u?{id:u.id,name:u.name,email:u.email}:null
async function loginSession(res,user){const id=await store.createSession(user);await json(res,200,{user:safeUser(user)},{'Set-Cookie':`mm_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${cloud?'; Secure':''}`})}
function limit(req,key,max){const now=Date.now(),id=`${req.socket.remoteAddress}:${key}`,entry=rates.get(id);if(!entry||entry.until<now){rates.set(id,{n:1,until:now+60000});return true}return ++entry.n<=max}
export async function handler(req,res){
  try {
    const url=new URL(req.url,'http://localhost'),api=url.pathname.startsWith('/api/')
    if(api){
      const hostname=String(req.headers.host||'').replace(/:\d+$/,'')
      const allowedHosts=['127.0.0.1','localhost','[::1]',...(cloud?[process.env.VERCEL_URL,process.env.VERCEL_PROJECT_PRODUCTION_URL,process.env.APP_HOST].filter(Boolean):[])]
      if(!allowedHosts.includes(hostname))return json(res,403,{error:'등록된 데모 주소에서만 사용할 수 있습니다.'})
      if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return json(res,403,{error:'허용되지 않은 요청 출처입니다.'})
      if(!limit(req,'all',90))return json(res,429,{error:'요청이 많습니다. 잠시 후 다시 시도해 주세요.'})
      if(url.pathname==='/api/catalog-updates'&&req.method==='GET'){
        await dataStore.refresh();return json(res,200,{updates:Object.fromEntries(currentProducts().filter(p=>dataStore.entries()[p.id]).map(p=>[p.id,{verifiedNutrition:p.verifiedNutrition,officialNutritionState:p.officialNutritionState,manufacturer:p.manufacturer,market:p.market}]))})
      }
      if(url.pathname==='/api/nutrition-sync'&&req.method==='POST'){
        if(!limit(req,'sync',4))return json(res,429,{error:'데이터 조회는 분당 4회까지 가능합니다.'})
        if(!publicData.status().nutrition.configured)return json(res,503,{error:'식약처 API 인증키를 서버에 설정한 뒤 조회해 주세요.'})
        const body=await readBody(req),query=String(body.query||'').slice(0,150),pool=candidates(products,{query}),offset=Math.max(0,Math.trunc(Number(body.offset))||0),batch=pool.slice(offset,offset+20)
        const found=await lookupBatch(batch,publicData,{max:20,deadlineMs:20000}),failed=found.filter(e=>e.status==='error').length,next=failed?offset:offset+found.length
        return json(res,200,{total:pool.length,queried:found.length,next,done:!failed&&next>=pool.length,failed,confirmed:found.filter(e=>e.match==='report_number').length})
      }
      if(url.pathname==='/api/product-data'&&req.method==='GET'){
        const id=url.searchParams.get('id'),product=/^\d{8}$/.test(id||'')?products.find(p=>String(p.id)===id):null
        if(!product)return json(res,404,{error:'등록된 상품을 찾을 수 없습니다.'})
        if(!limit(req,'public-data',12))return json(res,429,{error:'공공 데이터 조회는 분당 12회까지 가능합니다.'})
        return json(res,200,await publicData.productData(product))
      }
      if(url.pathname==='/api/product-images'&&req.method==='GET'){
        const id=url.searchParams.get('id')
        if(!/^\d{8}$/.test(id||'')||!products.some(p=>String(p.id)===id))return json(res,404,{error:'등록된 상품을 찾을 수 없습니다.'})
        if(!limit(req,'images',30))return json(res,429,{error:'잠시 후 이미지를 다시 조회해 주세요.'})
        try{return json(res,200,await getProductImages(Number(id)),{'Cache-Control':'public, max-age=3600'})}
        catch{return json(res,502,{error:'나라장터 이미지 조회가 지연되고 있습니다. 다시 시도해 주세요.'})}
      }
      const user=await userOf(req),method=req.method
      if(url.pathname==='/api/status'&&method==='GET')return json(res,200,{configured:!!claudeKey(),model:process.env.ANTHROPIC_MODEL?.trim()||'claude-sonnet-5-5',catalogCount:products.length,user:safeUser(user),dataProviders:publicData.status()})
      if(['/api/register','/api/login'].includes(url.pathname)&&method==='POST'){
        if(!limit(req,'auth',10))return json(res,429,{error:'로그인 시도가 많습니다. 1분 후 다시 시도해 주세요.'})
        const body=await readBody(req),email=String(body.email||'').trim().toLowerCase(),password=String(body.password||'')
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>120||password.length<8||password.length>128)return json(res,400,{error:'이메일과 8–128자의 비밀번호를 입력해 주세요.'})
        if(url.pathname==='/api/register'){
          if(await store.findUser(email))return json(res,409,{error:'이미 등록된 이메일입니다.'})
          const salt=randomBytes(16).toString('hex'),hash=(await scrypt(password,salt,64)).toString('hex')
          if(await store.findUser(email))return json(res,409,{error:'이미 등록된 이메일입니다.'})
          const account={id:randomUUID(),email,name:String(body.name||'급식 담당자').trim().slice(0,30)||'급식 담당자',salt,hash,history:[]};await store.createUser(account);return await loginSession(res,account)
        }
        const account=await store.findUser(email),salt=account?.salt||'00000000000000000000000000000000'
        const hash=await scrypt(password,salt,64)
        if(!account||!timingSafeEqual(Buffer.from(account.hash,'hex'),hash))return json(res,401,{error:'이메일 또는 비밀번호를 확인해 주세요.'})
        return await loginSession(res,account)
      }
      if(url.pathname==='/api/logout'&&method==='POST'){await store.deleteSession(cookieToken(req));return json(res,200,{ok:true},{'Set-Cookie':`mm_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${cloud?'; Secure':''}`})}
      if(url.pathname==='/api/chat'&&method==='POST'){
        if(!limit(req,'chat',12))return json(res,429,{error:'AI 요청은 분당 12회까지 가능합니다.'})
        const body=await readBody(req),message=String(body.message||'').trim()
        if(!message||message.length>2000)return json(res,400,{error:'질문을 1–2,000자로 입력해 주세요.'})
        await dataStore.refresh()
        let history=Array.isArray(body.history)?body.history.slice(-8).map(x=>String(x).slice(0,1000)):[]
        let conversation=conversationContext(body.conversation),ids=contextIds(body.productIds,currentProducts())
        let contextSettings=body.planSettings&&typeof body.planSettings==='object'?planSettings(body.planSettings):null
        const memory=chatMemory(body)
        let recommendationContext=memory.recommendation?validateQuery(memory.recommendation):null,contextReset=false
        memory.recommendation=recommendationContext
        const respond=reply=>{
          if(Object.hasOwn(reply,'mealRequestContext'))memory.meal=reply.mealRequestContext
          if(reply.answerKind==='recommendation'){
            const sameTopic=JSON.stringify([memory.recommendation?.query,memory.recommendation?.queries])===JSON.stringify([reply.recommendationContext?.query,reply.recommendationContext?.queries])
            memory.recommendationSeenIds=[...new Set([...(sameTopic?memory.recommendationSeenIds:[]),...(reply.products||[]).map(p=>p.id)])].slice(-200)
          }
          if(Object.hasOwn(reply,'recommendationContext'))memory.recommendation=reply.recommendationContext
          if(reply.plan)memory.lastPlanProductIds=reply.plan.purchase.map(p=>p.id).slice(0,200)
          return json(res,200,{...reply,contextReset,chatContext:memory,mealRequestContext:memory.meal,recommendationContext:memory.recommendation})
        }
        // With a key, Claude reads every turn. Regex parsing is only the explicitly labelled no-key demo.
        const interpreted=await interpretWithClaude(message,history,{conversation,planSettings:contextSettings,productIds:ids,recommendationContext,mealRequestContext:memory.meal})
        const demoMeal=interpreted?null:mealRequest(message,memory.meal),continued=interpreted||demoMeal?null:continueRecommendation(message,recommendationContext)
        const query=interpreted||(demoMeal?{intent:'plan'}:continued||interpretDemo(message,history)),mode=interpreted?'claude':'demo'
        if(interpreted&&query.resetContext===true&&hasUserEvidence(query.resetEvidence,[message])){
          Object.assign(memory,chatMemory({chatContext:{meal:null,recommendation:null}}))
          contextReset=true;recommendationContext=null;history=[];conversation=[];ids=[];contextSettings=null
        }
        const previousSeed=memory.meal?.seed||0
        if(interpreted&&(query.intent==='plan'||query.mealPatch||query.resetMealContext)){
          const merged=mergeMealTurn(memory.meal,query,{message,history});memory.meal=merged.state
          if(query.resetMealContext===true&&hasUserEvidence(query.resetEvidence,[message]))memory.lastPlanProductIds=[]
          if(merged.rejected.length){
            const names={start:'날짜',days:'기간',meals:'끼니',composition:'메뉴 구성',people:'인원',preferences:'선호',preferenceNotes:'추가 선호',preferredIngredients:'선호 재료',exclusions:'제외 재료',mealBudgets:'예산',dailyTargets:'하루 영양 목표',mealTargets:'끼니 영양 목표',targetSource:'영양 기준 출처'}
            return respond({mode,query,answerKind:'meal_clarification',needsMealDetails:true,products:[],text:`${merged.rejected.map(k=>names[k]).join('·')} 변경 내용을 정확히 확인하지 못했어요. 바꾸려는 조건만 다시 알려주시겠어요? 다른 조건은 유지했습니다.`})
          }
        }
        else if(demoMeal)memory.meal=demoMeal
        if(query.intent==='product_info')return respond({mode,query,...answerCatalog(currentProducts(),{...query,sort:'default',nutrient:null,conditions:[]})})
        if(query.intent==='advice'){
          const matched=query.query||query.queries.length||query.productIds.length?candidates(currentProducts(),query):currentProducts().filter(p=>ids.includes(p.id))
          const advice=await answerAdvice({message,conversation,products:matched.slice(0,8),planSettings:contextSettings,mealRequestContext:memory.meal})
          return respond({mode,...advice,products:matched.filter(p=>advice.productIds?.includes(p.id)).map(publicProduct),query})
        }
        if(query.intent==='plan'){
          const intake=mealRequestReply(memory.meal||mealRequest(message,null,{force:true})||validateMealContext({}))
          if(intake.needsMealDetails)return respond({mode,query,...await clarifyMeal(intake,{message,conversation}),answerKind:'meal_clarification'})
          const plan=await generatePlan({...mealRequestSettings(intake.mealRequestContext),avoidProductIds:memory.meal.seed>previousSeed?memory.lastPlanProductIds:[]})
          const count=plan.purchase.length
          const s=plan.settings,scope=Object.entries(s.composition).filter(([,n])=>n).map(([r,n])=>`${r==='주찬'?'메인':r==='부찬'?'반찬':r} ${n}개`).join(' · ')
          return respond({mode,answerKind:'meal_recommendation',mealRequestContext:intake.mealRequestContext,query,plan,planSettings:s,products:plan.purchase.slice(0,8),text:`${s.start}부터 ${s.days}일 · ${s.meals.join('·')} · ${s.people}명\n${scope}로만 구성했습니다.\n선택 기준: ${[...s.preferenceLabels,...s.preferredIngredients.map(x=>x+' 선호')].join(' · ')||'추가 선호 메모 참조'}${s.preferenceNotes.length?' / 전달한 선호: '+s.preferenceNotes.join(' · ')+' (정량 충족은 별도 검증)':''} / 제외 재료: ${s.exclusions.join(', ')||'없음'}\n1인 예산: ${s.meals.map(m=>`${m} ${s.mealBudgets[['아침','점심','저녁'].indexOf(m)].toLocaleString('ko-KR')}원`).join(' · ')}\n나라장터 연결 상품 ${count}종 · 포장 구매 예상 ${plan.total.toLocaleString('ko-KR')}원. ${plan.total>plan.budget?'포장 올림 후 전체 예산 초과 · 수량 조정이 필요합니다.':''}\n${plan.missing?`조건에 맞는 상품이 없어 ${plan.missing}개 구성 항목이 비어 있습니다.`:'요청한 메뉴 구성을 완료했습니다.'}\n${plan.nutritionVerified?'공공데이터 영양값으로 계산한 결과, 입력한 영양 목표를 충족합니다.':s.dailyTargets.length||s.mealTargets.length?'영양 목표 충족은 확정되지 않았습니다. 우측 지표에서 자료 부족·미충족 여부를 확인해 주세요.':'영양 목표가 미설정되어 충족률은 판정하지 않습니다. 우측에서 공공데이터 확인 비율과 배식량 기준 영양 합계를 볼 수 있어요.'}`,followUps:['같은 조건으로 다른 메뉴를 추천해줘','이 식단을 선택한 이유를 설명해줘']})
        }
        const nutritionQuery=query.intent==='nutrition'||query.intent==='compare'&&!['price','gramPrice'].includes(query.sort)||query.nutrient||query.conditions.length||nutrientKeys.includes(query.sort)
        const excludePrevious=['recommend','alternative'].includes(query.intent)&&query.excludePrevious===true&&hasUserEvidence(query.selectionEvidence,[message])
        if(excludePrevious){query.productIds=[];query.productId=null;if(!query.query&&!query.queries.length)query.query=recommendationContext?.query||''}
        const answer=['recommend','alternative'].includes(query.intent)?await recommend(currentProducts(),query,publicData,{userMessages:[recommendationContext?.recommendationBasis,...history,message].filter(Boolean),semanticInterpretation:Boolean(interpreted),excludedProductIds:excludePrevious?[...memory.recommendationSeenIds,...ids]:[]}):nutritionQuery?await answerNutrition(currentProducts(),query,publicData):answerCatalog(currentProducts(),query)
        if(['search','nutrition'].includes(query.intent))memory.recommendation=validateQuery({...query,intent:'recommend'})
        return respond({mode,...await explainVerified(answer),query})
      }
      if(url.pathname==='/api/alternative-comment'&&method==='POST'){
        if(!limit(req,'chat',12))return json(res,429,{error:'AI 요청은 분당 12회까지 가능합니다.'})
        const body=await readBody(req),all=currentProducts(),current=all.find(p=>p.id===Number(body.productId))
        const option=current&&alternatives(all,current,20).find(p=>p.id===Number(body.alternativeId))
        if(!option)return json(res,404,{error:'비교할 대체 상품을 찾을 수 없습니다.'})
        // Claude는 서버가 만든 사실 문장 중 핵심만 고른다. 숫자를 만들거나 바꾸지 않는다.
        const facts=alternativeFacts(current,option),explained=await explainVerified({text:facts.join('\n')})
        return json(res,200,{facts,highlights:explained.highlights||facts.slice(0,2),mode:explained.explanationMode,notice:explained.explanationNotice||null})
      }
      if(url.pathname==='/api/plan'&&method==='POST')return json(res,200,await generatePlan(await readBody(req)))
      if(url.pathname==='/api/history'){
        if(!user)return json(res,401,{error:'식단 기록을 저장하려면 로그인해 주세요.'})
        if(method==='GET')return json(res,200,{history:user.history.map(h=>({id:h.id,createdAt:h.createdAt,settings:h.plan.settings,total:h.plan.total,missing:h.plan.missing}))})
        if(method==='POST'){const body=await readBody(req),plan=await generatePlan(body.settings);const entry={id:randomUUID(),createdAt:new Date().toISOString(),plan};await store.saveHistory(user,entry);return json(res,200,{id:entry.id})}
      }
      if(url.pathname.startsWith('/api/history/')&&method==='GET'){if(!user)return json(res,401,{error:'로그인이 필요합니다.'});const entry=user.history.find(h=>h.id===url.pathname.split('/').pop());return entry?json(res,200,entry.plan):json(res,404,{error:'저장된 식단을 찾을 수 없습니다.'})}
      return json(res,404,{error:'지원하지 않는 요청입니다.'})
    }
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end()}
    const relative=decodeURIComponent(url.pathname)==='/'?'index.html':decodeURIComponent(url.pathname).replace(/^\//,'')
    const dist=path.join(root,'dist'),file=path.resolve(dist,relative)
    if(!file.startsWith(dist+path.sep)||relative.split(/[\\/]/).some(s=>s.startsWith('.'))){res.writeHead(404);return res.end()}
    const info=await stat(file);if(!info.isFile()){res.writeHead(404);return res.end()}
    const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream'
    res.writeHead(200,{'Content-Type':mime,'X-Content-Type-Options':'nosniff','Cache-Control':relative==='index.html'?'no-cache':'public, max-age=300'})
    res.end(req.method==='HEAD'?undefined:await readFile(file))
  }catch(e){if(e.code==='ENOENT'){res.writeHead(404);res.end('Not found')}else await json(res,e.statusCode||400,{error:e.name==='TimeoutError'?'Claude 응답 시간이 초과되었습니다. 다시 시도해 주세요.':e instanceof SyntaxError?'입력 형식을 확인해 주세요.':String(e.message).slice(0,240)})}
}
export const server=http.createServer(handler)
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))server.listen(Number(process.env.PORT)||5184,'127.0.0.1',()=>console.log(`MiliMarket demo: http://127.0.0.1:${Number(process.env.PORT)||5184} (Claude ${claudeKey()?'configured':'key not set'})`))
