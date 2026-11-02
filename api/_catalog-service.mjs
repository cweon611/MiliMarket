import {searchCatalog, gramPrice, alternatives, publicProduct} from '../shared/catalog.mjs'
import {candidates} from './_retrieval.mjs'
export function answerCatalog(products,q) {
  let matches=candidates(products,q)
  if(q.intent==='product_info'){
    if(!q.productIds?.length&&!q.productId&&!q.query&&!q.queries?.length)return {answerKind:'product_info',products:[],count:0,text:'어떤 상품을 말씀하시는지 확인할 수 없어요. 상품명이나 물품식별번호를 알려주세요.'}
    const selected=matches.slice(0,q.limit).map(publicProduct)
    return {answerKind:'product_info',products:selected,count:matches.length,text:selected.length?selected.map(p=>`${p.name}\n${p.unitPrice==null?'가격 미확인':p.unitPrice.toLocaleString('ko-KR')+'원 / '+(p.unit||'판매 단위')}`).join('\n\n'):'확인할 상품을 찾지 못했어요. 상품명이나 물품식별번호를 알려주세요.'}
  }
  if(q.intent==='alternative') {
    const current=matches[0]
    const rows=current?alternatives(products,current,q.limit):[]
    return {text:current?`${current.name}의 동일 세부 품목에서 g당 단가가 더 낮은 상품 ${rows.length}건입니다. 맛·원재료·영양 동등성은 검증되지 않았습니다.`:'기준 상품의 물품식별번호 또는 상품명을 알려 주세요.',products:rows.map(publicProduct),count:rows.length,reference:current?publicProduct(current):null}
  }
  if(q.maxPrice!==null)matches=matches.filter(p=>p.market?.unitPrice!=null&&p.market.unitPrice<=q.maxPrice)
  const nutrient=q.nutrient||(['protein','sodium','calories'].includes(q.sort)?q.sort:null)
  if(nutrient) {
    const needsComparison=['protein','sodium','calories'].includes(q.sort)||q.minNutrient!=null||q.maxNutrient!=null
    if(needsComparison) {
      return {text:'영양 조건으로 비교·추천할 수 없습니다. 현재 DB에 영양 기준 중량이 없으므로 서로 다른 상품의 값을 비교하거나 100g·1인분으로 환산하지 않습니다. 열량 미제공 값은 계산하지 않습니다. 아래는 검색어에 해당하는 확인용 상품이며 영양 조건을 충족한 결과가 아닙니다.',products:matches.slice(0,q.limit).map(publicProduct),count:matches.length,blocked:true}
    }
    return {text:`${q.query||'상품'}의 DB 영양 원문을 확인할 수 있습니다. 기준 중량이 없어 1인분 영양값과 식단 충족 여부는 판정할 수 없습니다. 미제공은 0이 아닙니다.`,products:matches.slice(0,q.limit).map(publicProduct),count:matches.length}
  }
  if(q.sort==='price'||q.sort==='gramPrice') {
    const price=p=>q.sort==='gramPrice'?gramPrice(p):p.market?.unitPrice??null
    const found=matches.length
    matches=matches.filter(p=>price(p)!==null).sort((a,b)=>(price(a)-price(b))*(q.direction==='desc'?-1:1)||a.id-b.id)
    if(found&&!matches.length)return {text:q.sort==='gramPrice'?`해당 상품 ${found.toLocaleString('ko-KR')}건 모두 g 중량이 확인되지 않아 g당 단가를 비교할 수 없어요. mL·L로 표기된 상품은 g으로 환산하지 않습니다. 판매 단위 가격으로 비교해 볼까요?`:`해당 상품 ${found.toLocaleString('ko-KR')}건 모두 가격이 확인되지 않아 가격순으로 비교할 수 없어요.`,products:[],count:0}
  }
  return {text:matches.length?`조건에 맞는 등록 상품 ${matches.length.toLocaleString('ko-KR')}건 중 ${Math.min(q.limit,matches.length)}건을 확인했습니다.${q.sort==='gramPrice'?` 확인된 중량 기준 환산 단가가 ${q.direction==='desc'?'높은':'낮은'} 순서입니다.`:q.sort==='price'?` 판매 단위 가격이 ${q.direction==='desc'?'높은':'낮은'} 순서입니다.`:''} 가격은 수집 시점 기준이며 실제 계약 조건은 상세 페이지에서 확인해 주세요.`:'현재 등록 데이터에서 조건에 맞는 상품을 찾지 못했습니다. 검색어나 가격 조건을 바꿔 주세요.',products:matches.slice(0,q.limit).map(publicProduct),count:matches.length}
}
