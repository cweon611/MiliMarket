import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateOrder, defaultQuote, formatValue, parseInput } from '../src/data.ts'

test('rounds purchase packs up and uses the entered price', () => {
  assert.deepEqual(calculateOrder(101, {portion:120, pack:1000, price:6200}), {needed:12120, packs:13, total:80600})
})
test('missing input never becomes a zero quote', () => {
  assert.deepEqual(calculateOrder(100, {portion:null, pack:1000, price:null}), {needed:null,packs:null,total:null})
  assert.deepEqual(calculateOrder(100, {portion:120, pack:null, price:6200}), {needed:12000,packs:null,total:null})
  assert.deepEqual(calculateOrder(100, {portion:120, pack:1000, price:null}), {needed:12000,packs:12,total:null})
})
test('invalid input and nutrition zeros remain distinct', () => {
  for (const value of ['', ' ', '0', '-1', 'Infinity', 'abc']) assert.equal(parseInput(value),null)
  assert.equal(parseInput('0.5'),0.5)
  assert.equal(formatValue(null,'g'),'미제공')
  assert.equal(formatValue(0,'g'),'0g')
  assert.deepEqual(defaultQuote({packGrams:500}), {portion:null,pack:500,price:null})
})
