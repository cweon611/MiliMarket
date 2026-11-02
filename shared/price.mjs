export function massPrice(perGram, unit = 'g') {
  return Number.isFinite(perGram) && perGram >= 0 ? perGram * (unit === 'kg' ? 1000 : 1) : null
}
