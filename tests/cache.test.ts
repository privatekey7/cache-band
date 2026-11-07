import { expect, test } from 'claude-code/testing'
import {
  EMPTY_CACHE,
  formatClock,
  formatTokens,
  getLiveColor,
  getRemainingMs,
  isExpired,
  learnTtl,
  MINUTE_MS,
  shouldWarn,
  TTL_LONG_MS,
  TTL_SHORT_MS,
} from '../hooks/cache'
import type { CacheState } from '../types'

const live = (patch: Partial<CacheState> = {}): CacheState => ({
  ...EMPTY_CACHE,
  status: 'live',
  lastAt: 0,
  tokens: 180_000,
  ...patch,
})

test('remaining time counts down from the last request and stops at zero', async () => {
  expect(getRemainingMs(live(), 10 * MINUTE_MS)).toBe(50 * MINUTE_MS)
  expect(getRemainingMs(live(), 2 * TTL_LONG_MS)).toBe(0)
  expect(isExpired(live(), TTL_LONG_MS)).toBe(true)
  expect(getRemainingMs(EMPTY_CACHE, 0)).toBe(0)
})

test('warns 5 minutes before a 1h cache dies, 1 minute before a 5m one, once, and only when idle', async () => {
  expect(shouldWarn(live(), 54 * MINUTE_MS, false)).toBe(false)
  expect(shouldWarn(live(), 56 * MINUTE_MS, false)).toBe(true)
  expect(shouldWarn(live(), 56 * MINUTE_MS, true)).toBe(false)
  expect(shouldWarn(live({ isWarned: true }), 56 * MINUTE_MS, false)).toBe(false)

  const short = live({ ttlMs: TTL_SHORT_MS })
  expect(shouldWarn(short, 1 * MINUTE_MS, false)).toBe(false)
  expect(shouldWarn(short, 4.5 * MINUTE_MS, false)).toBe(true)
})

test('learns a 1h TTL from a hit after a long pause and 5m from a miss', async () => {
  expect(learnTtl(live(), 20 * MINUTE_MS, 150_000)).toEqual({ ttlMs: TTL_LONG_MS, ttlSource: 'learned' })
  expect(learnTtl(live(), 20 * MINUTE_MS, 0)).toEqual({ ttlMs: TTL_SHORT_MS, ttlSource: 'learned' })
  expect(learnTtl(live(), 2 * MINUTE_MS, 0)).toBe(null)
  expect(learnTtl(live({ ttlSource: 'overage' }), 20 * MINUTE_MS, 0)).toBe(null)
})

test('colour is green for most of the TTL, then yellow, then orange', async () => {
  expect(getLiveColor(0.9)).toBe('#22c55e')
  expect(getLiveColor(0.25)).toBe('#eab308')
  expect(getLiveColor(0)).toBe('#f97316')
})

test('formats the timer and the token count', async () => {
  expect(formatClock(41 * MINUTE_MS + 20_000)).toBe('41:20')
  expect(formatClock(TTL_LONG_MS)).toBe('60:00')
  expect(formatTokens(180_400)).toBe('180k')
  expect(formatTokens(1_250_000)).toBe('1.3M')
})
