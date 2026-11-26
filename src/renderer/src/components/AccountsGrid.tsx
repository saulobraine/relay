import { usePreference } from '../usePreference'
import type { AccountStatus } from '@shared/types'
import { compareSortValues, SortableHeader, type SortDirection } from './SortableHeader'
import { AccountModelsButton } from './AccountModelsButton'

interface Props {
  accounts: AccountStatus[]
  excludedAccountIds: string[]
  currentMaestroPresetAccountId?: string | null
  excludeMaestroFromPool?: boolean
  viewMode?: 'grid' | 'table'
  onToggleExclude: (accountId: string) => void
}

const accountColumns = {
  'Conta / Identificador': (acc: AccountStatus) => acc.name,
  'Status': (acc: AccountStatus) => accountAvailability[acc.state],
  'Score': (acc: AccountStatus) => acc.state === 'AUTH_ERROR' || acc.score < 0 ? null : acc.score,
  'Terminais': (acc: AccountStatus) => acc.activeTerminalCount,
  'Janela 5h': (acc: AccountStatus) => acc.state === 'AUTH_ERROR' ? null : acc.gemini5hRemaining,
  'Semanal': (acc: AccountStatus) => acc.state === 'AUTH_ERROR' ? null : acc.geminiWeeklyRemaining,
}

type AccountSort = { column: keyof typeof accountColumns; direction: SortDirection }

function isAccountSort(value: unknown): value is AccountSort | null {
  if (value === null) return true
  if (typeof value !== 'object' || !('column' in value) || !('direction' in value)) return false
  return typeof value.column === 'string' && Object.hasOwn(accountColumns, value.column) &&
    (value.direction === 'ascending' || value.direction === 'descending')
}

const accountAvailability: Record<AccountStatus['state'], number> = {
  READY: 0,
  DRAINING: 1,
  COOLDOWN_5H: 2,
  EXHAUSTED_WEEKLY: 3,
  AUTH_ERROR: 4,
  UNKNOWN: 5
}

function accountStatus(acc: AccountStatus) {
  if (acc.state === 'AUTH_ERROR') return { label: 'ERRO DE AUTENTICAÇÃO', pillClass: 'unknown' }
  if (acc.state === 'UNKNOWN') return { label: 'UNKNOWN', pillClass: 'unknown' }
  if (acc.state === 'EXHAUSTED_WEEKLY') return { label: 'SEMANAL ZERADO', pillClass: 'exhausted' }
  if (acc.state === 'DRAINING') return { label: 'COTA BAIXA', pillClass: 'cooldown' }
  if (acc.state === 'COOLDOWN_5H') {
    return { label: 'COOLDOWN 5H', pillClass: 'cooldown' }
  }
  return { label: 'READY', pillClass: 'ready' }
}

function formatReset(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${day}/${month}, ${hours}:${minutes}`
}

export function AccountsGrid({
  accounts,
  excludedAccountIds,
  currentMaestroPresetAccountId,
  excludeMaestroFromPool,
  viewMode = 'grid',
  onToggleExclude
}: Props) {
  const excludedSet = new Set(excludedAccountIds.map((id) => id.toLowerCase()))
  const [sort, setSort] = usePreference<AccountSort | null>('accounts.sort', null, isAccountSort)

  if (viewMode === 'table') {
    const orderedAccounts = sort
      ? [...accounts].sort((a, b) => {
          const value = accountColumns[sort.column]
          return compareSortValues(value(a), value(b), sort.direction)
        })
      : accounts
    return (
      <div className="accounts-table-card">
        <table className="accounts-table">
          <thead>
            <tr>
              {(Object.keys(accountColumns) as (keyof typeof accountColumns)[]).map((column) => (
                <SortableHeader key={column} label={column}
                  direction={sort?.column === column ? sort.direction : undefined}
                  onClick={() => setSort((current) => ({
                    column,
                    direction: current?.column === column && current.direction === 'ascending'
                      ? 'descending' : 'ascending'
                  }))}
                />
              ))}
              <th style={{ textAlign: 'right' }}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {orderedAccounts.map((acc) => {
              const isExcluded = excludedSet.has(acc.id.toLowerCase())
              const isMaestroPreset =
                currentMaestroPresetAccountId &&
                acc.id.toLowerCase() === currentMaestroPresetAccountId.toLowerCase()
              const isLockedForMaestro = isMaestroPreset && excludeMaestroFromPool
              const isAuthError = acc.state === 'AUTH_ERROR'

              const { label: pillText, pillClass } = accountStatus(acc)


              return (
                <tr key={acc.id}>
                  <td>
                    <div className="table-account-cell">
                      <span className="table-acc-name">{acc.name}</span>
                      <span className="table-acc-id">ID: {acc.id.slice(0, 10).toUpperCase()}...</span>
                      {isMaestroPreset && (
                        <span className="badge-maestro-inline">
                          👑 MAESTRO PRESET {isLockedForMaestro ? '(BLINDADA)' : ''}
                        </span>
                      )}
                      <AccountModelsButton accountId={acc.id} accountName={acc.name} />
                    </div>
                  </td>
                  <td>
                    <span className={`status-pill pill-${pillClass}`}>
                      {pillClass === 'ready' && <span className="pill-dot dot-emerald" />}
                      {pillText}
                    </span>
                  </td>
                  <td>
                    <span className={`score-val ${acc.score === 100 ? 'score-100' : ''}`}>
                      {isAuthError || acc.score < 0 ? '--' : acc.score}
                    </span>
                  </td>
                  <td>
                    <span className="terminals-val">{acc.activeTerminalCount}</span>
                  </td>
                  <td>
                    {isAuthError ? (
                      <span className="table-dash">-</span>
                    ) : (
                      <div className="table-meter-box">
                        <div className="table-meter-text">
                          <span className={acc.gemini5hRemaining !== null && acc.gemini5hRemaining <= 10 ? 'txt-red-5h' : ''}>
                            {acc.gemini5hRemaining !== null ? `${acc.gemini5hRemaining}%` : '-'}
                          </span>
                          <span className="table-reset">Reset {formatReset(acc.gemini5hResetsAt)}</span>
                        </div>
                        <div className="progress-track">
                          <div
                            className={`progress-bar ${acc.gemini5hRemaining !== null && acc.gemini5hRemaining <= 10 ? 'bar-red-5h' : 'bar-orange'}`}
                            style={{ width: `${acc.gemini5hRemaining ?? 0}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </td>
                  <td>
                    {isAuthError ? (
                      <span className="table-dash">-</span>
                    ) : (
                      <div className="table-meter-box">
                        <div className="table-meter-text">
                          <span className={acc.geminiWeeklyRemaining !== null && acc.geminiWeeklyRemaining <= 10 ? 'txt-red-weekly' : ''}>
                            {acc.geminiWeeklyRemaining !== null ? `${acc.geminiWeeklyRemaining}%` : '-'}
                          </span>
                          <span className="table-reset">Reset {formatReset(acc.geminiWeeklyResetsAt)}</span>
                        </div>
                        <div className="progress-track">
                          <div
                            className={`progress-bar ${acc.geminiWeeklyRemaining !== null && acc.geminiWeeklyRemaining <= 10 ? 'bar-red-weekly' : 'bar-green'}`}
                            style={{ width: `${acc.geminiWeeklyRemaining ?? 0}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {isLockedForMaestro ? (
                      <span className="badge-maestro-inline">Reservada</span>
                    ) : (
                      <button
                        className={`btn-action-card ${isExcluded ? 'btn-include' : 'btn-pause'}`}
                        onClick={() => onToggleExclude(acc.id)}
                      >
                        {isExcluded ? '+ Incluir no Pool' : 'Pausar do Pool'}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="accounts-grid-layout">
      {accounts.map((acc) => {
        const isExcluded = excludedSet.has(acc.id.toLowerCase())
        const isMaestroPreset =
          currentMaestroPresetAccountId &&
          acc.id.toLowerCase() === currentMaestroPresetAccountId.toLowerCase()
        const isLockedForMaestro = isMaestroPreset && excludeMaestroFromPool
        const isAuthError = acc.state === 'AUTH_ERROR'

        const { label: pillText, pillClass } = accountStatus(acc)

        const scoreDisplay = isAuthError || acc.score < 0 ? '--' : acc.score
        const isScore100 = acc.score === 100

        return (
          <div
            key={acc.id}
            className={`account-card-box ${isMaestroPreset ? 'card-maestro-preset' : ''}`}
          >
            {/* Header: Title + Status Pill */}
            <div className="card-header-row">
              <div className="card-title-group">
                <span className="account-title">{acc.name}</span>
                <div className="account-submeta">
                  Score:{' '}
                  <span className={isScore100 ? 'score-val-100' : 'score-val-plain'}>
                    {scoreDisplay}
                  </span>{' '}
                  &nbsp;·&nbsp; Terminais: {acc.activeTerminalCount}
                </div>
                {isMaestroPreset && (
                  <span className="badge-maestro-card">
                    👑 MAESTRO PRESET {isLockedForMaestro ? '(PROTEGIDA NO POOL)' : ''}
                  </span>
                )}
              </div>

              <span className={`status-pill pill-${pillClass}`}>
                {pillClass === 'ready' && <span className="pill-dot dot-emerald" />}
                {pillText}
              </span>
            </div>
            <AccountModelsButton accountId={acc.id} accountName={acc.name} />

            {/* Quota meters OR Error alert */}
            {isAuthError ? (
              <div className="error-alert-box">
                <div className="error-alert-header">⚠ Command failed:</div>
                <div className="error-alert-body">
                  {acc.error ??
                    'C:\\Users\\admin\\AppData\\Local\\agy\\bin\\agy.exe -p /usage --output-format json Authentication required. Please visit the URL to...'}
                </div>
              </div>
            ) : (
              <div className="meters-container">
                {/* Janela 5h */}
                <div className="meter-row">
                  <div className="meter-label-row">
                    <span className="meter-name">Janela 5h (Gemini)</span>
                    <div className="meter-value-group">
                      <span
                        className={`meter-pct-text ${
                          acc.gemini5hRemaining !== null && acc.gemini5hRemaining <= 10
                            ? 'pct-red-5h'
                            : acc.gemini5hRemaining === 100
                              ? 'pct-emerald'
                              : 'pct-white'
                        }`}
                      >
                        {acc.gemini5hRemaining !== null ? `${acc.gemini5hRemaining}%` : '-'}
                      </span>
                      <span className="meter-dot-sep">·</span>
                      <span className="meter-reset-text">
                        Reset {formatReset(acc.gemini5hResetsAt)}
                      </span>
                    </div>
                  </div>
                  <div className="progress-track">
                    <div
                      className={`progress-bar ${
                        acc.gemini5hRemaining !== null && acc.gemini5hRemaining <= 10
                          ? 'bar-red-5h'
                          : 'bar-orange'
                      }`}
                      style={{
                        width:
                          acc.gemini5hRemaining === 0
                            ? '0%'
                            : `${acc.gemini5hRemaining ?? 0}%`
                      }}
                    />
                  </div>
                </div>

                {/* Semanal */}
                <div className="meter-row">
                  <div className="meter-label-row">
                    <span className="meter-name">Semanal (Gemini)</span>
                    <div className="meter-value-group">
                      <span
                        className={`meter-pct-text ${
                          acc.geminiWeeklyRemaining !== null && acc.geminiWeeklyRemaining <= 10
                            ? 'pct-red-weekly'
                            : acc.geminiWeeklyRemaining === 100 || (acc.geminiWeeklyRemaining !== null && acc.geminiWeeklyRemaining > 70)
                              ? 'pct-emerald'
                              : 'pct-white'
                        }`}
                      >
                        {acc.geminiWeeklyRemaining !== null
                          ? `${acc.geminiWeeklyRemaining}%`
                          : '-'}
                      </span>
                      <span className="meter-dot-sep">·</span>
                      <span className="meter-reset-text">
                        Reset {formatReset(acc.geminiWeeklyResetsAt)}
                      </span>
                    </div>
                  </div>
                  <div className="progress-track">
                    <div
                      className={`progress-bar ${
                        acc.geminiWeeklyRemaining !== null && acc.geminiWeeklyRemaining <= 10
                          ? 'bar-red-weekly'
                          : 'bar-green'
                      }`}
                      style={{
                        width: `${acc.geminiWeeklyRemaining ?? 0}%`
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Card Footer */}
            <div className="card-footer-row">
              <span className="account-monospace-id">
                ID: {acc.id.slice(0, 10).toUpperCase()}...
              </span>

              {isLockedForMaestro ? (
                <button
                  className="btn-action-card btn-maestro-reserved"
                  onClick={() => onToggleExclude(acc.id)}
                  title="Esta conta está blindada para o Maestro e protegida do pool de especialistas"
                >
                  {isExcluded ? '+ Incluir no Pool' : 'Reservada Maestro'}
                </button>
              ) : (
                <button
                  className={`btn-action-card ${isExcluded ? 'btn-include' : 'btn-pause'}`}
                  onClick={() => onToggleExclude(acc.id)}
                >
                  {isExcluded ? '+ Incluir no Pool' : 'Pausar do Pool'}
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
