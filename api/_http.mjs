import {readFile,stat} from 'node:fs/promises'
import path from 'node:path'

export async function readBody(req){
  if(!String(req.headers['content-type']).startsWith('application/json'))throw new Error('JSON 형식으로 요청해 주세요.')
  if(req.body!==undefined){const body=typeof req.body==='string'?req.body:JSON.stringify(req.body);if(Buffer.byteLength(body)>128000)throw new Error('입력 내용이 너무 깁니다.');return JSON.parse(body)}
  let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>128000)throw new Error('입력 내용이 너무 깁니다.')}return JSON.parse(body)
}

export async function serveStatic(req,res,url,root){
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end()}
    const relative=decodeURIComponent(url.pathname)==='/'?'index.html':decodeURIComponent(url.pathname).replace(/^\//,'')
    const dist=path.join(root,'dist'),file=path.resolve(dist,relative)
    if(!file.startsWith(dist+path.sep)||relative.split(/[\\/]/).some(s=>s.startsWith('.'))){res.writeHead(404);return res.end()}
    const info=await stat(file);if(!info.isFile()){res.writeHead(404);return res.end()}
    const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream'
    res.writeHead(200,{'Content-Type':mime,'X-Content-Type-Options':'nosniff','Cache-Control':relative==='index.html'?'no-cache':'public, max-age=300'})
    res.end(req.method==='HEAD'?undefined:await readFile(file))
}

// Expired buckets are released periodically without changing the original
// strict expiry boundary or the independent per-client/per-operation limits.
export function createRateLimiter({now=Date.now}={}){
 const rates=new Map();let nextCleanup=0
 return (req,key,max)=>{
  const time=now()
  if(time>=nextCleanup){
   for(const [id,entry] of rates)if(entry.until<time)rates.delete(id)
   nextCleanup=time+60000
  }
  const id=`${req.socket.remoteAddress}:${key}`,entry=rates.get(id)
  if(!entry||entry.until<time){rates.set(id,{n:1,until:time+60000});return true}
  return ++entry.n<=max
 }
}
