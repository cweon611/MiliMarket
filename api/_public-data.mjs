// Official data.go.kr services. Keys never leave the server or appear in errors.
export const SOURCES = {
  procurement:{name:'조달청 나라장터쇼핑몰 품목정보',url:'https://www.data.go.kr/data/15129471/openapi.do'},
  nutrition:{name:'식약처 식품영양성분DB',url:'https://www.data.go.kr/data/15127578/openapi.do'},
}
const G2B='https://apis.data.go.kr/1230000/at/ShoppingMallPrdctInfoService/'
const MFDS='https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo03/getFoodNtrCpntDbInq03'
const text=v=>String(v??'').trim()
export const reportId=v=>/^\d[\d-]{9,24}$/.test(text(v))?text(v).replaceAll('-',''):null
export function numberValue(v){const s=text(v).replaceAll(',','');return /^\d+(?:\.\d+)?$/.test(s)&&Number.isFinite(Number(s))?Number(s):null}
export function nutrientBasis(raw){
  const s=text(raw).normalize('NFKC'),m=s.match(/^(\d+(?:\.\d+)?)\s*(kg|g|mg|ml|l)$/i)
  if(!m||Number(m[1])<=0)return {text:s||'기준량 미제공',amount:null,unit:null}
  const unit=m[2].toLowerCase(),amount=Number(m[1])*({kg:1000,g:1,mg:.001,ml:1,l:1000}[unit])
  return {text:s,amount,unit:['ml','l'].includes(unit)?'mL':'g'}
}
export const NUTRIENTS={calories:['AMT_NUM1','열량','kcal'],protein:['AMT_NUM3','단백질','g'],fat:['AMT_NUM4','지방','g'],carbs:['AMT_NUM6','탄수화물','g'],sugars:['AMT_NUM7','당류','g'],sodium:['AMT_NUM13','나트륨','mg'],calcium:['AMT_NUM9','칼슘','mg']}
export function normalizeNutrition(row,fetchedAt){
  return {code:text(row.FOOD_CD),name:text(row.FOOD_NM_KR),manufacturer:text(row.MAKER_NM),reportNumber:reportId(row.ITEM_REPORT_NO),basis:nutrientBasis(row.SERVING_SIZE),
    nutrients:Object.fromEntries(Object.entries(NUTRIENTS).map(([key,[field,label,unit]])=>[key,{label,unit,value:numberValue(row[field]),raw:text(row[field])}])),
    source:SOURCES.nutrition,reference:text(row.SUB_REF_NAME),updatedAt:text(row.UPDATE_DATE),fetchedAt,classification:text(row.DB_CLASS_NM)}
}
function safeImage(raw){try{const u=new URL(raw);return ['http:','https:'].includes(u.protocol)&&(u.hostname==='g2b.go.kr'||u.hostname.endsWith('.g2b.go.kr'))?(u.protocol='https:',u.href):null}catch{return null}}
export function normalizeOffer(row,kind,fetchedAt){return {
  id:Number(row.prdctIdntNo),name:text(row.prdctSpecNm),manufacturer:text(row.prdctMakrNm),supplier:text(row.cntrctCorpNm),origin:text(row.prdctOrgplceNm),
  unitPrice:numberValue(row.cntrctPrceAmt),orderPrice:numberValue(row.orderCalclPrceAmt),unit:text(row.prdctUnit),imageUrl:safeImage(row.prdctImgUrl),
  category:text(row.dtilPrdctClsfcNoNm||row.prdctClsfcNoNm),contractType:kind,contractNumber:text(row.shopngCntrctNo),contractSequence:text(row.shopngCntrctSno),
  contractStart:text(row.cntrctBgnDate),contractEnd:text(row.cntrctEndDate),delivery:text(row.prdctDlvryCndtnNm),region:text(row.prdctSplyRgnNm),
  updatedAt:text(row.chgDt||row.rgstDt),fetchedAt,source:SOURCES.procurement,
}}
class ProviderError extends Error{constructor(code){super(code);this.code=code}}
const messages={credentials:'인증키 또는 해당 API 활용승인을 확인해 주세요.',quota:'공공 API의 호출 한도에 도달했습니다. 잠시 후 다시 조회해 주세요.',unavailable:'공공 API에 연결하지 못했습니다. 잠시 후 다시 조회해 주세요.',format:'공공 API의 응답 형식을 확인할 수 없습니다.'}
function codeError(code){if(['20','22','30','31','32','33'].includes(code))return new ProviderError('credentials');if(code==='21')return new ProviderError('quota');return new ProviderError('unavailable')}
function decodedKey(raw){try{return decodeURIComponent(raw.trim())}catch{return raw.trim()}}
export function createPublicDataService({env=process.env,fetchImpl=fetch,now=()=>Date.now(),onResult=async()=>{},saved={}}={}){
  const keys={procurement:env.G2B_SERVICE_KEY?.trim()||env.DATA_GO_KR_SERVICE_KEY?.trim(),nutrition:env.MFDS_SERVICE_KEY?.trim()||env.DATA_GO_KR_SERVICE_KEY?.trim()}
  const cache=new Map(),inflight=new Map()
  const status=()=>Object.fromEntries(Object.entries(SOURCES).map(([k,source])=>[k,{configured:!!keys[k],source}]))
  const result=(provider,state,extra={})=>({status:state,source:SOURCES[provider],...extra})
  async function request(provider,base,params){
    const url=new URL(base);url.search=new URLSearchParams({serviceKey:decodedKey(keys[provider]),type:'json',pageNo:'1',numOfRows:'30',...params}).toString()
    try{
      const response=await fetchImpl(url,{signal:AbortSignal.timeout(15000),headers:{accept:'application/json'}})
      if(!response.ok)throw new ProviderError(response.status===401||response.status===403?'credentials':response.status===429?'quota':'unavailable')
      const raw=await response.text();if(raw.length>3_000_000)throw new ProviderError('format')
      if(raw.trim().startsWith('<')){const code=raw.match(/<(?:returnReasonCode|resultCode)>([^<]+)</)?.[1];if(code==='03')return {rows:[],total:0};throw codeError(code)}
      let parsed;try{parsed=JSON.parse(raw)}catch{throw new ProviderError('format')}
      const payload=parsed.response||parsed,code=text(payload.header?.resultCode)
      if(code==='03')return {rows:[],total:0}
      if(!['00','0','INFO-000'].includes(code))throw codeError(code)
      const body=payload.body;if(!body||body.totalCount==null)throw new ProviderError('format')
      const items=body.items?.item??body.items??[],rows=Array.isArray(items)?items:typeof items==='object'?[items]:[]
      const total=numberValue(body.totalCount);if(total===null||total>0&&!rows.length)throw new ProviderError('format')
      return {rows,total}
    }catch(e){throw e instanceof ProviderError?e:new ProviderError('unavailable')}
  }
  async function cached(key,fn){
    const hit=cache.get(key);if(hit&&hit.until>now())return hit.value
    if(inflight.has(key))return inflight.get(key)
    const pending=fn().catch(e=>result(key.startsWith('g2b:')?'procurement':'nutrition','error',{message:messages[e.code]||messages.unavailable})).then(value=>{if(cache.size>=500)cache.delete(cache.keys().next().value);cache.set(key,{value,until:now()+(value.status==='error'?60_000:3600_000)});return value}).finally(()=>inflight.delete(key))
    inflight.set(key,pending);return pending
  }
  async function guarded(provider,fn){
    if(!keys[provider])return result(provider,'not_configured',{message:'인증키 발급 후 서버에 설정하면 조회할 수 있습니다.'})
    try{return await fn()}catch(e){return result(provider,'error',{message:messages[e.code]||messages.unavailable})}
  }
  async function procurement(product){
    return guarded('procurement',()=>cached(`g2b:${product.id}`,async()=>{
      // The official v1.3 guide supports exact prdctIdntNo without a date filter.
      // Validate every returned ID: a malformed provider query may default to recent items.
      const operations=[['getMASCntrctPrdctInfoList','다수공급자계약'],['getUcntrctPrdctInfoList','일반단가'],['getThptyUcntrctPrdctInfoList','제3자단가']]
      const fetchedAt=new Date(now()).toISOString(),responses=await Promise.allSettled(operations.map(async([op,kind])=>({kind,...await request('procurement',G2B+op,{prdctIdntNo:String(product.id)})})))
      const ok=responses.filter(r=>r.status==='fulfilled').map(r=>r.value),failures=responses.length-ok.length
      if(!ok.length)throw responses.find(r=>r.status==='rejected').reason
      const seen=new Set(),offers=ok.flatMap(({kind,rows})=>rows.filter(r=>text(r.prdctIdntNo)===String(product.id)).map(r=>normalizeOffer(r,kind,fetchedAt))).filter(r=>{const id=[r.contractType,r.contractNumber,r.contractSequence,r.supplier,r.unit,r.unitPrice].join('|');if(seen.has(id))return false;seen.add(id);return true})
      return result('procurement',offers.length?'ok':failures?'error':'empty',{offers,fetchedAt,partial:failures>0||ok.some(r=>r.total>r.rows.length),message:failures?'일부 계약 유형을 조회하지 못했습니다. 표시된 계약만 확인해 주세요.':offers.length?'물품식별번호가 일치하는 계약입니다.':'공식 API에서 일치하는 계약을 찾지 못했습니다.'})
    }))
  }
  async function searchNutrition(query,reportNumber){
    return guarded('nutrition',()=>cached(`mfds:${reportNumber?'report:'+reportNumber:'name:'+query}`,async()=>{
      const {rows,total}=await request('nutrition',MFDS,reportNumber?{ITEM_REPORT_NO:reportNumber}:{FOOD_NM_KR:query})
      const fetchedAt=new Date(now()).toISOString(),records=rows.map(r=>normalizeNutrition(r,fetchedAt)).filter(r=>r.code&&r.name)
      return result('nutrition',records.length?'ok':'empty',{records,total,partial:total>rows.length,fetchedAt})
    }))
  }
  async function nutrition(product){
    if(!keys.nutrition)return guarded('nutrition',()=>{})
    const id=reportId(product.reportNumber)
    if(id){
      const found=await searchNutrition('',id)
      if(found.status==='error')return found
      const exact=(found.records||[]).filter(r=>r.reportNumber===id)
      if(exact.length)return {...found,match:exact.length===1&&!found.partial?'report_number':'ambiguous',records:exact.slice(0,4),message:exact.length===1&&!found.partial?'품목제조보고번호가 일치합니다. 포장과 영양표시 변경 여부를 확인해 주세요.':'같은 보고번호에 여러 영양 자료가 있어 확정하지 않았습니다.'}
    }
    const parts=text(product.market?.name||product.name).split(',').map(s=>s.trim()).filter(Boolean)
    const query=(parts.length>=3?parts[2]:parts[0]).replace(/\d+(?:\.\d+)?\s*(?:kg|g|ml|l)\b/gi,'').trim().slice(0,80)
    if(query.length<2)return result('nutrition','empty',{records:[],match:'reference',message:'조회할 식품명 또는 품목제조보고번호가 없습니다.'})
    const found=await searchNutrition(query)
    return {...found,records:found.records?.slice(0,3),match:'reference',message:found.message||(found.records?.length?'이름으로 찾은 참고 자료입니다. 해당 상품의 확정 영양값이 아닙니다.':'일치하는 영양 자료를 찾지 못했습니다. 미제공은 0이 아닙니다.')}
  }
  async function remembered(provider,product,fn){
    const old=(typeof saved==='function'?saved():saved)[product.id]?.[provider]
    // Same 24-hour freshness that applyOfficialData uses for display.
    if(keys[provider]&&old?.fetchedAt&&now()-Date.parse(old.fetchedAt)>=0&&now()-Date.parse(old.fetchedAt)<(old.validDays??1)*86400000)return old
    // Persisting is batched by the store; lookups do not wait on storage round-trips.
    const value=await fn(product);Promise.resolve(onResult(product.id,provider,value)).catch(()=>{});return value
  }
  const getNutrition=p=>remembered('nutrition',p,nutrition),getProcurement=p=>remembered('procurement',p,procurement)
  return {status,procurement:getProcurement,nutrition:getNutrition,searchNutrition,async productData(product){const [p,n]=await Promise.all([getProcurement(product),getNutrition(product)]);return {productId:product.id,procurement:p,nutrition:n}}}
}
