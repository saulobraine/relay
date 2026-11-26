import type { AccountStatus, MonitoredTerminal } from '../../shared/types'
import {
  askTerminal,
  checkTerminal,
  replaceTerminalAccount,
  type MaestriContext
} from '../maestri/cliBridge'
import { extractRecentLines, isPromptReadyAfterRestart } from './terminalWatcher'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export interface FailoverResult {
  ok: boolean
  terminalName: string
  fromAccount: string
  toAccount: string
  handoffSent: boolean
  error?: string
}

async function waitForPromptReady(
  ctx: MaestriContext,
  terminalName: string,
  maxWaitMs = 18000
): Promise<boolean> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < maxWaitMs) {
    await sleep(1500)
    try {
      const buf = await checkTerminal(ctx, terminalName)
      if (isPromptReadyAfterRestart(buf)) {
        return true
      }
    } catch {
      // Terminal process is still booting
    }
  }
  return false
}

function buildHandoffPrompt(
  fromAccount: string,
  toAccount: string,
  priorSnippet: string,
  sendContext: boolean
): string {
  if (!sendContext || !priorSnippet.trim()) {
    return (
      `[Relay Auto-Failover] Sua sessão foi migrada da conta "${fromAccount}" para "${toAccount}" ` +
      `para evitar bloqueio por limite. Caso estivesse em uma thread do Maestri, rode \`maestri recall\` ` +
      `para recuperar seu histórico e continue de onde parou.`
    )
  }

  const trimmed = priorSnippet.slice(-2200)
  return (
    `[Relay Auto-Failover] Sua conta foi trocada de "${fromAccount}" para "${toAccount}" ` +
    `por proteção de cota/limite.\n\n` +
    `Último estado capturado da sua tela antes da troca:\n` +
    `---\n${trimmed}\n---\n\n` +
    `Se houver histórico de thread no Maestri, use \`maestri recall\` se precisar e retome imediatamente a tarefa em andamento do ponto exato onde parou.`
  )
}

export async function executeTerminalFailover(params: {
  pipePath: string
  terminal: MonitoredTerminal
  targetAccount: AccountStatus
  sendHandoff?: boolean
}): Promise<FailoverResult> {
  const { pipePath, terminal, targetAccount, sendHandoff = true } = params
  if (!terminal.managerTerminalId) {
    return {
      ok: false,
      terminalName: terminal.name,
      fromAccount: terminal.accountName,
      toAccount: targetAccount.name,
      handoffSent: false,
      error: 'Maestro indisponível para a troca.'
    }
  }
  const ctx: MaestriContext = {
    pipePath,
    workspaceId: terminal.workspaceId,
    terminalId: terminal.managerTerminalId
  }

  let priorSnippet = terminal.lastSnippet
  try {
    const freshBuf = await checkTerminal(ctx, terminal.name)
    priorSnippet = extractRecentLines(freshBuf, 35)
  } catch {
    // Use cached snippet if live check fails
  }

  try {
    await replaceTerminalAccount(ctx, terminal.name, targetAccount.name)
  } catch (err) {
    return {
      ok: false,
      terminalName: terminal.name,
      fromAccount: terminal.accountName,
      toAccount: targetAccount.name,
      handoffSent: false,
      error: err instanceof Error ? err.message : String(err)
    }
  }

  if (!sendHandoff) {
    return {
      ok: true,
      terminalName: terminal.name,
      fromAccount: terminal.accountName,
      toAccount: targetAccount.name,
      handoffSent: false
    }
  }

  const ready = await waitForPromptReady(ctx, terminal.name, 18000)
  if (!ready) {
    return {
      ok: true,
      terminalName: terminal.name,
      fromAccount: terminal.accountName,
      toAccount: targetAccount.name,
      handoffSent: false,
      error: 'Conta trocada, mas o prompt não ficou pronto dentro do timeout para handoff.'
    }
  }

  try {
    const prompt = buildHandoffPrompt(
      terminal.accountName,
      targetAccount.name,
      priorSnippet,
      true
    )
    await askTerminal(ctx, terminal.name, prompt, 25000)
    return {
      ok: true,
      terminalName: terminal.name,
      fromAccount: terminal.accountName,
      toAccount: targetAccount.name,
      handoffSent: true
    }
  } catch (err) {
    return {
      ok: true,
      terminalName: terminal.name,
      fromAccount: terminal.accountName,
      toAccount: targetAccount.name,
      handoffSent: false,
      error: `Conta trocada, falha ao enviar handoff: ${err instanceof Error ? err.message : String(err)}`
    }
  }
}
