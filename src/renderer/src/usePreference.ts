import { useEffect, useState } from 'react'

export function usePreference<T>(
  name: string,
  fallback: T,
  validate: (value: unknown) => value is T
) {
  const key = 'relay.ui.v1.' + name
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key)
      if (stored !== null) {
        const parsed: unknown = JSON.parse(stored)
        if (validate(parsed)) return parsed
      }
    } catch {
      // Storage may be disabled or contain invalid JSON.
    }
    return fallback
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // The preference still applies for the current session.
    }
  }, [key, value])

  return [value, setValue] as const
}

export function useChoice<T extends string>(name: string, fallback: T, choices: readonly T[]) {
  return usePreference<T>(name, fallback, (value): value is T =>
    typeof value === 'string' && choices.some((choice) => choice === value)
  )
}
