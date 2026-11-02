import {createContext, useContext, useState, type ReactNode} from 'react'
import {massPrice} from '../shared/price.mjs'
import './price-unit.css'
type Unit = 'g' | 'kg'
const Context = createContext<{unit:Unit;setUnit:(unit:Unit)=>void}>({unit:'g',setUnit:()=>{}})
export function PriceUnitProvider({children}:{children:ReactNode}) {
  const [unit,update]=useState<Unit>(()=>{try{return localStorage.getItem('milimarket.price-unit')==='kg'?'kg':'g'}catch{return 'g'}})
  const setUnit=(value:Unit)=>{update(value);try{localStorage.setItem('milimarket.price-unit',value)}catch{/* Keep the current selection when storage is unavailable. */}}
  return <Context.Provider value={{unit,setUnit}}>{children}</Context.Provider>
}
export function usePriceUnit(){const value=useContext(Context);return {...value,price:(perGram:number|null)=>massPrice(perGram,value.unit)}}
export function PriceUnitToggle(){const {unit,setUnit}=usePriceUnit();return <div className="price-unit-control"><span>환산 단가</span><div role="group" aria-label="환산 단가 표시 단위">{(['g','kg'] as const).map(value=><button type="button" key={value} aria-pressed={unit===value} onClick={()=>setUnit(value)}>{value}당</button>)}</div></div>}
