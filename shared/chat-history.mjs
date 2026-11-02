// Preserve the visible transcript while keeping forgotten turns out of future requests.
/** @param {Array<{role:string,text:string,reply?:any}>} messages @param {object|null} settings */
export function chatRequestContext(messages=[],settings=null){
  let reset=-1
  for(let i=messages.length-1;i>=0;i--)if(messages[i].reply?.contextReset){reset=i;break}
  const active=reset<0?messages:messages.slice(reset)
  const latest=[...active].reverse()
  return {
    chatContext:latest.find(m=>m.reply?.chatContext)?.reply.chatContext,
    history:active.filter(m=>m.role==='user').slice(-8).map(m=>m.text.slice(0,1000)),
    conversation:active.slice(-12).map(m=>({role:m.role,text:m.text.slice(0,1000)})),
    productIds:latest.find(m=>m.reply?.products?.length)?.reply.products.slice(0,8).map(p=>p.id)||[],
    planSettings:latest.find(m=>m.reply?.planSettings)?.reply.planSettings||(reset<0?settings:null)
  }
}
