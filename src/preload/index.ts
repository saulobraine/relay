import { contextBridge, ipcRenderer } from 'electron'
import type { AccountModelResult, RelayConfig, RelaySnapshot } from '../shared/types'

export const relayApi = {
  getSnapshot: (): Promise<RelaySnapshot> => ipcRenderer.invoke('relay:getSnapshot'),
  refreshQuotas: (): Promise<void> => ipcRenderer.invoke('relay:refreshQuotas'),
  refreshTerminals: (): Promise<void> => ipcRenderer.invoke('relay:refreshTerminals'),
  clearLogs: (): Promise<void> => ipcRenderer.invoke('relay:clearLogs'),
  getAccountModels: (accountId: string): Promise<AccountModelResult> =>
    ipcRenderer.invoke('relay:getAccountModels', accountId),
  swapTerminal: (
    terminalId: string,
    explicitAccountId?: string
  ): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke('relay:swapTerminal', terminalId, explicitAccountId),
  updateConfig: (patch: Partial<RelayConfig>): Promise<RelayConfig> =>
    ipcRenderer.invoke('relay:updateConfig', patch),
  onSnapshot: (callback: (snapshot: RelaySnapshot) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, snap: RelaySnapshot): void => {
      callback(snap)
    }
    ipcRenderer.on('relay:snapshot', handler)
    return () => ipcRenderer.removeListener('relay:snapshot', handler)
  },
  windowMinimize: (): Promise<void> => ipcRenderer.invoke('relay:windowMinimize'),
  windowToggleMaximize: (): Promise<boolean> => ipcRenderer.invoke('relay:windowToggleMaximize'),
  windowClose: (): Promise<void> => ipcRenderer.invoke('relay:windowClose'),
  windowIsMaximized: (): Promise<boolean> => ipcRenderer.invoke('relay:windowIsMaximized'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('relay:installUpdate'),
  checkForUpdates: (): Promise<void> => ipcRenderer.invoke('relay:checkForUpdates'),
  onWindowMaximized: (callback: (maximized: boolean) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, maximized: boolean): void => {
      callback(maximized)
    }
    ipcRenderer.on('relay:windowMaximized', handler)
    return () => ipcRenderer.removeListener('relay:windowMaximized', handler)
  }
}

contextBridge.exposeInMainWorld('relay', relayApi)
