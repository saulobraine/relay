import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { getDefaultMaestriCliPath } from './workspaceReader'

const execFileAsync = promisify(execFile)

export interface MaestriContext {
  pipePath: string
  workspaceId: string
  terminalId: string
}

export interface ConnectedAgentInfo {
  name: string
  role: string | null
  account: string | null
}

function buildCliEnv(ctx: MaestriContext): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('MAESTRI_')) {
      env[key] = value
    }
  }
  env.MAESTRI_PIPE = ctx.pipePath
  env.MAESTRI_WORKSPACE_ID = ctx.workspaceId
  env.MAESTRI_TERMINAL_ID = ctx.terminalId
  return env
}

async function runMaestri(ctx: MaestriContext, args: string[], timeoutMs = 15000): Promise<string> {
  const cliPath = getDefaultMaestriCliPath()
  const { stdout } = await execFileAsync(cliPath, args, {
    env: buildCliEnv(ctx),
    timeout: timeoutMs,
    windowsHide: true,
    maxBuffer: 2 * 1024 * 1024
  })
  return stdout
}

export async function listConnectedAgents(ctx: MaestriContext): Promise<ConnectedAgentInfo[]> {
  const output = await runMaestri(ctx, ['list'], 8000)
  const agents: ConnectedAgentInfo[] = []

  const lines = output.split(/\r?\n/)
  let inConnectedAgents = false

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line === 'Connected agents:') {
      inConnectedAgents = true
      continue
    }
    if (
      inConnectedAgents &&
      (line === '' || line.startsWith('Connected portals') || line.startsWith('Connected notes'))
    ) {
      if (line !== '') inConnectedAgents = false
      continue
    }
    if (!inConnectedAgents || !line.startsWith('- ')) continue

    const nameMatch = /name:\s*"([^"]+)"/.exec(line)
    if (!nameMatch) continue
    const roleMatch = /role:\s*"([^"]+)"/.exec(line)
    const accountMatch = /account:\s*"([^"]+)"/.exec(line)

    agents.push({
      name: nameMatch[1],
      role: roleMatch ? roleMatch[1] : null,
      account: accountMatch ? accountMatch[1] : null
    })
  }

  return agents
}

export async function checkTerminal(ctx: MaestriContext, agentName: string): Promise<string> {
  return runMaestri(ctx, ['check', agentName], 10000)
}

export async function replaceTerminalAccount(
  ctx: MaestriContext,
  agentName: string,
  targetAccountName: string
): Promise<string> {
  return runMaestri(ctx, ['recruit', '--replace', agentName, '--account', targetAccountName], 20000)
}

export async function askTerminal(
  ctx: MaestriContext,
  agentName: string,
  prompt: string,
  timeoutMs = 30000
): Promise<string> {
  return runMaestri(ctx, ['ask', agentName, prompt], timeoutMs)
}

export function workspaceKey(name: string, directory: string): string {
  return `${name.trim().toLowerCase()}\n${directory.trim().replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase()}`
}

export async function listLoadedWorkspaces(ctx: MaestriContext): Promise<Set<string>> {
  const output = await runMaestri(ctx, ['workspace', 'list'], 10000)
  const loaded = new Set<string>()
  for (const rawLine of output.split(/\r?\n/)) {
    const match = /^"(.+?)"\s*—\s*(.+)$/.exec(rawLine.trim())
    if (!match) continue
    const [directory, ...flags] = match[2].split(/\s+·\s+/)
    if (!flags.includes('unloaded')) loaded.add(workspaceKey(match[1], directory))
  }
  return loaded
}

export async function listLoadedFloors(ctx: MaestriContext): Promise<Set<string>> {
  const output = await runMaestri(ctx, ['floor', 'list'], 10000)
  const loaded = new Set<string>()
  for (const rawLine of output.split(/\r?\n/)) {
    const match = /^"(.+?)"\s*—\s*(.+)$/.exec(rawLine.trim())
    if (match && !match[2].split(/\s+·\s+/).includes('unloaded')) {
      loaded.add(match[1].toLowerCase())
    }
  }
  return loaded
}
