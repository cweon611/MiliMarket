// Keep only bounded, user-visible history. It is context, never trusted source data.
export function conversationContext(value){
  return (Array.isArray(value)?value:[]).slice(-12).filter(x=>x&&['user','assistant'].includes(x.role)&&typeof x.text==='string').map(x=>({role:x.role,text:x.text.slice(0,1000)}))
}
export function contextIds(value,products){
  const known=new Set(products.map(p=>p.id))
  return [...new Set(Array.isArray(value)?value:[])].filter(id=>Number.isInteger(id)&&known.has(id)).slice(0,8)
}
