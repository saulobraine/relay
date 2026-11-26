import { useEffect, useState } from 'react'
import { useChoice } from './usePreference'
import {
  Zap,
  Terminal,
  Settings,
  RotateCw,
  LayoutGrid,
  Menu,
  Minus,
  Square,
  Copy,
  X
} from 'lucide-react'
import type { RelayConfig, RelaySnapshot } from '@shared/types'
import { AccountsGrid } from './components/AccountsGrid'
import { WorkspacesPanel } from './components/WorkspacesPanel'
import { LogsAndSettings } from './components/LogsAndSettings'
import { RelayLogo } from './components/RelayLogo'

type Tab = 'accounts' | 'terminals' | 'settings'
type Filter = 'todos' | 'ready' | 'cooldown' | 'erros'
type RefreshAction = 'quotas' | 'terminals' | 'panel'

const MOCK_SNAPSHOT: RelaySnapshot = {
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

export default function App() {
  const [snapshot, setSnapshot] = useState<RelaySnapshot | null>(null)
  const [tab, setTab] = useChoice<Tab>('tab', 'accounts', ['accounts', 'terminals', 'settings'])
  const [filter, setFilter] = useChoice<Filter>('accounts.filter', 'todos', ['todos', 'ready', 'cooldown', 'erros'])
  const [viewMode, setViewMode] = useChoice('accounts.view', 'grid', ['grid', 'table'])
  const [isMaximized, setIsMaximized] = useState(false)
  const [refreshAction, setRefreshAction] = useState<RefreshAction | null>(null)
  const [refreshMessage, setRefreshMessage] = useState('')

  useEffect(() => {
    if (typeof window !== 'undefined' && window.relay) {
      void window.relay.getSnapshot().then(setSnapshot)
      void window.relay.windowIsMaximized().then(setIsMaximized)
      const unsubSnap = window.relay.onSnapshot(setSnapshot)
      const unsubMax = window.relay.onWindowMaximized(setIsMaximized)
      return () => {
        unsubSnap()
        unsubMax()
      }
    } else {
      // In browser preview / portal QA mode, load high-fidelity snapshot matching design
      setSnapshot(MOCK_SNAPSHOT)
    }
  }, [])

  const handleToggleExclude = async (accountId: string) => {
    if (!snapshot) return
    const current = snapshot.config.excludedAccountIds
    const exists = current.some((id) => id.toLowerCase() === accountId.toLowerCase())
    const next = exists
      ? current.filter((id) => id.toLowerCase() !== accountId.toLowerCase())
      : [...current, accountId]

    if (typeof window !== 'undefined' && window.relay) {
      await window.relay.updateConfig({ excludedAccountIds: next })
    } else {
      setSnapshot({
        ...snapshot,
        config: { ...snapshot.config, excludedAccountIds: next }
      })
    }
  }

  const handleSwap = async (terminalId: string, explicitAccountId?: string) => {
    if (typeof window !== 'undefined' && window.relay) {
      await window.relay.swapTerminal(terminalId, explicitAccountId)
    } else if (snapshot) {
      const targetAcc =
        snapshot.accounts.find((a) => a.id === explicitAccountId) ??
        snapshot.accounts.find((a) => a.state === 'READY')
      if (!targetAcc) return
      const term = snapshot.terminals.find((t) => t.id === terminalId)
      setSnapshot({
        ...snapshot,
        terminals: snapshot.terminals.map((t) =>
          t.id === terminalId
            ? { ...t, accountId: targetAcc.id, accountName: targetAcc.name, health: 'IDLE' }
            : t
        ),
        events: [
          {
            id: `ev-${Date.now()}`,
            timestamp: new Date().toISOString(),
            level: 'success',
            message: `Troca manual concluída para ${targetAcc.name}.`,
            workspaceName: term?.workspaceName,
            terminalName: term?.name,
            fromAccount: term?.accountName,
            toAccount: targetAcc.name
          },
          ...snapshot.events
        ]
      })
    }
  }

  const handleUpdateConfig = async (patch: Partial<RelayConfig>) => {
    if (typeof window !== 'undefined' && window.relay) {
      await window.relay.updateConfig(patch)
    } else if (snapshot) {
      setSnapshot({
        ...snapshot,
        config: { ...snapshot.config, ...patch }
      })
    }
  }

  const handleRefresh = async (action: RefreshAction) => {
    const relay = window.relay
    if (!relay || refreshAction) return

    setRefreshAction(action)
    setRefreshMessage('')
    if (action === 'terminals') setTab('terminals')
    if (action === 'quotas') setTab('accounts')

    try {
      const [quotas, terminals] = await Promise.allSettled([
        action === 'terminals' ? undefined : relay.refreshQuotas(),
        action === 'quotas' ? undefined : relay.refreshTerminals()
      ])
      const messages: string[] = []
      if (action !== 'terminals') {
        messages.push(quotas.status === 'fulfilled' ? 'Consulta de cotas concluída.' : 'Falha ao consultar cotas.')
      }
      if (action !== 'quotas') {
        if (terminals.status === 'rejected') {
          messages.push('Falha ao escanear terminais.')
        } else {
          const result = await relay.getSnapshot()
          if (!result.maestriConnected) {
            messages.push('Maestri desconectado.')
          } else {
            const count = result.terminals.length
            messages.push(count === 1 ? '1 terminal encontrado.' : `${count} terminais encontrados.`)
          }
        }
      }
      setRefreshMessage(messages.join(' '))
    } catch {
      setRefreshMessage('Falha ao ler o resultado da atualização.')
    } finally {
      setRefreshAction(null)
    }
  }

  if (!snapshot) {
    return (
      <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <span style={{ color: '#64748b' }}>Carregando Relay...</span>
      </div>
    )
  }

  // Count filters
  const totalCount = snapshot.accounts.length
  const readyCount = snapshot.accounts.filter((a) => a.state === 'READY').length
  const cooldownCount = snapshot.accounts.filter(
    (a) =>
      a.state === 'COOLDOWN_5H' ||
      a.state === 'DRAINING' ||
      (a.gemini5hRemaining !== null && a.gemini5hRemaining <= 10)
  ).length
  const errorCount = snapshot.accounts.filter(
    (a) => a.state === 'AUTH_ERROR' || a.state === 'EXHAUSTED_WEEKLY'
  ).length

  const filteredAccounts = snapshot.accounts.filter((a) => {
    if (filter === 'ready') return a.state === 'READY'
    if (filter === 'cooldown')
      return (
        a.state === 'COOLDOWN_5H' ||
        a.state === 'DRAINING' ||
        (a.gemini5hRemaining !== null && a.gemini5hRemaining <= 10)
      )
    if (filter === 'erros')
      return a.state === 'AUTH_ERROR' || a.state === 'EXHAUSTED_WEEKLY'
    return true
  })

  const lastSyncFormatted = snapshot.lastSyncAt
    ? `Hoje às ${new Date(snapshot.lastSyncAt).toLocaleTimeString('pt-BR')}`
    : 'Hoje às 13:02:18'

  const totalTerminals = snapshot.terminals.length
  const canRefresh = Boolean(window.relay) && refreshAction === null

  return (
    <div className="app-container">
      {/* 1. TOPBAR */}
      <header className="topbar">
        <div className="topbar-left">
          <div className="brand-group">
            <RelayLogo size={22} className="brand-icon-box" />
            <span className="brand-title">RELAY</span>
          </div>

          <span className="topbar-divider">|</span>

          <div className={`pipe-status ${snapshot.maestriConnected ? '' : 'off'}`}>
            <span className="dot dot-green" />
            <span>{snapshot.maestriConnected ? 'Pipe Conectado' : 'Pipe Offline'}</span>
          </div>

          <span className="topbar-divider">|</span>

          <div
            className="failover-capsule"
            onClick={() =>
              void handleUpdateConfig({ autoFailover: !snapshot.config.autoFailover })
            }
          >
            <span className="dot dot-green" />
            <span>Auto-Failover</span>
            <span className={`toggle-badge ${snapshot.config.autoFailover ? 'on' : 'off'}`}>
              {snapshot.config.autoFailover ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>

        <div className="topbar-right">
          <button
            className="consulting-pill"
            disabled={!canRefresh || snapshot.isRefreshingQuotas}
            onClick={() => void handleRefresh('quotas')}
          >
            <span className="dot dot-blue" />
            <span>{snapshot.isRefreshingQuotas || refreshAction === 'quotas' ? 'Consultando cotas…' : 'Atualizar cotas'}</span>
          </button>

          <button
            className="btn-scan"
            disabled={!canRefresh}
            onClick={() => void handleRefresh('terminals')}
          >
            <span>{refreshAction === 'terminals' ? 'Escaneando…' : '>_ Escanear Terminais'}</span>
          </button>

          <button
            className="btn-refresh"
            title={refreshAction === 'panel' ? 'Atualizando painel…' : 'Atualizar painel'}
            aria-label="Atualizar painel"
            aria-busy={refreshAction === 'panel'}
            disabled={!canRefresh}
            onClick={() => void handleRefresh('panel')}
          >
            <RotateCw size={13} />
          </button>

          {typeof window !== 'undefined' && window.relay && (
            <div className="win-controls">
              <button
                className="win-btn"
                title="Minimizar"
                onClick={() => void window.relay.windowMinimize()}
              >
                <Minus size={13} />
              </button>
              <button
                className="win-btn"
                title={isMaximized ? 'Restaurar' : 'Maximizar'}
                onClick={() => void window.relay.windowToggleMaximize().then(setIsMaximized)}
              >
                {isMaximized ? <Copy size={11} /> : <Square size={11} />}
              </button>
              <button
                className="win-btn win-btn-close"
                title="Fechar"
                onClick={() => void window.relay.windowClose()}
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* 2. SUBNAV / TABS / FILTERS */}
      <nav className="subnav">
        <div className="subnav-tabs">
          <button
            className={`nav-tab ${tab === 'accounts' ? 'active' : ''}`}
            onClick={() => setTab('accounts')}
          >
            <Zap size={13} className="tab-icon" />
            <span>Contas</span>
            <span className="counter-pill">{totalCount}</span>
            {tab === 'accounts' && <div className="tab-active-indicator" />}
          </button>

          <button
            className={`nav-tab ${tab === 'terminals' ? 'active' : ''}`}
            onClick={() => setTab('terminals')}
          >
            <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>&gt;_</span>
            <span>Terminais</span>
            <span className="counter-pill">{totalTerminals}</span>
            {tab === 'terminals' && <div className="tab-active-indicator" />}
          </button>

          <button
            className={`nav-tab ${tab === 'settings' ? 'active' : ''}`}
            onClick={() => setTab('settings')}
          >
            <Settings size={13} className="tab-icon" />
            <span>Logs &amp; Config</span>
            {tab === 'settings' && <div className="tab-active-indicator" />}
          </button>
        </div>

        {tab === 'accounts' && (
          <div className="subnav-filters">
            <button
              className={`filter-pill ${filter === 'todos' ? 'active' : ''}`}
              onClick={() => setFilter('todos')}
            >
              Todos ({totalCount})
            </button>
            <button
              className={`filter-pill filter-ready ${filter === 'ready' ? 'active' : ''}`}
              onClick={() => setFilter('ready')}
            >
              Ready ({readyCount})
            </button>
            <button
              className={`filter-pill filter-cooldown ${filter === 'cooldown' ? 'active' : ''}`}
              onClick={() => setFilter('cooldown')}
            >
              Cooldown ({cooldownCount})
            </button>
            <button
              className={`filter-pill filter-errors ${filter === 'erros' ? 'active' : ''}`}
              onClick={() => setFilter('erros')}
            >
              Erros / Limite ({errorCount})
            </button>

            <div className="view-mode-toggle">
              <button
                className={`view-mode-btn ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => setViewMode('grid')}
              >
                <LayoutGrid size={13} />
                <span>Grid</span>
              </button>
              <button
                className={`view-mode-btn ${viewMode === 'table' ? 'active' : ''}`}
                onClick={() => setViewMode('table')}
              >
                <Menu size={13} />
                <span>Tabela</span>
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* 3. MAIN VIEW */}
      <main className="main-view">
        {tab === 'accounts' && (
          <AccountsGrid
            accounts={filteredAccounts}
            excludedAccountIds={snapshot.config.excludedAccountIds}
            currentMaestroPresetAccountId={
              snapshot.config.maestroDedicatedAccountId ?? snapshot.currentMaestroPresetAccountId
            }
            excludeMaestroFromPool={snapshot.config.excludeMaestroFromPool}
            viewMode={viewMode}
            onToggleExclude={(id) => void handleToggleExclude(id)}
          />
        )}
        {tab === 'terminals' && (
          <WorkspacesPanel
            terminals={snapshot.terminals}
            accounts={snapshot.accounts}
            autoFailover={snapshot.config.autoFailover}
            terminalPollIntervalSeconds={snapshot.config.terminalPollIntervalSeconds}
            lastFailoverDurationMs={snapshot.lastFailoverDurationMs}
            scanWarning={snapshot.terminalScanWarning}
            onSwap={handleSwap}
          />
        )}
        {tab === 'settings' && (
          <LogsAndSettings
            config={snapshot.config}
            events={snapshot.events}
            accounts={snapshot.accounts}
            currentMaestroPresetAccountId={snapshot.currentMaestroPresetAccountId}
            onUpdateConfig={handleUpdateConfig}
            onClearLogs={async () => {
              if (window.relay) await window.relay.clearLogs()
              else setSnapshot((current) => current && { ...current, events: [] })
            }}
          />
        )}
      </main>

      {/* 4. FOOTER STATUS BAR */}
      <footer className="footer-bar">
        <div className="footer-left">
          <span className="footer-item">
            Total de Pools Ativos: <strong>{totalCount}</strong>
          </span>
          <span className="footer-sep">|</span>
          <span className="footer-item">
            Terminais Vinculados: <strong className="val-cyan">{totalTerminals}</strong>
          </span>
          <span className="footer-sep">|</span>
          <span className="footer-item">
            Pipe:{' '}
            <strong className={snapshot.maestriConnected ? 'val-emerald' : 'val-rose'}>
              {snapshot.maestriConnected ? 'Conectado' : 'Offline'}
            </strong>
          </span>
        </div>

        <div className="footer-right">
          <span role="status">
            {refreshAction === 'panel'
              ? 'Atualizando cotas e terminais…'
              : refreshMessage || `Última sincronização do agente: ${lastSyncFormatted}`}
          </span>
        </div>
      </footer>
    </div>
  )
}
