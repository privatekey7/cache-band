// Чистая отрисовка: модель вида по состоянию кэша, сегментная полоса и строки панели подробностей.
import type { CacheState, TtlSource } from '../types'
import {
  formatClock,
  formatTokens,
  GREY,
  getLiveColor,
  getRemainingMs,
  MINUTE_MS,
  RED,
  TTL_LONG_MS,
} from './cache'

const GREEN = '#22c55e'
const BAR_CELLS = 6
export const PANE_BAR_CELLS = 16

export type BandView = {
  /** Доля заливки 0..1. */
  fill: number
  color: string
  /** Проценты или прочерк: единственная подпись в строке. */
  percent: string
}

export type DetailRow = { label: string; value: string }

/** Доля TTL целыми процентами; пока кэш жив, не ниже 1%, чтобы не путать с остывшим. */
export function formatPercent(fraction: number): string {
  return `${Math.max(1, Math.round(fraction * 100))}%`
}

export function getBandView(cache: CacheState, now: number, isWorking: boolean): BandView {
  if (isWorking) return { fill: 1, color: GREEN, percent: '100%' }
  if (cache.status === 'live') {
    const fraction = getRemainingMs(cache, now) / cache.ttlMs
    return { fill: fraction, color: getLiveColor(fraction), percent: formatPercent(fraction) }
  }
  if (cache.status === 'dead') return { fill: 0, color: RED, percent: '0%' }
  return { fill: 0, color: GREY, percent: '—' }
}

/** Капсула из сегментов, как индикатор в iOS: нижняя строка рисует только текст. */
export function getSegmentBar(view: BandView, cells = BAR_CELLS): { filled: string; empty: string } {
  const filledCount = view.fill > 0 ? Math.max(1, Math.round(view.fill * cells)) : 0
  return { filled: '▰'.repeat(filledCount), empty: '▱'.repeat(cells - filledCount) }
}

const TTL_SOURCES: Record<TtlSource, string> = {
  default: 'по умолчанию',
  learned: 'выучен по запросам',
  overage: 'overage',
  switch: 'сообщил движок',
}

function formatTtl(ttlMs: number): string {
  return ttlMs >= TTL_LONG_MS ? '1 час' : `${Math.round(ttlMs / MINUTE_MS)} мин`
}

function formatAgo(ms: number): string {
  const minutes = Math.floor(ms / MINUTE_MS)
  return minutes < 1 ? 'только что' : `${minutes} мин назад`
}

function getStatusText(cache: CacheState, isWorking: boolean): string {
  if (isWorking) return 'Обновляется'
  if (cache.status === 'live') return 'Тёплый'
  if (cache.status === 'dead') return 'Остыл'
  return 'Ещё не создан'
}

/** Строки панели подробностей: то, что не влезает в нижнюю строку. */
export function getDetailRows(cache: CacheState, now: number, isWorking: boolean): DetailRow[] {
  const rows: DetailRow[] = [{ label: 'Состояние', value: getStatusText(cache, isWorking) }]
  if (cache.status === 'live' && !isWorking) {
    rows.push({ label: 'Осталось', value: formatClock(getRemainingMs(cache, now)) })
  }
  rows.push({ label: 'TTL', value: `${formatTtl(cache.ttlMs)} · ${TTL_SOURCES[cache.ttlSource]}` })
  if (cache.status !== 'none') {
    rows.push({ label: 'Последний запрос', value: formatAgo(now - cache.lastAt) })
    rows.push({ label: 'Контекст', value: `~${formatTokens(cache.tokens)} токенов` })
  }
  if (cache.status === 'dead') {
    rows.push({ label: 'Следующий запрос', value: `перечитает ~${formatTokens(cache.tokens)} заново` })
  }
  return rows
}
