// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import App from '../src/renderer/src/App'
import { account, snapshot, terminal } from './fixtures'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('carrega dados do Electron, navega, atualiza e libera inscrições ao sair', async () => {
  const unsubscribe = vi.fn()
  const relay = {
    getSnapshot: vi.fn().mockResolvedValue(snapshot({
      accounts: [account({ name: 'Conta de teste' })],
      terminals: [terminal({ name: 'Terminal de teste' })]
    })),
    onSnapshot: vi.fn(() => unsubscribe),
    onWindowMaximized: vi.fn(() => unsubscribe),
    windowIsMaximized: vi.fn().mockResolvedValue(false),
    refreshQuotas: vi.fn().mockResolvedValue(undefined),
    refreshTerminals: vi.fn().mockResolvedValue(undefined)
  }
  vi.stubGlobal('relay', relay)
  const { unmount } = render(<App />)
  expect(await screen.findByText('Conta de teste')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /Escanear Terminais/ }))
  expect(await screen.findByText('Terminal de teste')).toBeTruthy()
  expect(await screen.findByText('1 terminal encontrado.')).toBeTruthy()
  expect(relay.refreshTerminals).toHaveBeenCalledOnce()
  expect(relay.refreshQuotas).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: /Logs & Config/ }))
  expect(screen.getByRole('heading', { name: /Configurações Gerais/ })).toBeTruthy()
  unmount()
  expect(unsubscribe).toHaveBeenCalledTimes(2)
})
