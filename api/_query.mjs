import {nutrientKeys} from '../shared/nutrition.mjs'
const aliases={protein:'단백질',sodium:'나트륨',calories:'열량|칼로리|kcal',calcium:'칼슘',sugars:'당류|당분',fat:'지방',carbs:'탄수화물'}
const number=s=>Number(String(s).replaceAll(',',''))
export const defaults=()=>({intent:'search',query:'',queries:[],productIds:[],maxPrice:null,minPrice:null,priceExclusive:false,minPriceExclusive:false,sort:'default',direction:'asc',limit:5,productId:null,nutrient:null,minNutrient:null,maxNutrient:null,basis:null,serving:null,conditions:[],days:7,people:120,exclusions:[],mealBudgets:[4000,5000,4000],dessert:true,cuisine:'한식',dailyTargets:[],targetSource:'',clarifications:[],recommendationBasis:'',priorityConfirmed:false,tastePreferences:[]})
function measure(v,allowServing=false){
  if(v==null)return null
  if(!Number.isFinite(v.amount)||v.amount<=0||!['g','mL',...(allowServing?['serving']:[])].includes(v.unit))throw new Error('기준량은 양수 g·mL 또는 1인분으로 지정해 주세요.')
  return {amount:v.amount,unit:v.unit}
}
export function validateConditions(rows=[]){
  if(!Array.isArray(rows)||rows.length>14)throw new Error('영양 조건 형식을 확인해 주세요.')
  return rows.map(c=>{
    if(!nutrientKeys.includes(c.nutrient))throw new Error('영양 조건을 확인해 주세요.')
    for(const k of ['min','max'])if(c[k]!=null&&(!Number.isFinite(c[k])||c[k]<0))throw new Error('영양 기준은 0 이상의 숫자여야 합니다.')
    if(c.min!=null&&c.max!=null&&c.min>c.max)throw new Error('영양 최솟값이 최댓값보다 큽니다.')
    return {nutrient:c.nutrient,min:c.min??null,max:c.max??null,minExclusive:c.minExclusive===true,maxExclusive:c.maxExclusive===true}
  })
}
export function validateQuery(input){
  const q={...defaults(),...input}
  if(!['search','nutrition','compare','alternative','plan','advice','recommend','product_info'].includes(q.intent))throw new Error('지원하지 않는 요청 형식입니다.')
  if(!['default','price','gramPrice',...nutrientKeys].includes(q.sort))throw new Error('정렬 조건을 확인해 주세요.')
  if(q.nutrient!=null&&!nutrientKeys.includes(q.nutrient))throw new Error('영양 조건을 확인해 주세요.')
  for(const k of ['minPrice','maxPrice','productId','minNutrient','maxNutrient'])if(q[k]!=null&&(!Number.isFinite(q[k])||q[k]<0))throw new Error('잘못된 숫자 조건입니다.')
  if(q.minPrice!=null&&q.maxPrice!=null&&q.minPrice>q.maxPrice)throw new Error('최소 가격이 최대 가격보다 큽니다.')
  q.conditions=validateConditions(q.conditions)
  if(!q.conditions.length&&q.nutrient&&(q.minNutrient!=null||q.maxNutrient!=null))q.conditions=validateConditions([{nutrient:q.nutrient,min:q.minNutrient,max:q.maxNutrient}])
  q.dailyTargets=validateConditions(q.dailyTargets)
  q.basis=measure(q.basis,true);q.serving=measure(q.serving)
  q.limit=Math.min(['recommend','alternative'].includes(q.intent)?2:20,Math.max(1,Math.trunc(q.limit)||5));
  q.priorityConfirmed=q.priorityConfirmed===true
  q.recommendationBasis=String(q.recommendationBasis||'').trim().slice(0,300);q.tastePreferences=Array.isArray(q.tastePreferences)?[...new Set(q.tastePreferences)].filter(x=>['spicy','mild','unsweetened','grilled'].includes(x)).slice(0,4):[];q.direction=q.direction==='desc'?'desc':'asc'
  q.query=String(q.query||'').trim().slice(0,150)
  q.queries=Array.isArray(q.queries)?q.queries.slice(0,4).map(x=>String(x).trim().slice(0,150)).filter(Boolean):[]
  q.productIds=[...new Set([...(Array.isArray(q.productIds)?q.productIds:[]),...(q.productId?[q.productId]:[])])].slice(0,8)
  if(q.productIds.some(id=>!Number.isInteger(id)||!/^\d{8}$/.test(String(id))))throw new Error('물품식별번호는 8자리여야 합니다.')
  q.productId=q.productIds[0]||null
  q.exclusions=Array.isArray(q.exclusions)?[...new Set(q.exclusions.slice(0,10).map(x=>String(x).trim().slice(0,40)).filter(Boolean))]:[]
  q.targetSource=String(q.targetSource||'').slice(0,150)
  q.clarifications=Array.isArray(q.clarifications)?q.clarifications.slice(0,6).map(String):[]
  if(q.dailyTargets.length&&!q.targetSource)q.targetSource='사용자 입력 · 공식 기준 미확인'
  if(q.intent==='plan'){
    if(!Number.isInteger(q.days)||q.days<1||q.days>31||!Number.isInteger(q.people)||q.people<1||q.people>10000)throw new Error('기간은 1–31일, 인원은 1–10,000명으로 입력해 주세요.')
    if(!Array.isArray(q.mealBudgets)||q.mealBudgets.length!==3||q.mealBudgets.some(n=>!Number.isFinite(n)||n<100||n>100000))throw new Error('끼니별 예산을 확인해 주세요.')
  }
  return q
}
export function interpretDemo(message,history=[]){
  const q=defaults(),original=String(message).normalize('NFKC');let text=original
  if(/어떻게|무엇|뭐야|왜 |차이|방법|설명|뜻|할 수 있/.test(text)&&!(/찾아|검색|상품.*추천/.test(text)))return validateQuery({...q,intent:'advice'})
  if(/식단|일주일|주간/.test(text))q.intent='plan'
  else if(/대체|더 저렴|비슷/.test(text))q.intent='alternative'
  else if(/추천/.test(text))q.intent='recommend'
  else if(/비교/.test(text))q.intent='compare'
  else if(new RegExp('영양|'+Object.values(aliases).join('|'),'i').test(text))q.intent='nutrition'
  q.productIds=[...text.matchAll(/\b\d{8}\b/g)].map(m=>Number(m[0]));q.productId=q.productIds[0]||null
  text=text.replace(/\b\d{8}\b/g,' ')
  text=text.replace(/(?:상위\s*)?(\d+)\s*(?:개|가지|건)(?:만)?/g,(_,n)=>{q.limit=Number(n);return ' '})
  const basis=text.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\s*(?:당|기준)/i)
  if(basis){q.basis={amount:Number(basis[1])*({kg:1000,g:1,ml:1,l:1000}[basis[2].toLowerCase()]),unit:/l/i.test(basis[2])?'mL':'g'};text=text.replace(basis[0],' ')}
  const serving=text.match(/1\s*인분\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|l)/i)
  if(serving){q.serving={amount:Number(serving[1])*({kg:1000,g:1,ml:1,l:1000}[serving[2].toLowerCase()]),unit:/l/i.test(serving[2])?'mL':'g'};text=text.replace(serving[0],' ');q.basis={amount:1,unit:'serving'}}
  else if(/1\s*인분/.test(text)){q.basis={amount:1,unit:'serving'};text=text.replace(/1\s*인분(?:당)?/g,' ')}
  for(const [key,word] of Object.entries(aliases)){
    const re=new RegExp(`(?:${word})(?:\\s*(?:함량|수치))?(?:이|가|은|는)?\\s*(\\d[\\d,]*(?:\\.\\d+)?)\\s*(mg|g|kcal)?\\s*(이상|이하|미만|초과)`,'gi')
    text=text.replace(re,(_,n,unit,op)=>{let v=number(n);if(unit?.toLowerCase()==='mg'&&!['sodium','calcium'].includes(key))v/=1000;if(unit?.toLowerCase()==='g'&&['sodium','calcium'].includes(key))v*=1000;q.conditions.push({nutrient:key,min:/이상|초과/.test(op)?v:null,max:/이하|미만/.test(op)?v:null,minExclusive:op==='초과',maxExclusive:op==='미만'});q.nutrient=key;return ' '})
    const rank=new RegExp(`(?:${word})(?:\\s*(?:함량|수치))?(?:이|가|은|는)?\\s*(높은|낮은|많은|적은|높|낮|많|적)(?:\\s*순(?:서)?)?`,'i')
    text=text.replace(rank,(_,order)=>{q.sort=key;q.nutrient=key;q.direction=/높|많/.test(order)?'desc':'asc';return ' '})
    if(new RegExp(word,'i').test(text)){q.nutrient=q.nutrient||key;text=text.replace(new RegExp(`(?:${word})(?:\\s*(?:정보|함량|수치))?`,'gi'),' ')}
  }
  text=text.replace(/(\d[\d,]*)\s*원\s*(이하|미만|이상|초과)/g,(_,n,op)=>{if(/이하|미만/.test(op)){q.maxPrice=number(n);q.priceExclusive=op==='미만'}else {q.minPrice=number(n);q.minPriceExclusive=op==='초과'}return ' '})
  if(/(?:kg|g|킬로그램|그램)당/.test(text)){q.sort='gramPrice';text=text.replace(/(?:(?:kg|g|킬로그램|그램)당)\s*(?:가격|단가)?(?:이|가|은|는)?/g,' ')}
  if(/저렴|싼|낮은 가격/.test(text)){if(q.sort==='default')q.sort='price';q.direction='asc'}
  if(/비싼|높은 가격/.test(text)){q.sort='price';q.direction='desc'}
  if(q.intent==='plan'){
    const days=text.match(/(\d+)\s*일/),weeks=text.match(/(\d+)\s*주/),people=text.match(/(\d[\d,]*)\s*명/)
    if(days)q.days=Number(days[1]);else if(weeks)q.days=Number(weeks[1])*7
    if(people)q.people=number(people[1])
    const money=s=>{const m=s.match(/([\d,]+(?:\.\d+)?)\s*(만)?\s*원/);return m?number(m[1])*(m[2]?10000:1):null}
    let explicitMeals=0;for(const [i,label] of ['아침','점심','저녁'].entries()){const m=text.match(new RegExp(label+'\\s*[:：]?\\s*([\\d,.]+\\s*(?:만)?\\s*원)'));if(m){q.mealBudgets[i]=money(m[1]);explicitMeals++}}
    const daily=text.match(/(?:하루|1일|일일)\s*(?:예산)?\s*[:：]?\s*([\d,.]+\s*(?:만)?\s*원)/)
    if(daily&&!explicitMeals){const total=money(daily[1]);q.mealBudgets=[Math.floor(total*4/13),Math.floor(total*5/13),total-Math.floor(total*4/13)-Math.floor(total*5/13)];q.clarifications.push('하루 예산을 아침·점심·저녁 4:5:4 비율로 배분했습니다. 끼니별 금액을 확인해 주세요.')}
    const excludes=[...text.matchAll(/([가-힣A-Za-z]+)(?:은|는|을|를)?\s*(?:제외|빼줘|빼고|없이)/g)].map(m=>m[1].replace(/(?:은|는|을|를)$/,''));q.exclusions=excludes.filter(x=>!['후식','디저트'].includes(x))
    if(/후식\s*(?:없이|제외|빼)|후식[은는을를]\s*(?:없이|제외|빼)/.test(text))q.dessert=false
    if(/혼합|양식|중식/.test(text))q.cuisine='혼합'
    if(/양식|중식/.test(text))q.clarifications.push('현재 식단 유형은 한식 또는 혼합입니다. 선택한 유형을 확인해 주세요.')
    if(/고단백|저염|저당/.test(text)&&!q.conditions.length)q.clarifications.push('고단백·저염·저당을 판단할 수치 기준을 식단 조건에 입력해 주세요.')
    if(q.conditions.length){q.dailyTargets=q.conditions;q.targetSource='질문에서 지정한 1인 하루 기준 · 공식 기준 미확인'}
    q.query=''
  }else{
    text=text.replace(/(?:가장\s*)?(?:낮은|높은)\s*순(?:서)?(?:으로|대로)?|(?:더\s*)?저렴한\s*(?:거|걸로|것)|단가|(?:더\s*)?저렴한?|싼|비싼|낮은\s*가격|높은\s*가격|비슷한|대체\s*상품|가격|영양(?:정보)?|비교해줘|비교|상위|순서|정렬/g,' ')
      .replace(/(?:을|를)?\s*(?:찾아\s*주세요|찾아줘|검색해줘|검색|추천해줘|추천|알려줘|알려\s*주세요|보여줘|보여\s*주세요|정보)/g,' ')
      .replace(/(?:이고|이면서|그리고)(?=\s|$)/g,' ').replace(/(?:인|인것|상품|제품)(?=\s|$)/g,' ').replace(/[?!.,]/g,' ').replace(/\s+/g,' ').trim()
    q.queries=text.split(/\s+(?:그리고|및|대비|vs)\s+|(?:와|과|랑)\s+/i).map(s=>s.trim()).filter(Boolean)
    q.query=q.queries.length<=1?text:''
    if(q.queries.length<=1)q.queries=[]
    if(/^(그중|그 중|그거|이거|그 상품)/.test(text)&&history.length){const prev=interpretDemo(String(history.at(-1)),history.slice(0,-1));q.query=prev.query;q.queries=prev.queries;q.productIds=prev.productIds;q.basis=q.basis||prev.basis;if(q.intent==='alternative')q.intent='search'}
  }
  if(['recommend','alternative'].includes(q.intent)){if(q.sort!=='default')q.recommendationBasis=original;for(const [kind,pattern] of [['spicy',/매운|매콤|얼큰/],['mild',/순한|안\s*매운|맵지\s*않은/],['unsweetened',/무가당/],['grilled',/구이|그릴|구운/]])if(pattern.test(original)){q.tastePreferences.push(kind);q.recommendationBasis=original}}
  return validateQuery(q)
}
