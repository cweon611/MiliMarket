// Search aliases affect retrieval only; source names and ingredient/allergen filters stay intact.
export const SEARCH_ALIASES = [
  ['돈까스', '돈가스', '돈카츠', '돈카쓰', '톤카츠'],
  ['생선까스', '생선가스', '생선카츠'], ['치킨까스', '치킨가스', '치킨카츠'],
  ['계란', '달걀'], ['주꾸미', '쭈꾸미'], ['케첩', '케찹', '케챱'],
  ['소시지', '소세지'], ['요구르트', '요거트', '요구어트', '요쿠르트'],
  ['초코', '초콜릿', '초콜렛'], ['짜장', '자장'], ['오믈렛', '오믈릿'],
  ['돼지고기', '돈육'], ['소고기', '쇠고기', '우육'], ['닭고기', '계육'],
  ['멜론', '메론'], ['스파게티', '스파게띠'],
]
const compact = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
const aliases = new Map(SEARCH_ALIASES.flatMap(group => group.map(term => [term, group[0]])))
const aliasPattern = new RegExp([...aliases.keys()].sort((a,b) => b.length-a.length).join('|'), 'g')
export const normalizeSearch = value => compact(value).replace(aliasPattern, term => aliases.get(term))
  // Only the beverage connector is optional: never strip 맛 from 맛살/맛동산 etc.
  .replace(/맛(?=우유|두유|요구르트|음료|주스)/g, '')
const vocabulary = [...new Set([
  ...SEARCH_ALIASES.map(group => group[0]),
  '바나나','딸기','커피','포도','사과','복숭아','망고','오렌지','블루베리','샤인머스캣',
  '우유','두유','음료','주스','치즈','고구마','감자','옥수수','단호박','김치','볶음밥',
  '새우','고등어','오징어','낙지','참치','연어','어묵','두부','만두','떡볶이','떡',
  '닭갈비','닭가슴살','불고기','갈비','떡갈비','함박','스테이크','햄버거','치킨',
  '짜장면','짬뽕','라면','우동','국수','파스타','빵','쿠키','도넛','케이크','아이스크림',
  '미역국','된장국','된장찌개','순두부','육개장','설렁탕','갈비탕','국','탕','찌개',
  '고추장','된장','간장','소스','드레싱','설탕','소금','밀가루','전분','계란말이',
  '샐러드','스프','카레','김','볶음','구이','튀김','조림','찜','무가당','저지방','멸균',
].map(normalizeSearch))].sort((a,b) => b.length-a.length)
const known = new Set(vocabulary)

// Longest food terms first; unknown text (including brands) remains a required term.
function tokenize(value) {
  const text = normalizeSearch(value), terms = []
  let pending = ''
  for (let offset=0; offset<text.length;) {
    const word = vocabulary.find(term => text.startsWith(term, offset))
    if (word) { if (pending) terms.push(pending); pending=''; terms.push(word); offset+=word.length }
    else { pending+=text[offset]; offset++ }
  }
  if (pending) terms.push(pending)
  return terms
}
const includes = (fields, value) => fields.some(field => field.includes(value))

// Instant noodles rarely say "라면" in their name (새우탕큰사발, 불닭볶음면, 왕뚜껑…),
// so derive a 라면/컵라면 type from the 면류 class, food type and single-pack size.
const INSTANT_NOODLE = /라면|사발|컵|용기|뚜껑|도시락|볶음면|비빔면|스낵면|짜파게티|짜짜로니|짬뽕|짜장|탕면|우동|오동통|김치면|사리면|누들|볶이|육개장/
const CUP_NOODLE = /사발|컵|용기|뚜껑|도시락/
function smallestPackGrams(name) {
  const grams = [...name.matchAll(/(\d+(?:\.\d+)?)\s*(kg|㎏|g)(?![a-z])/gi)].map(m => Number(m[1]) * (/k|㎏/i.test(m[2]) ? 1000 : 1))
  return grams.length ? Math.min(...grams) : null
}
export function noodleTypes(product) {
  const names = [product.name, product.market?.name].filter(Boolean)
  const noodle = product.subcategory === '면류' || names.some(n => /^\s*면류\s*,/.test(n))
  if (!noodle) return []
  const label = names.map(n => { const parts = n.split(','); return parts.length >= 3 ? parts.slice(2).join(',') : n }).join(' ')
  const fried = /유탕면(?!외)/.test(String(product.foodType ?? ''))
  const grams = names.map(smallestPackGrams).find(g => g !== null) ?? null
  if (!fried && !(INSTANT_NOODLE.test(label) && grams !== null && grams <= 150)) return []
  return CUP_NOODLE.test(label) ? ['라면', '컵라면'] : ['라면']
}

function makeRecord(product) {
  const names = [product.name, product.market?.name].filter(Boolean)
  const metadata = [product.manufacturer, product.market?.supplier, product.foodType, product.category, product.subcategory, ...noodleTypes(product)].filter(Boolean)
  const ingredients = String(product.ingredients??'').split(/[,，;；\n]/)
  const types = [product.foodType,product.subcategory,product.market?.itemType, ...noodleTypes(product), ...names.filter(n=>n.includes(',')).map(n=>n.split(',')[0])].filter(Boolean).map(normalizeSearch)
  const labels = names.map(n=>{const parts=n.split(',');return parts.length>=3?parts[2]:n}).map(normalizeSearch)
  // What the product is: its item class/category, or the last word of its label ("등심돈까스" yes, "돈까스소스" no).
  // Class names only: free-text food types ("소스(간장 함유)") and names copied into the class field don't count.
  const normalizedNames = new Set(names.map(normalizeSearch))
  const kinds = [product.subcategory, product.market?.itemType, ...noodleTypes(product), ...names.filter(n=>n.includes(',')).map(n=>n.split(',')[0]), product.category]
    .filter(Boolean).map(normalizeSearch).filter(k=>k.length<=12&&!/\d/.test(k)&&!normalizedNames.has(k))
  const heads = names.map(n=>{const parts=n.split(',');return parts.length>=3?parts[2]:n})
    .map(label=>normalizeSearch(label.replace(/\([^)]*\)/g,'').replace(/\d+(?:\.\d+)?\s*(?:kg|㎏|g|ml|l|개입|개|ea|입|봉|팩)?/gi,'')))
  return {product, rawNames:names.map(compact), names:names.map(normalizeSearch),
    foodFields:[...labels,...types], types, kinds, heads,
    metadata:metadata.map(normalizeSearch), rawMetadata:metadata.map(compact),
    ingredients:ingredients.map(normalizeSearch), rawIngredients:ingredients.map(compact),
    identifiers:[product.id, product.reportNumber].filter(Boolean).map(compact)}
}
function prepare(query) {
  const raw=compact(query), canonical=normalizeSearch(query)
  const terms=[...new Set(tokenize(query))]
  const spacedTerms=[...new Set(String(query).trim().split(/[\s,]+/).flatMap(tokenize))].filter(Boolean)
  return {raw, canonical, terms, termGroups:[terms,spacedTerms], numeric:/^\d+$/.test(raw)}
}
function match(record, query) {
  const {raw, canonical, terms, numeric} = query
  if (!raw) return {score:0, kind:'all'}
  if (numeric) return includes(record.identifiers,raw) ? {score:120,kind:'exact'} : null
  if (includes(record.identifiers,raw)) return {score:115,kind:'exact'}
  if (includes(record.rawNames,raw)) return {score:100,kind:'exact'}
  if (includes(record.names,canonical)) return {score:90,kind:'related'}
  // Combining title/type/brand terms is allowed. Individual ingredient mentions do not
  // turn a banana cake containing milk into a banana milk product.
  if (query.termGroups.some(group=>group.length>1 && group.every(term => includes(known.has(term)?record.foodFields:[...record.names,...record.metadata],term)))) return {score:80,kind:'related'}
  if (includes(record.rawMetadata,raw)) return {score:65,kind:'exact'}
  if (includes(record.metadata,canonical)) return {score:60,kind:'related'}
  if (includes(record.rawIngredients,raw)) return {score:40,kind:'exact'}
  if (includes(record.ingredients,canonical)) return {score:35,kind:'related'}
  return null
}
// A type contains the term itself, not a longer food word ("햄류" has 햄, "햄버거패티" does not).
const typeHas = (type, term) => type.includes(term) && !tokenize(type).some(t => t !== term && known.has(t) && t.includes(term))
// 3: its item class is the requested item, 2: its name ends with it ("등심돈까스"),
// 1: its name only mentions it ("돈까스소스"), 0: only brand/type text or ingredients mention it.
function focus(record, query, score) {
  const head = query.terms.at(-1)
  if (head && record.kinds.some(k => typeHas(k, head))) return 3
  if (head && record.heads.some(h => h.endsWith(head) || h.endsWith(head + '류'))) return 2
  return score >= 80 ? 1 : 0
}
function affinity(record,query) {
  const type = record.types.join('|')
  if(query.terms.includes('우유') && /가공우유|^우유$/.test(type))return 25
  if(query.terms.includes('두유') && /두유/.test(type))return 25
  if(query.terms.includes('요구르트') && /발효유/.test(type))return 25
  if(query.terms.some(t=>['돈까스','치킨까스','생선까스'].includes(t)) && /양념육|식육|수산물가공|어육가공/.test(type))return 20
  return 0
}
function distance(a,b) {
  let row=Array.from({length:b.length+1},(_,i)=>i)
  for(let i=0;i<a.length;i++) {
    const next=[i+1]
    for(let j=0;j<b.length;j++) next[j+1]=Math.min(next[j]+1,row[j+1]+1,row[j]+Number(a[i]!==b[j]))
    row=next
  }
  return row[b.length]
}
export function createCatalogSearch(products) {
  const records=products.map(makeRecord), candidates=new Map()
  const add=(term,id)=>{if(term.length<2||term.length>18||/^\d+$/.test(term))return;const parts=tokenize(term);if(parts.some((t,i)=>i>0&&t===parts[i-1]))return;if(!candidates.has(term))candidates.set(term,new Set());candidates.get(term).add(id)}
  for(const {product} of records) {
    for(const name of new Set([product.name,product.market?.name].filter(Boolean))) {
      const parts=name.split(',')
      const label=(parts.length>=3?parts[2]:name).replace(/\([^)]*\)/g,'')
      const terms=tokenize(label)
      const clean=normalizeSearch(label)
      if(!/\d/.test(clean))add(clean,product.id)
      for(let i=0;i<terms.length;i++) if(known.has(terms[i])) {
        add(terms[i],product.id)
        for(let size=2;size<=3;size++) {
          const group=terms.slice(i,i+size)
          if(group.length===size&&group.every(t=>known.has(t)))add(group.join(''),product.id)
        }
      }
    }
  }
  const find=query=>records.flatMap(record=>{const result=match(record,query);return result?[{product:record.product,...result,score:result.score+affinity(record,query),focus:focus(record,query,result.score)}]:[]})
    .sort((a,b)=>b.score-a.score||a.product.id-b.product.id)
  return {
  // For ranking by price or nutrients: keep only the most on-topic matches so a cheap
  // "돈까스소스" or an ingredient-only hit can never outrank actual 돈까스.
  focused(value) {
    const matches=find(prepare(String(value??'').slice(0,200)))
    const best=Math.max(-1,...matches.map(m=>m.focus))
    return matches.filter(m=>m.focus===best)
  },
  search(value) {
    const query=prepare(String(value??'').slice(0,200)), matches=find(query)
    let suggestions=[]
    if(query.raw.length>=2&&!query.numeric) {
      const terms=[...candidates].filter(([term])=>term!==query.canonical)
      const pool=matches.length
        ? terms.filter(([term])=>term.includes(query.canonical)).sort((a,b)=>b[1].size-a[1].size||a[0].length-b[0].length).map(([term])=>({term}))
        : terms.filter(([term])=>Math.abs(term.length-query.canonical.length)<=(query.canonical.length>=5?2:1))
          .map(([term,ids])=>({term,frequency:ids.size,distance:distance(term,query.canonical)}))
          .filter(item=>item.distance<=(query.canonical.length>=5?2:1))
          .sort((a,b)=>a.distance-b.distance||b.frequency-a.frequency)
      const seen=new Set()
      for(const item of pool.slice(0,20)) {
        if(!matches.length && item.distance>pool[0].distance)break
        const found=find(prepare(item.term)), signature=found.map(m=>m.product.id).sort().join(',')
        if(found.length&&!seen.has(signature)){seen.add(signature);suggestions.push({term:item.term,count:found.length})}
        if(suggestions.length===5)break
      }
    }
    return {matches,suggestions}
  }}
}
