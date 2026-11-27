import { describe, expect, it, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import type { RelayScheduler } from '../src/main/engine/scheduler'

const { mockAutoUpdater, flags, notificationShow } = vi.hoisted(() => {
  const { EventEmitter: EE } = require('node:events')
  const emitter = new EE()
  emitter.autoDownload = false
  emitter.autoInstallOnAppQuit = false
  emitter.checkForUpdatesAndNotify = vi.fn().mockResolvedValue(null)
  emitter.quitAndInstall = vi.fn()
  const showMock = vi.fn()
  return {
    mockAutoUpdater: emitter,
    flags: { isPackaged: false, notificationSupported: true },
    notificationShow: showMock
  }
})

vi.mock('electron-updater', () => ({
  autoUpdater: mockAutoUpdater
}))

vi.mock('electron', () => {
  class MockNotification {
    static isSupported() {
      return flags.notificationSupported
    }
    show = notificationShow
  }
  return {
    app: {
      get isPackaged() {
        return flags.isPackaged
      }
    },
    Notification: MockNotification
  }
})

import { checkForUpdates, initAutoUpdater, installUpdate } from '../src/main/engine/autoUpdater'

describe('autoUpdater', () => {
  beforeEach(() => {
    mockAutoUpdater.removeAllListeners()
    mockAutoUpdater.autoDownload = false
    mockAutoUpdater.autoInstallOnAppQuit = false
    mockAutoUpdater.checkForUpdatesAndNotify.mockClear()
    mockAutoUpdater.quitAndInstall.mockClear()
    notificationShow.mockClear()
    flags.isPackaged = false
    flags.notificationSupported = true
  })

  it('configura autoDownload e autoInstallOnAppQuit e nao checa updates em desenvolvimento', () => {
    const scheduler = { logEvent: vi.fn(), setUpdateStatus: vi.fn(), getUpdateStatus: () => ({ state: 'idle' }) } as unknown as RelayScheduler
    initAutoUpdater(scheduler)

    expect(mockAutoUpdater.autoDownload).toBe(true)
    expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(true)
    expect(mockAutoUpdater.checkForUpdatesAndNotify).not.toHaveBeenCalled()
  })

  it('checa updates se app.isPackaged for true', () => {
    flags.isPackaged = true
    const scheduler = { logEvent: vi.fn(), setUpdateStatus: vi.fn(), getUpdateStatus: () => ({ state: 'idle' }) } as unknown as RelayScheduler
    initAutoUpdater(scheduler)

    expect(mockAutoUpdater.checkForUpdatesAndNotify).toHaveBeenCalled()
    expect(scheduler.setUpdateStatus).toHaveBeenCalledWith({ state: 'checking' })
  })

  it('registra eventos, atualiza status e dispara notificacao nativa ao baixar update', () => {
    const logEvent = vi.fn()
    const setUpdateStatus = vi.fn()
    const scheduler = { logEvent, setUpdateStatus, getUpdateStatus: () => ({ state: 'idle' }) } as unknown as RelayScheduler
    initAutoUpdater(scheduler)

    mockAutoUpdater.emit('update-available', { version: '1.2.0' })
    expect(setUpdateStatus).toHaveBeenCalledWith({ state: 'downloading', version: '1.2.0' })
    expect(logEvent).toHaveBeenCalledWith('info', expect.stringContaining('v1.2.0'))

    mockAutoUpdater.emit('update-downloaded', { version: '1.2.0' })
    expect(setUpdateStatus).toHaveBeenCalledWith({ state: 'downloaded', version: '1.2.0' })
    expect(logEvent).toHaveBeenCalledWith('success', expect.stringContaining('v1.2.0'))
    expect(notificationShow).toHaveBeenCalledOnce()

    mockAutoUpdater.emit('error', new Error('Network timeout'))
    expect(setUpdateStatus).toHaveBeenCalledWith({ state: 'error', error: 'Network timeout' })
    expect(logEvent).toHaveBeenCalledWith('warn', expect.stringContaining('Network timeout'))
  })

  it('permite instalar atualizacao e checar atualizacoes explicitamente', async () => {
    installUpdate()
    expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalledOnce()

    flags.isPackaged = true
    const setUpdateStatus = vi.fn()
    const scheduler = { setUpdateStatus, getUpdateStatus: () => ({ state: 'checking' }) } as unknown as RelayScheduler
    await checkForUpdates(scheduler)
    expect(setUpdateStatus).toHaveBeenCalledWith({ state: 'checking' })
    expect(mockAutoUpdater.checkForUpdatesAndNotify).toHaveBeenCalledOnce()
  })
})
