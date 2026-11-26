import { Notification } from 'electron'
import type {
  AccountStatus,
  MonitoredTerminal,
  RelayConfig,
  RelayEvent,
  RelaySnapshot
} from '../../shared/types'
import { checkTerminal, listConnectedAgents, listLoadedFloors, listLoadedWorkspaces, workspaceKey } from '../maestri/cliBridge'
import { discoverMaestriPipe } from '../maestri/pipeDiscovery'
import {
  readAntigravityAccounts,
  readWorkspaces,
  readMaestroPresetAccountId,
  setMaestroPresetAccountId,
  type PersistedAccount,
  type PersistedTerminalNode
} from '../maestri/workspaceReader'
import { fetchAllLiveAccountUsages, readCachedUsageStatus } from '../quota/accountCollector'
import { pickBestAccount } from '../quota/scorer'
import { executeTerminalFailover } from './failoverEngine'
import { detectTerminalHealth, extractRecentLines, readTerminalModel } from './terminalWatcher'
import { loadConfig, loadEvents, saveConfig, saveEvents } from '../store'

function findScanTerminal(terminals: PersistedTerminalNode[]): PersistedTerminalNode | undefined {
  return terminals.find((t) => t.isManager && !t.isUnloaded) ?? terminals.find((t) => !t.isUnloaded)
}

export class RelayScheduler {
  private config!: RelayConfig
  private events: RelayEvent[] = []
  private accounts: AccountStatus[] = []
  private persistedAccounts: PersistedAccount[] = []
  private terminals: MonitoredTerminal[] = []
  private pipePath: string | null = null
  private lastSyncAt: string | null = null
  private quotaRefresh: Promise<void> | null = null
  private lastFailoverDurationMs: number | null = null
  private eventWrite: Promise<void> = Promise.resolve()
  private currentMaestroPresetAccountId: string | null = null
  private swapLocks = new Set<string>()
  private quotaTimer: NodeJS.Timeout | null = null
  private terminalTimer: NodeJS.Timeout | null = null
  private terminalScan: { onlyActiveWorkspace: boolean; task: Promise<void> } | null = null
  private evaluatingFailover = false
  private terminalScanWarning: string | null = null
  private listeners = new Set<(snapshot: RelaySnapshot) => void>()

  async init(): Promise<void> {
    this.config = await loadConfig()
    this.events = await loadEvents()
    // Load the initial quota snapshot from disk before opening the window.
    this.pipePath = await discoverMaestriPipe()
    this.persistedAccounts = await readAntigravityAccounts()
    await this.refreshCachedQuotas()
    this.startTimers()
  }

  stop(): void {
    if (this.quotaTimer) clearInterval(this.quotaTimer)
    if (this.terminalTimer) clearInterval(this.terminalTimer)
    this.quotaTimer = null
    this.terminalTimer = null
  }

  subscribe(listener: (snapshot: RelaySnapshot) => void): () => void {
    this.listeners.add(listener)
    listener(this.getSnapshot())
    return () => this.listeners.delete(listener)
  }

  getSnapshot(): RelaySnapshot {
    return {
      pipePath: this.pipePath,
      maestriConnected: this.pipePath !== null,
      accounts: this.accounts,
      terminals: this.terminals,
      events: this.events,
      config: this.config,
      lastSyncAt: this.lastSyncAt,
      isRefreshingQuotas: this.quotaRefresh !== null,
      lastFailoverDurationMs: this.lastFailoverDurationMs,
      terminalScanWarning: this.terminalScanWarning,
      currentMaestroPresetAccountId: this.currentMaestroPresetAccountId
    }
  }

  private emit(): void {
    const snap = this.getSnapshot()
    for (const listener of this.listeners) {
      listener(snap)
    }
  }

  private async pushEvent(
    level: RelayEvent['level'],
    message: string,
    extra?: Partial<RelayEvent>
  ): Promise<void> {
    const ev: RelayEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      level,
      message,
      ...extra
    }
    await this.updateEvents((events) => [ev, ...events].slice(0, 150))
  }

  clearLogs(): Promise<void> {
    return this.updateEvents(() => [])
  }

  private updateEvents(update: (events: RelayEvent[]) => RelayEvent[]): Promise<void> {
    const write = this.eventWrite.then(async () => {
      const events = update(this.events)
      await saveEvents(events)
      this.events = events
      this.emit()
    })
    this.eventWrite = write.catch(() => {})
    return write
  }

  private notify(title: string, body: string): void {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show()
    }
  }

  private startTimers(): void {
    if (this.quotaTimer) clearInterval(this.quotaTimer)
    if (this.terminalTimer) clearInterval(this.terminalTimer)

    this.quotaTimer = setInterval(() => {
      // Maestri already writes quota snapshots. Reading them here avoids
      // launching an Antigravity CLI process for every account on each tick.
      if (!this.quotaRefresh) void this.refreshCachedQuotas()
    }, Math.max(30, this.config.quotaPollIntervalSeconds) * 1000)

    this.terminalTimer = setInterval(() => {
      void this.pollTerminals()
    }, Math.max(10, this.config.terminalPollIntervalSeconds) * 1000)
  }

  async updateConfig(patch: Partial<RelayConfig>): Promise<RelayConfig> {
    const previousWorkspaceFilter = this.config.onlyActiveWorkspace
    if (
      patch.maestroDedicatedAccountId !== undefined &&
      patch.maestroDedicatedAccountId !== this.currentMaestroPresetAccountId
    ) {
      if (patch.maestroDedicatedAccountId) {
        const ok = await setMaestroPresetAccountId(patch.maestroDedicatedAccountId)
        if (ok) {
          this.currentMaestroPresetAccountId = patch.maestroDedicatedAccountId
          await this.pushEvent(
            'info',
            `Preset do Maestro atualizado para a conta: ${patch.maestroDedicatedAccountId}`
          )
        } else {
          await this.pushEvent(
            'warn',
            'Conta blindada no Relay. Não foi possível atualizar o preset do Maestro no Maestri.'
          )
        }
      }
    }
    this.config = { ...this.config, ...patch }
    await saveConfig(this.config)
    this.startTimers()
    if (previousWorkspaceFilter !== this.config.onlyActiveWorkspace) {
      await this.pollTerminals(false)
    }
    await this.refreshCachedQuotas()
    this.emit()
    return this.config
  }

  async refreshAll(liveQuotas = false): Promise<void> {
    this.pipePath = await discoverMaestriPipe()
    this.persistedAccounts = await readAntigravityAccounts()
    this.currentMaestroPresetAccountId = await readMaestroPresetAccountId()
    await this.pollTerminals(false)
    if (liveQuotas) {
      await this.refreshQuotasLive()
    } else {
      await this.refreshCachedQuotas()
    }
  }

  private getActiveCountByAccountId(): Map<string, number> {
    const map = new Map<string, number>()
    for (const t of this.terminals) {
      if (t.canSwapAccount && t.accountId) {
        const key = t.accountId.toLowerCase()
        map.set(key, (map.get(key) ?? 0) + 1)
      }
    }
    return map
  }

  async refreshCachedQuotas(): Promise<void> {
    if (this.persistedAccounts.length === 0) {
      this.persistedAccounts = await readAntigravityAccounts()
    }
    this.currentMaestroPresetAccountId = await readMaestroPresetAccountId()
    this.accounts = await readCachedUsageStatus(
      this.persistedAccounts,
      this.getActiveCountByAccountId(),
      this.config.min5hPercent,
      this.config.minWeeklyPercent
    )
    this.lastSyncAt = new Date().toISOString()
    this.emit()
  }

  refreshQuotasLive(): Promise<void> {
    if (!this.quotaRefresh) {
      this.quotaRefresh = this.collectLiveQuotas().finally(() => {
        this.quotaRefresh = null
        this.emit()
      })
      this.emit()
    }
    return this.quotaRefresh
  }

  private async collectLiveQuotas(): Promise<void> {
    if (this.persistedAccounts.length === 0) {
      this.persistedAccounts = await readAntigravityAccounts()
    }
    this.accounts = await fetchAllLiveAccountUsages(
      this.persistedAccounts,
      this.getActiveCountByAccountId(),
      this.config.min5hPercent,
      this.config.minWeeklyPercent,
      this.config.quotaTimeoutSeconds
    )
    this.lastSyncAt = new Date().toISOString()
  }

  async pollTerminals(evaluateFailover = true): Promise<void> {
    const onlyActiveWorkspace = this.config.onlyActiveWorkspace
    await this.scanForWorkspaceScope(onlyActiveWorkspace)
    if (this.config.onlyActiveWorkspace !== onlyActiveWorkspace) return

    if (evaluateFailover && this.config.autoFailover && this.pipePath && !this.evaluatingFailover) {
      this.evaluatingFailover = true
      try {
        await this.evaluateAutoFailover()
      } finally {
        this.evaluatingFailover = false
      }
    }
  }

  private async scanForWorkspaceScope(onlyActiveWorkspace: boolean): Promise<void> {
    if (this.terminalScan) {
      const running = this.terminalScan
      await running.task
      if (running.onlyActiveWorkspace === onlyActiveWorkspace) return
      return this.scanForWorkspaceScope(onlyActiveWorkspace)
    }

    const task = this.scanTerminals(onlyActiveWorkspace).finally(() => {
      this.terminalScan = null
    })
    this.terminalScan = { onlyActiveWorkspace, task }
    await task
  }

  private async scanTerminals(onlyActiveWorkspace: boolean): Promise<void> {
    const pipePath = await discoverMaestriPipe()
    const workspaces = await readWorkspaces()
    const accountsByName = new Map(this.persistedAccounts.map((a) => [a.name.toLowerCase(), a]))
    const accountsById = new Map(this.persistedAccounts.map((a) => [a.id.toLowerCase(), a]))

    const activeWorkspace = workspaces.find((ws) => ws.isActive)
    const catalogContexts = pipePath ? workspaces
      .slice()
      .sort((a, b) => Number(b.isActive) - Number(a.isActive))
      .flatMap((ws) => {
        const terminal = findScanTerminal(ws.terminals)
        return terminal ? [{ pipePath, workspaceId: ws.id, terminalId: terminal.id }] : []
      }) : []
    let loadedWorkspaces: Set<string> | null = null
    if (!onlyActiveWorkspace) {
      // Use the focused canvas first, then an available local context if it is empty.
      for (const ctx of catalogContexts) {
        try {
          loadedWorkspaces = await listLoadedWorkspaces(ctx)
          break
        } catch {
          // The candidate may belong to an unloaded workspace.
        }
      }
    }

    const catalogKeys = new Set(workspaces.map((ws) => workspaceKey(ws.name, ws.workingDirectory)))
    const incompleteInventory = !onlyActiveWorkspace && (
      !loadedWorkspaces || [...loadedWorkspaces].some((key) => !catalogKeys.has(key))
    )
    const warnings: string[] = []
    if (incompleteInventory) {
      warnings.push(loadedWorkspaces
        ? 'Há workspaces sem inventário disponível nesta instalação do Maestri.'
        : 'Não foi possível obter a lista de workspaces abertos do Maestri.')
    }
    const visibleWorkspaces = workspaces.filter((ws) =>
      ws === activeWorkspace || (!onlyActiveWorkspace &&
        loadedWorkspaces?.has(workspaceKey(ws.name, ws.workingDirectory)))
    )
    const nextTerminals: MonitoredTerminal[] = []

    for (const ws of visibleWorkspaces) {
      const groundTerminal = findScanTerminal(ws.terminals)
      const floorTerminal = ws.floors.map((floor) => findScanTerminal(floor.terminals)).find(Boolean)
      const floorContext = groundTerminal ?? floorTerminal
      let loadedFloors = new Set<string>()
      if (ws.floors.length && pipePath && floorContext) {
        try {
          loadedFloors = await listLoadedFloors({ pipePath, workspaceId: ws.id, terminalId: floorContext.id })
        } catch {
          warnings.push(`Não foi possível confirmar os andares abertos de ${ws.name}.`)
        }
      } else if (ws.floors.length) {
        warnings.push(`Não foi possível confirmar os andares abertos de ${ws.name}.`)
      }

      const canvases = [
        { name: null, terminals: ws.terminals },
        ...ws.floors.filter((floor) => loadedFloors.has(floor.name.toLowerCase()))
      ]
      for (const canvas of canvases) {
        const manager = canvas.terminals.find((t) => t.isManager && !t.isUnloaded)
        const source = manager ?? findScanTerminal(canvas.terminals)
        const ctx = pipePath && source ? { pipePath, workspaceId: ws.id, terminalId: source.id } : null
        let connected = new Map<string, string | null>()
        if (ctx && canvas.terminals.some((t) => t.id !== source?.id && !t.isUnloaded)) {
          try {
            const agents = await listConnectedAgents(ctx)
            connected = new Map(agents.map((agent) => [agent.name.toLowerCase(), agent.account]))
          } catch {
            // Keep the inventory visible even when live inspection fails.
          }
        }

        // The CLI can only inspect peers, so the Maestro needs a different
        // terminal as the caller when it is the source of the scan.
        const managerPeer = manager && canvas.terminals.find((t) =>
          t.id !== manager.id && !t.isUnloaded && connected.has(t.name.toLowerCase())
        )
        const managerContext = ctx && managerPeer ? { ...ctx, terminalId: managerPeer.id } : null

        for (const t of canvas.terminals) {
          const terminalKey = t.name.toLowerCase()
          const isReachable = Boolean(ctx && t.id !== source?.id && !t.isUnloaded && connected.has(terminalKey))
          const liveAccountName = isReachable ? connected.get(terminalKey) ?? null : null
          const savedAccount = t.accountId ? accountsById.get(t.accountId.toLowerCase()) : undefined
          const liveAccount = t.agentType === 'antigravity_cli' && liveAccountName
            ? accountsByName.get(liveAccountName.toLowerCase())
            : undefined
          const isStopped = t.isUnloaded || (t.isManager && t.status === 'stopped')
          let health: MonitoredTerminal['health'] = isStopped ? 'STOPPED' : 'UNKNOWN'
          let currentModel: MonitoredTerminal['currentModel'] = null
          let lastSnippet = ''
          let inspectionLatencyMs: number | null = null

          const inspectionContext = t.id === manager?.id ? managerContext : isReachable ? ctx : null
          if (inspectionContext) {
            try {
              const startedAt = performance.now()
              const buffer = await checkTerminal(inspectionContext, t.name)
              inspectionLatencyMs = Math.round(performance.now() - startedAt)
              health = detectTerminalHealth(buffer)
              currentModel = readTerminalModel(buffer, t.agentType)
              lastSnippet = extractRecentLines(buffer, 25)
            } catch {
              // Keep the state inferred from the saved inventory.
            }
          }

          nextTerminals.push({
            id: t.id,
            name: t.name,
            workspaceId: ws.id,
            workspaceName: ws.name,
            floorName: canvas.name,
            managerTerminalId: manager?.id ?? null,
            agentType: t.agentType,
            isManager: t.isManager,
            canSwapAccount: Boolean(manager && isReachable && !t.isManager && t.agentType === 'antigravity_cli'),
            currentModel,
            accountId: liveAccount?.id ?? t.accountId,
            accountName: liveAccount?.name ?? liveAccountName ?? savedAccount?.name ?? 'Desconhecida',
            health,
            lastSnippet,
            lastCheckedAt: inspectionLatencyMs === null ? null : new Date().toISOString(),
            inspectionLatencyMs,
            isSwapping: this.swapLocks.has(t.id)
          })
        }
      }
    }

    this.pipePath = pipePath
    this.terminals = nextTerminals
    this.terminalScanWarning = warnings.length ? warnings.join(' ') : null
    this.emit()
  }
  private async evaluateAutoFailover(): Promise<void> {
    if (!this.pipePath) return

    const accountMap = new Map(this.accounts.map((a) => [a.id.toLowerCase(), a]))

    for (const terminal of this.terminals) {
      if (!terminal.canSwapAccount || terminal.inspectionLatencyMs === null) continue
      if (this.swapLocks.has(terminal.id)) continue
      if (terminal.health === 'STOPPED') continue

      const currentAcc = terminal.accountId
        ? accountMap.get(terminal.accountId.toLowerCase())
        : undefined

      const quotaCritical =
        currentAcc &&
        (currentAcc.state === 'COOLDOWN_5H' ||
          currentAcc.state === 'EXHAUSTED_WEEKLY' ||
          currentAcc.state === 'AUTH_ERROR' ||
          currentAcc.state === 'DRAINING')

      const terminalBlocked =
        terminal.health === 'RATE_LIMITED' || terminal.health === 'AUTH_ERROR'

      if (!quotaCritical && !terminalBlocked) continue
      // Wait for idle/blocked state before interrupting an active turn unless already rate-limited
      if (!terminalBlocked && terminal.health === 'ACTIVE') continue

      await this.swapTerminalToBest(terminal.id)
    }
  }

  async swapTerminalToBest(
    terminalId: string,
    explicitAccountId?: string
  ): Promise<{ ok: boolean; message: string }> {
    if (!this.pipePath) {
      return { ok: false, message: 'Maestri pipe não encontrado.' }
    }

    const terminal = this.terminals.find((t) => t.id === terminalId)
    if (!terminal) {
      return { ok: false, message: 'Terminal não encontrado.' }
    }

    if (!terminal.canSwapAccount) {
      return { ok: false, message: 'A troca exige um agente Antigravity conectado ao Maestro.' }
    }

    if (this.swapLocks.has(terminalId)) {
      return { ok: false, message: 'Troca já está em andamento para este terminal.' }
    }

    this.swapLocks.add(terminalId)
    this.terminals = this.terminals.map((t) =>
      t.id === terminalId ? { ...t, isSwapping: true } : t
    )
    this.emit()

    try {
      await this.refreshQuotasLive()

      const excludedSet = new Set(this.config.excludedAccountIds.map((id) => id.toLowerCase()))
      const reservedAccountId = this.config.maestroDedicatedAccountId ?? this.currentMaestroPresetAccountId
      if (this.config.excludeMaestroFromPool && reservedAccountId) {
        excludedSet.add(reservedAccountId.toLowerCase())
      }
      const effectiveExcluded = Array.from(excludedSet)

      const target = explicitAccountId
        ? this.accounts.find((a) => a.id === explicitAccountId) ?? null
        : pickBestAccount(this.accounts, effectiveExcluded, terminal.accountId, this.config.fallbackRoutingPolicy)

      if (!target) {
        const msg = `Nenhuma conta saudável disponível para substituir "${terminal.accountName}".`
        await this.pushEvent('warn', msg, {
          workspaceName: terminal.workspaceName,
          terminalName: terminal.name
        })
        this.notify('Relay — Sem conta disponível', msg)
        return { ok: false, message: msg }
      }

      const startedAt = performance.now()
      const result = await executeTerminalFailover({
        pipePath: this.pipePath,
        terminal,
        targetAccount: target,
        sendHandoff: true
      })

      if (result.ok) {
        this.lastFailoverDurationMs = Math.round(performance.now() - startedAt)
        const msg = `Trocado "${terminal.name}" (${terminal.workspaceName}): ${result.fromAccount} → ${result.toAccount}${result.handoffSent ? ' (handoff enviado)' : ''}`
        await this.pushEvent('success', msg, {
          workspaceName: terminal.workspaceName,
          terminalName: terminal.name,
          fromAccount: result.fromAccount,
          toAccount: result.toAccount
        })
        this.notify('Relay — Conta trocada', msg)
        await this.pollTerminals(false)
        return { ok: true, message: msg }
      }

      const errMsg = `Falha ao trocar "${terminal.name}": ${result.error ?? 'erro desconhecido'}`
      await this.pushEvent('error', errMsg, {
        workspaceName: terminal.workspaceName,
        terminalName: terminal.name
      })
      return { ok: false, message: errMsg }
    } finally {
      this.swapLocks.delete(terminalId)
      this.terminals = this.terminals.map((t) =>
        t.id === terminalId ? { ...t, isSwapping: false } : t
      )
      this.emit()
    }
  }
}
