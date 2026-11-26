import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as bridge from '../src/main/maestri/cliBridge'
import { executeTerminalFailover } from '../src/main/engine/failoverEngine'
import { account, terminal } from './fixtures'

vi.mock('../src/main/maestri/cliBridge', () => ({
  askTerminal: vi.fn(), checkTerminal: vi.fn(), replaceTerminalAccount: vi.fn()
}))

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.mocked(bridge.checkTerminal).mockResolvedValue('histórico atual')
})
afterEach(() => vi.useRealTimers())

const params = { pipePath: 'fixture', terminal: terminal(), targetAccount: account({ name: 'Beta' }) }

it('bloqueia a troca quando o terminal não tem Maestro', async () => {
  expect(await executeTerminalFailover({ ...params, terminal: terminal({ managerTerminalId: null }) }))
    .toMatchObject({ ok: false, handoffSent: false })
  expect(bridge.replaceTerminalAccount).not.toHaveBeenCalled()
})

it('propaga o erro de troca sem enviar contexto', async () => {
  vi.mocked(bridge.replaceTerminalAccount).mockRejectedValueOnce(new Error('processo indisponível'))
  expect(await executeTerminalFailover(params)).toMatchObject({ ok: false, error: 'processo indisponível' })
  expect(bridge.askTerminal).not.toHaveBeenCalled()
})

it('aguarda o novo prompt e envia o contexto da sessão', async () => {
  vi.mocked(bridge.checkTerminal)
    .mockResolvedValueOnce('histórico atual').mockResolvedValueOnce('Antigravity CLI\n>')
  const result = executeTerminalFailover(params)
  await vi.advanceTimersByTimeAsync(1500)
  expect(await result).toMatchObject({ ok: true, handoffSent: true })
  expect(bridge.replaceTerminalAccount).toHaveBeenCalledWith(expect.objectContaining({ terminalId: 'manager' }), 'Worker 1', 'Beta')
  expect(bridge.askTerminal).toHaveBeenCalledWith(expect.anything(), 'Worker 1', expect.stringContaining('histórico atual'), 25000)
})

it('preserva o sucesso da troca quando o prompt excede o timeout', async () => {
  const result = executeTerminalFailover(params)
  await vi.advanceTimersByTimeAsync(18000)
  expect(await result).toMatchObject({ ok: true, handoffSent: false, error: expect.stringContaining('timeout') })
  expect(bridge.askTerminal).not.toHaveBeenCalled()
})

it('permite troca manual sem handoff', async () => {
  expect(await executeTerminalFailover({ ...params, sendHandoff: false })).toMatchObject({ ok: true, handoffSent: false })
  expect(bridge.askTerminal).not.toHaveBeenCalled()
})
