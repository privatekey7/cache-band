import { expect, test } from 'claude-code/testing'

import { EMPTY_CACHE, MINUTE_MS, RED } from '../hooks/cache'
import { formatPercent, getBandView, getDetailRows, getSegmentBar } from '../hooks/view'
import type { CacheState } from '../types'

const live: CacheState = { ...EMPTY_CACHE, status: 'live', lastAt: 0, tokens: 180_000 }

test('a live cache shows whole percent of TTL left and fills the capsule by the share of TTL left', async () => {
  // Arrange: прошло 15 минут из часа
  const now = 15 * MINUTE_MS
  // Act
  const view = getBandView(live, now, false)
  // Assert
  expect(view.percent).toBe('75%')
  expect(view.fill).toBe(0.75)
  expect(getSegmentBar(view)).toEqual({ filled: '▰▰▰▰▰', empty: '▱' })
})

test('a dead cache is a red 0% and the details name the tokens to re-read', async () => {
  const dead: CacheState = { ...live, status: 'dead' }
  const view = getBandView(dead, 0, false)

  expect(view.color).toBe(RED)
  expect(view.percent).toBe('0%')
  expect(getDetailRows(dead, 0, false)).toContainEqual({ label: 'Следующий запрос', value: 'перечитает ~180k заново' })
})

test('details of a live cache show the time left, TTL and context', async () => {
  const rows = getDetailRows(live, 18 * MINUTE_MS + 40_000, false)

  expect(rows).toContainEqual({ label: 'Осталось', value: '41:20' })
  expect(rows).toContainEqual({ label: 'TTL', value: '1 час · по умолчанию' })
  expect(rows).toContainEqual({ label: 'Последний запрос', value: '18 мин назад' })
  expect(rows).toContainEqual({ label: 'Контекст', value: '~180k токенов' })
})

test('while Claude works the capsule is full', async () => {
  const view = getBandView(live, 0, true)

  expect(view.percent).toBe('100%')
  expect(getSegmentBar(view)).toEqual({ filled: '▰▰▰▰▰▰', empty: '' })
})

test('no cache yet is an empty grey capsule with a dash', async () => {
  const view = getBandView(EMPTY_CACHE, 0, false)

  expect(view.percent).toBe('—')
  expect(getSegmentBar(view)).toEqual({ filled: '', empty: '▱▱▱▱▱▱' })
})

test('percent is a whole number and never shows 0% while the cache is alive', async () => {
  expect(formatPercent(0.666)).toBe('67%')
  expect(formatPercent(0.001)).toBe('1%')
  expect(formatPercent(1)).toBe('100%')
})
