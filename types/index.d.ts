export type CacheStatus = 'none' | 'live' | 'dead'

/** Откуда известен TTL: по умолчанию, выучен по запросам, overage, событие смены модели. */
export type TtlSource = 'default' | 'learned' | 'overage' | 'switch'

export type CacheState = {
  status: CacheStatus
  /** Конец последнего запроса основной сессии, мс $.clock.now(). */
  lastAt: number
  /** Сколько токенов перечитает следующий запрос, если кэш умрёт. */
  tokens: number
  ttlMs: number
  ttlSource: TtlSource
  /** Тост о скором остывании уже показан для этого запроса. */
  isWarned: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'cache-band': { cache: Shaped<CacheState>; isWorking: boolean }
  }
}
