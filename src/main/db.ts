import { app } from 'electron'
import { DatabaseSync } from 'node:sqlite'
import { existsSync, readFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import {
  BAND_COUNT,
  BAND_HOURS,
  BAND_START_HOUR,
  DEFAULT_SETTINGS,
  type Accent,
  type DayStats,
  type ExportInventory,
  type ISODate,
  type PersistedState,
  type QueueItem,
  type QueueSnapshot,
  type Session,
  type Settings,
  type TaskTotal,
  type Template
} from '../shared/types'

let db: DatabaseSync

const SCHEMA = `
CREATE TABLE IF NOT EXISTS templates (
  id          TEXT PRIMARY KEY,
  title       TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  limit_sec   INTEGER,
  overrun     INTEGER NOT NULL DEFAULT 0,
  accent      TEXT    NOT NULL,
  icon        TEXT,
  created_at  INTEGER NOT NULL,
  position    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS queue_items (
  id          TEXT PRIMARY KEY,
  template_id TEXT,
  title       TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  limit_sec   INTEGER,
  overrun     INTEGER NOT NULL DEFAULT 0,
  accent      TEXT    NOT NULL,
  icon        TEXT,
  elapsed_sec INTEGER NOT NULL DEFAULT 0,
  status      TEXT    NOT NULL,
  started_at  INTEGER,
  position    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  date          TEXT    NOT NULL,
  template_id   TEXT,
  title         TEXT    NOT NULL,
  accent        TEXT    NOT NULL,
  started_at    INTEGER NOT NULL,
  ended_at      INTEGER NOT NULL,
  duration_sec  INTEGER NOT NULL,
  limit_sec     INTEGER,
  reached_limit INTEGER NOT NULL
);

-- Every statistics query filters by day, and this table is the one that grows.
CREATE INDEX IF NOT EXISTS sessions_by_date ON sessions (date);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

const SCHEMA_VERSION = 4

/** `ALTER TABLE ADD COLUMN` has no `IF NOT EXISTS`, so ask first. */
function addColumn(table: string, column: string, definition: string): void {
  const columns = rows<{ name: string }>(db.prepare(`PRAGMA table_info(${table})`).all())
  if (columns.some((c) => c.name === column)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

export function dbFilePath(): string {
  return join(app.getPath('userData'), 'time-tracker.db')
}

function legacyJsonPath(): string {
  return join(app.getPath('userData'), 'time-tracker.json')
}

/** SQLite takes no booleans; every flag crosses this boundary as 0 or 1. */
const bit = (value: boolean): number => (value ? 1 : 0)

/**
 * `node:sqlite` types every column as `SQLOutputValue`. The shape of each row is
 * fixed by the SELECT right above it, so these narrow it in one place instead of
 * scattering double casts through every query.
 */
const rows = <T>(result: unknown): T[] => result as T[]
const one = <T>(result: unknown): T => result as T

function getMeta(key: string): string | null {
  const row = one<{ value: string } | undefined>(
    db.prepare('SELECT value FROM meta WHERE key = ?').get(key)
  )
  return row?.value ?? null
}

function setMeta(key: string, value: string | null): void {
  if (value === null) {
    db.prepare('DELETE FROM meta WHERE key = ?').run(key)
    return
  }
  db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value)
}

function transaction(work: () => void): void {
  db.exec('BEGIN')
  try {
    work()
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

// ---------------------------------------------------------------------------
// Rows -> domain
// ---------------------------------------------------------------------------

interface TemplateRow {
  id: string
  title: string
  description: string
  limit_sec: number | null
  overrun: number
  accent: string
  icon: string | null
  created_at: number
}

interface QueueRow extends TemplateRow {
  template_id: string | null
  elapsed_sec: number
  status: string
  started_at: number | null
}

const toTemplate = (row: TemplateRow): Template => ({
  id: row.id,
  title: row.title,
  description: row.description,
  limitSec: row.limit_sec,
  overrun: row.overrun === 1,
  accent: row.accent as Accent,
  icon: row.icon,
  createdAt: row.created_at
})

const toQueueItem = (row: QueueRow): QueueItem => ({
  id: row.id,
  templateId: row.template_id,
  title: row.title,
  description: row.description,
  limitSec: row.limit_sec,
  overrun: row.overrun === 1,
  accent: row.accent as Accent,
  icon: row.icon,
  elapsedSec: row.elapsed_sec,
  status: row.status as QueueItem['status'],
  startedAt: row.started_at
})

// ---------------------------------------------------------------------------
// Seed and migration
// ---------------------------------------------------------------------------

function seedTemplates(): void {
  const now = Date.now()
  // Deep work overruns by default — running out the clock mid-thought is the
  // one case where stopping the timer is the wrong answer.
  const seeds: Array<[string, number | null, boolean, Accent, string]> = [
    ['Глубокая работа', 50 * 60, true, 'amber', '🧠'],
    ['Ревью кода', 25 * 60, false, 'violet', '🔍'],
    ['Созвон', 30 * 60, false, 'sky', '📞'],
    ['Разбор почты', 15 * 60, false, 'slate', '📥'],
    ['Перерыв', 5 * 60, false, 'emerald', '☕']
  ]
  const insert = db.prepare(
    'INSERT INTO templates (id, title, limit_sec, overrun, accent, icon, created_at, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  )
  seeds.forEach(([title, limitSec, overrun, accent, icon], index) => {
    insert.run(crypto.randomUUID(), title, limitSec, bit(overrun), accent, icon, now + index, index)
  })
}

/**
 * Earlier builds kept everything in one JSON file. Fold it in once, then move it
 * aside so a later launch cannot import the same sessions a second time.
 */
function importLegacyJson(): 'ok' | 'absent' | 'failed' {
  const path = legacyJsonPath()
  if (!existsSync(path)) return 'absent'

  try {
    const data = JSON.parse(readFileSync(path, 'utf8'))
    transaction(() => {
      const templates: Template[] = Array.isArray(data.templates) ? data.templates : []
      const insertTemplate = db.prepare(
        'INSERT OR REPLACE INTO templates (id, title, limit_sec, overrun, accent, created_at, position) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      templates.forEach((t, index) => {
        insertTemplate.run(
          t.id,
          t.title,
          t.limitSec ?? null,
          bit(Boolean(t.overrun)),
          t.accent,
          t.createdAt ?? Date.now(),
          index
        )
      })

      const sessions: Session[] = Array.isArray(data.sessions) ? data.sessions : []
      const insertSession = db.prepare(
        `INSERT OR REPLACE INTO sessions
         (id, date, template_id, title, accent, started_at, ended_at, duration_sec, limit_sec, reached_limit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      for (const s of sessions) {
        insertSession.run(
          s.id,
          s.date,
          s.templateId ?? null,
          s.title,
          s.accent,
          s.startedAt,
          s.endedAt,
          s.durationSec,
          s.limitSec ?? null,
          bit(Boolean(s.reachedLimit))
        )
      }

      // The queue is today's plan; dropping it on upgrade would look like the
      // app forgot what you were in the middle of.
      const queue: QueueItem[] = Array.isArray(data.queue) ? data.queue : []
      const insertQueueItem = db.prepare(
        `INSERT OR REPLACE INTO queue_items
         (id, template_id, title, limit_sec, overrun, accent, elapsed_sec, status, started_at, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      queue.forEach((item, index) => {
        insertQueueItem.run(
          item.id,
          item.templateId ?? null,
          item.title,
          item.limitSec ?? null,
          bit(Boolean(item.overrun)),
          item.accent,
          Math.round(item.elapsedSec ?? 0),
          item.status,
          item.startedAt ?? null,
          index
        )
      })

      if (data.settings) setMeta('settings', JSON.stringify(data.settings))
      if (data.queueDate) setMeta('queueDate', String(data.queueDate))
      if (data.activeId) setMeta('activeId', String(data.activeId))
      // `runningSince` is deliberately not carried over: an import is a cold
      // start, and a stretch left open in the old file has no heartbeat to
      // bound it, so it would credit unbounded time.
    })

    renameSync(path, `${path}.imported`)
    console.log(`[db] imported legacy JSON (${(data.sessions ?? []).length} sessions)`)
    return 'ok'
  } catch (err) {
    console.error('[db] could not import legacy JSON:', err)
    return 'failed'
  }
}

export function open(): void {
  db = new DatabaseSync(dbFilePath())
  // WAL survives a hard kill mid-write, which a timer app does on every quit.
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(SCHEMA)

  const version = Number(getMeta('schemaVersion') ?? '0')

  // Column migrations FIRST: the import/seed below writes into these columns,
  // and an old file that predates them would otherwise crash the boot.
  // `addColumn` asks PRAGMA table_info, so re-running is free on a fresh file.
  // v2 added the per-task over-limit behaviour; v3 the description; v4 the icon.
  if (version < 2) {
    addColumn('templates', 'overrun', 'INTEGER NOT NULL DEFAULT 0')
    addColumn('queue_items', 'overrun', 'INTEGER NOT NULL DEFAULT 0')
  }
  if (version < 3) {
    addColumn('templates', 'description', "TEXT NOT NULL DEFAULT ''")
    addColumn('queue_items', 'description', "TEXT NOT NULL DEFAULT ''")
  }
  if (version < 4) {
    addColumn('templates', 'icon', 'TEXT')
    addColumn('queue_items', 'icon', 'TEXT')
  }

  let importFailed = false
  if (version === 0) {
    const imported = importLegacyJson()
    importFailed = imported === 'failed'
    const count = one<{ n: number }>(db.prepare('SELECT COUNT(*) AS n FROM templates').get())
    if (imported === 'absent' && count.n === 0) seedTemplates()
  }

  // A failed import keeps the version at 0, so the next launch retries it
  // instead of locking the legacy file out forever.
  if (!importFailed) setMeta('schemaVersion', String(SCHEMA_VERSION))
}

let dbClosed = false

export function close(): void {
  dbClosed = true
  db?.close()
}

/** True while writes are still allowed; quit-time stragglers check first. */
export function isOpen(): boolean {
  return !dbClosed && db !== undefined
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function loadState(): PersistedState {
  const templates = rows<TemplateRow>(
    db.prepare('SELECT * FROM templates ORDER BY position, created_at').all()
  ).map(toTemplate)

  const queue = rows<QueueRow>(
    db.prepare('SELECT * FROM queue_items ORDER BY position').all()
  ).map(toQueueItem)

  // Picked key by key rather than spread, so a setting that was removed from
  // the app does not live on forever in the stored blob. A blob truncated by
  // a crash mid-write must not take the whole app down with it.
  let stored: Partial<Settings> = {}
  try {
    const raw = getMeta('settings')
    if (raw) stored = JSON.parse(raw) as Partial<Settings>
  } catch {
    /* defaults below */
  }
  const settings: Settings = {
    notifications: stored.notifications ?? DEFAULT_SETTINGS.notifications,
    sound: stored.sound ?? DEFAULT_SETTINGS.sound,
    autoAdvance: stored.autoAdvance ?? DEFAULT_SETTINGS.autoAdvance,
    pauseOnSleep: stored.pauseOnSleep ?? DEFAULT_SETTINGS.pauseOnSleep,
    language: stored.language ?? DEFAULT_SETTINGS.language
  }

  const num = (key: string): number | null => {
    const raw = getMeta(key)
    return raw === null ? null : Number(raw)
  }

  return {
    templates,
    queue,
    queueDate: getMeta('queueDate') ?? '',
    activeId: getMeta('activeId'),
    runningSince: num('runningSince'),
    lastTickAt: num('lastTickAt'),
    settings
  }
}

export function dayStats(date: ISODate): DayStats {
  const totals = db
    .prepare(
      `SELECT COALESCE(SUM(duration_sec), 0) AS total,
              COUNT(*)                       AS runs,
              COALESCE(MAX(duration_sec), 0) AS longest,
              COALESCE(SUM(reached_limit), 0) AS completed
       FROM sessions WHERE date = ?`
    )
    .get(date)
  const summary = one<{ total: number; runs: number; longest: number; completed: number }>(totals)

  // `title` and `accent` are bare columns here: within one template they are the
  // same row after row, and a renamed template only shows its older label until
  // the next session lands.
  const tasks = rows<{ key: string; title: string; accent: string; seconds: number; runs: number }>(
    db
      .prepare(
        `SELECT COALESCE(template_id, 'title:' || title) AS key,
                title, accent,
                SUM(duration_sec) AS seconds,
                COUNT(*)          AS runs
         FROM sessions WHERE date = ?
       GROUP BY key
       ORDER BY seconds DESC`
      )
      .all(date)
  )

  const bandRows = rows<{ hour: number; seconds: number }>(
    db
      .prepare(
        `SELECT CAST(strftime('%H', started_at / 1000, 'unixepoch', 'localtime') AS INTEGER) AS hour,
                SUM(duration_sec) AS seconds
         FROM sessions WHERE date = ?
         GROUP BY hour`
      )
      .all(date)
  )

  const bands = new Array<number>(BAND_COUNT).fill(0)
  for (const row of bandRows) {
    const index = Math.floor((row.hour - BAND_START_HOUR) / BAND_HOURS)
    // Work outside the 08:00–22:00 window stays out of the chart rather than
    // being folded into the edge bands under the wrong label.
    if (index >= 0 && index < BAND_COUNT) bands[index] += row.seconds
  }

  return {
    date,
    totalSec: summary.total,
    runs: summary.runs,
    taskCount: tasks.length,
    longestSec: summary.longest,
    completed: summary.completed,
    tasks: tasks.map(
      (t): TaskTotal => ({
        key: t.key,
        title: t.title,
        accent: t.accent as Accent,
        seconds: t.seconds,
        runs: t.runs
      })
    ),
    bands
  }
}

export function statsFor(dates: ISODate[]): Record<ISODate, DayStats> {
  const result: Record<ISODate, DayStats> = {}
  for (const date of dates) result[date] = dayStats(date)
  return result
}

/** Consecutive days ending today (or yesterday) with any tracked time. */
export function streak(today: ISODate): number {
  const dates = rows<{ date: string }>(
    db
      .prepare(
        `SELECT DISTINCT date FROM sessions
         WHERE duration_sec > 0 AND date <= ?
         ORDER BY date DESC `
      )
      .all(today)
  )

  const days = new Set(dates.map((r) => r.date))
  if (days.size === 0) return 0

  const step = (back: number): ISODate => {
    const [y, m, d] = today.split('-').map(Number)
    const at = new Date(y, m - 1, d - back)
    return new Date(at.getTime() - at.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
  }

  // Today not being logged yet shouldn't read as a broken streak before lunch.
  let cursor = days.has(today) ? 0 : 1
  if (!days.has(step(cursor))) return 0

  let count = 0
  while (days.has(step(cursor))) {
    count += 1
    cursor += 1
  }
  return count
}

// ---------------------------------------------------------------------------
// Export reads
// ---------------------------------------------------------------------------

interface SessionRow {
  id: string
  date: string
  template_id: string | null
  title: string
  accent: string
  started_at: number
  ended_at: number
  duration_sec: number
  limit_sec: number | null
  reached_limit: number
}

const toSession = (row: SessionRow): Session => ({
  id: row.id,
  date: row.date,
  templateId: row.template_id,
  title: row.title,
  accent: row.accent as Accent,
  startedAt: row.started_at,
  endedAt: row.ended_at,
  durationSec: row.duration_sec,
  limitSec: row.limit_sec,
  reachedLimit: row.reached_limit === 1
})

export function sessionsBetween(from: ISODate, to: ISODate): Session[] {
  return rows<SessionRow>(
    db
      .prepare('SELECT * FROM sessions WHERE date BETWEEN ? AND ? ORDER BY started_at')
      .all(from, to)
  ).map(toSession)
}

/** Wipe one task's sessions inside the period; the export dialog's delete. */
export function deleteTaskSessions(from: ISODate, to: ISODate, key: string): number {
  const result = db
    .prepare(
      `DELETE FROM sessions
       WHERE date BETWEEN ? AND ?
         AND COALESCE(template_id, 'title:' || title) = ?`
    )
    .run(from, to, key)
  return Number(result.changes)
}

/** The export dialog's inventory: which tasks the period holds, plus the log's
 *  first day so «за всё время» has a concrete left edge. */
export function exportInventory(from: ISODate, to: ISODate): ExportInventory {
  const tasks = rows<{ key: string; title: string; accent: string; seconds: number; runs: number }>(
    db
      .prepare(
        `SELECT COALESCE(template_id, 'title:' || title) AS key,
                title, accent,
                SUM(duration_sec) AS seconds,
                COUNT(*)          AS runs
         FROM sessions WHERE date BETWEEN ? AND ?
       GROUP BY key
       ORDER BY seconds DESC`
      )
      .all(from, to)
  )

  const first = one<{ date: string | null }>(
    db.prepare('SELECT MIN(date) AS date FROM sessions').get()
  )

  return {
    tasks: tasks.map((t) => ({
      key: t.key,
      title: t.title,
      accent: t.accent as Accent,
      seconds: t.seconds,
      runs: t.runs
    })),
    firstDate: first.date
  }
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export function saveTemplates(templates: Template[]): void {
  if (!isOpen()) return
  transaction(() => {
    db.exec('DELETE FROM templates')
    const insert = db.prepare(
      'INSERT INTO templates (id, title, description, limit_sec, overrun, accent, icon, created_at, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    templates.forEach((t, index) => {
      insert.run(
        t.id,
        t.title,
        t.description ?? '',
        t.limitSec ?? null,
        bit(t.overrun),
        t.accent,
        t.icon ?? null,
        t.createdAt,
        index
      )
    })
  })
}

export function saveQueue(snapshot: QueueSnapshot): void {
  if (!isOpen()) return
  transaction(() => {
    db.exec('DELETE FROM queue_items')
    const insert = db.prepare(
      `INSERT INTO queue_items
       (id, template_id, title, description, limit_sec, overrun, accent, icon, elapsed_sec, status, started_at, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    snapshot.queue.forEach((item, index) => {
      insert.run(
        item.id,
        item.templateId ?? null,
        item.title,
        item.description ?? '',
        item.limitSec ?? null,
        bit(item.overrun),
        item.accent,
        item.icon ?? null,
        Math.round(item.elapsedSec),
        item.status,
        item.startedAt ?? null,
        index
      )
    })

    setMeta('queueDate', snapshot.queueDate)
    setMeta('activeId', snapshot.activeId)
    setMeta('runningSince', snapshot.runningSince === null ? null : String(snapshot.runningSince))
    setMeta('lastTickAt', snapshot.lastTickAt === null ? null : String(snapshot.lastTickAt))
  })
}

export function saveSettings(settings: Settings): void {
  setMeta('settings', JSON.stringify(settings))
}

/** The stored language choice alone — for the menu and reports in main. */
export function languageSetting(): 'system' | 'ru' | 'en' {
  try {
    const stored = getMeta('settings')
    const parsed = stored ? (JSON.parse(stored) as Partial<Settings>) : {}
    return parsed.language ?? 'system'
  } catch {
    return 'system'
  }
}

export function addSession(session: Session): void {
  if (!isOpen()) return
  db.prepare(
    `INSERT OR REPLACE INTO sessions
     (id, date, template_id, title, accent, started_at, ended_at, duration_sec, limit_sec, reached_limit)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    session.id,
    session.date,
    session.templateId ?? null,
    session.title,
    session.accent,
    session.startedAt,
    session.endedAt,
    session.durationSec,
    session.limitSec ?? null,
    bit(session.reachedLimit)
  )
}
