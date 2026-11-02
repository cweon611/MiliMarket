import {searchCatalog,searchCatalogFocused} from '../shared/catalog.mjs'
export function candidates(products,q){
 let result
 const ids=q.productIds?.length?q.productIds:q.productId?[q.productId]:[]
 // Ranked answers (price/g price/nutrients) and recommendations use only on-topic products.
 const ranked=(q.sort&&q.sort!=='default')||['recommend','alternative'].includes(q.intent)
 const search=(list,query)=>query&&ranked?searchCatalogFocused(list,query):searchCatalog(list,query)
 if(ids.length)result=ids.map(id=>products.find(p=>p.id===id)).filter(Boolean)
 else if(q.queries?.length)result=[...new Map(q.queries.flatMap(query=>search(products,query)).map(p=>[p.id,p])).values()]
 else result=search(products,q.query||'')
 return result.filter(p=>(q.minPrice==null||p.market?.unitPrice!=null&&(q.minPriceExclusive?p.market.unitPrice>q.minPrice:p.market.unitPrice>=q.minPrice))&&(q.maxPrice==null||p.market?.unitPrice!=null&&(q.priceExclusive?p.market.unitPrice<q.maxPrice:p.market.unitPrice<=q.maxPrice)))
}
export async function lookupBatch(products,service,{max=40,deadlineMs=20000}={}){
 const selected=products.slice(0,max),results=[],start=Date.now();let cursor=0
 await Promise.all(Array.from({length:4},async()=>{while(cursor<selected.length&&Date.now()-start<deadlineMs){const p=selected[cursor++];results.push({productId:p.id,productName:p.name,...await service.nutrition(p)})}}))
 return results.sort((a,b)=>selected.findIndex(p=>p.id===a.productId)-selected.findIndex(p=>p.id===b.productId))
}
