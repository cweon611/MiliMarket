const SOURCE='https://shop.g2b.go.kr'
const ENDPOINT=SOURCE+'/gm/gms/gmsf/GdsDtlInfo/selectPdctBaseInfo.do'
const cache=new Map(),pending=new Map()
export function parseProductImages(data,id){
  if(data.ErrorCode!==0||!Array.isArray(data.dlImgUrlL))throw new Error('나라장터 이미지 목록 응답을 확인하지 못했습니다.')
  const images=[]
  for(const row of data.dlImgUrlL){
    if(String(row.itemIdnfNo)!==String(id)||typeof row.orgnlImgUrl!=='string')continue
    const url=new URL(row.orgnlImgUrl,SOURCE)
    if(url.origin!==SOURCE||!url.pathname.startsWith('/static/CataAttach/')||! /\.(png|jpe?g|gif|webp)$/i.test(url.pathname))continue
    if(!images.includes(url.href))images.push(url.href)
  }
  return {id:Number(id),images,sourceUrl:SOURCE+'/',checkedAt:new Date().toISOString()}
}
export async function getProductImages(id){
  const hit=cache.get(id)
  if(hit&&hit.until>Date.now())return hit.value
  if(pending.has(id))return pending.get(id)
  const promise=(async()=>{
    const res=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json',Referer:SOURCE+'/'},body:JSON.stringify({dlGdsDtlInfoSrchM:{srchItemIdnfNo:String(id),srchCtrtItemMngNo:''}}),signal:AbortSignal.timeout(12000)})
    if(!res.ok)throw new Error('나라장터 이미지 조회에 실패했습니다.')
    const value=parseProductImages(await res.json(),id)
    if(cache.size>=1000)cache.delete(cache.keys().next().value)
    cache.set(id,{value,until:Date.now()+3600000})
    return value
  })().finally(()=>pending.delete(id))
  pending.set(id,promise)
  return promise
}
