import fs from 'node:fs/promises'
import path from 'node:path'

const PIPE_DIR = '\\\\.\\pipe\\'

/**
 * Discovers active Maestri named pipes on Windows.
 * Prefers the newest/active maestri-* pipe if multiple exist.
 */
export async function discoverMaestriPipe(): Promise<string | null> {
  try {
    const entries = await fs.readdir(PIPE_DIR)
    const candidates = entries
      .filter((name) => /^maestri-[a-z0-9]+$/i.test(name))
      .map((name) => path.join(PIPE_DIR, name))

    if (candidates.length === 0) return null
    return candidates[0]
  } catch {
    return null
  }
}
