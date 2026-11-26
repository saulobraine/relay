import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import type { AccountModelResult, AccountStatus, AvailableAccountModel } from '../../shared/types'
import {
  getDefaultAgyCliPath,
  getMaestriLocalAccountsRoot,
  getMaestriRoot,
  type PersistedAccount
} from '../maestri/workspaceReader'
import { classifyAccount, computeAccountScore } from './scorer'

const execFileAsync = promisify(execFile)

interface UsageBucket {
  id: string
  window: 'weekly' | '5h'
  remaining_fraction: number
  reset_time: string
}

interface UsageGroup {
  name: string
  buckets: UsageBucket[]
}

interface AgyUsageOutput {
  status?: string
  command?: {
    data?: {
      groups?: UsageGroup[]
    }
  }
}

interface MaestriStatusFile {
  providers?: Array<{
    id: string
    name: string
    state: string
    error?: string
    lastSuccessAt?: string
    meters?: Array<{
      id: string
      windows?: Array<{
        id: string
        usedPercent?: number
        resetsAt?: string
      }>
    }>
  }>
}

function normalizePercent(fraction: number | undefined | null): number | null {
  if (typeof fraction !== 'number' || Number.isNaN(fraction)) return null
  return Math.max(0, Math.min(100, Math.round(fraction * 1000) / 10))
}

function normalizeReset(iso: string | undefined | null): string | null {
  if (!iso || iso.startsWith('1970-01-01')) return null
  return iso
}

export async function readCachedUsageStatus(
  accounts: PersistedAccount[],
  activeCountByAccountId: Map<string, number>,
  min5hPercent: number,
  minWeeklyPercent: number
): Promise<AccountStatus[]> {
  const statusPath = path.join(getMaestriRoot(), 'usage', 'providers', '.status.json')
  let parsed: MaestriStatusFile | null = null
  try {
    parsed = JSON.parse(await fs.readFile(statusPath, 'utf8')) as MaestriStatusFile
  } catch {
    parsed = null
  }

  const providerMap = new Map<string, NonNullable<MaestriStatusFile['providers']>[number]>()
  for (const p of parsed?.providers ?? []) {
    providerMap.set(p.id.toLowerCase(), p)
  }

  return accounts.map((acc) => {
    const providerKey = `account-${acc.id.replace(/-/g, '').toLowerCase()}`
    const p = providerMap.get(providerKey)
    const activeCount = activeCountByAccountId.get(acc.id.toLowerCase()) ?? 0

    const geminiMeter = p?.meters?.find((m) => m.id === 'Gemini Models')
    const thirdPartyMeter = p?.meters?.find((m) => m.id === 'Claude and GPT models')

    const g5h = geminiMeter?.windows?.find((w) => w.id === 'gemini-5h')
    const gWeekly = geminiMeter?.windows?.find((w) => w.id === 'gemini-weekly')
    const tp5h = thirdPartyMeter?.windows?.find((w) => w.id === '3p-5h')
    const tpWeekly = thirdPartyMeter?.windows?.find((w) => w.id === '3p-weekly')

    const gemini5hRemaining =
      g5h?.usedPercent != null ? Math.max(0, Math.round((100 - g5h.usedPercent) * 10) / 10) : null
    const geminiWeeklyRemaining =
      gWeekly?.usedPercent != null
        ? Math.max(0, Math.round((100 - gWeekly.usedPercent) * 10) / 10)
        : null
    const thirdParty5hRemaining =
      tp5h?.usedPercent != null ? Math.max(0, Math.round((100 - tp5h.usedPercent) * 10) / 10) : null
    const thirdPartyWeeklyRemaining =
      tpWeekly?.usedPercent != null
        ? Math.max(0, Math.round((100 - tpWeekly.usedPercent) * 10) / 10)
        : null

    const hasError = p?.state === 'failed' || Boolean(p?.error)
    const state = classifyAccount({
      gemini5hRemaining,
      geminiWeeklyRemaining,
      hasAuthError: hasError,
      min5hPercent,
      minWeeklyPercent
    })

    return {
      id: acc.id,
      name: acc.name,
      cli: acc.cli,
      state,
      score: computeAccountScore({
        state,
        gemini5hRemaining,
        geminiWeeklyRemaining,
        activeTerminalCount: activeCount
      }),
      gemini5hRemaining,
      gemini5hResetsAt: normalizeReset(g5h?.resetsAt),
      geminiWeeklyRemaining,
      geminiWeeklyResetsAt: normalizeReset(gWeekly?.resetsAt),
      thirdParty5hRemaining,
      thirdPartyWeeklyRemaining,
      activeTerminalCount: activeCount,
      lastCheckedAt: p?.lastSuccessAt ?? null,
      error: p?.error ?? null
    }
  })
}

function buildAccountEnv(accountId: string): NodeJS.ProcessEnv {
  const accountHome = path.join(getMaestriLocalAccountsRoot(), accountId)
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    USERPROFILE: accountHome,
    HOME: accountHome,
    SSH_CONNECTION: '127.0.0.1 0 127.0.0.1 0'
  }
  delete env.JETSKI_OAUTH_TOKEN
  delete env.AGY_ADC_AUTH
  delete env.GEMINI_API_KEY
  return env
}

export async function fetchAvailableAccountModels(acc: PersistedAccount): Promise<AccountModelResult> {
  try {
    const { stdout } = await execFileAsync(getDefaultAgyCliPath(), ['models'], {
      env: buildAccountEnv(acc.id),
      timeout: 15000,
      windowsHide: true,
      maxBuffer: 1024 * 1024
    })

    const models = new Map<string, AvailableAccountModel>()
    for (const line of stdout.split(/\r?\n/)) {
      // The CLI emits one model identifier and label per tab-separated line.
      const match = /^([a-z0-9][a-z0-9._-]*)\t([^\t]+)$/i.exec(line.trim())
      if (!match) continue
      const [, id, label] = match
      models.set(id, { id, label })
    }
    if (models.size === 0) {
      return { ok: false, message: 'O Antigravity não retornou uma lista de modelos para esta conta.' }
    }
    return { ok: true, models: [...models.values()] }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/authentication required|verify your account|eligibility check failed|signin\/continue|not signed in|isn['’]t signed in|please sign in|sign[ -]in required/i.test(message)) {
      return { ok: false, message: 'Autentique esta conta no Antigravity e tente novamente.' }
    }
    return { ok: false, message: 'Não foi possível consultar os modelos desta conta.' }
  }
}

export async function fetchLiveAccountUsage(
  acc: PersistedAccount,
  activeTerminalCount: number,
  min5hPercent: number,
  minWeeklyPercent: number,
  timeoutSeconds: number
): Promise<AccountStatus> {
  const agyPath = getDefaultAgyCliPath()

  const now = new Date().toISOString()

  try {
    const { stdout } = await execFileAsync(agyPath, ['-p', '/usage', '--output-format', 'json'], {
      env: buildAccountEnv(acc.id),
      timeout: timeoutSeconds * 1000,
      windowsHide: true,
      maxBuffer: 1024 * 1024
    })

    const data = JSON.parse(stdout) as AgyUsageOutput
    const groups = data.command?.data?.groups ?? []
    const geminiGroup = groups.find((g) => g.name === 'Gemini Models')
    const tpGroup = groups.find((g) => g.name === 'Claude and GPT models')

    const g5h = geminiGroup?.buckets.find((b) => b.id === 'gemini-5h')
    const gWeekly = geminiGroup?.buckets.find((b) => b.id === 'gemini-weekly')
    const tp5h = tpGroup?.buckets.find((b) => b.id === '3p-5h')
    const tpWeekly = tpGroup?.buckets.find((b) => b.id === '3p-weekly')

    // When 5h bucket is absent from Gemini Models, the 5h window hasn't been consumed yet (100% free)
    const geminiWeeklyRemaining = normalizePercent(gWeekly?.remaining_fraction)
    const gemini5hRemaining = g5h ? normalizePercent(g5h.remaining_fraction) : 100

    const state = classifyAccount({
      gemini5hRemaining,
      geminiWeeklyRemaining,
      hasAuthError: false,
      min5hPercent,
      minWeeklyPercent
    })

    return {
      id: acc.id,
      name: acc.name,
      cli: acc.cli,
      state,
      score: computeAccountScore({
        state,
        gemini5hRemaining,
        geminiWeeklyRemaining,
        activeTerminalCount
      }),
      gemini5hRemaining,
      gemini5hResetsAt: normalizeReset(g5h?.reset_time),
      geminiWeeklyRemaining,
      geminiWeeklyResetsAt: normalizeReset(gWeekly?.reset_time),
      thirdParty5hRemaining: tp5h ? normalizePercent(tp5h.remaining_fraction) : 100,
      thirdPartyWeeklyRemaining: normalizePercent(tpWeekly?.remaining_fraction),
      activeTerminalCount,
      lastCheckedAt: now,
      error: null
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isAuthErr =
      /Eligibility check failed|Verify your account|signin\/continue/i.test(message)

    return {
      id: acc.id,
      name: acc.name,
      cli: acc.cli,
      state: isAuthErr ? 'AUTH_ERROR' : 'UNKNOWN',
      score: -1,
      gemini5hRemaining: null,
      gemini5hResetsAt: null,
      geminiWeeklyRemaining: null,
      geminiWeeklyResetsAt: null,
      thirdParty5hRemaining: null,
      thirdPartyWeeklyRemaining: null,
      activeTerminalCount,
      lastCheckedAt: now,
      error: message.slice(0, 300)
    }
  }
}

export async function fetchAllLiveAccountUsages(
  accounts: PersistedAccount[],
  activeCountByAccountId: Map<string, number>,
  min5hPercent: number,
  minWeeklyPercent: number,
  timeoutSeconds: number
): Promise<AccountStatus[]> {
  return Promise.all(
    accounts.map((acc) =>
      fetchLiveAccountUsage(
        acc,
        activeCountByAccountId.get(acc.id.toLowerCase()) ?? 0,
        min5hPercent,
        minWeeklyPercent,
        timeoutSeconds
      )
    )
  )
}
