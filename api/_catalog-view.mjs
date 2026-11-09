import {mergeOfficialEntries} from '../shared/official-nutrition.mjs'
import {applyOfficialData} from './_data-store.mjs'

const DAY = 86400000
const EMPTY = Object.freeze({})

// Reuse the combined catalog until its inputs change or a freshness/date
// boundary is reached. Never give expired evidence an extra cache lifetime.
export function createCatalogView(products, bulk, entries, {now = Date.now} = {}) {
  let previousEntries, previousTime, expiresAt = 0, snapshot

  function nextBoundary(time, live) {
    let boundary = (Math.floor(time / DAY) + 1) * DAY
    for (const source of [bulk, live]) {
      for (const entry of Object.values(source)) {
        for (const value of [entry.nutrition, entry.procurement]) {
          const start = Date.parse(value?.fetchedAt)
          const end = start + (value?.validDays ?? 1) * DAY
          if (start > time) boundary = Math.min(boundary, start)
          if (end > time) boundary = Math.min(boundary, end)
        }
      }
    }
    return boundary
  }

  function current() {
    const time = now(), live = entries() || EMPTY
    if (snapshot && live === previousEntries && time >= previousTime && time < expiresAt) return snapshot
    const official = mergeOfficialEntries(bulk, live, time)
    snapshot = {official, products: applyOfficialData(products, official, time)}
    previousEntries = live
    previousTime = time
    expiresAt = nextBoundary(time, live)
    return snapshot
  }

  return {officialData: () => current().official, products: () => current().products}
}
