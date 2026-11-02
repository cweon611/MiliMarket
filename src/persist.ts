import {useEffect, useState, type Dispatch, type SetStateAction} from 'react'

// Keeps a piece of screen state across a browser refresh.
// 'session': this tab only (page, search, filters). 'local': this browser (selections, plan settings).
type Kind = 'session' | 'local'
const store = (kind: Kind): Storage | null => {
  try { return kind === 'session' ? window.sessionStorage : window.localStorage } catch { return null }
}

export function readStored<T>(key: string, fallback: T, kind: Kind = 'session', valid: (v: unknown) => boolean = () => true): T {
  try {
    const raw = store(kind)?.getItem(key)
    if (raw == null) return fallback
    const value = JSON.parse(raw)
    if (!valid(value)) return fallback
    // Objects keep newly added default fields when an older saved copy lacks them.
    return fallback && typeof fallback === 'object' && !Array.isArray(fallback) && value && typeof value === 'object' && !Array.isArray(value)
      ? {...fallback, ...value} as T : value as T
  } catch { return fallback }
}

export function usePersistentState<T>(key: string, fallback: T, kind: Kind = 'session', valid?: (v: unknown) => boolean): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => readStored(key, fallback, kind, valid))
  useEffect(() => {
    try { store(kind)?.setItem(key, JSON.stringify(value)) } catch { /* Storage full or blocked: keep working in memory. */ }
  }, [key, kind, value])
  return [value, setValue]
}

export const isOneOf = <T,>(values: readonly T[]) => (v: unknown) => values.includes(v as T)
export const isString = (v: unknown) => typeof v === 'string'
export const isNumberList = (v: unknown) => Array.isArray(v) && v.every(n => Number.isInteger(n))
