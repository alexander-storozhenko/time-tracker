import {
  ACCENTS,
  MANUAL_MAX_DESCRIPTION,
  MANUAL_MAX_ENTRIES,
  MANUAL_MAX_HOURS,
  MANUAL_MAX_NAME,
  MANUAL_MAX_TITLE,
  type Accent,
  type ManualDraft,
  type ManualEntry
} from '../shared/types'
import type { ReportSession } from './report'

/**
 * Hand-typed reports crossing the bridge. Everything here was written by a
 * person into a form the main process never saw, and it ends up both on disk
 * and inside a printed page, so nothing is taken on trust: a bad line is
 * dropped rather than stored or rendered.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/
/** Base64 pictures only — this string becomes a URL inside the printed page. */
const DATA_IMAGE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/
const MAX_ICON_BYTES = 256 * 1024

const isAccent = (value: unknown): value is Accent =>
  typeof value === 'string' && (ACCENTS as readonly string[]).includes(value)

export function readEntries(raw: unknown): ManualEntry[] {
  if (!Array.isArray(raw)) return []
  const entries: ManualEntry[] = []
  for (const item of raw.slice(0, MANUAL_MAX_ENTRIES)) {
    if (!item || typeof item !== 'object') continue
    const e = item as Partial<ManualEntry>
    const title = typeof e.title === 'string' ? e.title.trim().slice(0, MANUAL_MAX_TITLE) : ''
    const seconds = Math.round(Number(e.durationSec))
    if (!title) continue
    if (typeof e.date !== 'string' || !ISO_DATE.test(e.date)) continue
    // The floor is one second, not the form's: a line saved by an older build
    // must survive being read back, whatever the form offers today.
    if (!Number.isFinite(seconds) || seconds < 1 || seconds > MANUAL_MAX_HOURS * 3600) continue
    entries.push({
      id: typeof e.id === 'string' ? e.id.slice(0, 64) : '',
      title,
      // Absent on lines written before the field existed.
      description:
        typeof e.description === 'string'
          ? e.description.trim().slice(0, MANUAL_MAX_DESCRIPTION)
          : '',
      date: e.date,
      // A missing or unreadable clock costs the time of day, never the line.
      startTime: typeof e.startTime === 'string' && CLOCK.test(e.startTime) ? e.startTime : null,
      durationSec: seconds,
      // An emoji is a handful of code points; anything longer is not one.
      icon: typeof e.icon === 'string' && e.icon.length > 0 && e.icon.length <= 16 ? e.icon : null,
      accent: isAccent(e.accent) ? e.accent : 'slate'
    })
  }
  return entries
}

export function readIcons(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {}
  const icons: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key.length > 16 || typeof value !== 'string') continue
    if (value.length > MAX_ICON_BYTES || !DATA_IMAGE.test(value)) continue
    icons[key] = value
  }
  return icons
}

export const readName = (raw: unknown, fallback: string): string => {
  const name = typeof raw === 'string' ? raw.trim().slice(0, MANUAL_MAX_NAME) : ''
  return name || fallback
}

/** Reads the stored working state, including the shape that predates naming:
 *  the first version of this feature kept a bare array of lines. */
export function readDraft(raw: unknown): ManualDraft {
  if (Array.isArray(raw)) return { id: null, name: '', entries: readEntries(raw) }
  if (!raw || typeof raw !== 'object') return { id: null, name: '', entries: [] }
  const d = raw as Partial<ManualDraft>
  return {
    id: typeof d.id === 'string' && d.id.length > 0 ? d.id.slice(0, 64) : null,
    name: readName(d.name, ''),
    entries: readEntries(d.entries)
  }
}

export const totalSecOf = (entries: ManualEntry[]): number =>
  entries.reduce((sum, e) => sum + e.durationSec, 0)

/**
 * A hand-written line read as a run, so the report cannot tell the difference.
 * A line with no clock still needs an instant to be ordered and dated by, and
 * takes its day's midnight — `untimed` is what keeps that placeholder out of
 * the printed times and out of the hour chart.
 */
export function toReportSession(entry: ManualEntry, index: number): ReportSession {
  const [y, m, d] = entry.date.split('-').map(Number)
  const [hh, mm] = entry.startTime === null ? [0, 0] : entry.startTime.split(':').map(Number)
  const startedAt = new Date(y, m - 1, d, hh, mm, 0, 0).getTime()
  return {
    untimed: entry.startTime === null,
    id: entry.id || `manual-${index}`,
    date: entry.date,
    templateId: null,
    title: entry.title,
    description: entry.description,
    accent: entry.accent,
    startedAt,
    endedAt: startedAt + entry.durationSec * 1000,
    durationSec: entry.durationSec,
    // Nothing was planned and nothing ran out, so the limit column stays empty
    // rather than claiming every hand-written line finished on target.
    limitSec: null,
    reachedLimit: false,
    icon: entry.icon
  }
}
