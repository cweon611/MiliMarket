import {PriceUnitProvider, PriceUnitToggle, usePriceUnit} from './PriceUnit'
import {massPrice} from '../shared/price.mjs'
import {NutritionFilter, NutritionSync, VerifiedComparison, nutrientFilterMatch, nutrientFilterOrder, emptyNutrientFilter} from './NutritionTools'
import { StrictMode, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowDownUp, ArrowRight, Check, ChevronRight, ClipboardList, GitCompareArrows, Home, CalendarDays, Sparkles, Maximize2, MousePointerClick, Package, RotateCcw, Search, ShieldCheck, SlidersHorizontal, Utensils, X } from 'lucide-react'
import { CATEGORIES, SPEC_TYPES, calculateOrder, defaultQuote, formatValue, hasNutrition, nutritionRows, parseInput, marketPrice, marketKgPrice, priceLabel, saleStatus, type MarketInfo, type Product, type QuoteInputs } from './data'
import './style.css'
import './portal.css'
import './search-workspace.css'
import {SearchSuggestions} from './SearchSuggestions'
import { OrderCalculator, PeopleStepper } from './OrderCalculator'
import { ProductDetail } from './ProductDetail'
import { HomeExtras } from './HomeExtras'
import './catalog-data.css'
import { DiscoveryPanel } from './DiscoveryPanel'
import { emptyDiscovery, matchesDiscovery } from './discovery'
import './discovery.css'
import { QuoteFields } from './QuoteFields'
import { PREFERENCES_KEY, decodePreferences, emptyPreferences, restoreQuote, saveQuote } from './order-preferences'
import { saleUnit, servingLabel } from './data'
import {CATEGORY_NAMES, mergeCatalog, createCatalogSearch, gramPrice} from '../shared/catalog.mjs'
import {officialEntries,isFresh} from '../shared/official-nutrition.mjs'
import {verifiedRecord} from '../shared/nutrition.mjs'
import {AssistantWorkspace, HomeAiEntry, LoginDialog, MealHistory, api, initialPlanSettings, type Status, type Plan, type PlanSettings} from './AssistantWorkspace'
import './revisions.css'
import {usePersistentState, readStored, isOneOf, isString, isNumberList} from './persist'

const money = (n: number) => n.toLocaleString('ko-KR')
function listFacts(p: Product, unit:'g'|'kg'): [string, string][] {
  const m = p.market, kg = marketKgPrice(p)
  const nutrition = [p.calories !== null && `${formatValue(p.calories)}kcal`, p.protein !== null && `단백질 ${formatValue(p.protein, 'g')}`, p.sodium !== null && `나트륨 ${formatValue(p.sodium, 'mg')}`].filter(Boolean).join(' · ')
  const facts: [string, string | null | undefined][] = [
    ['분류', [p.category, p.subcategory].filter(v => v && v !== '미제공').join(' › ')],
    ['보관', p.specType],
    ['원산지', m?.origin || p.origin],
    ['제조사', p.manufacturer],
    ['구매방식', m?.purchaseMethod || p.purchaseMethod],
    ['납품지역', m?.region],
    ['배송', m?.delivery],
    ['최소주문', m?.minimumOrder ? `${money(m.minimumOrder)}${m.unit}` : null],
    [`${unit}당 가격`, kg !== null ? `${formatValue(massPrice(kg/1000,unit))}원` : null],
    ['계약종료', m?.contractEnd],
    ['영양', nutrition],
  ]
  return facts.filter((f): f is [string, string] => !!f[1] && f[1] !== '미제공')
}
function FoodArt({product: p}: {product: Product}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  if (p.market?.imageUrl && failedUrl !== p.market.imageUrl) return <div className="food-art real-product-art"><img src={p.market.imageUrl} alt={p.market.name} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailedUrl(p.market!.imageUrl)}/><span>나라장터 상품 이미지</span></div>
  return <div className="food-art catalog-art" role="img" aria-label={`${p.category} 상품 이미지 미제공`}><Package size={42} strokeWidth={1.2}/><strong>{p.category}</strong><span>상품 이미지 미제공</span></div>
}
function App() {
  const {unit,price:displayPrice}=usePriceUnit()
  // 새로고침해도 보던 화면·검색·필터·선택 상품이 유지되도록 저장한다. 홈 버튼은 지금처럼 초기화한다.
  const [page, setPage] = usePersistentState<'home' | 'search' | 'detail' | 'compare' | 'order' | 'assistant' | 'planner' | 'history'>('mm.page','home','session',isOneOf(['home','search','detail','compare','order','assistant','planner','history']))
  const [products, setProducts] = useState<Product[]>([])
  const [nutrientFilter,setNutrientFilter]=usePersistentState('mm.nutrientFilter',{...emptyNutrientFilter})
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [advanced, setAdvanced] = usePersistentState('mm.advanced',{...emptyDiscovery})
  const [status,setStatus]=useState<Status|null>(null)
  const [loginOpen,setLoginOpen]=useState(false)
  const [initialQuestion,setInitialQuestion]=useState('')
  const [planSettings,setPlanSettings]=usePersistentState<PlanSettings>('mm.planSettings',initialPlanSettings,'local')
  const [planOrder,setPlanOrder]=usePersistentState('mm.planOrder',false)
  useEffect(()=>{api<Status>('/api/status').then(setStatus).catch(()=>{})},[])
  const ask=(text:string)=>{setInitialQuestion(text);setPage('assistant');window.scrollTo(0,0)}
  const detailById=(id:number)=>{const p=products.find(p=>p.id===id);if(p)openDetail(p)}
  const importPlan=(p:Plan)=>{
    setPeople(p.settings.people);setSelected(ids=>Array.from(new Set([...ids,...p.purchase.map(row=>row.id)])))
    setQuotes(old=>({...old,...Object.fromEntries(p.purchase.map(row=>[row.id,{mode:'count',unitsPerPerson:row.packs/p.settings.people,portion:null,pack:row.packGrams,price:row.unitPrice}]))}))
    setPlanOrder(true);setPage('order');setNotice(p.missing>0?`채워진 상품만 가져왔습니다. 미구성 ${p.missing}칸은 수량·금액에 포함되지 않았습니다.`:'식단의 포장 올림·최소 주문량을 포함한 수량을 가져왔습니다.');window.scrollTo(0,0)
  }
  useEffect(() => {
    const controller = new AbortController()
    setLoadState('loading')
    // 식약처 일괄 매칭 확정분은 없어도 카탈로그는 열리도록 따로 받는다.
    const official=fetch('/data/official-nutrition.json',{signal:controller.signal}).then(r=>r.ok?r.json():null).catch(()=>null)
    Promise.all([...['/data/products.json', '/data/market-enrichment.json'].map(url=>fetch(url,{signal:controller.signal}).then(response=>{if(!response.ok)throw new Error('Catalog unavailable');return response.json()})),official])
      .then(data => { const [rows, market, bulk] = data as [Product[], Record<string, MarketInfo>, unknown]; if (!Array.isArray(rows) || !rows.length) throw new Error('Empty catalog'); const entries=officialEntries(bulk); setProducts(mergeCatalog(rows,market).map((p:Product)=>{const n=entries[p.id]?.nutrition;return n&&isFresh(n)?{...p,verifiedNutrition:verifiedRecord(n),officialNutritionState:'verified'}:p})); setLoadState('ready') })
      .catch(() => { if (!controller.signal.aborted) setLoadState('error') })
    return () => controller.abort()
  }, [loadAttempt])
  const [resultPage, setResultPage] = usePersistentState('mm.resultPage',1,'session',v=>Number.isInteger(v)&&(v as number)>=1)
  const [nutritionFilter, setNutritionFilter] = usePersistentState('mm.nutritionFilter','전체','session',isString)
  const [scrolled, setScrolled] = useState(false)
  const searchInput = useRef<HTMLInputElement>(null)
  const searchComposing = useRef(false)
  useEffect(() => {
    const updateScroll = () => setScrolled(window.scrollY > 24)
    updateScroll()
    window.addEventListener('scroll', updateScroll, { passive: true })
    return () => window.removeEventListener('scroll', updateScroll)
  }, [])
  const [query, setQuery] = usePersistentState('mm.query','','session',isString)
  const [category, setCategory] = usePersistentState('mm.category','전체','session',isString)
  const [sub, setSub] = usePersistentState('mm.sub','전체','session',isString)
  const [spec, setSpec] = usePersistentState('mm.spec','전체','session',isString)
  const [sort, setSort] = usePersistentState('mm.sort','관련도순','session',isString)
  const [columns, setColumns] = usePersistentState<1 | 2 | 4>('mm.columns',2,'session',isOneOf([1,2,4]))
  const [selected, setSelected] = usePersistentState<number[]>('mm.selected',[],'local',isNumberList)
  const [detail, setDetail] = useState<Product | null>(null)
  const [detailReturn,setDetailReturn]=usePersistentState<'search'|'assistant'|'planner'>('mm.detailReturn','search','session',isOneOf(['search','assistant','planner']))
  useEffect(()=>{if(loadState!=='ready')return;let active=true;const refresh=()=>{fetch('/api/catalog-updates').then(r=>{if(!r.ok)throw new Error();return r.json()}).then(r=>{if(active&&r.updates)setProducts(old=>old.map(p=>r.updates[p.id]?{...p,...r.updates[p.id]}:p))}).catch(()=>{})};refresh();window.addEventListener('official-data-updated',refresh);return()=>{active=false;window.removeEventListener('official-data-updated',refresh)}},[loadState,page])
  useEffect(()=>{setDetail(p=>p?products.find(x=>x.id===p.id)||p:null);setCalculator(p=>p?products.find(x=>x.id===p.id)||p:null)},[products])

  const [preferences, setPreferences] = useState(()=>{try{return decodePreferences(localStorage.getItem(PREFERENCES_KEY))}catch{return emptyPreferences()}})
  const [people, setPeople] = useState(preferences.people)
  const [storageFailed, setStorageFailed] = useState(false)
  useEffect(()=>{
    try { localStorage.setItem(PREFERENCES_KEY,JSON.stringify({...preferences,people,version:1})); setStorageFailed(false) }
    catch { setStorageFailed(true) }
  },[preferences,people])
  const [quotes, setQuotes] = usePersistentState<Record<number, QuoteInputs>>('mm.quotes',{})
  const quoteFor = (p: Product) => quotes[p.id] ?? restoreQuote(p,preferences)
  const updateQuote = (id: number, quote: QuoteInputs) => {
    setQuotes(current => ({...current,[id]:quote}))
    const p=products.find(p=>p.id===id)
    if(p) setPreferences(current=>({...current,quotes:{...current.quotes,[id]:saveQuote(p,quote)}}))
  }
  const [notice, setNotice] = useState('')
  const [calculator, setCalculator] = useState<Product | null>(null)
  // 상세·계산기는 상품 ID만 저장하고, 카탈로그를 불러온 뒤 다시 연다.
  const [savedOpen] = useState(()=>({detail:readStored<number|null>('mm.detailId',null),calculator:readStored<number|null>('mm.calculatorId',null)}))
  const restored = useRef(false)
  useEffect(()=>{
    if(loadState!=='ready'||restored.current)return
    restored.current=true
    const find=(id:number|null)=>id==null?null:products.find(p=>p.id===id)||null
    const d=find(savedOpen.detail),c=find(savedOpen.calculator)
    if(d)setDetail(d);else if(page==='detail')setPage('search')
    if(c)setCalculator(c)
  },[loadState,products])
  useEffect(()=>{if(!restored.current)return;try{sessionStorage.setItem('mm.detailId',JSON.stringify(detail?.id??null));sessionStorage.setItem('mm.calculatorId',JSON.stringify(calculator?.id??null))}catch{}},[detail,calculator])
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelProductClick = () => {
    if (clickTimer.current !== null) clearTimeout(clickTimer.current)
    clickTimer.current = null
  }
  useEffect(() => () => { if (clickTimer.current !== null) clearTimeout(clickTimer.current) }, [])
  useEffect(() => { cancelProductClick() }, [page])
  const clickProduct = (p: Product, clickCount: number) => {
    cancelProductClick()
    if (clickCount >= 2) return
    if (clickCount === 0) { setCalculator(p); return }
    clickTimer.current = setTimeout(() => { setCalculator(p); clickTimer.current = null }, 400)
  }
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 3000); return () => clearTimeout(timer) }, [notice])
  const openDetail = (p: Product) => { if(page!=='detail')setDetailReturn(page==='assistant'?'assistant':page==='planner'?'planner':'search'); cancelProductClick(); setDetail(p); setPage('detail'); window.scrollTo(0, 0) }
  const resetFilters = () => { setCategory('전체'); setSub('전체'); setSpec('전체'); setNutritionFilter('전체'); setAdvanced({...emptyDiscovery}); setNutrientFilter({...emptyNutrientFilter}); setSort('관련도순'); setOpenCategories([]); setResultPage(1) }
  const reset = () => { setQuery(''); resetFilters() }
  const navigate = (target: 'home' | 'search' | 'compare' | 'order' | 'assistant' | 'planner' | 'history') => {
    cancelProductClick()
    if(target==='home'){reset();setCalculator(null);setOpenCategories([])}
    setPage(target)
    window.scrollTo({ top: 0, behavior: 'instant' })
    if (target === 'search') requestAnimationFrame(() => searchInput.current?.focus({ preventScroll: true }))
  }
  const showResults = () => {
    setPage('search')
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  const submitSearch = () => {
    cancelProductClick()
    setQuery(query.trim())
    resetFilters()
    setCalculator(null)
    showResults()
  }
  const toggle = (id: number) => setSelected(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])
  const chosen = products.filter(p => selected.includes(p.id))
  const [openCategories, setOpenCategories] = usePersistentState<string[]>('mm.openCategories',[],'session',v=>Array.isArray(v)&&v.every(isString))
  const toggleCategoryOpen = (c: string) => setOpenCategories(open => open.includes(c) ? open.filter(v => v !== c) : [...open, c])
  const searchIndex = useMemo(() => createCatalogSearch(products), [products])
  const deferredQuery = useDeferredValue(query)
  const searchResult = useMemo(() => searchIndex.search(deferredQuery), [searchIndex, deferredQuery])
  const queryProducts = useMemo(() => searchResult.matches.map(r=>r.product as Product).filter(p=>nutrientFilterMatch(p,nutrientFilter)), [searchResult,nutrientFilter])
  // Each facet ignores its own selection, but respects the query and other filters.
  const categoryProducts = useMemo(() => queryProducts.filter(p=>matchesDiscovery(p,advanced)&&(nutritionFilter==='전체'||(nutritionFilter==='DB 영양정보 있음'?hasNutrition(p):!hasNutrition(p)))),[queryProducts,advanced,nutritionFilter])
  const categoryCounts = useMemo(() => categoryProducts.reduce<Record<string,number>>((counts,p)=>{counts[p.category]=(counts[p.category]??0)+1;return counts},{}),[categoryProducts])
  const visibleCategories = CATEGORY_NAMES.filter(c=>c==='전체'||c===category||categoryCounts[c]>0)
  const subcategoryCounts = useMemo(() => {
    const counts:Record<string,Record<string,number>>={}
    for(const p of categoryProducts)(counts[p.category]??={})[p.subcategory]=(counts[p.category]?.[p.subcategory]??0)+1
    if(category!=='전체'&&sub!=='전체')(counts[category]??={})[sub]??=0
    return Object.fromEntries(Object.entries(counts).map(([c,subs])=>[c,Object.entries(subs).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'ko'))]))
  },[categoryProducts,category,sub])
  const subcategories = ['전체',...(subcategoryCounts[category]??[]).map(([name])=>name)]
  const discoveryProducts = useMemo(()=>queryProducts.filter(p=>(category==='전체'||p.category===category)&&(sub==='전체'||p.subcategory===sub)&&(nutritionFilter==='전체'||(nutritionFilter==='DB 영양정보 있음'?hasNutrition(p):!hasNutrition(p)))),[queryProducts,category,sub,nutritionFilter])
  const nutritionProducts = useMemo(()=>queryProducts.filter(p=>matchesDiscovery(p,advanced)&&(category==='전체'||p.category===category)&&(sub==='전체'||p.subcategory===sub)),[queryProducts,advanced,category,sub])
  const nutritionOptions = ['전체',...['DB 영양정보 있음','DB 영양정보 미제공'].filter(v=>v===nutritionFilter||nutritionProducts.some(p=>v==='DB 영양정보 있음'?hasNutrition(p):!hasNutrition(p)))]
  const filtered = useMemo(() => {
    return searchResult.matches.map(result => result.product as Product).filter(p => {
      return nutrientFilterMatch(p,nutrientFilter) && matchesDiscovery(p, advanced) && (category === '전체' || p.category === category) && (sub === '전체' || p.subcategory === sub) && (spec === '전체' || p.specType === spec) && (nutritionFilter === '전체' || (nutritionFilter === 'DB 영양정보 있음' ? hasNutrition(p) : !hasNutrition(p)))
    }).sort((a,b) => {
      if(nutrientFilter.sort!=='default')return nutrientFilterOrder(a,b,nutrientFilter)
      if(sort==='관련도순') return 0 // Preserve the shared search engine's stable relevance order.
      if(sort==='낮은 가격순'||sort==='높은 가격순') { const price=advanced.priceBasis==='g'?gramPrice:advanced.priceBasis==='kg'?marketKgPrice:marketPrice;const av=price(a),bv=price(b);return av===null ? (bv===null?a.id-b.id:1) : bv===null ? -1 : (sort==='낮은 가격순'?av-bv:bv-av)||a.id-b.id }
      return sort === '상품명순' ? a.name.localeCompare(b.name, 'ko') : sort === '영양정보 있는 순' ? Number(hasNutrition(b)) - Number(hasNutrition(a)) || a.id - b.id : a.id - b.id
    })
  }, [searchResult, category, sub, spec, nutritionFilter, sort, advanced,nutrientFilter])
  const relatedResultCount = useMemo(() => { const visibleIds=new Set(filtered.map(p=>p.id)); return searchResult.matches.filter(result=>result.kind==='related'&&visibleIds.has(result.product.id)).length }, [filtered,searchResult])
  // Filter changes go back to page 1, but a refresh keeps the saved page.
  const filterKey = JSON.stringify([query, category, sub, spec, nutritionFilter, sort, advanced, nutrientFilter])
  const lastFilterKey = useRef(filterKey)
  useEffect(() => { if(lastFilterKey.current===filterKey)return; lastFilterKey.current=filterKey; setResultPage(1) }, [filterKey])
  const pageCount = Math.max(1, Math.ceil(filtered.length / 24))
  const currentPage = Math.min(resultPage, pageCount)
  const visibleProducts = filtered.slice((currentPage - 1) * 24, currentPage * 24)
  const changeResultPage = (n: number) => { cancelProductClick(); setResultPage(n); document.getElementById('catalog')?.scrollIntoView({block:'start'}) }
  const calculations = chosen.map(p => calculateOrder(people, quoteFor(p)))
  const complete = calculations.length > 0 && calculations.every(c => c.total !== null)
  const total = complete ? calculations.reduce((sum, c) => sum + c.total!, 0) : null
  const exportOrder = () => {
    if (!complete) { setNotice('상품별 계산 방식에 필요한 수량 또는 배식량과 단가를 확인해 주세요.'); return }
    const rows = [['물품식별번호','상품명','급식인원','계산방식','1인 배식량(g)','판매단위 중량(g)','1인 제공수량(판매단위)','주문수량','적용단가(원)','예상금액(원)','단가 기준','출처','조회일','판매단위'], ...chosen.map(p => {
      const q = quoteFor(p); const c = calculateOrder(people, q)
      return [p.id, p.name, people, q.mode==='count'?'개수':'중량', q.mode==='count'?'':q.portion, q.mode==='count'?'':q.pack, q.mode==='count'?q.unitsPerPerson:'', c.packs, q.price, c.total, priceLabel(p,q), p.market?.sourceUrl || '직접 입력', p.market?.collectedAt || '', p.market?.unit || '팩']
    })]
    const csvCell = (value: unknown) => { const text = String(value); return '"' + (/^[=+@-]/.test(text) ? "'" : '') + text.replaceAll('"', '""') + '"' }
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\r\n')], {type:'text/csv;charset=utf-8;'}))
    const a = document.createElement('a'); a.href = url; a.download = 'MiliMarket_발주검토안.csv'; a.click(); URL.revokeObjectURL(url); setNotice('발주 검토안을 저장했습니다.')
  }
  return <><div className="utility-bar"><div className="utility-inner"><span><ShieldCheck size={14}/> 군 급식 식재료 통합 플랫폼</span><span className="utility-account"><span>MiliMarket 통합 데모</span>{status?.user?<><b>{status.user.name}님</b><button onClick={()=>navigate('history')}>내 식단</button><button onClick={()=>{api('/api/logout',{}).then(()=>setStatus(old=>old?{...old,user:null}:null))}}>로그아웃</button></>:<button onClick={()=>setLoginOpen(true)}>로그인</button>}</span></div></div><header className={`header site-header${scrolled ? ' is-scrolled' : ''}`}><div className="header-inner">
      <a className="brand" href="#" onClick={e => {e.preventDefault(); navigate('home')}}><span className="brand-icon"><Utensils size={21}/></span><span className="brand-wordmark">MiliMarket<small>군 급식 식재료 플랫폼</small></span></a>
      <nav className="top-nav" aria-label="주 메뉴">
        {([{id: 'home', label: '홈', icon: Home}, {id: 'search', label: '검색', icon: Search}, {id: 'compare', label: '상품 비교', icon: GitCompareArrows}, {id: 'order', label: '발주 검토', icon: ClipboardList}, {id:'assistant',label:'AI - Mili',icon:Sparkles}] as const).map(n => <button key={n.id} className={page === n.id || (n.id === 'search' && page === 'detail') ? 'active' : ''} aria-current={page === n.id ? 'page' : undefined} onClick={() => navigate(n.id)}><n.icon size={16}/><span>{n.label}</span>{n.id === 'compare' && selected.length > 0 && <b className="count">{selected.length}</b>}</button>)}
      </nav>
    </div></header>
    <main className={page === 'home' ? 'search-workspace home-search' : page === 'search' ? 'search-workspace' : undefined}><div className="breadcrumb">MiliMarket <ChevronRight size={12}/> {page === 'home' ? '홈' : page === 'search' ? '식재료 탐색' : page === 'detail' ? '상품 상세' : page === 'compare' ? '상품 비교' : page === 'assistant' ? 'AI - Mili' : page === 'planner' ? '식단 계획' : page === 'history' ? '저장한 식단' : '발주 검토'}</div>
      {loadState !== 'ready' && <div className="catalog-load" role={loadState === 'error' ? 'alert' : 'status'}>{loadState === 'loading' ? '엑셀 상품 데이터를 불러오는 중입니다…' : <>데이터를 불러오지 못했습니다. <button onClick={() => setLoadAttempt(n => n+1)}>다시 불러오기</button></>}</div>}<div hidden={page!=='assistant'}><AssistantWorkspace settings={planSettings} onOrder={p=>{setPlanSettings(p.settings);importPlan(p)}} onLogin={()=>setLoginOpen(true)} status={status} initialQuestion={initialQuestion} onConsumed={()=>setInitialQuestion('')} onDetail={detailById}/></div>{page==='assistant'?null:page==='history'?<MealHistory user={status?.user||null} onLogin={()=>setLoginOpen(true)} onOpen={p=>{setPlanSettings(p.settings);importPlan(p)}} onNew={()=>navigate('assistant')}/>:(page === 'home' || page === 'search') ? <>{page==='home'&&<HomeAiEntry onAsk={ask}/>}<section className="search-portal compact-search" aria-label="식재료 통합 검색">
        <form className="search-bar" role="search" onSubmit={e => { e.preventDefault(); if(!searchComposing.current)submitSearch() }}><label className="search-scope" htmlFor="ingredient-search">통합검색</label><input id="ingredient-search" ref={searchInput} aria-label="식재료 검색" placeholder="상품명, 식별번호 또는 원재료를 입력하세요" value={query} onChange={e => setQuery(e.target.value)} onCompositionStart={()=>{searchComposing.current=true}} onCompositionEnd={()=>{searchComposing.current=false}} onKeyDown={e=>{if(e.nativeEvent.isComposing||searchComposing.current||e.nativeEvent.keyCode===229||e.repeat)return;if(e.key==='Enter'||e.key===' '&&e.currentTarget.value.trim()){e.preventDefault();submitSearch()}}}/>{query && <button type="button" aria-label="검색어 지우기" onClick={() => setQuery('')}><X size={18}/></button>}<button className="search-submit" type="submit" aria-label="검색 결과 보기"><Search size={23}/><span>검색</span></button></form>
      </section>
      {page === 'home' && <HomeExtras onCategory={value => {reset(); setCategory(value); setCalculator(null); showResults()}}/>}
      {page === 'search' && <div className={`catalog${calculator ? ' has-calculator' : ''} view-columns-${columns}`} id="catalog"><aside><div className="filter-title"><strong><SlidersHorizontal size={17}/> 상세 필터</strong><button onClick={reset} aria-label="필터 초기화"><RotateCcw size={15}/></button></div><div className="filter-group"><h3>식재료 분류</h3><p className="facet-context">검색 결과에 맞춘 필터</p>{visibleCategories.map(c => { const open = openCategories.includes(c), subs = subcategoryCounts[c] ?? []; return <div key={c} className={`category-node${open ? ' open' : ''}`}><div className="category-row"><button className={`category ${category === c && sub === '전체' ? 'selected' : category === c ? 'parent-selected' : ''}`} onClick={() => { setCategory(c); setSub('전체') }}><span>{c}</span><small>{c === '전체' ? categoryProducts.length : (categoryCounts[c] ?? 0)}</small></button>{c !== '전체' && subs.length > 0 && <button type="button" className="category-toggle" aria-expanded={open} aria-label={`${c} 세부 분류 ${open ? '접기' : '펼치기'}`} title={`${c} 세부 분류 ${open ? '접기' : '펼치기'}`} onClick={() => toggleCategoryOpen(c)}><ChevronRight size={14}/></button>}</div>{open && <ul className="subcategory-list" aria-label={`${c} 세부 분류`}>{subs.map(([s, n]) => <li key={s}><button className={`subcategory${category === c && sub === s ? ' selected' : ''}`} onClick={() => { setCategory(c); setSub(s) }}><span>{s}</span><small>{n}</small></button></li>)}</ul>}</div> })}</div>{category !== '전체' && <Filter label="세부 분류" value={sub} values={subcategories} onChange={setSub}/>}<DiscoveryPanel products={discoveryProducts} value={advanced} onChange={setAdvanced} moreActive={(nutritionFilter!=='전체'?1:0)+(nutrientFilter.conditions.length||nutrientFilter.verifiedOnly||nutrientFilter.sort!=='default'?1:0)} more={<div className="more-filter-block"><h4>영양</h4><Filter label="영양정보" value={nutritionFilter} values={nutritionOptions} onChange={setNutritionFilter}/><NutritionFilter value={nutrientFilter} onChange={setNutrientFilter}/></div>}/><div className="filter-note"><ShieldCheck size={20}/><p>통합 엑셀 <b>{money(products.length)}개 상품</b><br/>PPT 기준 13개 분류로 연결했습니다. 일치하지 않는 품명은 기타에서 확인해 주세요. 나라장터 조회 가격 {products.filter(p=>marketPrice(p)!==null).length.toLocaleString()}건을 연결했습니다.</p></div></aside>
      <section className="results"><NutritionSync query={deferredQuery}/><div className="results-heading"><div><h2>{query.trim() ? `“${query.trim()}” 검색 결과` : '식재료 둘러보기'} <span>{filtered.length}</span></h2><p>클릭: 우측 발주 계산기 · 더블 클릭: 상품 상세</p></div><div className="results-controls"><PriceUnitToggle/><div className="view-options" role="group" aria-label="한 줄에 표시할 상품 수">{([1, 2, 4] as const).map(n => <button key={n} type="button" aria-label={`한 줄에 ${n}개씩 보기`} title={`한 줄에 ${n}개씩 보기`} aria-pressed={columns === n} className={columns === n ? 'active' : ''} onClick={() => setColumns(n)}><span className="view-icon" aria-hidden="true">{Array.from({length:n}, (_, i) => <i key={i}/>)}</span></button>)}</div><label className="sort"><ArrowDownUp size={14}/><select aria-label="정렬" value={sort} onChange={e => setSort(e.target.value)}>{['관련도순', '식별번호순', '상품명순', '영양정보 있는 순', '낮은 가격순', '높은 가격순'].map(s => <option key={s}>{s}</option>)}</select></label></div></div><div className="chips">{category==='전체'?<span>전체 식재료</span>:<button className="filter-chip" onClick={()=>{setCategory('전체');setSub('전체')}} aria-label={`${category} 분류 해제`}>{category}<X size={11}/></button>}{sub!=='전체'&&<button className="filter-chip" onClick={()=>setSub('전체')}>{sub}<X size={11}/></button>}{nutritionFilter!=='전체'&&<button className="filter-chip" onClick={()=>setNutritionFilter('전체')}>{nutritionFilter}<X size={11}/></button>}{Object.entries(advanced).filter(([key,value])=>key!=='priceBasis'&&value!==emptyDiscovery[key as keyof typeof emptyDiscovery]).map(([key,value])=><button className="filter-chip" key={key} onClick={()=>setAdvanced(f=>({...f,[key]:emptyDiscovery[key as keyof typeof emptyDiscovery]}))} aria-label={`${key==='minPrice'?'최소 가격':key==='maxPrice'?'최대 가격':value} 필터 해제`}>{key==='minPrice'?`최소 ${money(Number(value))}원`:key==='maxPrice'?`최대 ${money(Number(value))}원`:value}<X size={11}/></button>)}<small>통합 엑셀 {money(products.length)}건 · 페이지당 24개</small></div><SearchSuggestions query={deferredQuery} suggestions={searchResult.suggestions} relatedCount={relatedResultCount} empty={searchResult.matches.length===0} onSearch={term=>{setQuery(term);setResultPage(1)}}/><div className="product-grid">{visibleProducts.map(p => <article className={`product-card${calculator?.id === p.id ? ' calculator-selected' : ''}`} key={p.id} onClick={e => clickProduct(p, e.detail)} onDoubleClick={() => openDetail(p)}><div className="art-wrap"><button className="art-button" aria-label={`${p.name} 스마트 발주 계산기 열기`}><FoodArt product={p}/><span className="storage">{saleStatus(p)==='active' ? `할인 ${p.market?.discount}` : p.specType==='미제공' ? p.category : p.specType}</span></button><span className="card-hover-hint" aria-hidden="true"><MousePointerClick size={11}/>더블클릭 <b>상세</b></span><button type="button" className="detail-open-button" aria-label={`${p.name} 상세 페이지 보기`} onClick={e => { e.stopPropagation(); cancelProductClick(); openDetail(p) }} onDoubleClick={e => e.stopPropagation()}><Maximize2 size={12}/>상세보기</button></div><div className="product-info"><div className="manufacturer">{p.market?.supplier || `식별번호 ${p.id}`}</div><button className="product-name">{p.name}</button><p className="spec">{p.market ? `${p.market.name} · 판매 단위 ${p.market.unit}` : `${p.weightPerUnit} · ${p.foodType}`}</p><p className="list-ingredients">원재료: {p.ingredients}</p><div className="list-tags">{p.tags.map(tag => <span key={tag}>{tag}</span>)}</div><dl className="list-facts">{listFacts(p,unit).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p className="list-click-hint">클릭 <b>계산기</b> · 더블 클릭 <b>상세</b></p><div className="price"><strong>{marketPrice(p) === null ? '가격 미확인' : formatValue(marketPrice(p), '원')}</strong><span>{p.market ? `나라장터 / ${p.market.unit}${p.market.offerCount>1?' · 최저 표시단가':''}` : '계산기에 단가 직접 입력'}</span></div><p className="g-price">{unit}당 {gramPrice(p)===null?'중량 미확인':formatValue(displayPrice(gramPrice(p)),'원')}</p><div className="product-metrics"><span>{p.verifiedNutrition?'공식 영양 자료 확인됨':hasNutrition(p) ? 'DB 영양정보 있음' : 'DB 영양정보 미제공'}</span></div><button className={`compare-button ${selected.includes(p.id) ? 'checked' : ''}`} onClick={e => { e.stopPropagation(); cancelProductClick(); toggle(p.id) }} onDoubleClick={e => e.stopPropagation()}>{selected.includes(p.id) ? <Check size={15}/> : <GitCompareArrows size={15}/>} {selected.includes(p.id) ? '비교함에 담김' : '비교함에 담기'}</button></div></article>)}</div>{loadState === 'ready' && filtered.length === 0 && <div className="empty"><Search size={30}/><h3>조건에 맞는 식재료가 없습니다</h3><p>검색어나 필터를 변경해 보세요.</p><button className="primary" onClick={reset}>필터 초기화</button></div>}{filtered.length > 0 && <nav className="catalog-pagination" aria-label="검색 결과 페이지"><button disabled={currentPage === 1} onClick={() => changeResultPage(currentPage - 1)}>이전</button><label>페이지 <select aria-label="검색 결과 페이지 선택" value={currentPage} onChange={e => changeResultPage(Number(e.target.value))}>{Array.from({length:pageCount}, (_,i) => <option key={i} value={i+1}>{i+1}</option>)}</select> / {pageCount}</label><button disabled={currentPage === pageCount} onClick={() => changeResultPage(currentPage + 1)}>다음</button></nav>}</section><div className="calculator-sidebar">{calculator && <OrderCalculator product={calculator} people={people} quote={quoteFor(calculator)} onQuoteChange={quote => updateQuote(calculator.id, quote)} onPeopleChange={setPeople} onClose={() => setCalculator(null)} onDetail={() => openDetail(calculator)} onReview={() => { setSelected(ids => ids.includes(calculator.id) ? ids : [...ids, calculator.id]); navigate('order') }}/> }<section className="calculator-placeholder" hidden={!!calculator}><h2>스마트 발주 계산기</h2><Package size={35}/><h3>식재료를 선택해 주세요</h3><p>목록의 상품을 클릭하면<br/>필요 수량과 예상 금액을<br/>바로 계산할 수 있습니다.</p></section></div></div>}</> : page === 'detail' && detail ? <ProductDetail products={products} onChoose={openDetail} onComparePair={p=>{setSelected(ids=>Array.from(new Set([...ids,detail.id,p.id])));navigate('compare')}} product={detail} image={<FoodArt product={detail}/>} people={people} quote={quoteFor(detail)} onPeopleChange={setPeople} onQuoteChange={quote => updateQuote(detail.id, quote)} backLabel={detailReturn==='assistant'?'AI 대화로':detailReturn==='planner'?'식단으로':'검색 결과로'} onBack={() => setPage(detailReturn)} onCompare={() => {setSelected(ids => ids.includes(detail.id) ? ids : [...ids, detail.id]); navigate('compare')}} onReview={() => {setSelected(ids => ids.includes(detail.id) ? ids : [...ids, detail.id]); navigate('order')}}/> : <section className="workspace"><span className="eyebrow">{page === 'compare' ? 'COMPARE INGREDIENTS' : 'PLAN YOUR ORDER'}</span><h1>{page === 'compare' ? '한눈에 비교하고, 꼼꼼하게 선택하세요.' : '급식 인원에 맞춰 발주량을 계산하세요.'}</h1><p className="muted">{page === 'compare' ? '비교함에 담은 식재료의 가격, 규격과 영양정보를 확인합니다.' : '포장 단위로 올림하여 계산한 검토안입니다. 실제 주문은 전송되지 않습니다.'}</p>{chosen.length === 0 ? <div className="empty"><Package size={36}/><h3>아직 선택한 식재료가 없습니다</h3><p>식재료 탐색에서 비교함에 상품을 담아주세요.</p><button className="primary" onClick={() => setPage('search')}>식재료 탐색 <ArrowRight size={16}/></button></div> : page === 'compare' ? <><div className="price-unit-toolbar"><PriceUnitToggle/></div><VerifiedComparison products={chosen}/><div className="comparison-grid">{chosen.map(p => <article className="comparison" key={p.id}><FoodArt product={p}/><div className="comparison-body"><button className="remove" onClick={() => toggle(p.id)} aria-label={`${p.name} 비교에서 삭제`}><X size={16}/></button><h3>{p.name}</h3><p>{p.manufacturer}</p><dl>{[['물품식별번호', String(p.id)], ['식품유형', p.foodType], ['나라장터 단가', formatValue(marketPrice(p), '원')], [`${unit}당 환산 단가`, formatValue(displayPrice(gramPrice(p)), `원 / ${unit}`)], ['판매 단위',p.market?.unit || '미확인'], ['계약업체',p.market?.supplier || '미확인'], ['제품명 표기 규격', p.weightPerUnit], ['1인 제공량 (설정값)', servingLabel(p,quoteFor(p))], ...nutritionRows(p)].map(([k,v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></div></article>)}</div><p className="data-note">영양정보는 DB 적용 엑셀의 수치입니다. 기준 중량이 미제공되어 상품별 100g당·1인분 직접 비교는 불가합니다.</p><button className="primary" onClick={() => setPage('order')}>선택 상품 발주 검토 <ArrowRight size={16}/></button></> : <>{planOrder&&<p className="data-note">식단에서 가져온 수량은 전체 기간의 포장 수량입니다. 최소 주문량을 포함합니다. 이 수량은 일반 배식 기본값으로 저장하지 않습니다.</p>}<div className="order-settings"><div className="order-people"><label htmlFor="order-people">급식 인원</label><PeopleStepper id="order-people" people={people} onChange={setPeople}/></div><span>개수 또는 중량 기준으로 계산 · 판매 단위 올림</span></div><div className="saved-order-settings"><span className={storageFailed?'storage-failure':''}>{storageFailed?'이 브라우저에서 저장할 수 없습니다. 현재 화면에서만 유지됩니다.':'인원과 상품별 제공량·중량을 이 브라우저에 자동 저장합니다. 단가는 저장하지 않습니다.'}</span><button onClick={()=>{setPreferences(emptyPreferences());setQuotes({});setPeople(emptyPreferences().people);setNotice('저장한 배식 설정을 초기화했습니다.')}}>배식 설정 초기화</button></div><div className="order-list">{chosen.map(p => { const q = quoteFor(p); const c = calculateOrder(people, q); return <div className="order-item imported-order-item" key={p.id}><div><h3>{p.name}</h3><small>식별번호 {p.id} · 제품명 규격 {p.weightPerUnit}</small><p className="price-source-label">{priceLabel(p,q)}{p.market && ` · 판매 단위 ${p.market.unit} · 조회 ${p.market.collectedAt.slice(0,10)}`}</p><QuoteFields product={p} quote={q} onChange={q=>updateQuote(p.id,q)}/></div><span>{c.packs === null ? '제공량 입력 필요' : formatValue(c.packs, p.market?.unit || '팩')}</span><strong>{c.total === null ? '입력 필요' : formatValue(c.total, '원')}</strong><button aria-label={`${p.name} 삭제`} onClick={() => toggle(p.id)}><X size={17}/></button></div> })}</div><div className="order-total"><span>예상 상품 금액 <small>적용 단가 기준 · 배송비 등 제외</small></span><strong>{total === null ? '입력 미완료' : formatValue(total, '원')}</strong></div>{!complete && <p className="data-note">개수 계산은 제공 수량과 단가만 필요합니다. 중량 계산은 배식량·판매 단위 중량을 확인해 주세요.</p>}<button className="primary" disabled={!complete} onClick={exportOrder}>발주 검토안 CSV 저장 <ArrowRight size={16}/></button></>}</section>}
    <footer className="portal-footer"><span className="footer-brand"><Utensils size={16}/> MiliMarket</span><span>군 급식의 더 나은 선택을 함께합니다.</span><small>시연용 · 실제 발주는 전송되지 않음</small></footer></main>
    {selected.length > 0 && page === 'search' && <div className="selection-bar"><span><GitCompareArrows size={19}/><b>{selected.length}개</b> 식재료 선택</span><button onClick={() => setSelected([])}>선택 해제</button><button className="primary" onClick={() => setPage('compare')}>비교하기 <ArrowRight size={16}/></button></div>}
    {scrolled && <button className="back-to-top" aria-label="맨 위로" onClick={() => window.scrollTo({top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'})}><span>↑</span>TOP</button>}

    {loginOpen&&<LoginDialog onClose={()=>setLoginOpen(false)} onUser={user=>setStatus(old=>old?{...old,user}:{configured:false,model:'',catalogCount:products.length,user})}/>}
    {notice && <div role="status" className="toast"><Check size={17}/>{notice}</div>}
  </>
}
function Filter({label, value, values, onChange}: {label: string; value: string; values: string[]; onChange: (v: string) => void}) {return <div className="filter-group"><label className="filter-label">{label}<select value={value} onChange={e => onChange(e.target.value)}>{values.map(v => <option key={v}>{v}</option>)}</select></label></div>}
createRoot(document.getElementById('root')!).render(<StrictMode><PriceUnitProvider><App/></PriceUnitProvider></StrictMode>)
