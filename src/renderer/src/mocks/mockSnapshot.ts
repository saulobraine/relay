import type { RelaySnapshot } from '@shared/types'

export const MOCK_SNAPSHOT: RelaySnapshot = {
  pipePath: 'maestri.pipe',
  maestriConnected: true,
  lastSyncAt: null,
  isRefreshingQuotas: false,
  lastFailoverDurationMs: null,
  terminalScanWarning: null,
  currentMaestroPresetAccountId: '42381C93-DBCD-4ED3-B72A-0694D839E2B1',
  config: {
    autoFailover: true,
    autoRebalance: false,
    onlyActiveWorkspace: false,
    maestroDedicatedAccountId: '42381C93-DBCD-4ED3-B72A-0694D839E2B1',
    excludeMaestroFromPool: true,
    quotaTimeoutSeconds: 20,
    fallbackRoutingPolicy: 'score',
    min5hPercent: 12,
    minWeeklyPercent: 5,
    quotaPollIntervalSeconds: 60,
    terminalPollIntervalSeconds: 25,
    openAtLogin: false,
    minimizeToTray: true,
    excludedAccountIds: ['D352E73D-68B7-4D2A-B981-D99AA9D4D73B']
  },
  events: [
    {
      id: 'ev-1',
      timestamp: '2026-11-25T13:02:14.000Z',
      level: 'success',
      message: 'Auto-failover concluído: terminal realocado para conta com maior score disponível.',
      workspaceName: 'Relay',
      terminalName: 'term-node-us-east-01',
      fromAccount: 'saulobraine4',
      toAccount: 'ps4games.sb@gmail.com'
    },
    {
      id: 'ev-2',
      timestamp: '2026-11-25T13:01:48.000Z',
      level: 'warn',
      message: 'Janela 5h atingiu piso mínimo (1.4% <= 12%). Conta brainebrasil movida para COOLDOWN_5H.',
      workspaceName: 'Maestri Core',
      terminalName: 'term-worker-gpu-09'
    },
    {
      id: 'ev-3',
      timestamp: '2026-11-25T13:00:55.000Z',
      level: 'error',
      message: 'HTTP 429 RESOURCE_EXHAUSTED detectado no buffer do terminal. Disparando watchdog.',
      workspaceName: 'Relay',
      terminalName: 'term-node-br-sp-02',
      fromAccount: 'braine.dev'
    },
    {
      id: 'ev-4',
      timestamp: '2026-11-25T12:59:10.000Z',
      level: 'info',
      message: 'Sincronização de cotas concluída: 7 contas consultadas via agy /usage.',
      workspaceName: 'Relay'
    }
  ],
  terminals: new Array(103).fill(null).map((_, i) => {
    const names = [
      'term-node-us-east-01',
      'term-worker-gpu-09',
      'term-node-br-sp-02',
      'specialist-ts-core',
      'specialist-qa-runner',
      'sentinel-reviewer'
    ]
    const workspaces = ['Relay', 'Maestri Core', 'Infra Pipeline']
    const boundAccounts = [
      { id: 'BD1F0314-1111-2222-3333-444455556666', name: 'saulobraine4' },
      { id: '02DD24D1-E480-4836-9AE3-A27A47B91846', name: 'ps4games.sb@gmail.com' },
      { id: '3C56AB3A-3333-4444-5555-666677778888', name: 'backup.saulobraine' },
      { id: '42381C93-DBCD-4ED3-B72A-0694D839E2B1', name: 'brainebrasil' },
      { id: 'E829A7F1-5555-6666-7777-888899990000', name: 'braine.dev' }
    ]
    const healths: RelaySnapshot['terminals'][number]['health'][] = [
      'ACTIVE',
      'ACTIVE',
      'ACTIVE',
      'IDLE',
      'RATE_LIMITED',
      'STOPPED'
    ]
    const acc = boundAccounts[i % boundAccounts.length]
    const health = i < 89 ? (i % 5 === 0 ? 'IDLE' : 'ACTIVE') : healths[i % healths.length]
    return {
      id: `term-${String(i + 1).padStart(3, '0')}`,
      name: `${names[i % names.length]}-${String(i + 1).padStart(2, '0')}`,
      workspaceId: `ws-${(i % 3) + 1}`,
      workspaceName: workspaces[i % workspaces.length],
      managerTerminalId: 'mgr-1',
      floorName: null,
      isManager: false,
      canSwapAccount: i % 4 !== 0,
      currentModel: i % 4 === 0 ? null : { name: 'Gemini 3.8 Flash', effort: 'medium' },
      agentType: i % 4 === 0 ? 'codex' : 'antigravity_cli',
      accountId: i % 4 === 0 ? null : acc.id,
      accountName: i % 4 === 0 ? 'Codex (QA)' : acc.name,
      health,
      lastSnippet:
        health === 'RATE_LIMITED'
          ? '429 Too Many Requests: quota exhausted for window 5h'
          : health === 'IDLE'
            ? '> Ready for next prompt (? for shortcuts)'
            : 'Executing TypeScript build & typecheck...',
      lastCheckedAt: new Date().toISOString(),
      inspectionLatencyMs: 80 + (i % 10) * 12,
      isSwapping: false
    }
  }),
  accounts: [
    {
      id: 'BD1F0314-1111-2222-3333-444455556666',
      name: 'saulobraine4',
      cli: 'antigravity',
      plan: 'PRO',
      state: 'COOLDOWN_5H',
      score: -1,
      gemini5hRemaining: 0,
      gemini5hResetsAt: '2026-11-25T13:05:00.000Z',
      geminiWeeklyRemaining: 72.5,
      geminiWeeklyResetsAt: '2026-12-02T08:05:00.000Z',
      thirdParty5hRemaining: null,
      thirdPartyWeeklyRemaining: null,
      activeTerminalCount: 13,
      lastCheckedAt: new Date().toISOString(),
      error: null
    },
    {
      id: '02DD24D1-E480-4836-9AE3-A27A47B91846',
      name: 'ps4games.sb@gmail.com',
      cli: 'antigravity',
      plan: 'FREE',
      state: 'READY',
      score: 100,
      gemini5hRemaining: 100,
      gemini5hResetsAt: null,
      geminiWeeklyRemaining: 100,
      geminiWeeklyResetsAt: '2026-12-02T12:30:00.000Z',
      thirdParty5hRemaining: null,
      thirdPartyWeeklyRemaining: null,
      activeTerminalCount: 0,
      lastCheckedAt: new Date().toISOString(),
      error: null
    },
    {
      id: 'C370857B-2222-3333-4444-555566667777',
      name: 'brainesaulo7',
      cli: 'antigravity',
      plan: 'PRO',
      state: 'EXHAUSTED_WEEKLY',
      score: -1,
      gemini5hRemaining: 100,
      gemini5hResetsAt: null,
      geminiWeeklyRemaining: 1.5,
      geminiWeeklyResetsAt: '2026-11-30T23:07:00.000Z',
      thirdParty5hRemaining: null,
      thirdPartyWeeklyRemaining: null,
      activeTerminalCount: 11,
      lastCheckedAt: new Date().toISOString(),
      error: null
    },
    {
      id: '3C56AB3A-3333-4444-5555-666677778888',
      name: 'backup.saulobraine',
      cli: 'antigravity',
      plan: 'PRO',
      state: 'READY',
      score: 84.3,
      gemini5hRemaining: 100,
      gemini5hResetsAt: null,
      geminiWeeklyRemaining: 89.3,
      geminiWeeklyResetsAt: '2026-12-02T12:08:00.000Z',
      thirdParty5hRemaining: null,
      thirdPartyWeeklyRemaining: null,
      activeTerminalCount: 1,
      lastCheckedAt: new Date().toISOString(),
      error: null
    },
    {
      id: '42381C93-DBCD-4ED3-B72A-0694D839E2B1',
      name: 'brainebrasil',
      cli: 'antigravity',
      plan: 'PRO',
      state: 'COOLDOWN_5H',
      score: -1,
      gemini5hRemaining: 1.4,
      gemini5hResetsAt: '2026-11-25T12:38:00.000Z',
      geminiWeeklyRemaining: 64.1,
      geminiWeeklyResetsAt: '2026-12-01T00:52:00.000Z',
      thirdParty5hRemaining: null,
      thirdPartyWeeklyRemaining: null,
      activeTerminalCount: 7,
      lastCheckedAt: new Date().toISOString(),
      error: null
    },
    {
      id: 'D352E73D-68B7-4D2A-B981-D99AA9D4D73B',
      name: 'saulobraine231126',
      cli: 'antigravity',
      plan: 'UNKNOWN',
      state: 'AUTH_ERROR',
      score: -1,
      gemini5hRemaining: null,
      gemini5hResetsAt: null,
      geminiWeeklyRemaining: null,
      geminiWeeklyResetsAt: null,
      thirdParty5hRemaining: null,
      thirdPartyWeeklyRemaining: null,
      activeTerminalCount: 0,
      lastCheckedAt: new Date().toISOString(),
      error:
        'C:\\Users\\admin\\AppData\\Local\\agy\\bin\\agy.exe -p /usage --output-format json Authentication required. Please visit the URL to...'
    },
    {
      id: 'E829A7F1-5555-6666-7777-888899990000',
      name: 'braine.dev',
      cli: 'antigravity',
      plan: 'PRO',
      state: 'COOLDOWN_5H',
      score: -1,
      gemini5hRemaining: 0,
      gemini5hResetsAt: '2026-11-25T15:38:00.000Z',
      geminiWeeklyRemaining: 73,
      geminiWeeklyResetsAt: '2026-12-02T10:38:00.000Z',
      thirdParty5hRemaining: null,
      thirdPartyWeeklyRemaining: null,
      activeTerminalCount: 22,
      lastCheckedAt: new Date().toISOString(),
      error: null
    }
  ]
}
