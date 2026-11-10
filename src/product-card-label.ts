import {PRODUCT_CARD_LABEL_OVERRIDES} from './product-card-label-overrides.ts'
import type {Product} from './data'

// Split display fields without splitting commas inside descriptions or numbers.
function nameFields(name:string) {
 const fields:string[]=[];let start=0,depth=0
 for(let i=0;i<name.length;i++){
  if('([{（'.includes(name[i]))depth++
  else if(')]}）'.includes(name[i]))depth=Math.max(0,depth-1)
  else if(name[i]===','&&depth===0&&!(/\d/.test(name[i-1]||'')&&/\d/.test(name[i+1]||''))){fields.push(name.slice(start,i).trim());start=i+1}
 }
 fields.push(name.slice(start).trim());return fields
}
type CardLabelProduct=Pick<Product,'name'|'subcategory'|'market'>&{id?:number}
function sourceCardLabel(p:CardLabelProduct) {
 const reviewed=p.id==null?undefined:PRODUCT_CARD_LABEL_OVERRIDES[p.id]
 if(reviewed?.sourceName===p.name&&reviewed.sourceMarketName===(p.market?.name||''))return {title:reviewed.title,itemName:reviewed.itemName}
 const itemName=p.market?.itemType||p.subcategory
 // G2B names provide separate item, brand, product and specification fields.
 for(const source of [p.name,p.market?.name]){
  if(!source)continue
  const fields=nameFields(source)
  if(fields.length>=4&&fields[0]===itemName&&fields[2])return {title:fields.slice(2).join(', '),itemName:fields[0]}
 }
 return {title:p.name,itemName:itemName&&itemName!=='미제공'&&![p.name,p.market?.name].includes(itemName)?itemName:''}
}

const capacityPattern=/(\d+(?:,\d{3})*(?:\.\d+)?)\s*(kg|mg|g|ml|l|㎏|㎖|ℓ)(?![a-wyz])/ig
function capacityValue(amount:string,unit:string) {
 const u=unit.toLowerCase(),volume=['ml','l','㎖','ℓ'].includes(u)
 const factor=['kg','㎏','l','ℓ'].includes(u)?1000:u==='mg'?.001:1
 return {value:Number(amount.replaceAll(',',''))*factor,volume}
}
function deduplicateCapacity(title:string) {
 const fields=nameFields(title)
 const specIndex=fields.findIndex((field,index)=>index>0&&/^\d/.test(field)&&[...field.matchAll(capacityPattern)].length>0)
 if(specIndex>0){
  const spec=[...fields[specIndex].matchAll(capacityPattern)][0]
  const target=capacityValue(spec[1],spec[2])
  let containsPackCount=false
  for(let i=0;i<specIndex;i++){
   fields[i]=fields[i].replace(capacityPattern,(full,amount:string,unit:string,offset:number,source:string)=>{
    const value=capacityValue(amount,unit)
    if(value.volume!==target.volume||Math.abs(value.value-target.value)>1e-8)return full
    if(/^\s*[×x*]\s*\d/i.test(source.slice(offset+full.length))){containsPackCount=true;return full}
    return ''
   }).replace(/[（(]\s*[,·]?\s*[）)]/g,'').replace(/([（(])\s*[,·]\s*/g,'$1').replace(/\s{2,}/g,' ').trim()
  }
  // Keep a meaningful name-side pack count such as 1kg×20EA.
  if(containsPackCount&&fields[specIndex].trim()===spec[0])fields.splice(specIndex,1)
 }
 // Some source specifications repeat the unit after their pack breakdown.
 return fields.join(', ').replace(/(\d[\d,.]*\s*)(kg|mg|g|ml|l)(\([^)]*[×x*][^)]*\))\s*\2(?![a-z])/ig,'$1$2$3').trim()
}
export function productCardLabel(p:CardLabelProduct) {
 const label=sourceCardLabel(p)
 return {...label,title:deduplicateCapacity(label.title)}
}
