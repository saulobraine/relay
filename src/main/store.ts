import { app } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { RelayConfig, RelayEvent } from '../shared/types'

const DEFAULT_CONFIG: RelayConfig = {
  autoFailover: true,
  autoRebalance: false,
  onlyActiveWorkspace: false,
  monitorOnlyMaestro: true,
  maestroDedicatedAccountId: null,
  excludeMaestroFromPool: true,
  quotaTimeoutSeconds: 20,
  fallbackRoutingPolicy: 'score',
  min5hPercent: 12,
  minWeeklyPercent: 5,
  quotaPollIntervalSeconds: 180,
  terminalPollIntervalSeconds: 25,
  openAtLogin: true,
  minimizeToTray: true,
  excludedAccountIds: []
}

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'relay-config.json')
}

function getEventsPath(): string {
  return path.join(app.getPath('userData'), 'relay-events.json')
}

export async function loadConfig(): Promise<RelayConfig> {
  try {
    const raw = await fs.readFile(getConfigPath(), 'utf8')
    return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<RelayConfig>) }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export async function saveConfig(config: RelayConfig): Promise<void> {
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(getConfigPath(), JSON.stringify(config, null, 2), 'utf8')
}

export async function loadEvents(): Promise<RelayEvent[]> {
  try {
    const raw = await fs.readFile(getEventsPath(), 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as RelayEvent[]) : []
  } catch {
    return []
  }
}

export async function saveEvents(events: RelayEvent[]): Promise<void> {
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(getEventsPath(), JSON.stringify(events.slice(0, 150), null, 2), 'utf8')
}
