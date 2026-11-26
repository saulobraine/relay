import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readAntigravityAccounts, readMaestroPresetAccountId, readWorkspaces, setMaestroPresetAccountId } from '../src/main/maestri/workspaceReader'
import { discoverMaestriPipe } from '../src/main/maestri/pipeDiscovery'
import { readCachedUsageStatus } from '../src/main/quota/accountCollector'

let dir: string
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'relay-maestri-test-'))
  vi.spyOn(os, 'homedir').mockReturnValue(dir)
})
afterEach(() => fs.rm(dir, { recursive: true, force: true }))

async function write(relativePath: string, payload: unknown) {
  const file = path.join(dir, '.maestri', relativePath)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, JSON.stringify(payload))
}

it('carrega contas locais e atualiza o preset sem perder outras preferências', async () => {
  await write('preferences.json', { payload: {
    agentAccounts: [
      { id: 'a', name: 'Alpha', cli: 'antigravity' },
      { id: 'b', name: 'Beta', cli: 'codex' },
      { id: 'c', name: 'Remota', cli: 'antigravity', connection: {} }
    ],
    agentPresets: [{ name: 'Maestro', accountId: 'a' }]
  } })
  expect(await readMaestroPresetAccountId()).toBe('a')
  expect(await setMaestroPresetAccountId('nova')).toBe(true)
  expect(await readMaestroPresetAccountId()).toBe('nova')
  expect(await readAntigravityAccounts()).toEqual([{ id: 'a', name: 'Alpha', cli: 'antigravity', kind: 'signIn' }])
})

it('lê terminal do workspace e de seu andar, ignorando nós que não são terminais', async () => {
  const savedTerminal = (id: string) => ({ content: { terminal: { _0: { id, name: id } } } })
  await write('app-state.json', { payload: { activeWorkspaceId: 'WORKSPACE' } })
  await write('workspaces/demo/workspace.json', { payload: {
    id: 'workspace', name: 'Demo', nodes: [{}, savedTerminal('agente')],
    floors: [{ id: 'f', name: 'Andar', nodes: [savedTerminal('agente-andar')] }]
  } })
  await write('workspaces/sem-id/workspace.json', { payload: {} })
  expect(await readWorkspaces()).toMatchObject([{
    id: 'workspace', isActive: true, terminals: [{ id: 'agente', accountId: null }],
    floors: [{ id: 'f', terminals: [{ id: 'agente-andar' }] }]
  }])
})

it('carrega o cache de cotas e deixa contas sem dados como desconhecidas', async () => {
  await write('usage/providers/.status.json', { providers: [{
    id: 'account-a1', name: 'Alpha', state: 'ready',
    meters: [{ id: 'Gemini Models', windows: [{ id: 'gemini-5h', usedPercent: 27.5 }] }]
  }] })
  const accounts = [
    { id: 'A-1', name: 'Alpha', cli: 'antigravity', kind: 'signIn' },
    { id: 'B-2', name: 'Beta', cli: 'antigravity', kind: 'signIn' }
  ]
  expect(await readCachedUsageStatus(accounts, new Map([['a-1', 3]]), 12, 5)).toMatchObject([
    { id: 'A-1', gemini5hRemaining: 72.5, activeTerminalCount: 3, state: 'READY' },
    { id: 'B-2', gemini5hRemaining: null, state: 'UNKNOWN' }
  ])
})

it('reconhece o pipe de Maestri e tolera falha de leitura', async () => {
  const readdir = vi.spyOn(fs, 'readdir')
  readdir.mockImplementationOnce(async () => ['outro', 'maestri-abc123'] as never)
  expect(await discoverMaestriPipe()).toMatch(/maestri-abc123$/)
  readdir.mockRejectedValueOnce(new Error('indisponível'))
  expect(await discoverMaestriPipe()).toBeNull()
})
