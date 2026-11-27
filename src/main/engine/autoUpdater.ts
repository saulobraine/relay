import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { RelayScheduler } from './scheduler'

export function initAutoUpdater(scheduler: RelayScheduler): void {
  try {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('update-available', (info) => {
      void scheduler.logEvent(
        'info',
        `Nova versão do Relay disponível (v${info.version}). Baixando atualização automaticamente...`
      )
    })

    autoUpdater.on('update-downloaded', (info) => {
      void scheduler.logEvent(
        'success',
        `Atualização v${info.version} baixada e pronta para instalação. Será aplicada ao reiniciar o Relay.`
      )
    })

    autoUpdater.on('error', (err) => {
      const message = err instanceof Error ? err.message : String(err)
      void scheduler.logEvent(
        'warn',
        `Falha na verificação de atualização automática: ${message}`
      )
    })

    if (app.isPackaged) {
      autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        const message = err instanceof Error ? err.message : String(err)
        void scheduler.logEvent(
          'warn',
          `Erro ao verificar atualizações: ${message}`
        )
      })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    void scheduler.logEvent('warn', `Não foi possível inicializar o auto-updater: ${message}`)
  }
}
