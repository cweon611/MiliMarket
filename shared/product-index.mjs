// Product arrays are treated as immutable snapshots. Keep the first match,
// matching Array.find even when malformed input contains duplicate IDs.
const indexes = new WeakMap()
export function productIndex(products) {
  let index = indexes.get(products)
  if (!index) {
    index = new Map()
    for (const product of products) if (!index.has(product.id)) index.set(product.id, product)
    indexes.set(products, index)
  }
  return index
}
