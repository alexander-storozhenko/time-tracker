import type { ISODate } from '@shared/types'
import { t } from './i18n'

export function toISODate(date: Date): ISODate {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

export function todayISO(): ISODate {
  return toISODate(new Date())
}

export function shiftISO(iso: ISODate, days: number): ISODate {
  const [y, m, d] = iso.split('-').map(Number)
  return toISODate(new Date(y, m - 1, d + days))
}

/** `25:00`, and `1:04:09` once an hour is on the clock. */
export function formatClock(totalSeconds: number): string {
  const sign = totalSeconds < 0 ? '−' : ''
  const s = Math.floor(Math.abs(totalSeconds))
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const seconds = s % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return hours > 0
    ? `${sign}${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${sign}${pad(minutes)}:${pad(seconds)}`
}

/** `4 ч 12 мин` / `4 h 12 min` — for totals, where seconds are noise. */
export function formatDuration(totalSeconds: number): string {
  const d = t()
  const s = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(s / 3600)
  const minutes = Math.round((s % 3600) / 60)
  if (hours === 0 && minutes === 0) return s > 0 ? d.lessThanMin : d.zeroMin
  if (hours === 0) return `${minutes} ${d.unitMin}`
  return minutes === 0
    ? `${hours} ${d.unitH}`
    : `${hours} ${d.unitH} ${minutes} ${d.unitMin}`
}

/** `1:40` — compact hours:minutes for dense rows. */
export function formatCompact(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}` : `${minutes} ${t().unitMin}`
}

export function formatLimit(limitSec: number | null): string {
  const d = t()
  if (limitSec === null) return d.noLimit
  const minutes = Math.round(limitSec / 60)
  if (minutes < 60) return `${minutes} ${d.unitMin}`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0
    ? `${hours} ${d.unitH}`
    : `${hours} ${d.unitH} ${rest} ${d.unitMin}`
}

/** A spoken form for the live region — words, not `24:05`. */
export function speakClock(totalSeconds: number): string {
  const d = t()
  const s = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const parts: string[] = []
  if (hours) parts.push(`${hours} ${d.unitH}`)
  parts.push(`${minutes} ${d.unitMin}`)
  return parts.join(' ')
}
