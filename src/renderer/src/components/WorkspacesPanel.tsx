import { useMemo, useRef, useState } from 'react'
import { useChoice, usePreference } from '../usePreference'
import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Cpu,
  LoaderCircle,
  Search,
  Server,
  Terminal as TerminalIcon
} from 'lucide-react'
import type { AccountStatus, MonitoredTerminal, TerminalHealthState } from '@shared/types'
import { compareSortValues, SortableHeader, type SortDirection } from './SortableHeader'

interface Props {
  terminals: MonitoredTerminal[]
  accounts: AccountStatus[]
  autoFailover?: boolean
  terminalPollIntervalSeconds?: number
  lastFailoverDurationMs: number | null
  scanWarning: string | null
  onSwap: (terminalId: string, explicitAccountId?: string) => Promise<void>
}

type HealthFilter = 'all' | 'active' | 'idle' | 'alerts' | 'stopped'
const terminalAvailability: Record<TerminalHealthState, number> = {
  ACTIVE: 0,
  IDLE: 1,
  RATE_LIMITED: 2,
  AUTH_ERROR: 3,
  UNKNOWN: 4,
  STOPPED: 5
}

const terminalColumns = {
  name: { label: 'Terminal / Nó', value: (t: MonitoredTerminal) => t.name },
  account: { label: 'Conta / Pool Ativa', value: (t: MonitoredTerminal) => t.accountName },
  latency: { label: 'Inspeção do terminal', value: (t: MonitoredTerminal) => t.inspectionLatencyMs },
  status: { label: 'Status', value: (t: MonitoredTerminal) => terminalAvailability[t.health] }
}
type TerminalColumn = keyof typeof terminalColumns
type TerminalSort = 'default' | TerminalColumn

const PAGE_SIZE = 18

function healthBadge(health: TerminalHealthState): { label: string; cls: string } {
  switch (health) {
    case 'ACTIVE':
      return { label: 'ATIVO', cls: 'pill-ready' }
    case 'IDLE':
      return { label: 'OCIOSO', cls: 'pill-active' }
    case 'RATE_LIMITED':
      return { label: 'LIMITE 429', cls: 'pill-exhausted' }
    case 'AUTH_ERROR':
      return { label: 'ERRO LOGIN', cls: 'pill-exhausted' }
    case 'STOPPED':
      return { label: 'PARADO', cls: 'pill-cooldown' }
    default:
      return { label: 'DESCONHECIDO', cls: 'pill-unknown' }
  }
}

function formatCheckedAt(iso: string | null): string {
  if (!iso) return '--:--:--'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '--:--:--'
  return d.toLocaleTimeString('pt-BR')
}

export function WorkspacesPanel({
  terminals,
  accounts,
  autoFailover = true,
  terminalPollIntervalSeconds = 25,
  lastFailoverDurationMs,
  scanWarning,
  onSwap
}: Props) {
  const [selectedTarget, setSelectedTarget] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [healthFilter, setHealthFilter] = useChoice<HealthFilter>('terminals.health', 'all', ['all', 'active', 'idle', 'alerts', 'stopped'])
  const [savedWorkspace, setWorkspaceFilter] = usePreference<string>(
    'terminals.workspace', 'all', (value): value is string => typeof value === 'string'
  )
  const [page, setPage] = useState(1)
  const [sort, setSort] = useChoice<TerminalSort>('terminals.sort', 'default', ['default', 'name', 'account', 'latency', 'status'])
  const [bufferId, setBufferId] = useState<string | null>(null)
  const bufferDialog = useRef<HTMLDialogElement>(null)
  const [sortDirection, setSortDirection] = useChoice<SortDirection>('terminals.direction', 'ascending', ['ascending', 'descending'])
  const bufferTerminal = terminals.find((t) => t.id === bufferId)

  const workspaces = useMemo(() => {
    const set = new Set<string>()
    for (const t of terminals) {
      if (t.workspaceName) set.add(t.workspaceName)
    }
    return Array.from(set).sort()
  }, [terminals])

  const workspaceFilter = workspaces.includes(savedWorkspace) ? savedWorkspace : 'all'

  const counts = useMemo(() => {
    let active = 0
    let idle = 0
    let alerts = 0
    let stopped = 0
    for (const t of terminals) {
      if (t.health === 'ACTIVE') active++
      else if (t.health === 'IDLE') idle++
      else if (t.health === 'RATE_LIMITED' || t.health === 'AUTH_ERROR') alerts++
      else if (t.health === 'STOPPED') stopped++
    }
    return {
      total: terminals.length,
      active,
      idle,
      alerts,
      stopped,
      online: active + idle
    }
  }, [terminals])

  const readyAccounts = useMemo(
    () => accounts.filter((a) => a.state === 'READY'),
    [accounts]
  )

  const filteredTerminals = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = terminals.filter((t) => {
      if (workspaceFilter !== 'all' && t.workspaceName !== workspaceFilter) return false
      if (healthFilter === 'active' && t.health !== 'ACTIVE') return false
      if (healthFilter === 'idle' && t.health !== 'IDLE') return false
      if (healthFilter === 'alerts' && t.health !== 'RATE_LIMITED' && t.health !== 'AUTH_ERROR') {
        return false
      }
      if (healthFilter === 'stopped' && t.health !== 'STOPPED') return false
      if (q) {
        const match =
          t.name.toLowerCase().includes(q) ||
          t.workspaceName.toLowerCase().includes(q) ||
          (t.floorName?.toLowerCase().includes(q) ?? false) ||
          t.accountName.toLowerCase().includes(q) ||
          t.agentType.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q)
        if (!match) return false
      }
      return true
    })
    if (sort !== 'default') {
      const { value } = terminalColumns[sort]
      filtered.sort((a, b) => compareSortValues(value(a), value(b), sortDirection))
    }
    return filtered
  }, [terminals, search, healthFilter, workspaceFilter, sort, sortDirection])

  const totalPages = Math.max(1, Math.ceil(filteredTerminals.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * PAGE_SIZE
  const visibleTerminals = filteredTerminals.slice(pageStart, pageStart + PAGE_SIZE)

  const operationalPct =
    counts.total > 0 ? ((counts.online / counts.total) * 100).toFixed(1) : '0.0'

  if (terminals.length === 0) {
    return (
      <div className="card">
        <div className="card-title">Nenhum terminal encontrado</div>
        <div className="muted">
          {scanWarning ?? 'Abra um workspace com terminais no Maestri e escaneie novamente.'}
        </div>
      </div>
    )
  }

  return (
    <div className="terminals-view">
      {scanWarning && <div className="card muted" role="status">{scanWarning}</div>}
      {/* 1. TELEMETRY KPI STRIP */}
      <div className="terminals-kpi-grid">
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">SAÚDE DA FROTA</span>
            <Server size={14} className="kpi-icon-emerald" />
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">{counts.online}</span>
            <span className="kpi-value-sub">/ {counts.total} online</span>
          </div>
          <div className="kpi-progress-track">
            <div className="kpi-progress-fill fill-emerald" style={{ width: `${operationalPct}%` }} />
          </div>
          <div className="kpi-footer-note val-emerald">{operationalPct}% operacional</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">FAILOVER WATCHER</span>
            <Cpu size={14} className="kpi-icon-amber" />
          </div>
          <div className="kpi-value-row">
            <span className={`kpi-value ${autoFailover ? 'val-emerald' : 'val-amber'}`}>
              {autoFailover ? 'ARMADO' : 'MANUAL'}
            </span>
            <span className="kpi-value-sub">poll {terminalPollIntervalSeconds}s</span>
          </div>
          <div className="kpi-footer-note">
            {lastFailoverDurationMs === null
              ? 'Nenhuma troca medida nesta sessão'
              : `Última troca: ${(lastFailoverDurationMs / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} s`}
          </div>
        </div>
      </div>

      {/* 2. SEARCH & FILTER TOOLBAR */}
      <div className="terminals-toolbar">
        <div className="search-input-wrap">
          <Search size={13} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Buscar por terminal, workspace, agente ou conta…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>

        <div className="terminals-filters-group">
          <button
            className={`filter-pill ${healthFilter === 'all' ? 'active' : ''}`}
            onClick={() => {
              setHealthFilter('all')
              setPage(1)
            }}
          >
            Todos ({counts.total})
          </button>
          <button
            className={`filter-pill filter-ready ${healthFilter === 'active' ? 'active' : ''}`}
            onClick={() => {
              setHealthFilter('active')
              setPage(1)
            }}
          >
            Ativos ({counts.active})
          </button>
          <button
            className={`filter-pill ${healthFilter === 'idle' ? 'active' : ''}`}
            onClick={() => {
              setHealthFilter('idle')
              setPage(1)
            }}
          >
            Ociosos ({counts.idle})
          </button>
          <button
            className={`filter-pill filter-errors ${healthFilter === 'alerts' ? 'active' : ''}`}
            onClick={() => {
              setHealthFilter('alerts')
              setPage(1)
            }}
          >
            Erros / 429 ({counts.alerts})
          </button>
          <button
            className={`filter-pill filter-cooldown ${healthFilter === 'stopped' ? 'active' : ''}`}
            onClick={() => {
              setHealthFilter('stopped')
              setPage(1)
            }}
          >
            Parados ({counts.stopped})
          </button>

          {workspaces.length > 1 && (
            <select
              aria-label="Filtrar por workspace"
              className="select-input compact-select"
              value={workspaceFilter}
              onChange={(e) => {
                setWorkspaceFilter(e.target.value)
                setPage(1)
              }}
            >
              <option value="all">Todos Workspaces</option>
              {workspaces.map((ws) => (
                <option key={ws} value={ws}>
                  {ws}
                </option>
              ))}
            </select>
          )}
          <select
            aria-label="Ordenar terminais"
            className="select-input compact-select"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as TerminalSort)
              setSortDirection('ascending')
              setPage(1)
            }}
          >
            <option value="default">Ordem de conexão</option>
            <option value="name">Nome do terminal</option>
            <option value="account">Conta ativa</option>
            <option value="latency">Latência da leitura</option>
            <option value="status">Status</option>
          </select>
        </div>
      </div>

      {/* 3. HIGH-DENSITY TERMINALS TABLE */}
      <div className="accounts-table-card">
        <div className="terminals-table-scroll" role="region" aria-label="Tabela de terminais com rolagem horizontal" tabIndex={0}>
        <table className="accounts-table terminals-table">
          <thead>
            <tr>
              {(Object.keys(terminalColumns) as TerminalColumn[]).map((column) => (
                <SortableHeader key={column} label={terminalColumns[column].label}
                  direction={sort === column ? sortDirection : undefined}
                  onClick={() => {
                    setSortDirection(sort === column && sortDirection === 'ascending' ? 'descending' : 'ascending')
                    setSort(column)
                    setPage(1)
                  }}
                />
              ))}
              <th style={{ textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {visibleTerminals.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '28px 16px' }}>
                  <span className="muted">Nenhum terminal corresponde aos filtros aplicados.</span>
                </td>
              </tr>
            ) : (
              visibleTerminals.map((t) => {
                const badge = healthBadge(t.health)
                const chosen = selectedTarget[t.id] ?? ''
                const canSwap = t.canSwapAccount

                return (
                  <tr key={t.id}>
                    <td>
                      <div className="table-account-cell">
                        <div className="terminal-name-line">
                          <TerminalIcon size={12} className="terminal-row-icon" />
                          <span className="table-acc-name">{t.name}</span>
                        </div>
                        <div className="terminal-tags">
                          <span className="workspace-tag">{t.workspaceName}</span>
                          {t.floorName && <span className="workspace-tag">{t.floorName}</span>}
                          {t.isManager && <span className="workspace-tag">Maestro</span>}
                          <span className="workspace-tag agent-tag">
                            {t.agentType === 'antigravity_cli' ? 'Antigravity CLI' : t.agentType === 'codex' ? 'Codex' : t.agentType}
                          </span>
                        </div>
                        {t.currentModel && (
                          <span className="terminal-current-model">
                            Modelo: <strong>{t.currentModel.name}</strong>
                            {t.currentModel.effort && ` · ${t.currentModel.effort}`}
                          </span>
                        )}
                        <span className="table-acc-id">ID: {t.id}</span>
                      </div>
                    </td>

                    <td>
                      <div className="table-account-cell">
                        <span className="terminal-bound-account">{t.accountName}</span>
                        {t.accountId && <span className="table-acc-id" title={t.accountId}>{t.accountId.slice(0, 12)}…</span>}
                      </div>
                    </td>

                    <td>
                      <div className="table-account-cell">
                        <span className="mono-time">{formatCheckedAt(t.lastCheckedAt)}</span>
                        <span className="table-acc-id terminal-inspection-latency">{t.inspectionLatencyMs === null ? '—' : `${t.inspectionLatencyMs} ms`}</span>
                      </div>
                    </td>

                    <td>
                      <span className={`status-pill ${badge.cls}`}>
                        {t.health === 'ACTIVE' && (
                          <span className="pill-dot dot-emerald terminal-active-dot" />
                        )}
                        {badge.label}
                      </span>
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <div className="terminal-actions">
                        {canSwap && <div className="terminal-swap-controls">
                        <select
                          aria-label={`Conta de destino para ${t.name}`}
                          className="select-input compact-select"
                          value={chosen}
                          disabled={t.isSwapping}
                          onChange={(e) =>
                            setSelectedTarget((prev) => ({ ...prev, [t.id]: e.target.value }))
                          }
                        >
                          <option value="">Melhor conta (Score)</option>
                          {readyAccounts.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.name} (5h: {acc.gemini5hRemaining ?? '?'}% | Sem:{' '}
                              {acc.geminiWeeklyRemaining ?? '?'}%)
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          className="btn-action-card btn-swap-action terminal-icon-action"
                          aria-label={t.isSwapping ? 'Trocando conta' : 'Trocar conta'}
                          title={t.isSwapping ? 'Trocando conta' : 'Trocar conta'}
                          aria-busy={t.isSwapping}
                          disabled={t.isSwapping}
                          onClick={() => void onSwap(t.id, chosen || undefined)}
                        >
                          {t.isSwapping
                            ? <LoaderCircle size={15} aria-hidden="true" />
                            : <ArrowLeftRight size={15} aria-hidden="true" />}
                        </button>
                        </div>}
                        <button
                          type="button"
                          className="btn-action-card terminal-icon-action"
                          aria-label="Ver buffer"
                          title="Ver buffer"
                          disabled={!t.lastSnippet}
                          onClick={() => {
                            setBufferId(t.id)
                            bufferDialog.current?.showModal()
                          }}
                        >
                          <TerminalIcon size={15} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
        </div>

        {/* TABLE PAGINATION FOOTER */}
        <div className="table-pagination">
          <span className="muted">
            Exibindo{' '}
            <strong>
              {filteredTerminals.length === 0 ? 0 : pageStart + 1}–
              {Math.min(pageStart + PAGE_SIZE, filteredTerminals.length)}
            </strong>{' '}
            de <strong>{filteredTerminals.length}</strong> terminais
          </span>
          <div className="pagination-controls">
            <button
              className="page-btn"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={13} />
              <span>Anterior</span>
            </button>
            <span className="page-indicator">
              Página {safePage} / {totalPages}
            </span>
            <button
              className="page-btn"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <span>Próxima</span>
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      </div>
      <dialog ref={bufferDialog} className="terminal-buffer-dialog" aria-labelledby="terminal-buffer-title">
        <div className="terminal-buffer-header">
          <h2 id="terminal-buffer-title">Buffer · {bufferTerminal?.name}</h2>
          <form method="dialog">
            <button className="btn-action-card">Fechar</button>
          </form>
        </div>
        <div className="terminal-buffer-meta">
          IP, porta, CPU, memória e uptime indisponíveis no Maestri.
        </div>
        <pre>{bufferTerminal?.lastSnippet ?? 'Buffer indisponível.'}</pre>
      </dialog>
    </div>
  )
}
