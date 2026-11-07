// Чистая логика полосы: без $ и без побочных эффектов, чтобы её можно было тестировать.
import type { CacheState, TtlSource } from '../types'

export const MINUTE_MS = 60_000
export const TTL_LONG_MS = 60 * MINUTE_MS
export const TTL_SHORT_MS = 5 * MINUTE_MS
const WARN_LEAD_LONG_MS = 5 * MINUTE_MS
const WARN_LEAD_SHORT_MS = 1 * MINUTE_MS
/** Сколько кэш-токенов считать «попаданием»: меньше бывает и у холодного запроса. */
const MIN_CACHE_HIT_TOKENS = 2_000
/** Запас к 5 минутам, чтобы задержка сети не путала обучение TTL. */
const TTL_LEARN_SLACK_MS = 30_000

/** Доля оставшегося TTL, на которой зелёный начинает уходить в жёлтый. */
const COOLING_START = 0.35
/** Доля, на которой полоса уже полностью жёлтая (последние 25% TTL). */
const COOLING_FULL = 0.25

const GREEN = [34, 197, 94] as const
const YELLOW = [234, 179, 8] as const
const ORANGE = [249, 115, 22] as const
export const RED = '#ef4444'
export const GREY = '#6b7280'

export const EMPTY_CACHE: CacheState = {
  status: 'none',
  lastAt: 0,
  tokens: 0,
  ttlMs: TTL_LONG_MS,
  ttlSource: 'default',
  isWarned: false,
}

export function getRemainingMs(cache: CacheState, now: number): number {
  if (cache.status !== 'live') return 0
  return Math.max(0, cache.lastAt + cache.ttlMs - now)
}

export function isExpired(cache: CacheState, now: number): boolean {
  return cache.status === 'live' && getRemainingMs(cache, now) === 0
}

/** Пора ли показать тост «кэш остывает»: один раз на запрос и только пока Claude молчит. */
export function shouldWarn(cache: CacheState, now: number, isWorking: boolean): boolean {
  if (cache.status !== 'live' || cache.isWarned || isWorking) return false
  const remaining = getRemainingMs(cache, now)
  const lead = cache.ttlMs <= TTL_SHORT_MS ? WARN_LEAD_SHORT_MS : WARN_LEAD_LONG_MS
  return remaining > 0 && remaining <= lead
}

/**
 * Учит TTL по факту: пауза дольше 5 минут, после которой кэш прочитался, значит TTL час;
 * пауза меньше часа с промахом при большом кэше до неё значит TTL 5 минут.
 */
export function learnTtl(
  cache: CacheState,
  requestStartedAt: number,
  cacheReadTokens: number,
): { ttlMs: number; ttlSource: TtlSource } | null {
  if (cache.status === 'none' || cache.ttlSource === 'overage') return null
  const gap = requestStartedAt - cache.lastAt
  const isPastShort = gap > TTL_SHORT_MS + TTL_LEARN_SLACK_MS
  const isWithinLong = gap < TTL_LONG_MS - TTL_LEARN_SLACK_MS
  if (!isPastShort || !isWithinLong) return null
  if (cacheReadTokens >= MIN_CACHE_HIT_TOKENS) return { ttlMs: TTL_LONG_MS, ttlSource: 'learned' }
  if (cache.tokens >= MIN_CACHE_HIT_TOKENS) return { ttlMs: TTL_SHORT_MS, ttlSource: 'learned' }
  return null
}

function mix(from: readonly number[], to: readonly number[], t: number): string {
  const clamped = Math.min(1, Math.max(0, t))
  const channels = from.map((value, i) => Math.round(value + ((to[i] ?? value) - value) * clamped))
  return `#${channels.map(c => c.toString(16).padStart(2, '0')).join('')}`
}

/** Цвет по доле оставшегося TTL: зелёный, плавно жёлтый на последних 25%, к концу оранжевый. */
export function getLiveColor(fractionLeft: number): string {
  if (fractionLeft >= COOLING_START) return mix(GREEN, GREEN, 0)
  if (fractionLeft >= COOLING_FULL) {
    return mix(GREEN, YELLOW, (COOLING_START - fractionLeft) / (COOLING_START - COOLING_FULL))
  }
  return mix(YELLOW, ORANGE, (COOLING_FULL - fractionLeft) / COOLING_FULL)
}

export function formatClock(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`
  return String(tokens)
}
