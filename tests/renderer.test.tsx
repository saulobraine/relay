// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AccountsGrid } from '../src/renderer/src/components/AccountsGrid'
import { WorkspacesPanel } from '../src/renderer/src/components/WorkspacesPanel'
import { LogsAndSettings } from '../src/renderer/src/components/LogsAndSettings'
import { AccountModelsButton } from '../src/renderer/src/components/AccountModelsButton'
import { account, config, terminal } from './fixtures'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('ordena contas numericamente nos dois sentidos, mantendo cotas desconhecidas no fim', () => {
  const toggle = vi.fn()
  const { container } = render(<AccountsGrid viewMode="table" excludedAccountIds={[]} onToggleExclude={toggle}
    accounts={[account({ id: 'a', name: 'Alpha', gemini5hRemaining: 100 }),
      account({ id: 'b', name: 'Beta', gemini5hRemaining: 9 }),
      account({ id: 'c', name: 'Gama', gemini5hRemaining: null })]} />)
  const names = () => [...container.querySelectorAll('tbody tr .table-acc-name')].map((row) => row.textContent)
  const header = screen.getByRole('button', { name: 'Janela 5h' })
  fireEvent.click(header)
  expect(names()).toEqual(['Beta', 'Alpha', 'Gama'])
  fireEvent.click(header)
  expect(names()).toEqual(['Alpha', 'Beta', 'Gama'])
  fireEvent.click(screen.getAllByRole('button', { name: 'Pausar do Pool' })[0])
  expect(toggle).toHaveBeenCalledWith('a')
})

it('ordena antes de paginar e filtra terminais por workspace', () => {
  const terminals = Array.from({ length: 20 }, (_, i) => terminal({
    id: String(i), name: 'Agente ' + (20 - i), workspaceName: i < 5 ? 'A' : 'B'
  }))
  const { container } = render(<WorkspacesPanel terminals={terminals} accounts={[]}
    lastFailoverDurationMs={null} scanWarning={null} onSwap={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Terminal / Nó' }))
  expect(container.querySelector('tbody .table-acc-name')?.textContent).toBe('Agente 1')
  fireEvent.change(screen.getByLabelText('Filtrar por workspace'), { target: { value: 'A' } })
  expect(container.querySelectorAll('tbody tr')).toHaveLength(5)
  expect(container.querySelector('tbody .table-acc-name')?.textContent).toBe('Agente 16')
})

it('ordena logs por data, filtra e exige confirmação para limpar', () => {
  const clear = vi.fn().mockResolvedValue(undefined)
  render(<LogsAndSettings config={config} onClearLogs={clear} onUpdateConfig={vi.fn()} events={[
    { id: 'a', timestamp: '2026-01-01T10:00:00Z', level: 'info', message: 'Antigo' },
    { id: 'b', timestamp: '2026-01-01T12:00:00Z', level: 'error', message: 'Recente' }
  ]} />)
  const logs = within(screen.getByRole('region', { name: 'Histórico de eventos' }))
  expect(logs.getByText('Recente').compareDocumentPosition(logs.getByText('Antigo')))
    .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  fireEvent.click(screen.getByRole('button', { name: 'Erros (1)' }))
  expect(logs.queryByText('Antigo')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Limpar' }))
  expect(clear).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar limpeza' }))
  expect(clear).toHaveBeenCalledOnce()
})

it('envia mudanças de timeout, limite e política para a configuração', () => {
  const update = vi.fn().mockResolvedValue(undefined)
  render(<LogsAndSettings config={config} events={[]} onClearLogs={vi.fn()} onUpdateConfig={update} />)
  fireEvent.change(screen.getByRole('slider', { name: /Timeout/ }), { target: { value: '40' } })
  fireEvent.change(screen.getByRole('slider', { name: /Limite da janela/ }), { target: { value: '18' } })
  fireEvent.change(screen.getByLabelText(/Política de Roteamento/), { target: { value: 'least-loaded' } })
  expect(update.mock.calls).toEqual([
    [{ quotaTimeoutSeconds: 40 }], [{ min5hPercent: 18 }], [{ fallbackRoutingPolicy: 'least-loaded' }]
  ])
})

it('consulta o catálogo da conta selecionada e mostra o resultado da integração', async () => {
  const getAccountModels = vi.fn().mockResolvedValue({ ok: true, models: [{ id: 'model-1', label: 'Modelo da conta' }] })
  vi.stubGlobal('relay', { getAccountModels })
  render(<AccountModelsButton accountId="a" accountName="Alpha" />)
  const dialog = document.querySelector('dialog')!
  dialog.showModal = () => dialog.setAttribute('open', '')
  fireEvent.click(screen.getByRole('button', { name: 'Modelos disponíveis para Alpha' }))
  expect(await screen.findByText('Modelo da conta')).toBeTruthy()
  expect(getAccountModels).toHaveBeenCalledWith('a')
})

it('renderiza os badges de plano FREE, PRO, PLUS e UNKNOWN tanto na tabela quanto no grid', () => {
  const accounts = [
    account({ id: 'acc-pro', name: 'Conta Pro', plan: 'PRO' }),
    account({ id: 'acc-free', name: 'Conta Free', plan: 'FREE' }),
    account({ id: 'acc-plus', name: 'Conta Plus', plan: 'PLUS' }),
    account({ id: 'acc-unk', name: 'Conta Desconhecida', plan: 'UNKNOWN' })
  ]

  const { container: tableContainer } = render(
    <AccountsGrid viewMode="table" accounts={accounts} excludedAccountIds={[]} onToggleExclude={vi.fn()} />
  )
  expect(tableContainer.querySelector('.badge-plan-pro')?.textContent).toBe('PRO')
  expect(tableContainer.querySelector('.badge-plan-free')?.textContent).toBe('FREE')
  expect(tableContainer.querySelector('.badge-plan-plus')?.textContent).toBe('PLUS')
  expect(tableContainer.querySelector('.badge-plan-unknown')?.textContent).toBe('UNKNOWN')

  cleanup()

  const { container: gridContainer } = render(
    <AccountsGrid viewMode="grid" accounts={accounts} excludedAccountIds={[]} onToggleExclude={vi.fn()} />
  )
  expect(gridContainer.querySelector('.badge-plan-pro')?.textContent).toBe('PRO')
  expect(gridContainer.querySelector('.badge-plan-free')?.textContent).toBe('FREE')
  expect(gridContainer.querySelector('.badge-plan-plus')?.textContent).toBe('PLUS')
  expect(gridContainer.querySelector('.badge-plan-unknown')?.textContent).toBe('UNKNOWN')
})

it('permite verificar atualizações na seção de configurações', () => {
  const checkForUpdates = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('relay', { checkForUpdates })

  render(
    <LogsAndSettings
      config={config}
      events={[]}
      onClearLogs={vi.fn()}
      onUpdateConfig={vi.fn()}
      updateStatus={{ state: 'idle' }}
    />
  )

  const checkBtn = screen.getByRole('button', { name: 'Verificar atualizações' })
  fireEvent.click(checkBtn)
  expect(checkForUpdates).toHaveBeenCalledOnce()
})


