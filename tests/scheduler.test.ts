import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RelayScheduler } from '../src/main/engine/scheduler'
import type { PersistedTerminalNode, PersistedWorkspace } from '../src/main/maestri/workspaceReader'
import { account, config } from './fixtures'

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(), loadEvents: vi.fn(), saveConfig: vi.fn(), saveEvents: vi.fn(),
  discoverMaestriPipe: vi.fn(), readAntigravityAccounts: vi.fn(), readMaestroPresetAccountId: vi.fn(),
  readWorkspaces: vi.fn(), setMaestroPresetAccountId: vi.fn(), readCachedUsageStatus: vi.fn(),
  fetchAllLiveAccountUsages: vi.fn(), executeTerminalFailover: vi.fn(),
  listConnectedAgents: vi.fn(), checkTerminal: vi.fn(), listLoadedWorkspaces: vi.fn(), listLoadedFloors: vi.fn()
}))
vi.mock('electron', () => ({ Notification: { isSupported: () => false } }))
vi.mock('../src/main/store', () => mocks)
vi.mock('../src/main/maestri/pipeDiscovery', () => mocks)
vi.mock('../src/main/maestri/workspaceReader', () => mocks)
vi.mock('../src/main/quota/accountCollector', () => mocks)
vi.mock('../src/main/engine/failoverEngine', () => mocks)
vi.mock('../src/main/maestri/cliBridge', async (original) => ({
  ...await original<typeof import('../src/main/maestri/cliBridge')>(), ...mocks
}))

function node(id: string, isManager = false): PersistedTerminalNode {
  return { id, name: id, agentType: 'antigravity_cli', accountId: 'a', isManager, isUnloaded: false, status: 'running' }
}
function workspace(id: string, isActive = false): PersistedWorkspace {
  return { id, name: id, isActive, workingDirectory: '', terminals: [node(id + '-manager', true), node(id + '-agent')], floors: [] }
}

let scheduler: RelayScheduler
beforeEach(async () => {
  vi.resetAllMocks()
  const initial = workspace('primeiro', true)
  initial.floors = [
    { id: 'f1', name: 'Aberto', terminals: [node('floor-agent')] },
    { id: 'f2', name: 'Fechado', terminals: [node('hidden-floor-agent')] }
  ]
  mocks.loadConfig.mockResolvedValue(config)
  mocks.loadEvents.mockResolvedValue([{ id: 'log', timestamp: '2026-01-01T00:00:00Z', level: 'info', message: 'início' }])
  mocks.discoverMaestriPipe.mockResolvedValue('fixture')
  mocks.readAntigravityAccounts.mockResolvedValue([{ id: 'a', name: 'Alpha', cli: 'agy' }])
  mocks.readMaestroPresetAccountId.mockResolvedValue('reserved')
  mocks.readCachedUsageStatus.mockResolvedValue([account()])
  mocks.readWorkspaces.mockResolvedValue([initial, workspace('segundo'), workspace('fechado')])
  mocks.listLoadedWorkspaces.mockResolvedValue(new Set(['primeiro\n', 'segundo\n']))
  mocks.listLoadedFloors.mockResolvedValue(new Set(['aberto']))
  mocks.listConnectedAgents.mockImplementation(({ workspaceId }) => [{ name: workspaceId + '-agent', account: 'Alpha' }])
  mocks.checkTerminal.mockResolvedValue('? for shortcuts  Gemini 3 Pro · high')
  scheduler = new RelayScheduler()
  await scheduler.init()
})
afterEach(() => scheduler.stop())

it('varre workspaces e andares abertos e permite limitar ao workspace em foco', async () => {
  await scheduler.pollTerminals(false)
  expect(scheduler.getSnapshot().terminals.map(({ id }) => id)).toEqual([
    'primeiro-manager', 'primeiro-agent', 'floor-agent', 'segundo-manager', 'segundo-agent'
  ])
  expect(scheduler.getSnapshot().terminals.find(({ id }) => id === 'segundo-agent'))
    .toMatchObject({ accountId: 'a', canSwapAccount: true, health: 'IDLE', currentModel: { name: 'Gemini 3 Pro' } })
  await scheduler.updateConfig({ onlyActiveWorkspace: true })
  expect(scheduler.getSnapshot().terminals.every(({ workspaceId }) => workspaceId === 'primeiro')).toBe(true)
  expect(mocks.saveConfig).toHaveBeenCalledWith(expect.objectContaining({ onlyActiveWorkspace: true }))
})

it('mantém o inventário em falha de inspeção e avisa quando o catálogo falha', async () => {
  mocks.listLoadedWorkspaces.mockRejectedValue(new Error('offline'))
  mocks.checkTerminal.mockRejectedValue(new Error('offline'))
  await scheduler.pollTerminals(false)
  expect(scheduler.getSnapshot()).toMatchObject({ terminalScanWarning: expect.stringContaining('workspaces abertos') })
  expect(scheduler.getSnapshot().terminals.find(({ id }) => id === 'primeiro-agent'))
    .toMatchObject({ health: 'UNKNOWN', inspectionLatencyMs: null })
})

it('reage a 429 e escolhe uma conta elegível conforme a política, excluindo a reserva do Maestro', async () => {
  await scheduler.updateConfig({ fallbackRoutingPolicy: 'least-loaded', quotaTimeoutSeconds: 35 })
  mocks.listConnectedAgents.mockResolvedValue([{ name: 'primeiro-agent', account: 'Alpha' }])
  mocks.checkTerminal.mockResolvedValue('HTTP 429')
  mocks.fetchAllLiveAccountUsages.mockResolvedValue([
    account(), account({ id: 'reserved', score: 100 }),
    account({ id: 'busy', activeTerminalCount: 4, score: 98 }), account({ id: 'idle', score: 70 })
  ])
  mocks.executeTerminalFailover.mockResolvedValue({ ok: true, fromAccount: 'Alpha', toAccount: 'Beta', handoffSent: true })
  await scheduler.pollTerminals()
  expect(mocks.fetchAllLiveAccountUsages).toHaveBeenCalledWith(expect.any(Array), expect.any(Map), 12, 5, 35)
  expect(mocks.executeTerminalFailover).toHaveBeenCalledOnce()
  expect(mocks.executeTerminalFailover).toHaveBeenCalledWith(expect.objectContaining({
    terminal: expect.objectContaining({ id: 'primeiro-agent' }),
    targetAccount: expect.objectContaining({ id: 'idle' })
  }))
  expect(scheduler.getSnapshot().events[0]).toMatchObject({ level: 'success', toAccount: 'Beta' })
})

it('persiste a limpeza e notifica assinantes ativos', async () => {
  const listener = vi.fn()
  const unsubscribe = scheduler.subscribe(listener)
  await scheduler.clearLogs()
  expect(mocks.saveEvents).toHaveBeenCalledWith([])
  expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ events: [] }))
  unsubscribe()
  await scheduler.clearLogs()
  expect(listener).toHaveBeenCalledTimes(2)
})

it('protege a conta escolhida no Relay mesmo se o Maestri não gravar o preset', async () => {
  mocks.setMaestroPresetAccountId.mockResolvedValue(false)
  await scheduler.updateConfig({ maestroDedicatedAccountId: 'nova-reserva' })
  await scheduler.pollTerminals(false)
  mocks.fetchAllLiveAccountUsages.mockResolvedValue([
    account(),
    account({ id: 'nova-reserva', score: 100 }),
    account({ id: 'reserved', score: 90 })
  ])
  mocks.executeTerminalFailover.mockResolvedValue({ ok: true, fromAccount: 'Alpha', toAccount: 'Beta' })

  await scheduler.swapTerminalToBest('primeiro-agent')

  expect(scheduler.getSnapshot()).toMatchObject({
    config: { maestroDedicatedAccountId: 'nova-reserva' },
    currentMaestroPresetAccountId: 'reserved'
  })
  expect(mocks.executeTerminalFailover).toHaveBeenCalledWith(expect.objectContaining({
    targetAccount: expect.objectContaining({ id: 'reserved' })
  }))
})

it('restringe a checagem e auto-failover ao maestro quando monitorOnlyMaestro está ativo', async () => {
  await scheduler.updateConfig({ monitorOnlyMaestro: true })
  mocks.checkTerminal.mockClear()
  mocks.checkTerminal.mockResolvedValue('? for shortcuts  Gemini 3 Pro · high')

  await scheduler.pollTerminals(false)
  const snap = scheduler.getSnapshot()
  const agent = snap.terminals.find(({ id }) => id === 'segundo-agent')
  expect(agent).toMatchObject({ health: 'UNKNOWN', inspectionLatencyMs: null })

  // Auto failover ignores non-managers
  mocks.fetchAllLiveAccountUsages.mockClear()
  mocks.executeTerminalFailover.mockClear()
  await scheduler.pollTerminals(true)
  expect(mocks.executeTerminalFailover).not.toHaveBeenCalled()
})


