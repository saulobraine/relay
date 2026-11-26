import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig, loadEvents, saveConfig, saveEvents } from '../src/main/store'

const electron = vi.hoisted(() => ({ app: { getPath: vi.fn() } }))
vi.mock('electron', () => electron)

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'relay-test-'))
  electron.app.getPath.mockReturnValue(dir)
})
afterEach(() => rm(dir, { recursive: true, force: true }))

it('migra configuração antiga e persiste os novos controles', async () => {
  await writeFile(join(dir, 'relay-config.json'), JSON.stringify({ autoFailover: false }))
  const config = await loadConfig()
  expect(config).toMatchObject({ autoFailover: false, quotaTimeoutSeconds: 20, fallbackRoutingPolicy: 'score' })
  await saveConfig({ ...config, quotaTimeoutSeconds: 35, fallbackRoutingPolicy: 'least-loaded' })
  expect(await loadConfig()).toMatchObject({ quotaTimeoutSeconds: 35, fallbackRoutingPolicy: 'least-loaded' })
})

it('recupera os padrões quando os arquivos estão corrompidos', async () => {
  await writeFile(join(dir, 'relay-config.json'), '{')
  await writeFile(join(dir, 'relay-events.json'), '{')
  expect((await loadConfig()).autoFailover).toBe(true)
  expect(await loadEvents()).toEqual([])
})

it('limita o histórico persistido a 150 eventos e permite limpá-lo', async () => {
  const events = Array.from({ length: 151 }, (_, index) => ({
    id: String(index), timestamp: new Date(0).toISOString(), level: 'info' as const, message: 'evento'
  }))
  await saveEvents(events)
  expect(await loadEvents()).toEqual(events.slice(0, 150))
  await saveEvents([])
  expect(JSON.parse(await readFile(join(dir, 'relay-events.json'), 'utf8'))).toEqual([])
})
