import {normalize, publicProduct, gramPrice} from '../shared/catalog.mjs'
import {convertNutrition} from '../shared/nutrition.mjs'
export const defaultPlanSettings={days:7,people:120,mealBudgets:[4000,5000,4000],exclusions:[],dessert:true,cuisine:'한식',seed:0}
export function planSettings(input={}) {
  const s={...defaultPlanSettings,...input}
  if(!Number.isInteger(s.days)||s.days<1||s.days>31||!Number.isInteger(s.people)||s.people<1||s.people>10000) throw new Error('기간은 1–31일, 인원은 1–10,000명으로 입력해 주세요.')
  if(!Array.isArray(s.mealBudgets)||s.mealBudgets.length!==3||s.mealBudgets.some(x=>!Number.isFinite(x)||x<100||x>100000)) throw new Error('끼니별 예산을 100–100,000원으로 입력해 주세요.')
  s.exclusions=Array.isArray(s.exclusions)?s.exclusions.slice(0,10).map(x=>String(x).trim().slice(0,40)).filter(Boolean):[]
  s.cuisine=s.cuisine==='혼합'?'혼합':'한식'; s.dessert=s.dessert!==false
  s.seed=Number.isInteger(s.seed)?Math.abs(s.seed)%10000:0
  s.avoidProductIds=[...new Set(Array.isArray(s.avoidProductIds)?s.avoidProductIds:[])].filter(id=>Number.isInteger(id)).slice(0,200)
  s.portions={...portions,...(s.portions||{})}
  for(const role of Object.keys(portions))if(!Number.isFinite(s.portions[role])||s.portions[role]<=0||s.portions[role]>2000)throw new Error('배식량은 0 초과 2,000g 이하로 입력해 주세요.')
  s.portionSource=String(s.portionSource||'데모 배식량').slice(0,150)
  s.meals=s.meals??['아침','점심','저녁']
  if(!Array.isArray(s.meals)||!s.meals.length||s.meals.some(m=>!['아침','점심','저녁'].includes(m)))throw new Error('추천할 끼니를 선택해 주세요.')
  s.meals=[...new Set(s.meals)]
  if(s.composition!=null){const entries=Object.entries(s.composition);if(!entries.length||entries.some(([r,n])=>!Object.hasOwn(portions,r)||!Number.isInteger(n)||n<0||n>4)||!entries.some(([,n])=>n>0))throw new Error('메뉴 구성 개수를 확인해 주세요.')}
  s.preferenceLabels=Array.isArray(s.preferenceLabels)?s.preferenceLabels.filter(x=>['한식','혼합','맵지 않게','매콤하게','가격 우선','고단백','선호 제한 없음'].includes(x)):[]
  s.preferredIngredients=Array.isArray(s.preferredIngredients)?s.preferredIngredients.slice(0,8).map(x=>String(x).slice(0,100)).filter(Boolean):[]
  s.preferenceNotes=Array.isArray(s.preferenceNotes)?s.preferenceNotes.slice(0,8).map(x=>String(x).slice(0,100)).filter(Boolean):[]
  s.start=/^\d{4}-\d{2}-\d{2}$/.test(s.start||'')?s.start:new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'})
  const date=new Date(s.start+'T12:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==s.start)throw new Error('시작 날짜를 확인해 주세요.')
  return s
}
const familyWords=['소고기미역국','소고기무국','시래기된장국','우거지국','된장찌개','김치찌개','부대찌개','청국장','육개장','갈비탕','설렁탕','삼계탕','곰탕','추어탕','순두부','해장국','닭갈비','찜닭','닭강정','닭볶음탕','치킨까스','돈까스','돈가스','생선까스','생선가스','떡갈비','함박','소불고기','돼지불고기','불고기','제육','수육','보쌈','스테이크','고등어','삼치','가자미','오리훈제','훈제오리','치킨너겟','가라아게','치킨','계란말이','지단','계란찜','계란장조림','장조림','깍두기','배추김치','백김치','열무김치','총각김치','파김치','갓김치','오이소박이','단무지','두부','어묵','감자','김자반','조미김']
export function menuFamily(p) {
  const name=normalize(p.market?.name||p.name).replaceAll('쭈꾸미','주꾸미').replaceAll('달걀','계란').replaceAll('스크램블드','스크램블').replaceAll('오믈릿','오믈렛').replaceAll('돈가스','돈까스').replaceAll('생선가스','생선까스').replaceAll('구운란','구운계란')
  if(p.market?.itemType==='조미김')return /자반/.test(name)?'김자반':'조미김'
  const words=['주꾸미볶음','낙지볶음','오징어볶음','코다리강정','도토리묵','청포묵','동부묵','오믈렛','스크램블','구운계란','훈제란','반숙란',...familyWords]
  return words.find(x=>name.includes(x)) || normalize((p.market?.name||p.name).split(',').slice(2,-1).join('')||p.name).replace(/\d+(\.\d+)?(kg|g|ml|l|개|입|팩)|[()\-_/]/g,'').slice(0,40)
}
export function excludes(p, terms) {
  if(!terms.length)return false
  if(!p.ingredients||/^(미제공|정보없음|-)$/u.test(p.ingredients.trim()))return true
  const haystack=normalize(`${p.name} ${p.market?.name||''} ${p.ingredients}`)
  return terms.some(term=>/돼지|돈육/.test(term)?/돼지|돈육|포크|돈골|돈지/.test(haystack):/^(계란|달걀|난류)$/.test(normalize(term))?/계란|달걀|난류|난백|난황|전란|난액|에그/.test(haystack):haystack.includes(normalize(term)))
}
export function roleOf(p) {
  const name=normalize(p.market?.name||p.name),type=p.market?.itemType||''
  if(['조리된곡물','냉동밥류','즉석건조식품'].includes(type)&&/쌀밥|백미밥|현미밥|잡곡밥|흑미밥/.test(name))return '밥'
  if(type==='국탕류'&&!/육수|베이스|농축|엑기스|진국/.test(name))return '국'
  if(p.category==='김치류')return '김치'
  if(type==='발효유류'||type==='두유음료'||['젤리류','쿠키','상온보관용빵'].includes(type))return '후식'
  if(type==='조미김'||type==='단무지'||type==='묵류')return '부찬'
  if(type==='알가공품'&&/말이|구이|부침|찜|장조림|오믈렛|오믈릿|스크램블|에그롤|반숙란|구운란|훈제란|구운계란/.test(name)&&!/전란액|난액|흰자액|노른자액/.test(name))return '부찬'
  if(['두부류','수산물가공품','어육가공품','식육가공품'].includes(type)&&/두부조림|어묵볶음|감자조림|멸치볶음|무침|콩자반/.test(name))return '부찬'
  if(['양념육류','식육가공품','식육함유가공품','수산물가공품','어육가공품','새우패티'].includes(type)&&/불고기|제육|닭갈비|찜닭|닭볶음|떡갈비|너비아니|까스|가스|강정|스테이크|함박|구이|수육|보쌈|장조림|바베큐|바비큐|양념갈비|볶음|훈제|순살치킨/.test(name))return '주찬'
  return null
}
const portions={밥:210,국:250,주찬:120,부찬:60,김치:40,후식:100}
const shares={밥:.35,국:.30,주찬:.38,부찬:.10,김치:.05,후식:.14}
export function createPlan(products,input={}) {
  const settings=planSettings(input),{days,people,mealBudgets,exclusions:terms}=settings
  const avoided=new Set(settings.avoidProductIds),avoidedFamilies=new Set(products.filter(p=>avoided.has(p.id)).map(menuFamily))
  const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'})
  const pools={밥:[],국:[],주찬:[],부찬:[],김치:[],후식:[]}
  for(const p of products) {
    if(!p.market||!(p.market.unitPrice>0)||excludes(p,terms))continue
    if(p.market.contractEnd && p.market.contractEnd<today)continue
    const role=roleOf(p);if(!role)continue
    if(settings.cuisine==='한식'&&role==='주찬'&&/스테이크|까스|가스|함박|너겟|가라아게/.test(p.market.name))continue
    const spicy=/매운|매콤|불닭|얼큰|고추장|제육|닭갈비/.test(p.market.name||p.name)
    if(settings.preferenceLabels.includes('맵지 않게')&&spicy)continue
    if(settings.preferenceLabels.includes('매콤하게')&&role==='주찬'&&!spicy)continue
    const gp=gramPrice(p),grams=role==='부찬'&&p.market.itemType==='조미김'?(/자반/.test(p.market.name)?10:5):role==='부찬'&&p.market.itemType==='단무지'?30:settings.portions[role]
    // Liquid packages have no supported mass conversion. Treat them as one whole sale unit.
    const count=role==='후식'&&gp===null
    if(gp===null&&!count)continue
    const cost=count?p.market.unitPrice:gp*grams
    const preferenceHits=settings.preferredIngredients.filter(term=>normalize(`${p.name} ${p.market.name} ${p.ingredients||''}`).includes(normalize(term)))
    // 고단백: 공식 영양 자료(보고번호 일치)의 100g당 단백질만 쓴다. 기준량 모르는 원문 수치는 쓰지 않는다.
    const official=['주찬','부찬'].includes(role)&&p.verifiedNutrition?convertNutrition(p.verifiedNutrition,{amount:100,unit:'g'}):null
    const proteinPer100g=official?.ok&&Number.isFinite(official.values.protein)?official.values.protein:null
    pools[role].push({...publicProduct(p),role,proteinPer100g,grams:count?null:grams,unitsPerPerson:count?1:null,portionCost:cost,family:menuFamily(p),minimumOrder:p.market.minimumOrder||1,preferenceHits})
  }
  for(const list of Object.values(pools))list.sort((a,b)=>a.portionCost-b.portionCost||a.id-b.id)
  const usage=new Map(),lastUsed=new Map(),warnings=new Set(),plan=[],highProtein=settings.preferenceLabels.includes('고단백')
  if(highProtein)warnings.add('고단백 우선: 공식 영양 자료(품목제조보고번호 일치)가 있는 주찬·부찬을 100g당 단백질이 높은 순으로 먼저 고릅니다. 자료가 없는 메뉴는 단백질을 확인하지 못했습니다.')
  if(settings.preferenceNotes.length)warnings.add(`추가 선호 “${settings.preferenceNotes.join(' · ')}”은 자동 판정 기준이 없어 충족 여부를 보장하지 않습니다. 확인 가능한 배식량·예산·영양 목표는 별도로 계산합니다.`)
  for(let d=0;d<days;d++) {
    const date=new Date(settings.start+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+d)
    const meals=[]
    for(let m=0;m<3;m++) {
      if(!settings.meals.includes(['아침','점심','저녁'][m]))continue
      const roles=settings.composition?Object.entries(settings.composition).flatMap(([r,n])=>Array(n).fill(r)):['밥','국','주찬','부찬','김치',...(settings.dessert&&m===1?['후식']:[])]
      let remaining=mealBudgets[m];const items=[]
      for(const [index,role] of roles.entries()) {
        // Reserve the cheapest eligible later courses before choosing this course.
        const reserve=roles.slice(index+1).reduce((sum,next)=>{
          const options=pools[next].filter(p=>['밥','김치'].includes(next)||!lastUsed.has(p.family)||d-lastUsed.get(p.family)>=3)
          return sum+(options.length?Math.min(...options.map(p=>p.portionCost)):0)
        },0)
        const share=shares[role]/(settings.composition?roles.reduce((sum,r)=>sum+shares[r],0):1)
        const cap=Math.min(remaining-reserve,mealBudgets[m]*share)
        const candidates=pools[role].filter(p=>p.portionCost<=cap)
        const eligible=candidates.filter(p=>['밥','김치'].includes(role)||!lastUsed.has(p.family)||d-lastUsed.get(p.family)>=3)
        const novelty=p=>avoided.has(p.id)?2:avoidedFamilies.has(p.family)?1:0
        eligible.sort((a,b)=>novelty(a)-novelty(b)||(usage.get(a.family)||0)-(usage.get(b.family)||0)||(highProtein&&['주찬','부찬'].includes(role)?(b.proteinPer100g??-1)-(a.proteinPer100g??-1):0)||b.preferenceHits.length-a.preferenceHits.length||(settings.preferenceLabels.includes('가격 우선')?a.portionCost-b.portionCost:0)||((a.id+settings.seed*7919+d*13+m*31)%997)-((b.id+settings.seed*7919+d*13+m*31)%997))
        const chosen=eligible[0]
        if(!chosen) { warnings.add(`${role}: 예산·제외 재료·최근 3일 중복 조건을 만족하는 상품이 부족합니다.`);items.push({role,missing:true});continue }
        if(avoided.has(chosen.id))warnings.add(`${role}: 같은 조건의 새 후보가 부족해 이전 상품이 일부 포함되었습니다.`)
        usage.set(chosen.family,(usage.get(chosen.family)||0)+1);lastUsed.set(chosen.family,d)
        items.push({...chosen,reasons:[...(highProtein&&chosen.proteinPer100g!=null?[`공식 영양 자료 100g당 단백질 ${Math.round(chosen.proteinPer100g*10)/10}g`]:[]),...chosen.preferenceHits.map(term=>`선호 재료 '${term}'을 상품명·원재료 원문에서 확인`),`요청한 ${['아침','점심','저녁'][m]}의 ${role} 구성`,...(settings.preferenceLabels.includes('맵지 않게')?['상품명에 매운 양념 표현이 있는 메뉴 제외 · 실제 맵기는 확인 필요']:[]),...(settings.preferenceLabels.includes('매콤하게')&&role==='주찬'?['상품명에 매운 양념 표현 확인']:[]),...(settings.preferenceLabels.includes('가격 우선')?['중복 조건을 통과한 후보 중 낮은 1인 배식 단가 우선']:[]),`1인 배식 예상 ${Math.round(chosen.portionCost).toLocaleString('ko-KR')}원 · 끼니 예산 내 구성`,...(!['밥','김치'].includes(role)?['같은 메뉴군 최근 3일 중복 제외']:[])]});remaining-=chosen.portionCost
      }
      meals.push({name:['아침','점심','저녁'][m],budget:mealBudgets[m],cost:items.reduce((sum,x)=>sum+(x.portionCost||0),0),items})
    }
    plan.push({date:date.toISOString().slice(0,10),meals})
  }
  const purchased=new Map()
  for(const day of plan)for(const meal of day.meals)for(const p of meal.items) {
    if(p.missing)continue
    const row=purchased.get(p.id)||{...p,requiredGrams:0,requiredUnits:0}
    row.requiredGrams+=(p.grams||0)*people;row.requiredUnits+=(p.unitsPerPerson||0)*people;purchased.set(p.id,row)
    p.repeat=usage.get(p.family)
  }
  const purchase=[...purchased.values()].map(p=>{const packs=Math.max(p.minimumOrder,Math.ceil(p.requiredUnits||p.requiredGrams/p.packGrams));return {...p,packs,total:packs*p.unitPrice}})
  const total=purchase.reduce((sum,p)=>sum+p.total,0),budget=days*people*settings.meals.reduce((sum,m)=>sum+mealBudgets[['아침','점심','저녁'].indexOf(m)],0)
  if(total>budget)warnings.add('포장 단위 올림·최소 주문량 적용 후 전체 예산을 초과했습니다. 수량과 상품을 조정해 주세요.')
  const missing=plan.reduce((sum,d)=>sum+d.meals.reduce((n,m)=>n+m.items.filter(p=>p.missing).length,0),0)
  return {settings,days:plan,purchase,total,budget,missing,warnings:[...warnings],nutritionVerified:false,createdAt:new Date().toISOString(),basis:`나라장터 수집 상품·가격 + ${settings.portionSource}. ${settings.meals.join('·')} 요청 범위만 구성. 영양 충족은 확정 자료 및 입력 목표로 별도 검증. 최근 3일 국·주찬·부찬·후식 메뉴군 중복 제한.`}
}
