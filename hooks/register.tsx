import type { EngineInterface, Register, Timer } from 'claude-code'
import { atom, read, update } from 'claude-code'

import type { CacheState } from '../types'

import { EMPTY_CACHE, formatClock, getRemainingMs, isExpired, learnTtl, RED, shouldWarn, TTL_SHORT_MS } from './cache'
import { getBandView, getDetailRows, getSegmentBar, PANE_BAR_CELLS } from './view'

const TICK_MS = 1000
const PANE = 'cache-band'
const PANE_TITLE = 'Кэш'
const COMMAND = 'cache'
const OVERAGE_PERCENT = 100

// Меняй shape, когда меняются поля CacheState: старое значение переживает перезагрузку.
const cacheAtom = atom({ plugin: 'cache-band', key: 'cache' } as const, EMPTY_CACHE, { shape: 'cache-1' })
const isWorkingAtom = atom({ plugin: 'cache-band', key: 'isWorking' } as const, false)

async function isInOverage($: EngineInterface): Promise<boolean> {
  const { rateLimits } = await $.session.usage()
  return rateLimits.some(limit => limit.percentUsed >= OVERAGE_PERCENT)
}

async function tick($: EngineInterface): Promise<void> {
  const now = await $.clock.now()
  const cache = await read($, cacheAtom)
  const isWorking = await read($, isWorkingAtom)

  if (isExpired(cache, now)) {
    await update($, cacheAtom, (current): CacheState => ({ ...current, status: 'dead' }))
    return
  }
  if (shouldWarn(cache, now, isWorking)) {
    await update($, cacheAtom, (current): CacheState => ({ ...current, isWarned: true }))
    $.ui.toast(`Кэш остывает: осталось ${formatClock(getRemainingMs(cache, now))}. Допиши сейчас.`)
  }
  // Раз в секунду перерисовывается только идущий таймер: пульс анимирует сам SVG, а пустое и мёртвое состояния статичны.
  if (cache.status === 'live' && !isWorking) $.ui.invalidate('ui.render')
}

export const register: Register = on => {
  let ticker: Timer | undefined

  on('session.start', async ($, e, next) => {
    ticker?.cancel()
    ticker = $.clock.every(TICK_MS, () => void tick($))
    await $.command.register({ name: COMMAND, description: 'Подробности о prompt-кэше сессии' })
    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    await $.ui.open({ id: PANE, title: PANE_TITLE })
    return { text: 'Панель кэша открыта.' }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) await update($, isWorkingAtom, () => true)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) await update($, isWorkingAtom, () => false)
    return next(e)
  })

  // Каждый запрос основной сессии продлевает кэш; субагенты кэшируют свой префикс и не считаются.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)

    const startedAt = await $.clock.now()
    const result = yield* next(e)
    const usage = result.usage
    if (!usage) return result

    const finishedAt = await $.clock.now()
    const isOverage = await isInOverage($)
    await update($, cacheAtom, (cache): CacheState => {
      const learned = learnTtl(cache, startedAt, usage.cache_read_input_tokens)
      const ttl = isOverage
        ? { ttlMs: TTL_SHORT_MS, ttlSource: 'overage' as const }
        : (learned ?? (cache.ttlSource === 'overage' ? { ttlMs: EMPTY_CACHE.ttlMs, ttlSource: 'default' as const } : null))
      return {
        ...cache,
        ...ttl,
        status: 'live',
        lastAt: finishedAt,
        tokens:
          usage.input_tokens +
          usage.cache_read_input_tokens +
          usage.cache_creation_input_tokens +
          usage.output_tokens,
        isWarned: false,
      }
    })
    return result
  })

  // Движок сам сообщает TTL при смене модели; сама смена кэш убивает.
  on('classic.PreModelSwitch', async ($, e, next) => {
    const ttlMs = e.cache_ttl === '5m' ? TTL_SHORT_MS : EMPTY_CACHE.ttlMs
    await update($, cacheAtom, (cache): CacheState => ({ ...cache, ttlMs, ttlSource: 'switch' }))
    return next(e)
  }).catch((_$, e, next) => next(e))

  on('classic.PostModelSwitch', async ($, e, next) => {
    if (e.from_model !== e.to_model) {
      await update($, cacheAtom, (cache): CacheState => (cache.status === 'none' ? cache : { ...cache, status: 'dead' }))
    }
    return next(e)
  }).catch((_$, e, next) => next(e))

  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) {
      await update($, cacheAtom, (cache): CacheState => (cache.status === 'none' ? cache : { ...cache, status: 'dead' }))
    }
    return result
  }).catch((_$, e, next) => next(e))

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') await update($, cacheAtom, (cache): CacheState => ({ ...EMPTY_CACHE, ttlMs: cache.ttlMs, ttlSource: cache.ttlSource }))
    return next(e)
  })

  // Строка под полем ввода, где метки режимов: без подложки, капсула выглядит родным элементом.
  // Только полоса и проценты; подробности командой /cache.
  on('ui.render', { component: 'SessionMode' }, async ($, e) => {
    const now = await $.clock.now()
    const cache = await read($, cacheAtom)
    const isWorking = await read($, isWorkingAtom)
    const view = getBandView(cache, now, isWorking)
    const bar = getSegmentBar(view)
    const modes = e.props.modes.join(' & ')
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="row" alignItems="center" gap={1}>
        {/* Без кнопки: в этой строке кнопка красит содержимое в серый и встаёт перед текстом. */}
        <Text>
          <Text color={view.color}>{bar.filled}</Text>
          <Text dimColor>{bar.empty}</Text>
        </Text>
        <Text color={view.color === RED ? RED : undefined} size="footnote" weight="medium" tabular>
          {view.percent}
        </Text>
        {modes ? (
          <Text dimColor size="footnote">
            {modes}
          </Text>
        ) : null}
      </Box>
    )
  })

  // Панель подробностей: крупная полоса и строки «подпись — значение».
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const now = await $.clock.now()
    const cache = await read($, cacheAtom)
    const isWorking = await read($, isWorkingAtom)
    const view = getBandView(cache, now, isWorking)
    const bar = getSegmentBar(view, PANE_BAR_CELLS)
    const rows = getDetailRows(cache, now, isWorking)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column" gap={1} padding={1}>
        <Box flexDirection="row" alignItems="center" gap={1}>
          <Text>
            <Text color={view.color}>{bar.filled}</Text>
            <Text dimColor>{bar.empty}</Text>
          </Text>
          <Text color={view.color} size="title" weight="semibold" tabular>
            {view.percent}
          </Text>
        </Box>
        <Box flexDirection="column">
          {rows.map(row => (
            <Box key={row.label} flexDirection="row" justifyContent="space-between" gap={2}>
              <Text dimColor>{row.label}</Text>
              <Text tabular>{row.value}</Text>
            </Box>
          ))}
        </Box>
      </Box>
    )
  })
}
