import {interpretDemo,validateConditions} from './_query.mjs'

const meals=['아침','점심','저녁']
const empty=()=>({start:null,days:null,meals:null,composition:null,people:null,preferences:null,preferenceNotes:[],preferredIngredients:[],exclusions:[],mealBudgets:null,budgetConfirmed:[],dailyTargets:[],mealTargets:[],targetSource:'',seed:0,pending:true})
const count=s=>({한:1,하나:1,두:2,둘:2,세:3,셋:3}[s]??Number(s.replaceAll(',','')))
const money=s=>{const m=s.match(/([\d,]+(?:\.\d+)?)\s*(만)?\s*원/);return m?Number(m[1].replaceAll(',',''))*(m[2]?10000:1):null}
export function isMealRequest(text){return /(?:식단|급식표|메인\s*메뉴|주찬|서브\s*반찬|아침|점심|저녁|조식|중식|석식)/.test(text)&&/(?:짜|추천|만들|구성해|계획해|부탁)/.test(text)&&!/(?:방법|어떻게|왜|줄이려면|설명)/.test(text)}
export function validateMealContext(input){
  if(!input||typeof input!=='object')return null
  const s={...empty(),...input}
  if(s.start!=null){const d=new Date(s.start+'T12:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(s.start)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==s.start)throw Error('식단 날짜를 확인해 주세요.')}
  for(const [key,max] of [['days',31],['people',10000]])if(s[key]!=null&&(!Number.isInteger(s[key])||s[key]<1||s[key]>max))throw Error('식단 기간·인원을 확인해 주세요.')
  if(s.meals!=null&&(!Array.isArray(s.meals)||!s.meals.length||s.meals.some(x=>!meals.includes(x))))throw Error('추천할 끼니를 확인해 주세요.')
  if(s.composition!=null){if(typeof s.composition!=='object')throw Error('메뉴 구성을 확인해 주세요.');const entries=Object.entries(s.composition);if(!entries.length||entries.some(([k,n])=>!['밥','국','주찬','부찬','김치','후식'].includes(k)||!Number.isInteger(n)||n<0||n>4)||entries.reduce((a,[,n])=>a+n,0)<1)throw Error('메뉴 개수는 종류별 0–4개로 입력해 주세요.')}
  if(s.preferences!=null&&(!Array.isArray(s.preferences)||!s.preferences.length||s.preferences.some(x=>!['한식','혼합','맵지 않게','매콤하게','가격 우선','고단백','선호 제한 없음'].includes(x))))throw Error('선호 조건을 확인해 주세요.')
  if(s.mealBudgets!=null&&(!Array.isArray(s.mealBudgets)||s.mealBudgets.length!==3||s.mealBudgets.some(n=>!Number.isFinite(n)||n<100||n>100000)))throw Error('1인 한 끼 예산은 100–100,000원으로 입력해 주세요.')
  s.exclusions=Array.isArray(s.exclusions)?s.exclusions.slice(0,10).map(x=>String(x).slice(0,40)):[]
  for(const field of ['preferenceNotes','preferredIngredients'])s[field]=Array.isArray(s[field])?[...new Set(s[field].slice(0,8).map(x=>String(x).trim().slice(0,100)).filter(Boolean))]:[]
  s.seed=Number.isInteger(s.seed)?Math.abs(s.seed)%10000:0
  s.budgetConfirmed=Array.isArray(s.budgetConfirmed)?[...new Set(s.budgetConfirmed.filter(x=>meals.includes(x)))]:[]
  s.dailyTargets=validateConditions(s.dailyTargets);s.mealTargets=validateConditions(s.mealTargets)
  s.targetSource=String(s.targetSource||'').slice(0,150)
  return Object.fromEntries(Object.keys(empty()).map(k=>[k,s[k]]))
}

// Chat must collect explicit choices; simulator defaults are never evidence of user intent.
export function mealRequest(message,previous=null,{now=new Date(),force=false}={}){
  const text=String(message).normalize('NFKC'),old=validateMealContext(previous)
  const newRequest=force||isMealRequest(text),keep=old&&(!newRequest||old.pending||/이 조건|같은 식단|이 식단|그대로|만\s*바꿔|만\s*변경/.test(text))
  const s=keep?{...old}:empty();let changed=false
  const set=(key,value)=>{s[key]=value;changed=true}
  const today=now.toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}),year=today.slice(0,4)
  const date=text.match(/(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일/),iso=text.match(/\b(\d{4}-\d{2}-\d{2})\b/)
  let remainder=text
  if(date){set('start',`${date[1]||year}-${date[2].padStart(2,'0')}-${date[3].padStart(2,'0')}`);remainder=remainder.replace(date[0],' ')}
  else if(iso){set('start',iso[1]);remainder=remainder.replace(iso[0],' ')}
  else if(/오늘|내일|모레/.test(text)){const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+(/모레/.test(text)?2:/내일/.test(text)?1:0));set('start',d.toISOString().slice(0,10))}
  const range=text.match(/(\d{1,2})월\s*(\d{1,2})일\s*부터\s*(?:(\d{1,2})월\s*)?(\d{1,2})일\s*까지/)
  if(range){const end=`${date?.[1]||year}-${(range[3]||range[1]).padStart(2,'0')}-${range[4].padStart(2,'0')}`;set('days',Math.round((Date.parse(end)-Date.parse(s.start))/86400000)+1)}
  else if(/일주일|한\s*주|주간/.test(remainder))set('days',7)
  else {const duration=remainder.match(/(\d+)\s*(일간|일치|일 동안|일 식단|일분|주간|주치)/);if(duration)set('days',Number(duration[1])*(duration[2].startsWith('주')?7:1));else if(/하루|당일/.test(remainder)||(!keep||!s.days)&&(date||iso||/오늘|내일|모레/.test(text)))set('days',1)}
  const selected=meals.filter((m,i)=>new RegExp(m+'|'+['조식','중식','석식'][i]).test(text))
  if(/세\s*끼|3\s*끼|모든\s*끼니|하루\s*전체/.test(text))set('meals',meals)
  else if(selected.length)set('meals',selected)
  const people=text.match(/(\d[\d,]*)\s*명/);if(people)set('people',count(people[1]))
  const composition={}
  for(const [role,words] of [['주찬','메인(?:\\s*메뉴)?|주찬'],['부찬','서브(?:\\s*반찬)?|반찬|부찬'],['밥','밥'],['국','국'],['김치','김치'],['후식','후식|디저트']]){
    const found=text.match(new RegExp(`(?:${words})\\s*(\\d+|한|두|세|하나|둘|셋)\\s*(?:가지|개)`));if(found)composition[role]=count(found[1])
  }
  if(Object.keys(composition).length)set('composition',keep&&/만\s*바꿔|만\s*변경/.test(text)?{...s.composition,...composition}:composition)
  if(/기본\s*(?:구성|식단)|밥[·,\s]+국[·,\s]+주찬/.test(text))set('composition',{밥:1,국:1,주찬:1,부찬:1,김치:1})
  const preferences=[]
  if(/한식/.test(text))preferences.push('한식')
  if(/혼합|양식도/.test(text))preferences.push('혼합')
  if(/맵지\s*않|안\s*맵|안\s*매운|순한|매운\s*(?:건|것|음식|메뉴)?\s*(?:싫|빼|제외)/.test(text))preferences.push('맵지 않게')
  else if(/매콤|매운\s*(?:걸|것|음식|메뉴|맛)|얼큰/.test(text))preferences.push('매콤하게')
  if(/저렴|가격\s*우선|싼\s*걸/.test(text))preferences.push('가격 우선')
  if(/고단백|단백질\s*(?:많|높|위주|풍부)/.test(text))preferences.push('고단백')
  if(/(?:취향|선호|맛|제외|제한|알레르기)(?:은|는|가|도)?\s*(?:상관\s*없|없)|아무거나|상관없어/.test(text))preferences.push('선호 제한 없음')
  if(preferences.length)set('preferences',preferences)
  const excluded=[...text.matchAll(/([가-힣A-Za-z]+?)(?:은|는|을|를)?\s*(?:제외|빼줘|빼고|없이)/g)].map(m=>m[1]).filter(x=>!['후식','디저트','매운','음식','메뉴'].includes(x))
  if(excluded.length){set('exclusions',[...new Set([...s.exclusions,...excluded])]);if(!s.preferences)set('preferences',['선호 제한 없음'])}
  if(/제외\s*(?:재료|조건)?\s*(?:없|해제)/.test(text))set('exclusions',[])
  const budgets=s.mealBudgets?[...s.mealBudgets]:[4000,5000,4000];let explicitBudget=false
  s.budgetConfirmed=[...s.budgetConfirmed]
  for(const [i,m] of meals.entries()){const b=text.match(new RegExp(m+'\\s*(?:예산)?\\s*([\\d,.]+\\s*(?:만)?\\s*원)'));if(b){budgets[i]=money(b[1]);s.budgetConfirmed.push(m);explicitBudget=true}}
  if(!explicitBudget&&/(?:예산|한\s*끼|1인|인당)/.test(text)&&money(text)!=null){const b=money(text);for(const m of s.meals||meals){budgets[meals.indexOf(m)]=b;s.budgetConfirmed.push(m)}explicitBudget=true}
  if(explicitBudget)set('mealBudgets',budgets)
  if(/기본\s*예산|데모\s*예산/.test(text)){set('mealBudgets',[4000,5000,4000]);s.budgetConfirmed=meals}
  if(/단백질|나트륨|열량|칼로리|당류|지방|탄수화물|칼슘/.test(text)){
    const nutrients=interpretDemo(text).conditions
    if(nutrients.length){const daily=/하루|1일|일일/.test(text);set(daily?'dailyTargets':'mealTargets',nutrients);set('targetSource',daily?'사용자 지정 · 1인 하루 목표':'사용자 지정 · 요청한 구성 1인분 목표')}
  }
  if(!newRequest&&!old)return null
  if(!newRequest&&!changed&&!/그대로|다시\s*(?:추천|만들)|기본값/.test(text))return null
  if(!s.start)s.start=today
  return validateMealContext(s)
}

export function mealRequestReply(request){
  const s=validateMealContext(request),questions=[],missingFields=[]
  const ask=(field,text)=>{missingFields.push(field);questions.push(text)}
  if(!s.days)ask('days','며칠 동안의 식단인가요?')
  if(!s.meals)ask('meals','아침·점심·저녁 중 어떤 끼니가 필요한가요?')
  if(!s.composition)ask('composition','메뉴 구성은 어떻게 할까요? “기본 구성”이면 밥·국·주찬·부찬·김치를 각 1개씩 준비해요.')
  if(!s.people)ask('people','몇 명이 드시나요?')
  if(!s.preferences?.length&&!s.preferenceNotes.length&&!s.preferredIngredients.length&&!s.exclusions.length)ask('preferences','선호하는 맛·식단이나 제외할 재료가 있나요? (예: 한식, 맵지 않게, 새우 제외 / 없으면 “선호 없음”)')
  if(!s.mealBudgets||s.meals?.some(m=>!s.budgetConfirmed.includes(m)))ask('mealBudgets',`1인 한 끼 예산은 얼마인가요? “기본 예산”을 선택하면 ${(s.meals||meals).map(m=>`${m} ${m==='점심'?'5,000':'4,000'}원`).join('·')}을 사용해요.`)
  const scope=[s.start,s.days?`${s.days}일`:'기간 미정',s.meals?.join('·')||'끼니 미정',s.composition?Object.entries(s.composition).filter(([,n])=>n).map(([r,n])=>`${r==='주찬'?'메인':r==='부찬'?'반찬':r} ${n}개`).join(' · '):'구성 미정'].join(' / ')
  s.pending=questions.length>0
  return {needsMealDetails:s.pending,missingFields,questions,mealRequestContext:s,products:[],text:`요청 내용: ${scope}${s.people?` / ${s.people}명`:''}${questions.length?'\n추천 전에 다음 조건을 알려주세요.\n'+questions.map((q,i)=>`${i+1}. ${q}`).join('\n'):'\n확인한 조건으로 식단을 구성할게요.'}`}
}
export function mealRequestSettings(request){
  const r=mealRequestReply(request);if(r.needsMealDetails)throw Error('식단 추천 조건을 먼저 확인해 주세요.')
  const s=r.mealRequestContext
  return {...s,cuisine:s.preferences?.includes('한식')?'한식':'혼합',dessert:false,nutritionScope:s.composition.밥&&s.composition.국&&s.composition.주찬?'meal':'selection',preferenceLabels:s.preferences||[]}
}
