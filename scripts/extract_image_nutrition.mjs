// 상품 상세 이미지(나라장터)에서 영양성분표를 읽어 영양 정보를 추출한다. 결과는 '검증 전' 자료이며 식약처 확정 자료와 섞지 않는다.
// 사용: node scripts/extract_image_nutrition.mjs --set=unverified|verified [--limit=50] [--offset=0] [--concurrency=3] [--collect-only] [--build] [--retry=parse_error,no_basis]
//  - 이미지: .local/image-nutrition/img/  · 추출 결과(이어받기): .local/image-nutrition/results.jsonl
//  - --build: 결과를 public/data/image-nutrition.json(배포용)으로 내보낸다.
import {readFile,writeFile,appendFile,mkdir,access} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {parseProductImages} from '../api/_product-images.mjs'
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),dir=path.join(root,'.local','image-nutrition'),imgDir=path.join(dir,'img'),resultsFile=path.join(dir,'results.jsonl'),listFile=path.join(dir,'images.jsonl')
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const [k,v='true']=a.replace(/^--/,'').split('=');return [k,v]}))
try{for(const line of (await readFile(path.join(root,'.env'),'utf8')).split(/\r?\n/)){const m=line.match(/^([A-Z_]+)=(.*)$/);if(m&&process.env[m[1]]===undefined)process.env[m[1]]=m[2].trim()}}catch{}
const KEY=(process.env.MILIMARKET_CLAUDE_API_KEY||process.env.ANTHROPIC_API_KEY||'').trim()
const WORKSPACE=(process.env.MILIMARKET_CLAUDE_WORKSPACE_ID||process.env.ANTHROPIC_WORKSPACE_ID||'').trim()
const MODEL=process.env.IMAGE_NUTRITION_MODEL?.trim()||'claude-haiku-5-5'
const MAX_IMAGES=4,ENDPOINT='https://shop.g2b.go.kr/gm/gms/gmsf/GdsDtlInfo/selectPdctBaseInfo.do'
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function retry(fn,tries=4){for(let i=0;;i++){try{return await fn()}catch(e){if(i>=tries-1)throw e;await sleep(1500*(i+1))}}}
const exists=f=>access(f).then(()=>true,()=>false)
const readJsonl=async f=>(await exists(f))?(await readFile(f,'utf8')).split('\n').filter(Boolean).map(l=>JSON.parse(l)):[]
await mkdir(imgDir,{recursive:true})
const load=f=>readFile(path.join(root,f),'utf8').then(JSON.parse)

if(args.build){
  // 등급: full = 열량과 3대 영양소가 모두 읽히고 열량이 맞음 / partial = 일부만 읽혔고 읽힌 값끼리 모순 없음. 기준량이 없거나 모순이면 제외.
  const classify=r=>{
    if(!r.hasTable||!r.basis||!r.values||r.values.some(v=>v!=null&&v<0)||r.values.every(v=>v==null))return null
    const [kcal,p,fat,c]=r.values,known=4*(p??0)+4*(c??0)+9*(fat??0)
    if([kcal,p,fat,c].every(v=>v!=null))return Math.abs(known-kcal)<=Math.max(30,kcal*0.3)?'full':null
    if(kcal!=null&&known>kcal*1.3+30)return null
    return 'partial'
  }
  const records={},grades={full:0,partial:0},official=(await load('public/data/official-nutrition.json')).records
  const latest=new Map();for(const r of await readJsonl(resultsFile))latest.set(r.id,r) // 재시도한 상품은 마지막 결과를 쓴다
  for(const r of latest.values()){const g=classify(r);if(!g||official[r.id])continue;/* 식약처 확정 상품은 확정 자료를 우선한다 */records[r.id]={b:r.basis,v:r.values,i:r.image,t:r.extractedAt,g};grades[g]++}
  console.log('등급',grades)
  await writeFile(path.join(root,'public','data','image-nutrition.json'),JSON.stringify({source:'상품 상세 이미지(나라장터) 영양성분표 · 모델 추출',verified:false,model:MODEL,count:Object.keys(records).length,records}))
  console.log(`public/data/image-nutrition.json: ${Object.keys(records).length}개`);process.exit(0)
}

const [rows,off]=await Promise.all([load('public/data/products.json'),load('public/data/official-nutrition.json')])
const products=rows.products||rows,officialIds=new Set(Object.keys(off.records))
let targets=products.map(p=>String(p.id)).filter(id=>args.set==='verified'?officialIds.has(id):!officialIds.has(id))
if(args.set==='verified'){const step=Math.max(1,Math.floor(targets.length/Number(args.limit||50)));targets=targets.filter((_,i)=>i%step===0)} // 균등 표본
targets=targets.slice(Number(args.offset||0),Number(args.offset||0)+Number(args.limit||targets.length))
const concurrency=Number(args.concurrency||3)
async function pool(items,worker){let i=0,done=0;await Promise.all(Array.from({length:concurrency},async()=>{while(i<items.length){const item=items[i++];try{await worker(item)}catch(e){console.error(item,String(e.message||e).slice(0,120),e.cause?.code||e.cause?.message||'')}if(++done%50===0)console.log(`${done}/${items.length}`)}}))}

// 1) 이미지 수집
const listed=new Map((await readJsonl(listFile)).map(r=>[r.id,r]))
async function collect(id){
  if(listed.has(id))return
  const parsed=await retry(async()=>{const res=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json',Referer:'https://shop.g2b.go.kr/'},body:JSON.stringify({dlGdsDtlInfoSrchM:{srchItemIdnfNo:id,srchCtrtItemMngNo:''}}),signal:AbortSignal.timeout(20000)});return parseProductImages(await res.json(),id)}),files=[]
  for(const [n,url] of parsed.images.slice(0,MAX_IMAGES).entries()){
    const ext=(url.match(/\.(png|jpe?g|gif|webp)$/i)||['','jpg'])[1].toLowerCase().replace('jpeg','jpg'),file=path.join(imgDir,`${id}_${n}.${ext}`)
    if(!await exists(file)){const buf=await retry(async()=>{const r=await fetch(url,{headers:{Referer:'https://shop.g2b.go.kr/'},signal:AbortSignal.timeout(30000)});if(!r.ok)return null;return Buffer.from(await r.arrayBuffer())});if(!buf)continue;await writeFile(file,buf)}
    files.push({url,file:path.basename(file)})
  }
  const rec={id,count:parsed.images.length,files};listed.set(id,rec);await appendFile(listFile,JSON.stringify(rec)+'\n');await sleep(250)
}
await pool(targets,collect)
if(args['collect-only']){console.log('수집 완료',listed.size);process.exit(0)}

// 2) 영양표 읽기
if(!KEY)throw new Error('MILIMARKET_CLAUDE_API_KEY가 필요합니다.')
const NUT=['calories','protein','fat','carbs','sugars','sodium','calcium']
const nullableNum={anyOf:[{type:'number'},{type:'null'}]}
const schema={type:'object',additionalProperties:false,required:['hasTable','imageIndex','basisAmount','basisUnit','calories','protein','fat','carbs','sugars','sodium','calcium'],properties:{hasTable:{type:'boolean'},imageIndex:{anyOf:[{type:'integer'},{type:'null'}]},basisAmount:nullableNum,basisUnit:{anyOf:[{type:'string',enum:['g','mL']},{type:'null'}]},calories:nullableNum,protein:nullableNum,fat:nullableNum,carbs:nullableNum,sugars:nullableNum,sodium:nullableNum,calcium:nullableNum}}
const system='너는 식품 상세 이미지에서 영양성분표를 읽는 도구다. 이미지들 중 "영양정보/영양성분" 표가 읽히는 것을 찾는다. 원재료명·주의사항·포장 사진만 있으면 hasTable=false로 하고 나머지는 null이다. 표에 실제로 적힌 숫자만 옮기고 추측·계산·보정을 하지 않는다. 읽을 수 없거나 표에 없는 항목은 null이다(0과 다르다). 기준량은 표의 100g(또는 100mL)당 열이 있으면 그것을, 없으면 1회 제공량의 g·mL를 basisAmount/basisUnit에 적는다. "총 내용량 400g"·"1포장(250g)당"처럼 표 전체가 특정 중량·용량 기준이면 그 숫자가 기준량이다(예: 총 내용량 400g → basisAmount 400, basisUnit g). 기준량이 어디에도 없을 때만 null이다. 단위가 g·mL로 확인되지 않으면 basisAmount와 basisUnit을 null로 한다. 열량 kcal, 단백질·지방·탄수화물·당류 g, 나트륨·칼슘 mg 값이며 %영양성분기준치는 쓰지 않는다. imageIndex는 표가 있는 이미지의 번호(0부터)다.'
const MIME={jpg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif'}
async function callClaude(content,attempt=0){
  const res=await retry(()=>fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':KEY,'anthropic-version':'2023-06-01',...(WORKSPACE?{'anthropic-workspace-id':WORKSPACE}:{})},body:JSON.stringify({model:MODEL,max_tokens:2000,system,output_config:{effort:'low',format:{type:'json_schema',schema}},messages:[{role:'user',content}]}),signal:AbortSignal.timeout(90000)}))
  if([429,500,502,503,529].includes(res.status)&&attempt<5){await sleep(2000*(attempt+1));return callClaude(content,attempt+1)}
  const body=await res.json();if(!res.ok)throw new Error(`HTTP ${res.status} ${JSON.stringify(body).slice(0,200)}`)
  return body
}
const latestResult=new Map();for(const r of await readJsonl(resultsFile))latestResult.set(r.id,r)
const category=r=>r.reason==='parse_error'?'parse_error':r.hasTable&&!r.basis&&r.values?.some(v=>v!=null)?'no_basis':r.hasTable&&r.basis&&r.consistent===false?'inconsistent':'other'
const retryKinds=new Set(String(args.retry||'').split(',').filter(Boolean))
const done=new Set([...latestResult.values()].filter(r=>!retryKinds.has(category(r))).map(r=>r.id))
if(retryKinds.size)console.log('재시도 대상',targets.filter(id=>!done.has(id)).length)
let usage={input:0,output:0}
async function extract(id){
  if(done.has(id))return
  const rec=listed.get(id);if(!rec?.files?.length){await appendFile(resultsFile,JSON.stringify({id,hasTable:false,reason:'no_images'})+'\n');return}
  const content=[]
  for(const [n,f] of rec.files.entries()){const ext=path.extname(f.file).slice(1),buf=await readFile(path.join(imgDir,f.file));if(buf.length>4_500_000)continue;content.push({type:'text',text:`이미지 ${n}`},{type:'image',source:{type:'base64',media_type:MIME[ext]||'image/jpeg',data:buf.toString('base64')}})}
  content.push({type:'text',text:'위 이미지들에서 영양성분표를 읽어 JSON으로 답해라.'})
  const body=await callClaude(content);usage.input+=body.usage?.input_tokens||0;usage.output+=body.usage?.output_tokens||0
  const text=body.content?.find(c=>c.type==='text')?.text;let r;try{r=JSON.parse(text)}catch{r=null}
  if(!r){await appendFile(resultsFile,JSON.stringify({id,hasTable:false,reason:'parse_error'})+'\n');return}
  const values=NUT.map(k=>Number.isFinite(r[k])?r[k]:null),basis=r.basisAmount>0&&r.basisUnit?{text:`${r.basisAmount}${r.basisUnit}`,amount:r.basisAmount,unit:r.basisUnit}:null
  const [kcal,p,fat,c]=values,core=[kcal,p,fat,c].every(v=>v!=null)
  // 검산: 열량 ≈ 4·단백질 + 4·탄수화물 + 9·지방 (±30% 또는 ±30kcal). 맞지 않으면 오인식으로 보고 표기하지 않는다.
  const est=core?4*p+4*c+9*fat:null,consistent=!!(r.hasTable&&basis&&core&&Math.abs(est-kcal)<=Math.max(30,kcal*0.3)&&values.every(v=>v==null||v>=0))
  await appendFile(resultsFile,JSON.stringify({id,hasTable:r.hasTable,basis,values,image:rec.files[r.imageIndex??0]?.url||null,consistent,est,model:MODEL,extractedAt:new Date().toISOString()})+'\n')
}
await pool(targets,extract)
console.log('토큰',usage,'모델',MODEL)
