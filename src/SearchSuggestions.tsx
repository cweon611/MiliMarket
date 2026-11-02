import {Search} from 'lucide-react'

export function SearchSuggestions({query, suggestions, relatedCount, empty, onSearch}: {
  query: string; suggestions: {term: string; count: number}[]; relatedCount: number
  empty: boolean; onSearch: (term: string) => void
}) {
  if (!query.trim()) return null
  return <div className="search-assistance">
    {relatedCount>0 && <p className="search-match-note">상품명 표기 차이·연관 단어로 찾은 상품 <strong>{relatedCount}건</strong> 포함</p>}
    {suggestions.length>0 && <nav className="related-searches" aria-label={empty?'대체 검색어':'연관 검색어'}>
      <span>{empty?'이 검색어는 어떠세요?':'연관 검색'}</span>
      {suggestions.map(({term,count})=><button type="button" key={term} onClick={()=>onSearch(term)} title={`전체 상품 기준 ${count}건 · 현재 필터 유지`}><Search size={12}/>{term}</button>)}
    </nav>}
  </div>
}
