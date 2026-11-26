import { expect, it, vi } from 'vitest'
import { config, snapshot } from './fixtures'

it('inicializa o Electron e conecta o preload aos comandos do processo principal', async () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const pollTerminals = vi.fn()
  const refreshCachedQuotas = vi.fn()
  const swapTerminalToBest = vi.fn()
  const updateConfig = vi.fn().mockResolvedValue({ ...config, openAtLogin: false })
  const setLoginItemSettings = vi.fn()
  const getSnapshot = vi.fn(() => snapshot())
  const win = {
    on: vi.fn(), loadFile: vi.fn(), loadURL: vi.fn(), webContents: { send: vi.fn() }
  }
  const tray = { setToolTip: vi.fn(), on: vi.fn(), setContextMenu: vi.fn() }

  vi.doMock('electron', () => ({
    app: {
      requestSingleInstanceLock: () => true, whenReady: () => Promise.resolve(),
      on: vi.fn(), isPackaged: true, setLoginItemSettings
    },
    BrowserWindow: class { constructor() { return win } },
    Tray: class { constructor() { return tray } },
    Menu: { buildFromTemplate: vi.fn() },
    nativeImage: { createFromPath: () => ({ resize: vi.fn() }) },
    ipcMain: { handle: (channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler) },
    ipcRenderer: { invoke: (channel: string, ...args: unknown[]) => handlers.get(channel)!(undefined, ...args) },
    contextBridge: { exposeInMainWorld: vi.fn() }
  }))
  vi.doMock('../src/main/engine/scheduler', () => ({
    RelayScheduler: class {
      init = vi.fn()
      subscribe = vi.fn((listener) => listener(getSnapshot()))
      getSnapshot = getSnapshot
      pollTerminals = pollTerminals
      refreshCachedQuotas = refreshCachedQuotas
      swapTerminalToBest = swapTerminalToBest
      updateConfig = updateConfig
    }
  }))
  vi.doMock('../src/main/maestri/workspaceReader', () => ({
    readAntigravityAccounts: async () => [{ id: 'a' }]
  }))
  vi.doMock('../src/main/quota/accountCollector', () => ({
    fetchAvailableAccountModels: async () => ({ ok: true, models: [{ id: 'm', label: 'Modelo' }] })
  }))

  await import('../src/main/index')
  const { relayApi } = await import('../src/preload')
  expect(win.webContents.send).toHaveBeenCalledWith('relay:snapshot', expect.objectContaining({ config }))
  expect(handlers.size).toBe(11)
  expect(await relayApi.getSnapshot()).toMatchObject({ config })
  await relayApi.refreshQuotas()
  expect(refreshCachedQuotas).toHaveBeenCalledOnce()
  await relayApi.refreshTerminals()
  expect(pollTerminals).toHaveBeenNthCalledWith(2, false)
  await relayApi.swapTerminal('t', 'a')
  expect(swapTerminalToBest).toHaveBeenCalledWith('t', 'a')
  expect(await relayApi.getAccountModels('a')).toMatchObject({ ok: true, models: [{ id: 'm' }] })
  expect(await relayApi.getAccountModels('ausente')).toMatchObject({ ok: false })
  expect(await relayApi.updateConfig({ openAtLogin: false })).toMatchObject({ openAtLogin: false })
  expect(setLoginItemSettings).toHaveBeenLastCalledWith({ openAtLogin: false, args: ['--minimized'] })
})
