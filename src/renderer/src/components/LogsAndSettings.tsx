import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useChoice } from '../usePreference'
import { Download, Monitor, Search, Shield, Sliders, Trash2, Zap } from 'lucide-react'
import type { AccountStatus, AppUpdateStatus, RelayConfig, RelayEvent } from '@shared/types'

interface Props {
  config: RelayConfig
  events: RelayEvent[]
  accounts?: AccountStatus[]
  currentMaestroPresetAccountId?: string | null
  updateStatus?: AppUpdateStatus
  onUpdateConfig: (patch: Partial<RelayConfig>) => Promise<void>
  onClearLogs: () => Promise<void>
}

type LogLevelFilter = 'all' | RelayEvent['level']

interface ToggleRowProps {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
}

function ToggleRow({ label, description, checked, onChange }: ToggleRowProps) {
  return (
    <label className="toggle-row">
      <div className="toggle-text">
        <span className="toggle-label">{label}</span>
        {description && <span className="toggle-desc">{description}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`toggle-switch ${checked ? 'checked' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="toggle-knob" />
      </button>
    </label>
  )
}

function levelBadge(level: RelayEvent['level']): { tag: string; cls: string } {
  switch (level) {
    case 'success':
      return { tag: 'SUCCESS', cls: 'lvl-success' }
    case 'warn':
      return { tag: 'WARN', cls: 'lvl-warn' }
    case 'error':
      return { tag: 'ERROR', cls: 'lvl-error' }
    default:
      return { tag: 'INFO', cls: 'lvl-info' }
  }
}

export function LogsAndSettings({
  config,
  events,
  accounts = [],
  currentMaestroPresetAccountId,
  updateStatus,
  onUpdateConfig,
  onClearLogs
}: Props) {
  const [checkingUpdates, setCheckingUpdates] = useState(false)
  const [levelFilter, setLevelFilter] = useChoice<LogLevelFilter>('logs.level', 'all', ['all', 'info', 'warn', 'error', 'success'])
  const [logSearch, setLogSearch] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [logMessage, setLogMessage] = useState('')
  const logFeed = useRef<HTMLDivElement>(null)
  const followingLogs = useRef(true)

  const selectedMaestroAcc = config.maestroDedicatedAccountId ?? ''

  const levelCounts = useMemo(() => {
    const counts = { all: events.length, info: 0, success: 0, warn: 0, error: 0 }
    for (const ev of events) {
      counts[ev.level]++
    }
    return counts
  }, [events])

  const filteredEvents = useMemo(() => {
    const q = logSearch.trim().toLowerCase()
    return events.filter((ev) => {
      if (levelFilter !== 'all' && ev.level !== levelFilter) return false
      if (q) {
        const text = [
          ev.message,
          ev.workspaceName ?? '',
          ev.terminalName ?? '',
          ev.fromAccount ?? '',
          ev.toAccount ?? ''
        ]
          .join(' ')
          .toLowerCase()
        if (!text.includes(q)) return false
      }
      return true
    }).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
  }, [events, levelFilter, logSearch])

  useLayoutEffect(() => {
    const feed = logFeed.current
    if (feed && followingLogs.current) feed.scrollTop = 0
  }, [filteredEvents])

  const handleClearLogs = async () => {
    setClearing(true)
    setLogMessage('')
    try {
      await onClearLogs()
      setConfirmClear(false)
      setLogMessage('Logs limpos.')
    } catch {
      setLogMessage('Falha ao limpar os logs.')
    } finally {
      setClearing(false)
    }
  }

  const handleCheckUpdates = async () => {
    if (typeof window !== 'undefined' && window.relay?.checkForUpdates) {
      setCheckingUpdates(true)
      try {
        await window.relay.checkForUpdates()
      } finally {
        setTimeout(() => setCheckingUpdates(false), 1200)
      }
    }
  }

  const handleExportLogs = () => {
    const blob = new Blob([JSON.stringify(filteredEvents, null, 2)], {
      type: 'application/json'
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `relay-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="settings-split-layout">
      {/* LEFT COLUMN: CONFIGURATION CARDS */}
      <div className="settings-config-column card">
        <header className="settings-card-heading">
          <span className="settings-heading-icon"><Monitor size={16} /></span>
          <div>
            <h2>Configurações Gerais &amp; Failover</h2>
            <p>Diretivas de automação e integração local</p>
          </div>
        </header>
        <section className="settings-section">
          <div className="card-header-inline">
            <Sliders size={14} className="icon-cyan" />
            <div className="card-title">Thresholds e Intervalos</div>
          </div>

          <div className="thresholds-grid">
            <label className="settings-range">
              <span>Timeout de Resposta <strong>{config.quotaTimeoutSeconds}s</strong></span>
              <span className="settings-range-control">
                <input type="range" min={5} max={60} value={config.quotaTimeoutSeconds}
                  onChange={(e) => void onUpdateConfig({ quotaTimeoutSeconds: e.target.valueAsNumber })} />
                <span className="settings-range-scale"><span>5s</span><span>60s</span></span>
              </span>
            </label>
            <label className="settings-range settings-range-threshold">
              <span>Limite da janela 5h <strong>≤ {config.min5hPercent}%</strong></span>
              <span className="settings-range-control">
                <input type="range" min={1} max={50} value={config.min5hPercent}
                  onChange={(e) => void onUpdateConfig({ min5hPercent: e.target.valueAsNumber })} />
                <span className="settings-range-scale"><span>1%</span><span>50%</span></span>
              </span>
            </label>

            <div className="field">
              <label>Piso mínimo Semanal</label>
              <div className="input-with-unit">
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={config.minWeeklyPercent}
                  onChange={(e) =>
                    void onUpdateConfig({ minWeeklyPercent: Number(e.target.value) || 5 })
                  }
                />
                <span className="unit-tag">%</span>
              </div>
            </div>

            <div className="field">
              <label>Polling de Quotas</label>
              <div className="input-with-unit">
                <input
                  type="number"
                  min={30}
                  max={600}
                  value={config.quotaPollIntervalSeconds}
                  onChange={(e) =>
                    void onUpdateConfig({
                      quotaPollIntervalSeconds: Math.max(30, Number(e.target.value) || 60)
                    })
                  }
                />
                <span className="unit-tag">s</span>
              </div>
            </div>

            <div className="field">
              <label>Polling de Terminais</label>
              <div className="input-with-unit">
                <input
                  type="number"
                  min={10}
                  max={300}
                  value={config.terminalPollIntervalSeconds}
                  onChange={(e) =>
                    void onUpdateConfig({
                      terminalPollIntervalSeconds: Math.max(10, Number(e.target.value) || 25)
                    })
                  }
                />
                <span className="unit-tag">s</span>
              </div>
            </div>
          </div>
        </section>

        <section className="settings-failover-box">
          <ToggleRow
            label="Auto-Failover ativo"
            description="Realiza troca imediata ao atingir piso mínimo ou erro HTTP 429."
            checked={config.autoFailover}
            onChange={(val) => void onUpdateConfig({ autoFailover: val })}
          />
          <label className="field">
            Política de Roteamento de Reserva
            <select className="select-input" value={config.fallbackRoutingPolicy}
              onChange={(e) => void onUpdateConfig({
                fallbackRoutingPolicy: e.target.value === 'least-loaded' ? 'least-loaded' : 'score'
              })}>
              <option value="score">Maior score</option>
              <option value="least-loaded">Menos terminais ativos</option>
            </select>
          </label>
        </section>

        <details className="settings-advanced">
          <summary>Preferências do Maestro e do Windows</summary>
        <section className="settings-section">
          <div className="card-header-inline">
            <Shield size={14} className="icon-purple" />
            <div className="card-title">Conta Dedicada do Maestro (Preset &amp; Proteção)</div>
          </div>

          <div className="field">
            <label>Conta do Preset Maestro (preferences.json)</label>
            <select
              value={selectedMaestroAcc}
              onChange={(e) =>
                void onUpdateConfig({ maestroDedicatedAccountId: e.target.value || null })
              }
              className="select-input"
            >
              <option value="">
                {currentMaestroPresetAccountId
                  ? `Usar conta do preset (${accounts.find((acc) =>
                      acc.id.toLowerCase() === currentMaestroPresetAccountId.toLowerCase()
                    )?.name ?? currentMaestroPresetAccountId.slice(0, 10)})`
                  : '(Nenhuma Selecionada)'}
              </option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} — {acc.id.slice(0, 8)}... ({acc.state})
                </option>
              ))}
            </select>
          </div>

          <ToggleRow
            label="Blindar conta do Maestro no pool"
            description="Impede que a conta dedicada do Maestro seja recrutada para especialistas durante auto-failover."
            checked={config.excludeMaestroFromPool}
            onChange={(val) => void onUpdateConfig({ excludeMaestroFromPool: val })}
          />
        </section>
        <section className="settings-section">
          <div className="card-header-inline">
            <Zap size={14} className="icon-emerald" />
            <div className="card-title">Limites &amp; Automação</div>
          </div>

          <ToggleRow
            label="Somente workspace em foco"
            description="Desative para incluir os outros workspaces abertos no Maestri."
            checked={config.onlyActiveWorkspace}
            onChange={(val) => void onUpdateConfig({ onlyActiveWorkspace: val })}
          />

          <ToggleRow
            label="Auto-Rebalanceamento de carga"
            description="Redistribui terminais ociosos quando há contas READY com score superior."
            checked={config.autoRebalance}
            onChange={(val) => void onUpdateConfig({ autoRebalance: val })}
          />

          <ToggleRow
            label="Iniciar junto com o Windows"
            description="Inicia minimizado na bandeja do sistema após login."
            checked={config.openAtLogin}
            onChange={(val) => void onUpdateConfig({ openAtLogin: val })}
          />

          <ToggleRow
            label="Minimizar para a bandeja ao fechar"
            description="Mantém o watchdog ativo em background ao fechar a janela."
            checked={config.minimizeToTray}
            onChange={(val) => void onUpdateConfig({ minimizeToTray: val })}
          />
        </section>
        </details>

        <section className="settings-section">
          <div className="card-header-inline">
            <Download size={14} className="icon-cyan" />
            <div className="card-title">Atualização do Software</div>
          </div>
          <div className="update-check-row">
            <div className="update-check-info">
              <span className="toggle-label">Versão do Relay</span>
              <span className="toggle-desc">
                {updateStatus?.state === 'downloaded'
                  ? `Versão v${updateStatus.version ?? ''} pronta para instalar.`
                  : updateStatus?.state === 'downloading'
                    ? `Baixando nova versão v${updateStatus.version ?? ''}...`
                    : updateStatus?.state === 'checking'
                      ? 'Verificando atualizações...'
                      : updateStatus?.state === 'available'
                        ? `Nova versão v${updateStatus.version ?? ''} encontrada.`
                        : updateStatus?.state === 'error'
                          ? `Erro: ${updateStatus.error ?? 'Falha na verificação'}`
                          : 'Seu Relay está configurado para atualização automática.'}
              </span>
            </div>
            <button
              type="button"
              className="btn-action-card"
              disabled={checkingUpdates || updateStatus?.state === 'checking' || updateStatus?.state === 'downloading'}
              onClick={() => void handleCheckUpdates()}
            >
              {checkingUpdates || updateStatus?.state === 'checking'
                ? 'Verificando…'
                : 'Verificar atualizações'}
            </button>
          </div>
        </section>
      </div>

      {/* RIGHT COLUMN: REAL-TIME LOG STREAM */}
      <div className="logs-stream-column">
        <div className="logs-panel-card">
          <div className="logs-header">
            <div className="logs-title-group">
              <span className="logs-console-lights" aria-hidden="true"><i /><i /><i /></span>
              <span className="card-title">Live Stream de Eventos e Auditoria</span>
              <span className="logs-live-badge">
                <span className="dot dot-green" />
                STREAMING
              </span>
            </div>


          </div>

          {confirmClear && (
            <div className="logs-clear-confirm" role="group" aria-label="Confirmar limpeza de logs">
              <span>Apagar todo o histórico local de eventos?</span>
              <button type="button" className="btn-action-card" disabled={clearing} onClick={() => setConfirmClear(false)}>Cancelar</button>
              <button type="button" className="btn-action-card" disabled={clearing} onClick={() => void handleClearLogs()}>
                {clearing ? 'Limpando…' : 'Confirmar limpeza'}
              </button>
            </div>
          )}
          {logMessage && <span role="status" className="muted">{logMessage}</span>}

          <div className="logs-toolbar">
            <div className="logs-level-filters">
              <button
                className={`filter-pill ${levelFilter === 'all' ? 'active' : ''}`}
                onClick={() => setLevelFilter('all')}
              >
                Todos ({levelCounts.all})
              </button>
              <button
                className={`filter-pill filter-ready ${levelFilter === 'success' ? 'active' : ''}`}
                onClick={() => setLevelFilter('success')}
              >
                Sucesso ({levelCounts.success})
              </button>
              <button
                className={`filter-pill ${levelFilter === 'info' ? 'active' : ''}`}
                onClick={() => setLevelFilter('info')}
              >
                Info ({levelCounts.info})
              </button>
              <button
                className={`filter-pill filter-cooldown ${levelFilter === 'warn' ? 'active' : ''}`}
                onClick={() => setLevelFilter('warn')}
              >
                Alertas ({levelCounts.warn})
              </button>
              <button
                className={`filter-pill filter-errors ${levelFilter === 'error' ? 'active' : ''}`}
                onClick={() => setLevelFilter('error')}
              >
                Erros ({levelCounts.error})
              </button>
            </div>
            <div className="logs-header-actions">
            <button
              type="button"
              className="btn-action-card btn-pause btn-icon-inline"
              onClick={handleExportLogs}
              disabled={filteredEvents.length === 0}
              title="Exportar eventos filtrados em JSON"
            >
              <Download size={12} />
              <span>JSON</span>
            </button>
            <button
              type="button"
              className="btn-action-card btn-icon-inline"
              disabled={events.length === 0 || clearing}
              onClick={() => {
                setLogMessage('')
                setConfirmClear(true)
              }}
            >
              <Trash2 size={12} />
              <span>Limpar</span>
            </button>
            </div>
          </div>

          <div className="logs-search-row">
            <div className="search-input-wrap">
              <Search size={13} className="search-icon" />
              <input
                type="text"
                className="search-input"
                placeholder="Buscar por mensagem, terminal, workspace ou conta..."
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
              />
            </div>

          </div>
          <div
            className="logs-terminal-feed"
            role="region"
            aria-label="Histórico de eventos"
            tabIndex={0}
            ref={logFeed}
            onScroll={(event) => {
              followingLogs.current = event.currentTarget.scrollTop < 24
            }}
          >
            {filteredEvents.length === 0 ? (
              <div className="logs-empty-state">
                <span className="muted">
                  {events.length === 0
                    ? 'Nenhum evento de troca ou failover registrado ainda.'
                    : 'Nenhum evento corresponde aos filtros selecionados.'}
                </span>
              </div>
            ) : (
              filteredEvents.map((ev, index) => {
                const badge = levelBadge(ev.level)
                const time = new Date(ev.timestamp).toLocaleTimeString('pt-BR')

                return (
                  <div key={ev.id} className={`log-entry log-entry-${ev.level}`}>
                    <div className="log-entry-meta">
                      <span className="log-line-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                      <span className="log-time">[{time}]</span>
                      <span className={`log-level-badge ${badge.cls}`}>[{badge.tag}]</span>
                    </div>
                    <div className="log-entry-message">
                      <div className="log-context">
                      {ev.workspaceName && (
                        <span className="log-meta-tag">{ev.workspaceName}</span>
                      )}
                      {ev.terminalName && (
                        <span className="log-meta-tag log-meta-terminal">{ev.terminalName}</span>
                      )}
                      {ev.fromAccount && ev.toAccount && (
                        <span className="log-swap-arrow">
                          {ev.fromAccount} → <strong>{ev.toAccount}</strong>
                        </span>
                      )}
                      </div>
                      {ev.message}
                    </div>
                  </div>
                )
              })
            )}
          </div>
          <footer className="logs-console-footer">
            Buffer: <strong>{filteredEvents.length}</strong> de {events.length} eventos
          </footer>
        </div>
      </div>
    </div>
  )
}
