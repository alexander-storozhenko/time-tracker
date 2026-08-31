import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ISODate,
  ManualDraft,
  ManualEntry,
  ManualReport,
  ManualReportSummary
} from '@shared/types'
import { emojiDataUri } from '@/components/EmojiIcon'
import { currentLang, t } from './i18n'
import { todayISO } from './time'

/**
 * The hand-written report: lines typed in for work the tracker never saw.
 * They live in their own draft and never become sessions, so the statistics
 * stay a record of measured time — see `ManualEntry` for why.
 */

export const newEntryId = (): string => crypto.randomUUID()

/** Seconds as the hours field shows them: `1.5`, not `1.4999999999`. */
export const hoursOf = (durationSec: number): number => Number((durationSec / 3600).toFixed(2))

/** Where an entry lands on the clock, and how many midnights it crossed —
 *  `null` for a line that records a length but no time of day. */
export function endOf(
  startTime: string | null,
  durationSec: number
): { time: string; dayShift: number } | null {
  if (startTime === null || startTime === '') return null
  const [hours, minutes] = startTime.split(':').map(Number)
  const total = hours * 60 + minutes + Math.round(durationSec / 60)
  const shifted = ((total % 1440) + 1440) % 1440
  const pad = (n: number): string => String(n).padStart(2, '0')
  return {
    time: `${pad(Math.floor(shifted / 60))}:${pad(shifted % 60)}`,
    dayShift: Math.floor(total / 1440)
  }
}

/** By day, then by clock — and a line with no clock closes its day. */
export const sortEntries = (entries: ManualEntry[]): ManualEntry[] =>
  [...entries].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      Number(a.startTime === null) - Number(b.startTime === null) ||
      (a.startTime ?? '').localeCompare(b.startTime ?? '') ||
      a.title.localeCompare(b.title)
  )

export interface ManualDay {
  date: ISODate
  totalSec: number
  entries: ManualEntry[]
}

/** The list as the report reads it: by day, each day summed. */
export function groupByDay(entries: ManualEntry[]): ManualDay[] {
  const days = new Map<ISODate, ManualDay>()
  for (const entry of sortEntries(entries)) {
    const day = days.get(entry.date) ?? { date: entry.date, totalSec: 0, entries: [] }
    day.totalSec += entry.durationSec
    day.entries.push(entry)
    days.set(entry.date, day)
  }
  return [...days.values()]
}

/** `28 авг` — the day heading, in whichever language the app is set to. */
export function shortDate(iso: ISODate): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat(currentLang() === 'en' ? 'en-US' : 'ru-RU', {
    day: 'numeric',
    month: 'long'
  }).format(new Date(y, m - 1, d))
}

/**
 * The artwork for the icons a draft actually uses. The report is printed by an
 * offscreen window with no access to the app's bundled images, so the pictures
 * travel with the request — deduplicated here, since one icon usually carries
 * a dozen lines.
 */
export function reportIcons(entries: ManualEntry[]): Record<string, string> {
  const icons: Record<string, string> = {}
  for (const entry of entries) {
    if (!entry.icon || icons[entry.icon]) continue
    const uri = emojiDataUri(entry.icon)
    if (uri) icons[entry.icon] = uri
  }
  return icons
}

/** A name for a report nobody has named yet — never an empty title bar. */
export const defaultReportName = (): string => t().manualDefaultName(shortDate(todayISO()))

/** What «не сохранено» compares: the document, without its bookkeeping. */
const snapshot = (doc: { name: string; entries: ManualEntry[] }): string =>
  JSON.stringify({ name: doc.name, entries: doc.entries })

export interface ManualController {
  draft: ManualDraft
  loaded: boolean
  /** Bumped when a different document is loaded, so the composer starts over. */
  revision: number
  reports: ManualReportSummary[]
  /** True while the editor holds something the store does not. */
  dirty: boolean
  setEntries: (next: ManualEntry[]) => void
  setName: (name: string) => void
  save: () => Promise<void>
  open: (id: string) => Promise<void>
  create: () => Promise<void>
  remove: (id: string) => Promise<void>
}

/**
 * The hand-written reports the dialog works with: the one being edited, and the
 * library it can be saved into and reopened from.
 *
 * Two layers, on purpose. The editor's state is written back to `meta` a beat
 * after every change, so closing the dialog — or the app — never costs work
 * that was never saved. `Сохранить` is the separate, deliberate act that puts
 * the document in the library under a name. Switching to another report commits
 * the current one first: a report is a document, and leaving it should not be
 * the way to lose it.
 */
export function useManualReports(active: boolean): ManualController {
  const [draft, setDraft] = useState<ManualDraft>({ id: null, name: '', entries: [] })
  const [reports, setReports] = useState<ManualReportSummary[]>([])
  const [loaded, setLoaded] = useState(false)
  const [revision, setRevision] = useState(0)
  /** The stored document as it was last read or written; `null` when unsaved. */
  const [clean, setClean] = useState<string | null>(null)
  /** What is already in `meta`, so loading does not immediately write it back. */
  const written = useRef('')
  /** The live draft, for callbacks that must not close over a stale one. */
  const current = useRef(draft)
  current.current = draft

  // An unsaved document counts as dirty the moment it holds anything at all —
  // a name typed with no lines yet is still work the library should keep.
  const dirty =
    clean === null
      ? draft.entries.length > 0 || draft.name.trim() !== ''
      : snapshot(draft) !== clean

  const refresh = useCallback(async (): Promise<void> => {
    setReports(await window.tracker.listManualReports())
  }, [])

  // Read on the first open, not at boot: a draft nobody asked for should not
  // cost a round trip on every launch.
  useEffect(() => {
    if (!active || loaded) return
    let cancelled = false
    void (async () => {
      try {
        const stored = await window.tracker.loadManual()
        const saved = stored.id === null ? null : await window.tracker.openManualReport(stored.id)
        const list = await window.tracker.listManualReports()
        if (cancelled) return
        written.current = JSON.stringify(stored)
        setDraft(stored)
        // The editor may hold edits the stored document never received; the
        // «не сохранено» mark is the difference between the two, not a flag.
        setClean(saved ? snapshot(saved) : null)
        setReports(list)
      } catch (err) {
        console.error('[manual] load failed:', err)
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [active, loaded])

  // Written back a beat after the last edit, so a burst of typing is one write.
  useEffect(() => {
    if (!loaded) return
    const payload = JSON.stringify(draft)
    if (payload === written.current) return
    const id = setTimeout(() => {
      written.current = payload
      window.tracker.saveManual(draft).catch((err) => {
        // A draft that failed to persist is still on screen and still exports;
        // a toast about it would interrupt composing for nothing.
        console.error('[manual] draft save failed:', err)
      })
    }, 400)
    return () => clearTimeout(id)
  }, [draft, loaded])

  const adopt = useCallback((report: ManualReport | null): void => {
    if (report === null) return
    setDraft({ id: report.id, name: report.name, entries: report.entries })
    setClean(snapshot(report))
  }, [])

  /** Puts the held document in the library, naming it if it has no name. */
  const persist = useCallback((): Promise<ManualReport> => {
    const held = current.current
    return window.tracker.storeManualReport({
      ...held,
      name: held.name.trim() || defaultReportName()
    })
  }, [])

  const save = useCallback(async (): Promise<void> => {
    adopt(await persist())
    await refresh()
  }, [adopt, persist, refresh])

  /** Nothing is abandoned on the way out of a document that has lines in it. */
  const commitIfNeeded = useCallback(async (): Promise<void> => {
    if (!dirty || current.current.entries.length === 0) return
    await persist()
  }, [dirty, persist])

  const open = useCallback(
    async (id: string): Promise<void> => {
      await commitIfNeeded()
      const report = await window.tracker.openManualReport(id)
      if (report !== null) {
        adopt(report)
        setRevision((n) => n + 1)
      }
      await refresh()
    },
    [adopt, commitIfNeeded, refresh]
  )

  const create = useCallback(async (): Promise<void> => {
    await commitIfNeeded()
    setDraft({ id: null, name: defaultReportName(), entries: [] })
    setClean(null)
    setRevision((n) => n + 1)
    await refresh()
  }, [commitIfNeeded, refresh])

  const remove = useCallback(
    async (id: string): Promise<void> => {
      await window.tracker.deleteManualReport(id)
      // Deleting the document that is open keeps the lines on screen and lets
      // go of the id: saving again writes a new report rather than nothing.
      if (current.current.id === id) {
        setDraft((d) => ({ ...d, id: null }))
        setClean(null)
      }
      await refresh()
    },
    [refresh]
  )

  return {
    draft,
    loaded,
    revision,
    reports,
    dirty,
    setEntries: (entries) => setDraft((d) => ({ ...d, entries })),
    setName: (name) => setDraft((d) => ({ ...d, name })),
    save,
    open,
    create,
    remove
  }
}
