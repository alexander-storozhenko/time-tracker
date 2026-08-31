/** Shared between the main process (persistence) and the renderer (UI). */

/** Calendar day in the user's local timezone, `YYYY-MM-DD`. */
export type ISODate = string

/**
 * Accent keys; resolved to `--mz-tone-rgb` triples in the renderer. Ordered
 * around the colour wheel, so the picker reads as a spectrum rather than a
 * list. Every one but `slate` is a saturated hue: these mark tasks apart at a
 * 3px stripe, which muted colours cannot do. `slate` stays as the deliberate
 * "no colour" choice, and as the fallback for data from elsewhere.
 */
export const ACCENTS = [
  'amber',
  'lime',
  'green',
  'emerald',
  'cyan',
  'sky',
  'blue',
  'violet',
  'fuchsia',
  'rose',
  'slate'
] as const
export type Accent = (typeof ACCENTS)[number]

/** A reusable task definition from the left-hand library. */
export interface Template {
  id: string
  title: string
  /** Free-form notes; empty string when the task needs none. */
  description: string
  /** Optional planned duration in seconds; `null` runs as an open stopwatch. */
  limitSec: number | null
  /**
   * What happens at the limit. `false` finishes the task and banks the time;
   * `true` keeps the clock running and counts the overtime instead. Per task,
   * because the answer differs by kind of work: a stand-up should stop, deep
   * work in flow should not.
   */
  overrun: boolean
  accent: Accent
  /** Emoji shown on the card; `null` falls back to the initials/colour chip. */
  icon: string | null
  createdAt: number
}

export type QueueStatus = 'pending' | 'active' | 'done'

/** One task instance sitting in today's run queue. */
export interface QueueItem {
  id: string
  /** Kept so stats can group instances back to their template. */
  templateId: string | null
  title: string
  /** Copied from the template when queued; editable per instance. */
  description: string
  limitSec: number | null
  /** Copied from the template when queued, like the title and the limit. */
  overrun: boolean
  accent: Accent
  icon: string | null
  /** Seconds banked from every completed run of this item. */
  elapsedSec: number
  status: QueueStatus
  /** Epoch ms of the first time this item was started. */
  startedAt: number | null
}

/** A finished stretch of work, the unit the statistics are built from. */
export interface Session {
  id: string
  date: ISODate
  templateId: string | null
  title: string
  accent: Accent
  startedAt: number
  endedAt: number
  durationSec: number
  limitSec: number | null
  /** True when the task ran to its planned limit rather than being stopped early. */
  reachedLimit: boolean
}

/** UI language: an explicit pick, or whatever the OS is set to. */
export type AppLanguage = 'system' | 'ru' | 'en'

/**
 * Only what the app itself decides. The colour theme and the rail's open state
 * belong to the kit's own providers, which already persist them.
 */
export interface Settings {
  /** Desktop notification when a task reaches its limit. */
  notifications: boolean
  /** Quiet two-note chime when a task reaches its limit. */
  sound: boolean
  /** Start the next queued task automatically once the current one finishes. */
  autoAdvance: boolean
  /**
   * Pause a running stretch when the machine suspends, crediting only the time
   * before the sleep. Off, the clock runs straight through — for whoever
   * deliberately tracks wall-clock time, naps included.
   */
  pauseOnSleep: boolean
  language: AppLanguage
}

/** The live part of the app: everything except the session log, which stays in
 *  the database and is queried rather than held in memory. */
export interface PersistedState {
  templates: Template[]
  queue: QueueItem[]
  /** The day `queue` belongs to; a new day archives it and starts empty. */
  queueDate: ISODate
  activeId: string | null
  /** Epoch ms the running stretch began, or `null` when paused/idle. */
  runningSince: number | null
  /**
   * Heartbeat written every few seconds while running. On recovery the elapsed
   * time is credited up to this mark, never up to `Date.now()` — a machine that
   * slept for eight hours must not bank eight hours of work.
   */
  lastTickAt: number | null
  settings: Settings
}

/** What the queue table owns; saved as one unit. */
export interface QueueSnapshot {
  queue: QueueItem[]
  queueDate: ISODate
  activeId: string | null
  runningSince: number | null
  lastTickAt: number | null
}

export interface TaskTotal {
  key: string
  title: string
  accent: Accent
  seconds: number
  runs: number
}

export interface DayStats {
  date: ISODate
  totalSec: number
  runs: number
  /** Distinct tasks touched, not distinct sessions. */
  taskCount: number
  /** Longest single uninterrupted stretch — the honest measure of deep work. */
  longestSec: number
  /** Stretches that ran all the way to their planned limit. */
  completed: number
  tasks: TaskTotal[]
  /** Seconds per two-hour band from 08:00 to 22:00, for the sparkline. */
  bands: number[]
}

export const BAND_START_HOUR = 8
export const BAND_HOURS = 2
export const BAND_COUNT = 7

export function emptyDayStats(date: ISODate): DayStats {
  return {
    date,
    totalSec: 0,
    runs: 0,
    taskCount: 0,
    longestSec: 0,
    completed: 0,
    tasks: [],
    bands: new Array<number>(BAND_COUNT).fill(0)
  }
}

export const DEFAULT_SETTINGS: Settings = {
  notifications: true,
  sound: true,
  autoAdvance: false,
  pauseOnSleep: true,
  language: 'system'
}

// ---------------------------------------------------------------------------
// Statistics export
// ---------------------------------------------------------------------------

/** One task as the export dialog lists it: totals over the chosen period. */
export interface ExportTask {
  /** `templateId`, or `title:<title>` for ad-hoc tasks — same key stats use. */
  key: string
  title: string
  accent: Accent
  seconds: number
  runs: number
}

/** What `export:tasks` answers: the period's tasks plus the log's first day,
 *  which is what «за всё время» resolves to. */
export interface ExportInventory {
  tasks: ExportTask[]
  firstDate: ISODate | null
}

/** The report's optional blocks, shared by both ways of building one. */
export interface ReportSections {
  /** Append the raw list of individual runs. */
  includeSessions: boolean
  /** Include the day-by-day breakdown. */
  includeDays: boolean
  /** Include the hour-of-day distribution. */
  includeHours: boolean
}

export interface ExportOptions extends ReportSections {
  format: 'json' | 'pdf'
  from: ISODate
  to: ISODate
  /** Task keys to include; `null` means every task in the period. */
  taskKeys: string[] | null
}

export interface ExportResult {
  status: 'saved' | 'canceled' | 'empty'
  /** Present when `status` is `saved`. */
  path?: string
}

// ---------------------------------------------------------------------------
// Report written by hand
// ---------------------------------------------------------------------------

/**
 * One line of a hand-written report: work the tracker never saw, typed in
 * after the fact. Deliberately NOT a `Session` — the session log stays a
 * record of what was actually timed, so the statistics never quietly gain
 * hours nobody measured. Manual entries live in their own draft and reach
 * paper only through the export dialog.
 */
export interface ManualEntry {
  id: string
  title: string
  /** What was actually done; empty when the title says enough. Printed under
   *  the line in the report's list of runs, where per-line detail belongs. */
  description: string
  date: ISODate
  /**
   * Local wall-clock start, `HH:MM`, or `null` when the line records only how
   * long the work took. Optional on purpose: reconstructing a week from memory,
   * the hours are the thing you know and the clock rarely is.
   */
  startTime: string | null
  durationSec: number
  /** Emoji shown in front of the title; `null` falls back to the colour dot. */
  icon: string | null
  accent: Accent
}

export interface ManualExportOptions extends ReportSections {
  format: 'json' | 'pdf'
  entries: ManualEntry[]
  /**
   * Emoji -> data-URI PNG for the icons in use. The report is printed by an
   * offscreen window that cannot reach the renderer's bundled artwork, so the
   * pictures travel with the request rather than being looked up on the way.
   */
  icons: Record<string, string>
}

/**
 * A hand-written report kept under a name, so it can be reopened and reworked
 * rather than composed from scratch every month.
 */
export interface ManualReport {
  id: string
  name: string
  entries: ManualEntry[]
  createdAt: number
  updatedAt: number
}

/**
 * What the export dialog is holding right now: a saved report being edited, or
 * one that has never been saved (`id: null`). Written back on every change, so
 * closing the dialog — or the app — is not the same as losing the work.
 */
export interface ManualDraft {
  id: string | null
  name: string
  entries: ManualEntry[]
}

/** A row of the saved-reports list: everything except the lines themselves. */
export interface ManualReportSummary {
  id: string
  name: string
  entryCount: number
  totalSec: number
  updatedAt: number
}

/** Guard rails for hand-typed input, applied on both sides of the bridge. */
export const MANUAL_MAX_ENTRIES = 500
export const MANUAL_MAX_NAME = 120
export const MANUAL_MAX_TITLE = 200
export const MANUAL_MAX_DESCRIPTION = 400
/** A single entry cannot outrun the day it is dated. */
export const MANUAL_MAX_HOURS = 24
/**
 * The shortest length the form offers. The store itself accepts less, so a line
 * written by an older build is never dropped on the way back in — a form is
 * about what is worth typing, a validator about what is sane.
 */
export const MANUAL_MIN_HOURS = 0.1
