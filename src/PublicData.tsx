import {readJsonResponse} from '../shared/http-response.mjs'
import {useEffect,useState} from 'react'
import {Database, ExternalLink, LoaderCircle, RefreshCw} from 'lucide-react'
import './public-data.css'

interface Source {name:string;url:string}
interface Nutrient {label:string;unit:string;value:number|null;raw:string}
export interface NutritionRecord {code:string;name:string;manufacturer:string;reportNumber:string|null;basis:{text:string;amount:number|null;unit:string|null};nutrients:Record<string,Nutrient>;source:Source;reference:string;updatedAt:string;fetchedAt:string;classification:string}
export interface NutritionEvidence {productId?:number|null;productName?:string|null;status:string;match?:string;source:Source;records?:NutritionRecord[];message?:string;partial?:boolean;total?:number}
interface Offer {id:number;name:string;manufacturer:string;supplier:string;origin:string;unitPrice:number|null;unit:string;imageUrl:string|null;category:string;contractType:string;contractNumber:string;contractSequence:string;contractStart:string;contractEnd:string;delivery:string;region:string;updatedAt:string;fetchedAt:string;source:Source}
interface ProductData {productId:number;procurement:{status:string;source:Source;offers?:Offer[];fetchedAt?:string;partial?:boolean;message?:string};nutrition:NutritionEvidence}
const date=(s:string)=>s?new Date(s).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'미확인'
const stateLabel:Record<string,string>={not_configured:'인증키 발급 대기',error:'연결 확인 필요',empty:'조회 자료 없음',ok:'공식 API 조회'}
export function NutritionSources({evidence}:{evidence:NutritionEvidence[]}){
  return <div className="nutrition-sources">{evidence.map((e,i)=><section className="official-nutrition" key={`${e.productId||'reference'}-${i}`}>
    {e.productName&&<h3>{e.productName}</h3>}
    <div className="public-data-state"><span className={e.status==='ok'&&e.match==='report_number'?'verified':''}>{e.status==='ok'?(e.match==='report_number'?'보고번호 일치':e.match==='ambiguous'?'복수 자료 · 확인 필요':'참고 자료 · 상품 일치 미확인'):stateLabel[e.status]||'조회 상태 확인'}</span></div>
    {e.message&&<p className="public-data-message">{e.message}</p>}
    {e.records?.map(r=><article className="official-nutrition-record" key={r.code}>
      <h4>{r.name}</h4><p>{r.manufacturer||'제조사 미제공'} · 식품코드 {r.code}</p>
      <strong className="official-basis">{r.basis.text} 기준</strong>
      <dl>{Object.entries(r.nutrients).map(([key,n])=><div key={key}><dt>{n.label}</dt><dd>{n.value!==null?`${n.value.toLocaleString('ko-KR')} ${n.unit}`:n.raw?`${n.raw} ${n.unit} (원문)`:'미제공'}</dd></div>)}</dl>
      {!r.basis.amount&&<p className="public-data-message">계산 가능한 기준량이 없어 배식량으로 환산하지 않습니다.</p>}
      <footer>자료 수정 {r.updatedAt||'미제공'}<br/>조회 {date(r.fetchedAt)}{r.reference&&<><br/>원출처 {r.reference}</>}</footer>
    </article>)}
    {e.partial&&<p className="public-data-message">일부 결과만 표시했습니다. 전체 자료에서 유일한 상품인지 확인이 필요합니다.</p>}
    <a href={e.source.url} target="_blank" rel="noreferrer">{e.source.name} <ExternalLink size={12}/></a>
  </section>)}</div>
}
export function ProductPublicData({id}:{id:number}){
  const [data,setData]=useState<ProductData|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[attempt,setAttempt]=useState(0)
  useEffect(()=>{
    const controller=new AbortController();setData(null);setError('');setLoading(true)
    fetch(`/api/product-data?id=${id}`,{signal:controller.signal}).then(async r=>{return await readJsonResponse(r,'조회에 실패했습니다.') as ProductData}).then(d=>{setData(d);window.dispatchEvent(new Event('official-data-updated'))}).catch(e=>{if(!controller.signal.aborted)setError(e.message)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return ()=>controller.abort()
  },[id,attempt])
  return <section className="detail-box public-data-panel" aria-label="공공 API 상품 및 영양 정보">
    <div className="public-data-heading"><h2><Database size={16}/> 공공 API 정보</h2><button aria-label="공공 데이터 다시 불러오기" disabled={loading} onClick={()=>setAttempt(n=>n+1)}><RefreshCw size={15}/></button></div>
    <p className="section-caption">상품 상세와 AI 도우미가 같은 영양 자료를 사용합니다.</p>
    {loading?<p className="public-data-loading" role="status"><LoaderCircle className="spin" size={16}/> 나라장터·식약처 자료 확인 중…</p>:error?<p role="alert" className="ai-error">{error}</p>:data&&<>
      <h3>나라장터 계약·상품 정보</h3>
      <div className="public-data-state"><span className={data.procurement.status==='ok'?'verified':''}>{stateLabel[data.procurement.status]}</span></div>
      <p className="public-data-message">{data.procurement.message}</p>
      {data.procurement.offers?.map((o,i)=><article className="official-offer" key={`${o.contractType}-${o.contractNumber}-${o.contractSequence}-${i}`}>
        {o.imageUrl&&<img src={o.imageUrl} alt={o.name} loading="lazy" referrerPolicy="no-referrer" onError={e=>{e.currentTarget.style.display='none'}}/>}
        <h4>{o.name}</h4><dl>{[['제조사',o.manufacturer],['계약업체',o.supplier],['원산지',o.origin],['판매 단위',o.unit],['계약 단가',o.unitPrice!==null?o.unitPrice.toLocaleString('ko-KR')+'원':'미제공'],['계약 유형',o.contractType],['계약 번호',o.contractNumber],['계약 기간',`${o.contractStart||'미제공'} ~ ${o.contractEnd||'미제공'}`],['공급 지역',o.region]].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v||'미제공'}</dd></div>)}</dl>
      </article>)}
      {data.procurement.partial&&<p className="public-data-message">일부 계약만 표시했습니다. 전체 최저가로 해석하지 않습니다.</p>}
      {data.procurement.fetchedAt&&<p className="public-data-message">조회 {date(data.procurement.fetchedAt)} · 계약별 단위와 유효기간 확인 필요. 동일 판매 단위의 유효한 단일 계약은 조회 가격에 반영됩니다. 직접 입력한 계산기 단가는 유지합니다.</p>}
      <a href={data.procurement.source.url} target="_blank" rel="noreferrer">나라장터 API 출처 <ExternalLink size={12}/></a>
      <h3 className="public-nutrition-title">식약처 공식 영양 정보</h3>
      <NutritionSources evidence={[data.nutrition]}/>
      <p className="public-data-footnote">같은 조회는 1시간 재사용하며 공유 자료는 24시간 이내 값을 적용합니다. 인증키 설정 여부와 실제 조회 성공 여부는 별도로 표시합니다. 영양값 미제공은 0이 아닙니다.</p>
    </>}
  </section>
}
