import {Component,Suspense,type ReactNode} from 'react'
interface Props {children:ReactNode;label:string}
export class DeferredPanel extends Component<Props,{failed:boolean}> {
 state={failed:false}
 static getDerivedStateFromError(){return {failed:true}}
 render(){
  if(this.state.failed)return <div role="alert" className="catalog-load">{this.props.label} 불러오기에 실패했습니다. <button onClick={()=>window.location.reload()}>다시 불러오기</button></div>
  return <Suspense fallback={<div className="catalog-load" role="status">{this.props.label} 불러오는 중입니다…</div>}>{this.props.children}</Suspense>
 }
}
