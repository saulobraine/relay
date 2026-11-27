import { app, Notification } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { AppUpdateStatus } from '../../shared/types'
import type { RelayScheduler } from './scheduler'

export function installUpdate(): void {
  autoUpdater.quitAndInstall()
}

export async function checkForUpdates(scheduler?: RelayScheduler): Promise<void> {
  if (scheduler) {
    scheduler.setUpdateStatus({ state: 'checking' })
  }
  if (app.isPackaged) {
    await autoUpdater.checkForUpdatesAndNotify()
  } else if (scheduler) {
    setTimeout(() => {
      if (scheduler.getUpdateStatus().state === 'checking') {
        scheduler.setUpdateStatus({ state: 'idle' })
      }
    }, 500)
  }
}

export function initAutoUpdater(scheduler: RelayScheduler): void {
  try {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('checking-for-update', () => {
      scheduler.setUpdateStatus({ state: 'checking' })
    })

    autoUpdater.on('update-available', (info) => {
      scheduler.setUpdateStatus({ state: 'downloading', version: info.version })
      void scheduler.logEvent(
        'info',
        `Nova versão do Relay disponível (v${info.version}). Baixando atualização automaticamente...`
      )
    })

    autoUpdater.on('update-not-available', () => {
      scheduler.setUpdateStatus({ state: 'idle' })
    })

    autoUpdater.on('update-downloaded', (info) => {
      scheduler.setUpdateStatus({ state: 'downloaded', version: info.version })
      void scheduler.logEvent(
        'success',
        `Atualização v${info.version} baixada e pronta para instalação. Será aplicada ao reiniciar o Relay.`
      )
      if (Notification.isSupported()) {
        new Notification({
          title: 'Relay - Atualizacao Pronta',
          body: `A versao v${info.version} foi baixada. Reinicie para aplicar.`
        }).show()
      }
    })

    autoUpdater.on('error', (err) => {
      const message = err instanceof Error ? err.message : String(err)
      scheduler.setUpdateStatus({ state: 'error', error: message })
      void scheduler.logEvent(
        'warn',
        `Falha na verificação de atualização automática: ${message}`
      )
    })

    if (app.isPackaged) {
      scheduler.setUpdateStatus({ state: 'checking' })
      autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        const message = err instanceof Error ? err.message : String(err)
        scheduler.setUpdateStatus({ state: 'error', error: message })
        void scheduler.logEvent(
          'warn',
          `Erro ao verificar atualizações: ${message}`
        )
      })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    scheduler.setUpdateStatus({ state: 'error', error: message })
    void scheduler.logEvent('warn', `Não foi possível inicializar o auto-updater: ${message}`)
  }
}
