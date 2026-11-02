import {usePriceUnit} from './PriceUnit'
import {useEffect,useRef,useState,type ReactNode} from 'react'
import {FileImage,Package,Maximize2,X} from 'lucide-react'
import {formatValue,type Product} from './data'
import {alternatives,gramPrice} from '../shared/catalog.mjs'
import {nutritionDiffs} from '../shared/alternative-facts.mjs'
import {api} from './AssistantWorkspace'
export function ProductGallery({product:p,image}:{product:Product;image:ReactNode}) {
  const [active,setActive]=useState(0),[images,setImages]=useState<string[]>([])
  const [state,setState]=useState<'loading'|'ready'|'error'>('loading'),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0)
  const zoom=useRef<HTMLDialogElement>(null)
  useEffect(()=>{setActive(0);zoom.current?.close()},[p.id])
  useEffect(()=>{
    const controller=new AbortController()
    setImages([]);setFailed(false);setState('loading')
    fetch(`/api/product-images?id=${p.id}`,{signal:controller.signal})
      .then(async r=>{if(!r.ok)throw new Error('Image lookup failed');return r.json()})
      .then(data=>{if(data.id!==p.id||!Array.isArray(data.images))throw new Error('Invalid image list');setImages(data.images);setState('ready')})
      .catch(()=>{if(!controller.signal.aborted)setState('error')})
    return ()=>controller.abort()
  },[p.id,attempt])
  const choose=(index:number)=>{setActive(index);setFailed(false)}
  const src=images[active]||(active===1?p.market?.labelImageUrl:undefined)
  return <div className="product-gallery">
    {src&&!failed?<button className="gallery-preview" aria-label={`${active===0?'상품':'추가'} 이미지 확대`} onClick={()=>zoom.current?.showModal()}><img src={src} alt={`${p.name} ${active===0?'상품 이미지':`원재료·영양 표시 확인용 추가 이미지 ${active}`}`} referrerPolicy="no-referrer" onError={()=>setFailed(true)}/><span><Maximize2 size={14}/> 크게 보기</span></button>:active===0?image:<div className="label-placeholder" role="status"><FileImage size={34}/><strong>{failed?'이미지를 불러오지 못했습니다':state==='loading'?'나라장터 추가 이미지 조회 중…':state==='error'?'추가 이미지 조회에 실패했습니다':'나라장터에 추가 이미지가 없습니다'}</strong><p>{state==='ready'&&!failed?'아래 영양성분 원문과 상품 출처를 확인해 주세요.':'잠시 후 다시 시도하거나 나라장터 원본을 확인해 주세요.'}</p>{(state==='error'||failed)&&<button className="detail-outline" onClick={()=>setAttempt(n=>n+1)}>이미지 다시 조회</button>}</div>}
    <div className="gallery-tabs" role="group" aria-label="상품 이미지 선택"><button aria-pressed={active===0} onClick={()=>choose(0)}><Package size={14}/> 상품 이미지</button><button aria-pressed={active>0} onClick={()=>choose(1)}><FileImage size={14}/> 원재료·영양 라벨</button></div>
    {images.length>0&&<div className="gallery-thumbnails" aria-label="나라장터 등록 이미지">{images.map((url,index)=><button key={url} aria-label={`등록 이미지 ${index+1} 선택`} aria-pressed={active===index} onClick={()=>choose(index)}><img src={url} alt="" loading="lazy" referrerPolicy="no-referrer"/><span>{index===0?'상품':`추가 ${index}`}</span></button>)}</div>}
    <p className="gallery-source">나라장터 등록 원본 · 추가 사진의 영양·원재료 표시는 확대해서 확인하세요. 상품별로 등록 내용이 다릅니다.</p>
    <dialog ref={zoom} className="gallery-zoom" aria-label="상품 이미지 확대 보기"><header><strong>{active===0?'상품 이미지':'원재료·영양 표시 확인'}</strong><button aria-label="이미지 확대 닫기" onClick={()=>zoom.current?.close()}><X size={22}/></button></header>{src&&<img src={src} alt={`${p.name} 확대 이미지`} referrerPolicy="no-referrer"/>}<p>출처: 나라장터 쇼핑몰 · 물품식별번호 {p.id}</p></dialog>
  </div>
}
export function AlternativeProducts({products,current,onChoose,onCompare}:{products:Product[];current:Product;onChoose:(p:Product)=>void;onCompare:(p:Product)=>void}) {
  const {unit,price}=usePriceUnit()
  const options=alternatives(products,current) as Product[]
  return <section className="alternatives-section"><span className="ai-eyebrow">COMPARE WITH CONFIDENCE</span><h2>같은 품목, 더 낮은 {unit}당 가격</h2><p>나라장터 세부 품목이 같고 중량·단가가 확인된 상품입니다. 맛·원재료·영양의 동등성을 의미하지 않습니다.</p>{options.length?<div className="alternatives-grid">{options.map(p=><article key={p.id}><strong>{p.name}</strong><p>{unit}당 <b>{formatValue(price(gramPrice(p)),'원')}</b><br/>현재 상품 대비 {unit}당 {formatValue(price(gramPrice(current)!-gramPrice(p)!),'원')} 낮음</p><AlternativeNutrition current={current} option={p}/><small>물품식별번호 {p.id}</small><div><button onClick={()=>onChoose(p)}>상품 상세</button><button onClick={()=>onCompare(p)}>두 상품 비교</button></div><AlternativeComment current={current} option={p}/></article>)}</div>:<p>같은 품목에서 비교 가능한 저가 상품이 없거나 기준 중량이 확인되지 않았습니다.</p>}</section>
}
// 공식 영양 자료(보고번호 일치)가 두 상품 모두 있을 때만 100g당 차이를 보여준다.
function AlternativeNutrition({current,option}:{current:Product;option:Product}){
  const diffs=nutritionDiffs(current,option)
  if(!diffs.length)return <p className="alternative-nutrition muted">영양 비교: 공식 영양 자료가 없는 상품이 있어 비교하지 않음</p>
  return <p className="alternative-nutrition">공식 영양 100g당 {diffs.map(d=><span key={d.key} className={d.diff===0||d.key==='calories'?'':(d.key==='protein')===(d.diff>0)?'better':'worse'}>{d.label} {d.diff>0?'+':d.diff<0?'−':'±'}{formatValue(Math.round(Math.abs(d.diff)*10)/10,d.unit)}</span>)}</p>
}
// 버튼을 눌렀을 때만 요청한다. Claude는 서버가 만든 사실 문장 중 핵심만 고른다.
function AlternativeComment({current,option}:{current:Product;option:Product}){
  const [state,setState]=useState<{status:'idle'|'loading'|'ready'|'error';lines:string[];note?:string}>({status:'idle',lines:[]})
  useEffect(()=>{setState({status:'idle',lines:[]})},[current.id,option.id])
  const load=()=>{setState({status:'loading',lines:[]});api<{highlights:string[];mode:string;notice:string|null}>('/api/alternative-comment',{productId:current.id,alternativeId:option.id}).then(r=>setState({status:'ready',lines:r.highlights,note:r.mode==='claude_verified'?'Mili가 검증된 비교 사실에서 고른 핵심입니다.':r.notice||'AI 미연결 · 검증된 비교 사실을 그대로 보여줍니다.'})).catch(e=>setState({status:'error',lines:[],note:(e as Error).message}))}
  if(state.status==='idle')return <button className="alternative-comment-button" onClick={load}>Mili 코멘트 보기</button>
  if(state.status==='loading')return <p className="alternative-comment muted">Mili가 비교 근거를 고르는 중…</p>
  if(state.status==='error')return <p className="alternative-comment muted" role="alert">{state.note} <button onClick={load}>다시 시도</button></p>
  return <div className="alternative-comment"><b>Mili 코멘트</b>{state.lines.map(l=><p key={l}>{l}</p>)}<small>{state.note}</small></div>
}
