import type {Product,MarketInfo} from './data'
import {mergeCatalog} from '../shared/catalog.mjs'
import {officialEntries,imageEntries,isFresh} from '../shared/official-nutrition.mjs'
import {verifiedRecord} from '../shared/nutrition.mjs'

export function hydrateCatalog(rows:Product[],market:Record<string,MarketInfo>,bulk:unknown,imageFile:unknown):Product[] {
 if(!Array.isArray(rows)||!rows.length)throw new Error('Empty catalog')
 const entries=officialEntries(bulk),images=imageEntries(imageFile)
 return mergeCatalog(rows,market).map((p:Product)=>{
  const nutrition=entries[p.id]?.nutrition
  const base=nutrition&&isFresh(nutrition)?{...p,verifiedNutrition:verifiedRecord(nutrition),officialNutritionState:'verified'}:p
  return !base.verifiedNutrition&&images[p.id]?{...base,imageNutrition:images[p.id]}:base
 })
}
