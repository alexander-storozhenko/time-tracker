import type { Accent } from '@shared/types'
import type { CSSProperties } from 'react'

/**
 * Every accent is spent through one `--tone` custom property, so a card, a bar
 * and a dial arc all take their colour from the same declaration — and the
 * light theme can re-point the palette without touching a component.
 */
export function tone(accent: Accent): CSSProperties {
  return { ['--tone' as string]: `var(--accent-${accent})` }
}

export function initials(title: string): string {
  const cleaned = title.trim()
  if (!cleaned) return '—'
  const words = cleaned.split(/\s+/).slice(0, 2)
  return words.map((w) => w[0] ?? '').join('').toUpperCase() || '—'
}
