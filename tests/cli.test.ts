import { beforeEach, expect, it, vi } from 'vitest'
import { fetchAvailableAccountModels, fetchLiveAccountUsage } from '../src/main/quota/accountCollector'
import { listConnectedAgents, listLoadedFloors, listLoadedWorkspaces, replaceTerminalAccount } from '../src/main/maestri/cliBridge'

const { execFile } = vi.hoisted(() => ({ execFile: vi.fn() }))
vi.mock('node:child_process', () => ({ execFile }))
const acc = { id: 'a', name: 'Alpha', kind: 'antigravity', cli: 'agy' }
const ctx = { workspaceId: 'w', terminalId: 't', pipePath: 'mock-pipe' }

beforeEach(() => execFile.mockReset())

function output(stdout: string) {
  execFile.mockImplementationOnce((_file, _args, _options, callback) => callback(null, { stdout }))
}

it('interpreta cotas da CLI e usa o timeout da configuração', async () => {
  output(JSON.stringify({ command: { data: { groups: [
    { name: 'Gemini Models', buckets: [
      { id: 'gemini-5h', remaining_fraction: 0.12, reset_time: '1970-01-01T00:00:00Z' },
      { id: 'gemini-weekly', remaining_fraction: 0.85 }
    ] },
    { name: 'Claude and GPT models', buckets: [{ id: '3p-weekly', remaining_fraction: 0.42 }] }
  ] } } }))
  expect(await fetchLiveAccountUsage(acc, 2, 12, 5, 37)).toMatchObject({
    state: 'DRAINING', gemini5hRemaining: 12, gemini5hResetsAt: null,
    geminiWeeklyRemaining: 85, thirdPartyWeeklyRemaining: 42, activeTerminalCount: 2,
    plan: 'PRO'
  })
  expect(execFile).toHaveBeenCalledWith(expect.any(String), ['-p', '/usage', '--output-format', 'json'],
    expect.objectContaining({ timeout: 37000 }), expect.any(Function))
})

it('identifica plano FREE na CLI quando possui apenas gemini-weekly e sem modelos Pro', async () => {
  output(JSON.stringify({ command: { data: { groups: [
    { name: 'Gemini Models', buckets: [{ id: 'gemini-weekly', remaining_fraction: 0.9 }] }
  ] } } }))
  expect(await fetchLiveAccountUsage(acc, 0, 12, 5, 20)).toMatchObject({ plan: 'FREE' })
})

it('identifica plano PRO na CLI quando buckets de terceiros possuem reset time ativo', async () => {
  output(JSON.stringify({ command: { data: { groups: [
    { name: 'Gemini Models', buckets: [{ id: 'gemini-5h', remaining_fraction: 0.9 }] },
    { name: 'Claude and GPT models', buckets: [{ id: '3p-weekly', remaining_fraction: 0.5, reset_time: '2026-03-01T12:00:00Z' }] }
  ] } } }))
  expect(await fetchLiveAccountUsage(acc, 0, 12, 5, 20)).toMatchObject({ plan: 'PRO' })
})

it('marca erro de autenticação na coleta de cotas', async () => {
  execFile.mockImplementationOnce((_file, _args, _options, callback) => callback(new Error('Eligibility check failed')))
  expect(await fetchLiveAccountUsage(acc, 0, 12, 5, 20)).toMatchObject({ state: 'AUTH_ERROR', score: -1, plan: 'UNKNOWN' })
})

it('extrai modelos por conta, ignora ruído e distingue falha de autenticação', async () => {
  output('banner\r\nmodel-1\tModelo antigo\r\nmodel-1\tModelo atual\r\nmodel-2\tModelo 2')
  expect(await fetchAvailableAccountModels(acc)).toEqual({ ok: true, models: [
    { id: 'model-1', label: 'Modelo atual' }, { id: 'model-2', label: 'Modelo 2' }
  ] })
  expect(execFile.mock.lastCall?.[2].env.USERPROFILE).toMatch(/[\\/]accounts[\\/]a$/)
  expect(execFile.mock.lastCall?.[2].env.GEMINI_API_KEY).toBeUndefined()
  execFile.mockImplementationOnce((_file, _args, _options, callback) => callback(new Error('Authentication required')))
  expect(await fetchAvailableAccountModels(acc)).toMatchObject({ ok: false, message: expect.stringContaining('Autentique') })
})

it('interpreta agentes, workspaces e andares sem incluir portais ou ambientes descarregados', async () => {
  output('Connected agents:\n- name: "Worker", role: "Dev", account: "Alpha"\nConnected portals:\n- name: "QA"')
  output('"Relay" — G:\\Projetos\\Relay\\ · active\n"Outros" — G:\\Outros · unloaded')
  output('"QA" — aberto\n"Dev" — fechado · unloaded')
  expect(await listConnectedAgents(ctx)).toEqual([{ name: 'Worker', role: 'Dev', account: 'Alpha' }])
  expect(await listLoadedWorkspaces(ctx)).toEqual(new Set(['relay\ng:/projetos/relay']))
  expect(await listLoadedFloors(ctx)).toEqual(new Set(['qa']))
})

it('passa o contexto e os argumentos de troca separadamente à CLI', async () => {
  output('ok')
  expect(await replaceTerminalAccount(ctx, 'Worker QA', 'Conta Beta')).toBe('ok')
  expect(execFile).toHaveBeenCalledWith(expect.any(String),
    ['recruit', '--replace', 'Worker QA', '--account', 'Conta Beta'],
    expect.objectContaining({ timeout: 20000 }), expect.any(Function))
})
