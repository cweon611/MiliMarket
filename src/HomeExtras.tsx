import { Beef, Fish, Leaf, Wheat, CupSoda, Package, Soup, Salad, Croissant, Droplets, Amphora, Backpack, LayoutGrid, Search, GitCompareArrows, ClipboardList, ArrowUpRight, type LucideIcon } from 'lucide-react'
import { CATEGORY_TYPES } from '../shared/catalog.mjs'
import './home.css'

// 홈 카드는 검색 필터와 같은 13개 분류(shared/catalog.mjs)를 같은 순서로 보여준다.
const CATEGORY_CARDS: Record<string, {hint: string, icon: LucideIcon}> = {
  '가루/조미료/오일': {hint:'소금 · 설탕 · 식용유', icon:Droplets},
  '국/탕류': {hint:'국 · 탕 · 찌개', icon:Soup},
  '김치류': {hint:'배추김치 · 깍두기', icon:Salad},
  '두부류': {hint:'두부 · 콩류가공품', icon:Leaf},
  '분식류': {hint:'냉동밥 · 만두 · 면류', icon:Wheat},
  '빵식류': {hint:'건빵 · 빵 · 쿠키', icon:Croissant},
  '수육류': {hint:'양념육 · 햄 · 소시지', icon:Beef},
  '양념/소스류': {hint:'드레싱 · 카레 · 소스', icon:Package},
  '어패류': {hint:'수산물 · 어육 · 김', icon:Fish},
  '음료류': {hint:'우유 · 두유 · 주스', icon:CupSoda},
  '장류': {hint:'간장 · 고추장 · 된장', icon:Amphora},
  '특수식량': {hint:'전투식량 · 건조식품', icon:Backpack},
  '기타': {hint:'치즈 · 견과 · 간편조리', icon:LayoutGrid},
}
const HOME_CATEGORIES = Object.keys(CATEGORY_TYPES).map(name => ({name, hint:CATEGORY_CARDS[name]?.hint ?? '', icon:CATEGORY_CARDS[name]?.icon ?? LayoutGrid}))

export function HomeExtras({onCategory}: {onCategory: (category: string) => void}) {
  return <div className="home-extras">
    <section className="home-category-section" aria-labelledby="home-categories"><div className="home-section-title"><div><span>식재료 분류 {HOME_CATEGORIES.length}</span><h2 id="home-categories">어떤 식재료를 찾으세요?</h2></div><div className="home-fruit-accent"><p>다채롭게 고르고,<br/><strong>더 맛있게 채우세요.</strong></p><img src="/images/home-fruit-snacks.png" alt="" aria-hidden="true" width="1536" height="1024" loading="lazy"/></div></div><div className="home-category-grid all-categories">{HOME_CATEGORIES.map(c => <button key={c.name} onClick={() => onCategory(c.name)}><ArrowUpRight className="category-arrow" size={15}/><c.icon className="category-drawing" size={30} strokeWidth={1.4}/><strong>{c.name}</strong><small>{c.hint}</small></button>)}</div></section>
    <section className="home-guide" aria-label="식재료 선택 안내"><div className="home-guide-heading"><span>이용 안내</span><h2>검색부터 발주 검토까지,<br/>한 흐름으로.</h2><p>좋은 한 끼를 준비하는<br/>담당자의 선택을 돕습니다.</p></div><div className="home-guide-steps">{[{number:'01',icon:Search,title:'필요한 식재료 찾기',text:'상품명과 원재료로 검색하고, 카테고리·포장 중량으로 좁혀보세요.'},{number:'02',icon:GitCompareArrows,title:'같은 기준으로 비교하기',text:'원본 규격과 영양정보 제공 여부를 나란히 확인하세요.'},{number:'03',icon:ClipboardList,title:'우리 부대에 맞게 계산하기',text:'급식 인원·배식량·포장 단가를 입력해 발주 수량과 금액을 확인하세요.'}].map(s => <div className="home-guide-step" key={s.number}><div><s.icon size={21} strokeWidth={1.5}/><span>{s.number}</span></div><h3>{s.title}</h3><p>{s.text}</p></div>)}</div></section>
  </div>
}
