export const SEARCH_ALIASES: string[][]
export function normalizeSearch(value: unknown): string
export function createCatalogSearch<T extends {id:number; name:string}>(products: T[]): {
  search(query: string): {
    matches: {product:T; score:number; kind:'all'|'exact'|'related'}[]
    suggestions: {term:string; count:number}[]
  }
}
