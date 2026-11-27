export type AccountHealthState =
  | 'READY'
  | 'DRAINING'
  | 'COOLDOWN_5H'
  | 'EXHAUSTED_WEEKLY'
  | 'AUTH_ERROR'
  | 'UNKNOWN'

export type AccountPlan = 'FREE' | 'PRO' | 'PLUS' | 'UNKNOWN'

export interface QuotaWindowSnapshot {
  id: string
  window: '5h' | 'weekly'
  remainingPercent: number
  usedPercent: number
  resetsAt: string | null
}

export interface AvailableAccountModel {
  id: string
  label: string
}

export type AccountModelResult =
  | { ok: true; models: AvailableAccountModel[] }
  | { ok: false; message: string }

export interface AccountStatus {
  id: string
  name: string
  cli: string
  plan?: AccountPlan
  state: AccountHealthState
  score: number
  gemini5hRemaining: number | null
  gemini5hResetsAt: string | null
  geminiWeeklyRemaining: number | null
  geminiWeeklyResetsAt: string | null
  thirdParty5hRemaining: number | null
  thirdPartyWeeklyRemaining: number | null
  activeTerminalCount: number
  lastCheckedAt: string | null
  error: string | null
}

export type TerminalHealthState = 'ACTIVE' | 'IDLE' | 'RATE_LIMITED' | 'AUTH_ERROR' | 'STOPPED' | 'UNKNOWN'

export interface TerminalModel {
  name: string
  effort: string | null
}

export interface MonitoredTerminal {
  id: string
  name: string
  workspaceId: string
  workspaceName: string
  managerTerminalId: string | null
  floorName: string | null
  agentType: string
  isManager: boolean
  canSwapAccount: boolean
  currentModel: TerminalModel | null
  accountId: string | null
  accountName: string
  health: TerminalHealthState
  lastSnippet: string
  lastCheckedAt: string | null
  inspectionLatencyMs: number | null
  isSwapping: boolean
}

export interface RelayEvent {
  id: string
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
  workspaceName?: string
  terminalName?: string
  fromAccount?: string
  toAccount?: string
}

export interface RelayConfig {
  autoFailover: boolean
  autoRebalance: boolean
  onlyActiveWorkspace: boolean
  maestroDedicatedAccountId: string | null
  excludeMaestroFromPool: boolean
  quotaTimeoutSeconds: number
  fallbackRoutingPolicy: 'score' | 'least-loaded'
  min5hPercent: number
  minWeeklyPercent: number
  quotaPollIntervalSeconds: number
  terminalPollIntervalSeconds: number
  openAtLogin: boolean
  minimizeToTray: boolean
  excludedAccountIds: string[]
}

export interface RelaySnapshot {
  pipePath: string | null
  maestriConnected: boolean
  accounts: AccountStatus[]
  terminals: MonitoredTerminal[]
  events: RelayEvent[]
  config: RelayConfig
  lastSyncAt: string | null
  isRefreshingQuotas: boolean
  lastFailoverDurationMs: number | null
  terminalScanWarning: string | null
  currentMaestroPresetAccountId: string | null
}
