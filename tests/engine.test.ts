import { describe, expect, it } from 'vitest'
import { classifyAccount, computeAccountScore, pickBestAccount } from '../src/main/quota/scorer'
import { detectTerminalHealth, extractRecentLines, isPromptReadyAfterRestart, readTerminalModel } from '../src/main/engine/terminalWatcher'
import { account } from './fixtures'

describe('cotas e roteamento', () => {
  it.each([
    [100, 100, true, 'AUTH_ERROR'], [null, null, false, 'UNKNOWN'],
    [100, 2, false, 'EXHAUSTED_WEEKLY'], [3, 100, false, 'COOLDOWN_5H'],
    [12, 100, false, 'DRAINING'], [100, 5, false, 'DRAINING'], [13, 6, false, 'READY']
  ] as const)('classifica janela 5h=%s semanal=%s auth=%s como %s', (h, w, auth, state) => {
    expect(classifyAccount({
      gemini5hRemaining: h, geminiWeeklyRemaining: w, hasAuthError: auth,
      min5hPercent: 12, minWeeklyPercent: 5
    })).toBe(state)
  })

  it('penaliza terminais ativos e desqualifica contas indisponíveis', () => {
    expect(computeAccountScore(account({ activeTerminalCount: 2 }))).toBe(59.5)
    expect(computeAccountScore(account({ state: 'DRAINING' }))).toBe(-1)
  })

  it('respeita exclusões, conta atual e política de reserva', () => {
    const accounts = [
      account({ id: 'blocked', score: 100 }), account({ id: 'current', score: 99 }),
      account({ id: 'draining', state: 'DRAINING', score: 98 }),
      account({ id: 'busy', score: 90, activeTerminalCount: 3 }),
      account({ id: 'idle', score: 75 }), account({ id: 'idle-low', score: 60 })
    ]
    expect(pickBestAccount(accounts, ['BLOCKED'], 'CURRENT')?.id).toBe('busy')
    expect(pickBestAccount(accounts, ['BLOCKED'], 'CURRENT', 'least-loaded')?.id).toBe('idle')
    expect(pickBestAccount(accounts.slice(0, 3), ['BLOCKED'], 'CURRENT')).toBeNull()
  })
})

describe('inspeção do terminal', () => {
  it.each([
    ['', 'STOPPED'], ['processando', 'ACTIVE'], ['>', 'IDLE'],
    ['HTTP 429', 'RATE_LIMITED'], ['HTTP 429\nEligibility check failed', 'AUTH_ERROR']
  ])('classifica o buffer %j', (buffer, health) => {
    expect(detectTerminalHealth(buffer)).toBe(health)
  })

  it('lê o modelo e esforço do rodapé atual, retirando códigos ANSI', () => {
    const footer = '? for shortcuts  Auto · \x1b[32mGemini 3 Pro\x1b[0m · HIGH'
    expect(readTerminalModel(footer, 'antigravity_cli')).toEqual({ name: 'Gemini 3 Pro', effort: 'high' })
    expect(readTerminalModel(footer + '\ntexto novo', 'antigravity_cli')).toBeNull()
    expect(readTerminalModel(footer, 'codex')).toBeNull()
  })

  it('distingue sinais de execução de prompts antigos e do rodapé persistente', () => {
    expect(detectTerminalHealth('>\nExecutando uma tarefa')).toBe('ACTIVE')
    expect(detectTerminalHealth('? for shortcuts\nExecutando uma tarefa')).toBe('ACTIVE')
    expect(detectTerminalHealth('>\n✦ Thinking… (Esc to interrupt)\n? for shortcuts')).toBe('ACTIVE')
    expect(detectTerminalHealth('✦ Thinking…\n>\n? for shortcuts')).toBe('IDLE')
  })

  it('recorta o histórico e exige que o prompt reiniciado esteja pronto', () => {
    expect(extractRecentLines('antigo\r\n\r\natual  \r\nfinal', 2)).toBe('atual\nfinal')
    expect(isPromptReadyAfterRestart('Antigravity CLI\n>')).toBe(true)
    expect(isPromptReadyAfterRestart('Antigravity CLI\niniciando')).toBe(false)
  })
})
