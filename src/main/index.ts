import { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray } from 'electron'
import path from 'node:path'
import type { AccountModelResult, RelayConfig } from '../shared/types'
import { RelayScheduler } from './engine/scheduler'
import { checkForUpdates, initAutoUpdater, installUpdate } from './engine/autoUpdater'
import { readAntigravityAccounts } from './maestri/workspaceReader'
import { fetchAvailableAccountModels } from './quota/accountCollector'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

const scheduler = new RelayScheduler()
const iconPath = path.join(__dirname, '../../resources/icon.png')

function createTrayIcon(): Electron.NativeImage {
  return nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 740,
    minWidth: 860,
    minHeight: 580,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    icon: iconPath,
    backgroundColor: '#090d16',
    title: 'Relay — Maestri Account Broker',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('relay:windowMaximized', true)
  })
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('relay:windowMaximized', false)
  })

  mainWindow.on('ready-to-show', () => {
    const startMinimized = process.argv.includes('--minimized')
    if (!startMinimized) {
      mainWindow?.show()
    }
  })

  mainWindow.on('close', (event) => {
    if (!isQuitting && scheduler.getSnapshot().config.minimizeToTray) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

function setupTray(): void {
  tray = new Tray(createTrayIcon())
  tray.setToolTip('Relay — Maestri Account Broker')
  tray.on('double-click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })

  const menu = Menu.buildFromTemplate([
    {
      label: 'Abrir Relay',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      }
    },
    {
      label: 'Atualizar Cotas Agora',
      click: () => {
        void scheduler.refreshCachedQuotas()
      }
    },
    { type: 'separator' },
    {
      label: 'Sair',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])
  tray.setContextMenu(menu)
}

function applyAutoLaunch(enabled: boolean): void {
  if (app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      args: ['--minimized']
    })
  }
}

function registerIpc(): void {
  ipcMain.handle('relay:getSnapshot', () => scheduler.getSnapshot())
  ipcMain.handle('relay:refreshQuotas', () => scheduler.refreshCachedQuotas())
  ipcMain.handle('relay:refreshTerminals', () => scheduler.pollTerminals(false))
  ipcMain.handle('relay:clearLogs', () => scheduler.clearLogs())
  ipcMain.handle('relay:getAccountModels', async (_event, accountId: string): Promise<AccountModelResult> => {
    const accounts = await readAntigravityAccounts()
    const account = accounts.find((candidate) => candidate.id === accountId)
    return account
      ? fetchAvailableAccountModels(account)
      : { ok: false, message: 'Conta Antigravity não encontrada no Maestri.' }
  })
  ipcMain.handle(
    'relay:swapTerminal',
    (_event, terminalId: string, explicitAccountId?: string) =>
      scheduler.swapTerminalToBest(terminalId, explicitAccountId)
  )
  ipcMain.handle('relay:updateConfig', async (_event, patch: Partial<RelayConfig>) => {
    const updated = await scheduler.updateConfig(patch)
    if (typeof patch.openAtLogin === 'boolean') {
      applyAutoLaunch(patch.openAtLogin)
    }
    return updated
  })
  ipcMain.handle('relay:windowMinimize', () => {
    mainWindow?.minimize()
  })
  ipcMain.handle('relay:windowToggleMaximize', () => {
    if (!mainWindow) return false
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
      return false
    }
    mainWindow.maximize()
    return true
  })
  ipcMain.handle('relay:windowClose', () => {
    mainWindow?.close()
  })
  ipcMain.handle('relay:windowIsMaximized', () => mainWindow?.isMaximized() ?? false)
  ipcMain.handle('relay:installUpdate', () => {
    installUpdate()
  })
  ipcMain.handle('relay:checkForUpdates', () => checkForUpdates(scheduler))
}

const singleLock = app.requestSingleInstanceLock()
if (!singleLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  void app.whenReady().then(async () => {
    registerIpc()
    await scheduler.init()
    applyAutoLaunch(scheduler.getSnapshot().config.openAtLogin)
    setupTray()
    createWindow()

    scheduler.subscribe((snapshot) => {
      mainWindow?.webContents.send('relay:snapshot', snapshot)
    })
    void scheduler.pollTerminals(false)
    initAutoUpdater(scheduler)
  })

  app.on('before-quit', () => {
    isQuitting = true
    scheduler.stop()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && !scheduler.getSnapshot().config.minimizeToTray) {
      app.quit()
    }
  })
}
