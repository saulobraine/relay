import type { AccountHealthState, AccountStatus, RelayConfig } from '../../shared/types'

export function classifyAccount(params: {
  gemini5hRemaining: number | null
  geminiWeeklyRemaining: number | null
  hasAuthError: boolean
  min5hPercent: number
  minWeeklyPercent: number
}): AccountHealthState {
  if (params.hasAuthError) return 'AUTH_ERROR'

  const w = params.geminiWeeklyRemaining
  const h = params.gemini5hRemaining

  if (w === null && h === null) return 'UNKNOWN'
  if (w !== null && w <= Math.max(2, params.minWeeklyPercent * 0.5)) return 'EXHAUSTED_WEEKLY'
  if (h !== null && h <= Math.max(3, params.min5hPercent * 0.4)) return 'COOLDOWN_5H'

  if (
    (w !== null && w <= params.minWeeklyPercent) ||
    (h !== null && h <= params.min5hPercent)
  ) {
    return 'DRAINING'
  }

  return 'READY'
}

export function computeAccountScore(params: {
  state: AccountHealthState
  gemini5hRemaining: number | null
  geminiWeeklyRemaining: number | null
  activeTerminalCount: number
}): number {
  if (params.state !== 'READY') return -1

  const h = params.gemini5hRemaining ?? 100
  const w = params.geminiWeeklyRemaining ?? 100

  // 5h window recovers quickly so it carries higher routing weight; penalize stacked terminals
  const rawScore = 0.65 * h + 0.35 * w - params.activeTerminalCount * 12
  return Math.round(rawScore * 10) / 10
}

export function pickBestAccount(
  accounts: AccountStatus[],
  excludedAccountIds: string[],
  currentAccountId?: string | null,
  policy: RelayConfig['fallbackRoutingPolicy'] = 'score'
): AccountStatus | null {
  const excludedSet = new Set(excludedAccountIds.map((id) => id.toLowerCase()))
  const candidates = accounts
    .filter((acc) => {
      if (excludedSet.has(acc.id.toLowerCase())) return false
      if (currentAccountId && acc.id.toLowerCase() === currentAccountId.toLowerCase()) return false
      return acc.state === 'READY'
    })
    .sort((a, b) => {
      if (policy === 'least-loaded') {
        const difference = a.activeTerminalCount - b.activeTerminalCount
        if (difference !== 0) return difference
      }
      return b.score - a.score
    })

  return candidates[0] ?? null
}
