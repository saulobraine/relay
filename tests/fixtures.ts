import type { AccountStatus, MonitoredTerminal, RelayConfig, RelaySnapshot } from '../src/shared/types'

export function account(patch: Partial<AccountStatus> = {}): AccountStatus {
  return {
    id: 'a', name: 'Alpha', cli: 'agy', state: 'READY', score: 80,
    gemini5hRemaining: 80, geminiWeeklyRemaining: 90,
    gemini5hResetsAt: null, geminiWeeklyResetsAt: null, thirdParty5hRemaining: null,
    thirdPartyWeeklyRemaining: null, activeTerminalCount: 0, lastCheckedAt: null,
    error: null, ...patch
  }
}

export function terminal(patch: Partial<MonitoredTerminal> = {}): MonitoredTerminal {
  return {
    id: 't1', name: 'Worker 1', workspaceId: 'w1', workspaceName: 'Workspace A',
    managerTerminalId: 'manager', floorName: null, agentType: 'antigravity_cli',
    isManager: false, canSwapAccount: true, currentModel: null, accountId: 'a',
    accountName: 'Alpha', health: 'ACTIVE', lastSnippet: 'trabalho em andamento',
    lastCheckedAt: null, inspectionLatencyMs: null, isSwapping: false, ...patch
  }
}

export const config: RelayConfig = {
  autoFailover: true, autoRebalance: false, onlyActiveWorkspace: false,
  monitorOnlyMaestro: false,
  maestroDedicatedAccountId: null, excludeMaestroFromPool: true,
  quotaTimeoutSeconds: 20, fallbackRoutingPolicy: 'score', min5hPercent: 12,
  minWeeklyPercent: 5, quotaPollIntervalSeconds: 180, terminalPollIntervalSeconds: 25,
  openAtLogin: true, minimizeToTray: true, excludedAccountIds: []
}

export function snapshot(patch: Partial<RelaySnapshot> = {}): RelaySnapshot {
  return {
    pipePath: 'fixture', maestriConnected: true, accounts: [account()], terminals: [terminal()],
    events: [], config, lastSyncAt: null, isRefreshingQuotas: false,
    lastFailoverDurationMs: null, terminalScanWarning: null, currentMaestroPresetAccountId: null,
    ...patch
  }
}
