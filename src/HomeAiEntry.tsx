import {useState} from 'react'
import {ArrowRight,ChevronRight,Sparkles} from 'lucide-react'
import './assistant.css'

export function HomeAiEntry({onAsk}:{onAsk:(text:string)=>void}){
  const [text,setText]=useState('')
  return <section className="home-ai-entry"><div><span className="ai-label"><Sparkles size={15}/> AI - Mili</span><h2>찾는 조건을 문장으로 알려주세요.</h2><p>상품 탐색부터 일주일 식단 초안까지, 한곳에서 이어집니다.</p></div><div><form onSubmit={e=>{e.preventDefault();onAsk(text.trim()||'120명 일주일 식단을 만들어줘')}}><input aria-label="Mili에게 질문" placeholder="예: 120명 일주일 식단, 돼지고기는 빼줘" value={text} maxLength={2000} onChange={e=>setText(e.target.value)}/><button aria-label="Mili 질문 보내기"><ArrowRight size={20}/></button></form><div className="ai-home-links"><button onClick={()=>onAsk('g당 가격이 저렴한 두부 찾아줘')}>g당 가격 비교</button><button onClick={()=>onAsk('바나나우유 영양정보 알려줘')}>영양정보 확인</button><button onClick={()=>onAsk('120명 일주일 식단을 만들어줘')}>AI 식단 짜기 <ChevronRight size={12}/></button></div></div></section>
}
