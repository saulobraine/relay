import { expect, it, vi } from 'vitest'
import { relayApi } from '../src/preload'

const electron = vi.hoisted(() => ({
  ipcRenderer: { invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn() },
  contextBridge: { exposeInMainWorld: vi.fn() }
}))
vi.mock('electron', () => electron)

it('expõe a API do Relay e encaminha comandos ao canal correto', async () => {
  vi.resetModules()
  const { relayApi } = await import('../src/preload')
  expect(electron.contextBridge.exposeInMainWorld).toHaveBeenCalledWith('relay', relayApi)
  await relayApi.getSnapshot()
  await relayApi.refreshQuotas()
  await relayApi.refreshTerminals()
  await relayApi.swapTerminal('t', 'a')
  await relayApi.getAccountModels('a')
  await relayApi.updateConfig({ autoFailover: false })
  await relayApi.clearLogs()
  expect(electron.ipcRenderer.invoke.mock.calls).toEqual([
    ['relay:getSnapshot'], ['relay:refreshQuotas'], ['relay:refreshTerminals'],
    ['relay:swapTerminal', 't', 'a'], ['relay:getAccountModels', 'a'],
    ['relay:updateConfig', { autoFailover: false }], ['relay:clearLogs']
  ])
})

it.each([
  ['relay:snapshot', relayApi.onSnapshot], ['relay:windowMaximized', relayApi.onWindowMaximized]
] as const)('libera a inscrição no canal %s', (channel, subscribe) => {
  const listener = vi.fn()
  const unsubscribe = subscribe(listener)
  const handler = electron.ipcRenderer.on.mock.lastCall?.[1]
  handler({ sender: 'ipc' }, true)
  expect(listener).toHaveBeenCalledWith(true)
  unsubscribe()
  expect(electron.ipcRenderer.removeListener).toHaveBeenCalledWith(channel, handler)
})

