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
import { MOCK_SNAPSHOT } from './mocks/mockSnapshot'

type Tab = 'accounts' | 'terminals' | 'settings'
type Filter = 'todos' | 'ready' | 'cooldown' | 'erros'
type RefreshAction = 'quotas' | 'terminals' | 'panel'

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
