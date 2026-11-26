import type { relayApi } from '../preload/index'

declare global {
  interface Window {
    relay: typeof relayApi
  }
}

export {}
