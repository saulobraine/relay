import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export interface PersistedAccount {
  id: string
  name: string
  cli: string
  kind: string
}

export interface PersistedTerminalNode {
  id: string
  name: string
  accountId: string | null
  isManager: boolean
  isUnloaded: boolean
  agentType: string
  status: string
}

interface PersistedCanvas {
  terminals: PersistedTerminalNode[]
}

export interface PersistedFloor extends PersistedCanvas {
  id: string
  name: string
}

export interface PersistedWorkspace extends PersistedCanvas {
  id: string
  name: string
  workingDirectory: string
  isActive: boolean
  floors: PersistedFloor[]
}

interface SavedCanvas {
  nodes?: Array<{
    content?: {
      terminal?: {
        _0?: Partial<PersistedTerminalNode>
      }
    }
  }>
}

function readCanvasTerminals(canvas: SavedCanvas): PersistedTerminalNode[] {
  const terminals: PersistedTerminalNode[] = []
  for (const node of canvas.nodes ?? []) {
    const terminal = node.content?.terminal?._0
    if (!terminal?.id || !terminal.name) continue
    terminals.push({
      id: terminal.id,
      name: terminal.name,
      accountId: terminal.accountId ?? null,
      isManager: Boolean(terminal.isManager),
      isUnloaded: Boolean(terminal.isUnloaded),
      agentType: terminal.agentType ?? 'unknown',
      status: terminal.status ?? 'unknown'
    })
  }
  return terminals
}

export function getMaestriRoot(): string {
  return path.join(os.homedir(), '.maestri')
}

export function getMaestriLocalAccountsRoot(): string {
  return path.join(os.homedir(), '.maestri-local', 'accounts')
}

export function getDefaultMaestriCliPath(): string {
  return path.join(
    os.homedir(),
    'AppData',
    'Local',
    'Programs',
    'Maestri',
    'resources',
    'cli',
    'maestri.exe'
  )
}

export function getDefaultAgyCliPath(): string {
  return path.join(os.homedir(), 'AppData', 'Local', 'agy', 'bin', 'agy.exe')
}

async function readJsonSafe<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export async function readAntigravityAccounts(): Promise<PersistedAccount[]> {
  const prefsPath = path.join(getMaestriRoot(), 'preferences.json')
  const prefs = await readJsonSafe<{
    payload?: {
      agentAccounts?: Array<{
        id?: string
        name?: string
        cli?: string
        kind?: string
        connection?: unknown
      }>
    }
  }>(prefsPath)

  const list = prefs?.payload?.agentAccounts ?? []
  return list
    .filter((a) => a.cli === 'antigravity' && a.id && a.name && (a.connection ?? null) === null)
    .map((a) => ({
      id: a.id!,
      name: a.name!,
      cli: a.cli!,
      kind: a.kind ?? 'signIn'
    }))
}

export async function readActiveWorkspaceId(): Promise<string | null> {
  const appStatePath = path.join(getMaestriRoot(), 'app-state.json')
  const state = await readJsonSafe<{
    payload?: { activeWorkspaceId?: string }
  }>(appStatePath)
  return state?.payload?.activeWorkspaceId ?? null
}

export async function readMaestroPresetAccountId(): Promise<string | null> {
  const prefsPath = path.join(getMaestriRoot(), 'preferences.json')
  const prefs = await readJsonSafe<{
    payload?: {
      agentPresets?: Array<{
        name?: string
        accountId?: string
      }>
    }
  }>(prefsPath)
  const maestro = prefs?.payload?.agentPresets?.find((p) => p.name === 'Maestro')
  return maestro?.accountId ?? null
}

export async function setMaestroPresetAccountId(targetAccountId: string): Promise<boolean> {
  const prefsPath = path.join(getMaestriRoot(), 'preferences.json')
  try {
    const raw = await fs.readFile(prefsPath, 'utf8')
    const prefs = JSON.parse(raw)
    const presets = prefs?.payload?.agentPresets
    if (!Array.isArray(presets)) return false

    const maestro = presets.find((p: { name?: string }) => p.name === 'Maestro')
    if (!maestro) return false

    maestro.accountId = targetAccountId
    await fs.writeFile(prefsPath, JSON.stringify(prefs, null, 2), 'utf8')
    return true
  } catch {
    return false
  }
}

export async function readWorkspaces(): Promise<PersistedWorkspace[]> {
  const workspacesDir = path.join(getMaestriRoot(), 'workspaces')
  const activeId = await readActiveWorkspaceId()

  let dirs: string[] = []
  try {
    const entries = await fs.readdir(workspacesDir, { withFileTypes: true })
    dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return []
  }

  const results: PersistedWorkspace[] = []
  for (const dirName of dirs) {
    const wsPath = path.join(workspacesDir, dirName, 'workspace.json')
    const ws = await readJsonSafe<{
      payload?: SavedCanvas & {
        id?: string
        name?: string
        workingDirectory?: string
        floors?: Array<SavedCanvas & { id: string; name: string }>
      }
    }>(wsPath)

    const payload = ws?.payload
    if (!payload?.id) continue

    results.push({
      id: payload.id,
      name: payload.name ?? dirName,
      workingDirectory: payload.workingDirectory ?? '',
      isActive: payload.id.toLowerCase() === activeId?.toLowerCase(),
      terminals: readCanvasTerminals(payload),
      floors: (payload.floors ?? []).map((floor) => ({
        id: floor.id,
        name: floor.name,
        terminals: readCanvasTerminals(floor)
      }))
    })
  }

  return results
}
