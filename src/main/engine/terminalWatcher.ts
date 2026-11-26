import { stripVTControlCharacters } from 'node:util'
import type { TerminalHealthState, TerminalModel } from '../../shared/types'

const RATE_LIMIT_PATTERN =
  /\b(?:HTTP\s*429|RESOURCE_EXHAUSTED|quota.*(?:exhausted|exceeded)|hit your quota limit|Too Many Requests)\b/i

const AUTH_ERROR_PATTERNS = [
  /Eligibility check failed/i,
  /Verify your account in your browser/i,
  /accounts\.google\.com\/v3\/signin/i
]

export function extractRecentLines(buffer: string, maxLines = 35): string {
  const lines = buffer
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0)
  return lines.slice(-maxLines).join('\n')
}

export function readTerminalModel(buffer: string, agentType: string): TerminalModel | null {
  if (agentType !== 'antigravity_cli') return null

  // Read the current prompt footer. Earlier lines can contain old status bars
  // or model names mentioned in the conversation.
  const footer = stripVTControlCharacters(buffer).trimEnd().split(/\r?\n/).at(-1)?.trimStart()
  const status = /^\?\s+for shortcuts(?: {2,}|\t+)(.+)$/i.exec(footer ?? '')?.[1]
  if (!status) return null

  const fields = status.split(/\s+·\s+/).map((field) => field.trim())
  if (/^(auto|default|plan|accept[ -]?edits)$/i.test(fields[0])) fields.shift()
  const [name, effort] = fields
  if (!/^(?:(?:Gemini|Claude|GPT)[ -][\w. ()+/-]+|Orchestrator(?: \([\w -]+\))?)$/i.test(name ?? '')) {
    return null
  }
  return {
    name,
    effort: /^(low|medium|high|xhigh|max)$/i.test(effort ?? '') ? effort.toLowerCase() : null
  }
}

export function detectTerminalHealth(buffer: string): TerminalHealthState {
  if (!buffer || buffer.trim().length === 0) return 'STOPPED'

  const tail = extractRecentLines(stripVTControlCharacters(buffer), 20)

  if (AUTH_ERROR_PATTERNS.some((re) => re.test(tail))) {
    return 'AUTH_ERROR'
  }

  if (RATE_LIMIT_PATTERN.test(tail)) {
    return 'RATE_LIMITED'
  }

  const lines = tail.split('\n')
  const lastLine = lines.at(-1)?.trim() ?? ''
  const hasShortcutFooter = /^\?\s+for shortcuts(?:\s|$)/i.test(lastLine)
  const prompt = /^(?:>|❯|›)(?:\s+Auto mode.*)?$/i
  const activity = /(?:\b(?:esc|escape|ctrl\+c)\s+to\s+(?:interrupt|cancel|stop)\b|^[✦✧*●⠋-⠿]\s*(?:thinking|working|processing|running)\b)/iu

  // A persistent shortcuts footer can still be visible during a running turn.
  for (const line of [...lines].reverse()) {
    if (activity.test(line.trim())) return 'ACTIVE'
    if (prompt.test(line.trim())) break
  }
  if (prompt.test(lastLine) || hasShortcutFooter) return 'IDLE'

  return 'ACTIVE'
}

export function isPromptReadyAfterRestart(buffer: string): boolean {
  const tail = extractRecentLines(buffer, 18)
  const hasAgyBanner = /Antigravity CLI/i.test(tail) || /for shortcuts/i.test(tail)
  const hasPrompt = /^>\s*(Auto mode.*)?$/m.test(tail)
  return hasAgyBanner && hasPrompt
}
