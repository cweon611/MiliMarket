import {useEffect,useState} from 'react'
import type {Product,MarketInfo} from './data'
import {hydrateCatalog} from './catalog-hydration'

export function useCatalog(active:boolean,page:string) {
 const [requested,setRequested]=useState(active)
 const [products,setProducts]=useState<Product[]>([])
 const [loadState,setLoadState]=useState<'loading'|'ready'|'error'>('loading')
 const [attempt,setAttempt]=useState(0)
 useEffect(()=>{if(active)setRequested(true)},[active])
 useEffect(()=>{
  if(!requested)return
  const controller=new AbortController();let live=true
  setLoadState('loading')
  const read=async(url:string)=>{const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw new Error('Catalog unavailable');return response.json()}
  Promise.all([read('/data/products.json'),read('/data/market-enrichment.json'),read('/data/official-nutrition.json').catch(()=>null),read('/data/image-nutrition.json').catch(()=>null)])
   .then(([rows,market,bulk,images])=>{if(live){setProducts(hydrateCatalog(rows as Product[],market as Record<string,MarketInfo>,bulk,images));setLoadState('ready')}})
   .catch(()=>{if(live&&!controller.signal.aborted)setLoadState('error')})
  return ()=>{live=false;controller.abort()}
 },[requested,attempt])
 useEffect(()=>{
  if(loadState!=='ready')return
  let live=true
  const refresh=()=>{
   fetch('/api/catalog-updates').then(response=>{if(!response.ok)throw new Error();return response.json()})
    .then(data=>{if(!live||!data.updates||!Object.keys(data.updates).length)return
     setProducts(old=>old.some(p=>data.updates[p.id])?old.map(p=>data.updates[p.id]?{...p,...data.updates[p.id]}:p):old)
    }).catch(()=>{})
  }
  refresh();window.addEventListener('official-data-updated',refresh)
  return ()=>{live=false;window.removeEventListener('official-data-updated',refresh)}
 },[loadState,page])
 return {products,loadState,retry:()=>setAttempt(n=>n+1)}
}
