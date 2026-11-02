import { defaultQuote, type Product, type QuoteInputs } from './data.ts'
export const PREFERENCES_KEY = 'milimarket-order-preferences-v1'
interface SavedQuote { signature:string; mode:'weight'|'count'; portion:number|null; pack:number|null; unitsPerPerson:number|null }
export interface OrderPreferences { people:number; quotes:Record<number,SavedQuote> }
export const emptyPreferences = ():OrderPreferences => ({people:1000,quotes:{}})
const positive = (n:unknown):number|null => typeof n==='number' && Number.isFinite(n) && n>0 ? n : null
export function decodePreferences(raw:string|null):OrderPreferences {
  try {
    const value=JSON.parse(raw || '{}')
    const out=emptyPreferences()
    if(value.version!==1) return out
    if(positive(value.people) && value.people<=100000) out.people=Math.floor(value.people)
    for(const [id, q] of Object.entries(value.quotes || {}) as [string,any][]) {
      if(!/^\d+$/.test(id) || !q || typeof q.signature!=='string' || !['weight','count'].includes(q.mode)) continue
      out.quotes[Number(id)]={signature:q.signature,mode:q.mode,portion:positive(q.portion),pack:positive(q.pack),unitsPerPerson:positive(q.unitsPerPerson)}
    }
    return out
  } catch { return emptyPreferences() }
}
const signature=(p:Product)=>JSON.stringify([p.market?.name || p.name,p.market?.unit || '',p.market?p.market.packGrams:p.packGrams])
export function saveQuote(p:Product,q:QuoteInputs):SavedQuote {
  return {signature:signature(p),mode:q.mode || 'weight',portion:q.portion,pack:q.pack,unitsPerPerson:q.unitsPerPerson ?? null}
}
export function restoreQuote(p:Product,prefs:OrderPreferences):QuoteInputs {
  const saved=prefs.quotes[p.id]
  const base=defaultQuote(p)
  if(!saved || saved.signature!==signature(p)) return base
  return {...base,mode:saved.mode,portion:saved.portion,pack:saved.pack,unitsPerPerson:saved.unitsPerPerson}
}
