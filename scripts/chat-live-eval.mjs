// Explicit opt-in: these checks call the running app and may consume Claude/API credits.
import {writeFile,mkdir} from 'node:fs/promises'
import path from 'node:path'
import {chatRequestContext} from '../shared/chat-history.mjs'
if(!process.argv.includes('--run-live'))throw Error('실제 API 검증은 --run-live를 지정해야 합니다.')
const option=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1]}
const base=option('--url','http://127.0.0.1:5184'),out=option('--out','.local/chat-eval.json'),only=option('--only','')
const is=(actual,expected)=>JSON.stringify(actual)===JSON.stringify(expected)
const hasAll=(actual,expected)=>expected.every(x=>actual?.includes(x))
const sessions=new Map(),results=[]
const mealIds=r=>r.plan?.days.flatMap(d=>d.meals.flatMap(m=>m.items.filter(p=>!p.missing).map(p=>p.id)))||[]
const cases=[
 {id:'meal-complete',session:'meal',message:'10월 20일 아침, 150명, 메인 1개와 반찬 2개로 식단 추천해줘. 맵지 않게 하고 새우는 빼줘. 1인 한 끼 예산은 5천 원이야.',check:r=>[!!r.plan,'추가 문진 없이 식단 생성',r.plan?.settings.people===150&&is(r.plan?.settings.meals,['아침'])&&is(r.plan?.settings.composition,{주찬:1,부찬:2}),'범위·인원·구성 보존']},
 {id:'exclusion-add',session:'meal',message:'계란도 제외해줘.',check:r=>[hasAll(r.chatContext?.meal?.exclusions,['새우','계란']),'기존 제외 재료에 추가',r.chatContext?.meal?.people===150,'인원 유지']},
 {id:'explain-no-regenerate',session:'meal',message:'지금까지 정한 식단 조건을 알려줘. 새로 만들지는 말고.',check:r=>[r.answerKind==='guidance'&&!r.plan,'설명 요청은 재생성하지 않음',hasAll(r.chatContext?.meal?.exclusions,['새우','계란']),'설명 후에도 조건 유지']},
 {id:'exclusion-clear',session:'meal',message:'제외 조건은 이제 전부 해제해줘.',check:r=>[is(r.chatContext?.meal?.exclusions,[]),'제외 조건 해제',r.chatContext?.meal?.people===150,'다른 조건 유지']},
 {id:'meal-alternative',session:'meal',message:'방금 것 말고 대안을 보여줘.',check:(r,s)=>[!!r.plan,'같은 범위의 대안 식단 생성',r.chatContext?.meal?.seed>(s.memory?.meal?.seed||0),'재추천 선택값 변경',!is(mealIds(r),s.lastMealIds),'상품 구성 변경']},
 {id:'scope-edit',session:'meal',message:'이번엔 점심으로. 예산은 6천 원, 반찬만 하나로 줄여줘.',check:r=>[is(r.chatContext?.meal?.meals,['점심']),'점심만 선택',r.chatContext?.meal?.mealBudgets?.[1]===6000&&is(r.chatContext?.meal?.composition,{주찬:1,부찬:1}),'예산·반찬 수만 수정',r.chatContext?.meal?.people===150,'인원 유지']},
 {id:'nutrition-rank',session:'product',message:'우유 중에서 100mL당 단백질 가장 높은 거 하나만 추천해줘.',check:r=>[r.query?.basis?.unit==='mL'&&r.query?.basis?.amount===100&&r.query?.limit===1,'영양 비교 기준·개수 보존',(r.products||[]).length<=1&&(!r.products?.length||r.comparison?.every(c=>c.values?.protein!=null)),'확인된 영양 근거로만 추천']},
 {id:'nutrition-followup',session:'product',message:'가격은 1천 원 이하로, 같은 기준 유지해.',check:r=>[r.query?.maxPrice===1000&&r.query?.limit===1,'가격만 변경하고 추천 개수 유지',r.query?.basis?.unit==='mL'&&r.query?.basis?.amount===100&&r.query?.sort==='protein','영양 기준 유지']},
 {id:'reset-all',session:'product',message:'조건은 다 잊고 처음부터 얘기하자. 안녕 밀리!',check:r=>[r.answerKind==='guidance','인사로 응답',!r.chatContext?.recommendation?.query&&!r.chatContext?.meal?.people,'이전 조건 초기화']},
 {id:'two-products',session:'product',message:'두부는 3천 원 이하, 가격이 가장 중요해. 두 개만 추천해줘.',check:r=>[r.products?.length===2,'상품 두 개만 추천',r.products?.every(p=>p.unitPrice<=3000),'가격 상한 준수']},
 {id:'refer-second',session:'product',message:'두 번째 거 이름이랑 가격만 다시 알려줘.',check:(r,s)=>[r.products?.length===1&&r.products[0].id===s.productIds[1],'두 번째 상품만 참조',!r.needsPreference,'이미 답한 추천 기준 재질문 없음',r.answerKind==='product_info'&&!r.nutritionEvidence,'요청하지 않은 영양 정보 조회 방지']},
 {id:'different-products',session:'product',message:'그거 말고 다른 두부 두 개 추천해줘. 가격 기준은 같아.',check:(r,s)=>[r.products?.length===2,'대안 두 개 추천',r.products?.every(p=>!s.productIds.includes(p.id)),'방금 상품 재추천 방지']},
]
for(const c of cases){
 if(only&&!only.split(',').includes(c.session))continue
 const s=sessions.get(c.session)||{messages:[],history:[],conversation:[],productIds:[],memory:undefined,settings:undefined,lastMealIds:[]}
 const start=performance.now();let r,status,error
 try{const response=await fetch(base+'/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:c.message,...chatRequestContext(s.messages,s.settings)}),signal:AbortSignal.timeout(65000)});status=response.status;r=await response.json()}catch(e){error=e.message;r={}}
 const checks=status===200?c.check(r,s):[false,error||r.error||'HTTP '+status]
 const assertions=[];for(let i=0;i<checks.length;i+=2)assertions.push({pass:Boolean(checks[i]),name:checks[i+1]})
 const row={id:c.id,message:c.message,status,ms:Math.round(performance.now()-start),pass:assertions.every(a=>a.pass),assertions,query:r.query,context:r.chatContext,text:r.text,error:r.error||error,products:r.products?.map(p=>({id:p.id,name:p.name,price:p.unitPrice})),mealIds:mealIds(r)}
 results.push(row);console.log(JSON.stringify({id:row.id,pass:row.pass,ms:row.ms,failed:assertions.filter(a=>!a.pass).map(a=>a.name),text:row.text?.slice(0,280),error:row.error}))
 if(status===200){s.messages.push({role:'user',text:c.message},{role:'assistant',text:r.text,reply:r});if(r.contextReset){s.history=[];s.conversation=[];s.productIds=[];s.settings=undefined;s.lastMealIds=[]}s.history.push(c.message);s.conversation.push({role:'user',text:c.message},{role:'assistant',text:r.text});s.memory=r.chatContext;if(r.plan){s.settings=r.plan.settings;s.lastMealIds=mealIds(r)}if(r.products?.length)s.productIds=r.products.slice(0,8).map(p=>p.id);sessions.set(c.session,s)}
 await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify({createdAt:new Date().toISOString(),base,results},null,2))
}
const times=results.map(r=>r.ms).sort((a,b)=>a-b)
console.log(JSON.stringify({passed:results.filter(r=>r.pass).length,total:results.length,medianMs:times[Math.floor(times.length/2)],maxMs:times.at(-1),out}))
if(results.some(r=>!r.pass))process.exitCode=1
