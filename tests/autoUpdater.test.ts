import { describe, expect, it, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import type { RelayScheduler } from '../src/main/engine/scheduler'

const { mockAutoUpdater, flags } = vi.hoisted(() => {
  const { EventEmitter: EE } = require('node:events')
  const emitter = new EE()
  emitter.autoDownload = false
  emitter.autoInstallOnAppQuit = false
  emitter.checkForUpdatesAndNotify = vi.fn().mockResolvedValue(null)
  return {
    mockAutoUpdater: emitter,
    flags: { isPackaged: false }
  }
})

vi.mock('electron-updater', () => ({
  autoUpdater: mockAutoUpdater
}))

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return flags.isPackaged
    }
  }
}))

import { initAutoUpdater } from '../src/main/engine/autoUpdater'

describe('autoUpdater', () => {
  beforeEach(() => {
    mockAutoUpdater.removeAllListeners()
    mockAutoUpdater.autoDownload = false
    mockAutoUpdater.autoInstallOnAppQuit = false
    mockAutoUpdater.checkForUpdatesAndNotify.mockClear()
    flags.isPackaged = false
  })

  it('configura autoDownload e autoInstallOnAppQuit e nao checa updates em desenvolvimento', () => {
    const scheduler = { logEvent: vi.fn() } as unknown as RelayScheduler
    initAutoUpdater(scheduler)

    expect(mockAutoUpdater.autoDownload).toBe(true)
    expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(true)
    expect(mockAutoUpdater.checkForUpdatesAndNotify).not.toHaveBeenCalled()
  })

  it('checa updates se app.isPackaged for true', () => {
    flags.isPackaged = true
    const scheduler = { logEvent: vi.fn() } as unknown as RelayScheduler
    initAutoUpdater(scheduler)

    expect(mockAutoUpdater.checkForUpdatesAndNotify).toHaveBeenCalled()
  })

  it('registra eventos no stream de logs do scheduler', () => {
    const logEvent = vi.fn()
    const scheduler = { logEvent } as unknown as RelayScheduler
    initAutoUpdater(scheduler)

    mockAutoUpdater.emit('update-available', { version: '1.2.0' })
    expect(logEvent).toHaveBeenCalledWith('info', expect.stringContaining('v1.2.0'))

    mockAutoUpdater.emit('update-downloaded', { version: '1.2.0' })
    expect(logEvent).toHaveBeenCalledWith('success', expect.stringContaining('v1.2.0'))

    mockAutoUpdater.emit('error', new Error('Network timeout'))
    expect(logEvent).toHaveBeenCalledWith('warn', expect.stringContaining('Network timeout'))
  })
})
