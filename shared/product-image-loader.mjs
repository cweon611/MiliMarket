// Share successful lookups and in-flight requests across cards and the gallery.
export function createProductImageLoader(fetcher=(...args)=>fetch(...args),now=Date.now) {
 const cache=new Map(),pending=new Map()
 return function load(id,refresh=false) {
  const key=Number(id),hit=cache.get(key)
  if(!refresh&&hit&&hit.until>now())return Promise.resolve(hit.data)
  if(pending.has(key))return pending.get(key)
  const request=Promise.resolve().then(()=>fetcher(`/api/product-images?id=${key}`)).then(async response=>{
   if(!response.ok)throw new Error('Image lookup failed')
   const data=await response.json()
   if(data.id!==key||!Array.isArray(data.images)||data.images.some(url=>typeof url!=='string'))throw new Error('Invalid image list')
   if(cache.size>=500)cache.delete(cache.keys().next().value)
   cache.set(key,{data,until:now()+3600000});return data
  }).finally(()=>pending.delete(key))
  pending.set(key,request);return request
 }
}
export const loadProductImages=createProductImageLoader()
