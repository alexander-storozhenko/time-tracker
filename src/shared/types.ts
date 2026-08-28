/** Shared between the main process (persistence) and the renderer (UI). */

/** Calendar day in the user's local timezone, `YYYY-MM-DD`. */
export type ISODate = string

/** Accent keys; resolved to `--mz-tone-rgb` triples in the renderer. */
export const ACCENTS = ['amber', 'violet', 'emerald', 'sky', 'rose', 'slate'] as const
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

export interface ExportOptions {
  format: 'json' | 'pdf'
  from: ISODate
  to: ISODate
  /** Task keys to include; `null` means every task in the period. */
  taskKeys: string[] | null
  /** Append the raw list of individual runs. */
  includeSessions: boolean
  /** Include the day-by-day breakdown. */
  includeDays: boolean
  /** Include the hour-of-day distribution. */
  includeHours: boolean
}

export interface ExportResult {
  status: 'saved' | 'canceled' | 'empty'
  /** Present when `status` is `saved`. */
  path?: string
}
