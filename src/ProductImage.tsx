import {useEffect,useRef,useState} from 'react'
import {Package} from 'lucide-react'
import type {Product} from './data'
import {categoryLabel} from './category-label'
import {loadProductImages} from '../shared/product-image-loader.mjs'

export function ProductImage({product:p}:{product:Product}) {
 const root=useRef<HTMLDivElement>(null)
 const [visible,setVisible]=useState(false),[images,setImages]=useState<string[]>([])
 const [failed,setFailed]=useState<string[]>([]),[checked,setChecked]=useState(false),[loading,setLoading]=useState(false)
 const [loaded,setLoaded]=useState<string|null>(null)
 const src=[p.market?.imageUrl,...images].find((url):url is string=>!!url&&!failed.includes(url))
 useEffect(()=>{
  const element=root.current;if(!element)return
  const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);observer.disconnect()}},{rootMargin:'200px'})
  observer.observe(element);return ()=>observer.disconnect()
 },[])
 useEffect(()=>{
  if(!visible||src||checked)return
  let active=true;setLoading(true)
  loadProductImages(p.id).then((data:{images:string[]})=>{if(active)setImages(data.images)}).catch(()=>{}).finally(()=>{if(active){setChecked(true);setLoading(false)}})
  return ()=>{active=false}
 },[visible,src,checked,p.id])
 return <div ref={root} className={src?'food-art real-product-art':'food-art catalog-art'}>
  {src?<><img key={src} src={src} alt={p.market?.name||p.name} loading="lazy" referrerPolicy="no-referrer" onLoad={()=>setLoaded(src)} onError={()=>setFailed(urls=>[...urls,src])}/>{loaded!==src&&<small className="product-image-loading" role="status">이미지 불러오는 중…</small>}</>:<><Package size={42} strokeWidth={1.2}/><strong>{categoryLabel(p.category)}</strong><span>{loading||!checked?'이미지 확인 중…':'상품 이미지 미제공'}</span></>}
 </div>
}
