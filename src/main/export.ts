import { app, BrowserWindow, dialog } from 'electron'
import { unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  BAND_COUNT,
  BAND_HOURS,
  BAND_START_HOUR,
  type Accent,
  type ExportOptions,
  type ExportResult,
  type ISODate,
  type ManualExportOptions,
  type ReportSections,
  type Session
} from '../shared/types'
import * as db from './db'
import { resolveAppLang } from './lang'
import { readEntries, readIcons, toReportSession } from './manual'
import {
  buildReportHtml,
  type ReportData,
  type ReportDay,
  type ReportSession,
  type ReportTask
} from './report'

const sessionKey = (s: Session): string => s.templateId ?? `title:${s.title}`

/**
 * Everything the report needs, folded out of a flat list of runs. Both sources
 * — the tracked log and a hand-written draft — come through here, so the two
 * kinds of report are the same document built from the same arithmetic.
 */
function aggregate(
  sessions: ReportSession[],
  from: ISODate,
  to: ISODate,
  sections: ReportSections,
  icons: Record<string, string>
): ReportData {
  const taskMap = new Map<string, ReportTask>()
  const dayMap = new Map<ISODate, ReportDay & { taskMap: Map<string, ReportDay['tasks'][number]> }>()
  const bands = new Array<number>(BAND_COUNT).fill(0)
  let totalSec = 0
  let reachedLimit = 0
  let longestSec = 0

  for (const s of sessions) {
    totalSec += s.durationSec
    longestSec = Math.max(longestSec, s.durationSec)
    if (s.reachedLimit) reachedLimit += 1

    const key = sessionKey(s)
    const task = taskMap.get(key) ?? {
      title: s.title,
      accent: s.accent,
      icon: s.icon ?? null,
      seconds: 0,
      runs: 0,
      reachedLimit: 0,
      share: 0
    }
    task.seconds += s.durationSec
    task.runs += 1
    if (s.reachedLimit) task.reachedLimit += 1
    // A renamed template keeps one row: the latest title wins, like in the app.
    task.title = s.title
    // One line of a task carrying an icon lends it to the whole row; the first
    // one wins, so a later blank entry cannot strip the task of its picture.
    task.icon = task.icon ?? s.icon ?? null
    taskMap.set(key, task)

    const day = dayMap.get(s.date) ?? {
      date: s.date,
      totalSec: 0,
      runs: 0,
      tasks: [],
      taskMap: new Map<string, ReportDay['tasks'][number]>()
    }
    day.totalSec += s.durationSec
    day.runs += 1
    const dayTask = day.taskMap.get(key) ?? {
      title: s.title,
      accent: s.accent,
      icon: s.icon ?? null,
      seconds: 0
    }
    dayTask.seconds += s.durationSec
    day.taskMap.set(key, dayTask)
    dayMap.set(s.date, day)

    // A run with no time of day has no place on a chart of times of day.
    if (s.untimed) continue
    const hour = new Date(s.startedAt).getHours()
    const band = Math.floor((hour - BAND_START_HOUR) / BAND_HOURS)
    // Out-of-window hours are dropped from the bands, never mislabelled.
    if (band >= 0 && band < BAND_COUNT) bands[band] += s.durationSec
  }

  const tasks = [...taskMap.values()]
    .sort((a, b) => b.seconds - a.seconds)
    .map((t) => ({ ...t, share: totalSec > 0 ? t.seconds / totalSec : 0 }))

  const days: ReportDay[] = [...dayMap.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ taskMap: perTask, ...day }) => ({
      ...day,
      tasks: [...perTask.values()].sort((a, b) => b.seconds - a.seconds)
    }))

  // Only the icons the page actually spends: the map arrives from the renderer
  // and each entry costs several kilobytes of base64 in the printed HTML.
  const used = new Set(sessions.map((s) => s.icon).filter((i): i is string => Boolean(i)))
  const usedIcons: Record<string, string> = {}
  for (const icon of used) if (icons[icon]) usedIcons[icon] = icons[icon]

  return {
    lang: resolveAppLang(db.languageSetting()),
    from,
    to,
    generatedAt: Date.now(),
    totalSec,
    runs: sessions.length,
    dayCount: days.length,
    reachedLimit,
    longestSec,
    tasks,
    days: sections.includeDays ? days : null,
    // A chart of nothing is not a chart. Every line of a hand-written report
    // may be untimed, and out-of-window hours drop out too, so the section is
    // asked for by the checkbox but earned by the data.
    bands: sections.includeHours && bands.some((seconds) => seconds > 0) ? bands : null,
    sessions: sections.includeSessions ? sessions : null,
    icons: usedIcons
  }
}

/** The tracked log, filtered to the chosen period and tasks. */
function collect(options: ExportOptions): ReportData | null {
  let sessions = db.sessionsBetween(options.from, options.to)
  if (options.taskKeys !== null) {
    const wanted = new Set(options.taskKeys)
    sessions = sessions.filter((s) => wanted.has(sessionKey(s)))
  }
  if (sessions.length === 0) return null
  return aggregate(sessions, options.from, options.to, options, {})
}

// ---------------------------------------------------------------------------
// Hand-written reports
// ---------------------------------------------------------------------------

function collectManual(options: ManualExportOptions): ReportData | null {
  const entries = readEntries(options.entries)
  if (entries.length === 0) return null
  const sessions = entries
    .map(toReportSession)
    // Timed lines first, in clock order; the ones with no clock close the day.
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        Number(a.untimed ?? false) - Number(b.untimed ?? false) ||
        a.startedAt - b.startedAt ||
        a.title.localeCompare(b.title)
    )
  // The period is whatever the lines span; there is no picker to disagree with.
  const dates = sessions.map((s) => s.date).sort()
  return aggregate(sessions, dates[0], dates[dates.length - 1], options, readIcons(options.icons))
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** The JSON shape mirrors the report: summary first, detail only if asked. */
function buildJson(data: ReportData): string {
  const accentOut = (accent: Accent): string => accent
  return JSON.stringify(
    {
      app: 'time-tracker',
      exportedAt: new Date(data.generatedAt).toISOString(),
      period: { from: data.from, to: data.to },
      totals: {
        seconds: data.totalSec,
        runs: data.runs,
        tasks: data.tasks.length,
        daysWithWork: data.dayCount,
        runsReachedLimit: data.reachedLimit,
        longestRunSeconds: data.longestSec
      },
      tasks: data.tasks.map((t) => ({
        title: t.title,
        accent: accentOut(t.accent),
        icon: t.icon ?? undefined,
        seconds: t.seconds,
        runs: t.runs,
        runsReachedLimit: t.reachedLimit,
        share: Number(t.share.toFixed(4))
      })),
      days: data.days?.map((d) => ({
        date: d.date,
        seconds: d.totalSec,
        runs: d.runs,
        tasks: d.tasks.map((t) => ({ title: t.title, seconds: t.seconds }))
      })),
      hourBands: data.bands
        ? data.bands.map((seconds, index) => ({
            from: `${String(BAND_START_HOUR + index * BAND_HOURS).padStart(2, '0')}:00`,
            to: `${String(BAND_START_HOUR + (index + 1) * BAND_HOURS).padStart(2, '0')}:00`,
            seconds
          }))
        : undefined,
      sessions: data.sessions?.map((s) => ({
        date: s.date,
        title: s.title,
        description: s.description || undefined,
        icon: s.icon ?? undefined,
        // A placeholder midnight would read as a fact; an untimed line simply
        // has no clock, and says so by leaving the fields out.
        startedAt: s.untimed ? undefined : new Date(s.startedAt).toISOString(),
        endedAt: s.untimed ? undefined : new Date(s.endedAt).toISOString(),
        durationSeconds: s.durationSec,
        limitSeconds: s.limitSec,
        reachedLimit: s.reachedLimit
      }))
    },
    null,
    2
  )
}

async function renderPdf(html: string): Promise<Buffer> {
  const worker = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true }
  })
  // Through a temp file, not a data: URL — percent-encoding a year's report
  // blows past Chromium's 2 MB URL cap and the export dies silently.
  const htmlPath = join(app.getPath('temp'), `time-tracker-report-${Date.now()}.html`)
  try {
    await writeFile(htmlPath, html, 'utf8')
    await worker.loadFile(htmlPath)
    return await worker.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { top: 0.55, bottom: 0.6, left: 0.6, right: 0.6 }
    })
  } finally {
    worker.destroy()
    void unlink(htmlPath).catch(() => {})
  }
}

/** Ask where it goes, render it, write it — the same for both sources. */
async function save(
  owner: BrowserWindow | null,
  data: ReportData,
  format: 'json' | 'pdf'
): Promise<ExportResult> {
  const filename = `time-tracker_${data.from}_${data.to}.${format}`
  const picked = await dialog.showSaveDialog(owner ?? BrowserWindow.getAllWindows()[0], {
    title: data.lang === 'en' ? 'Statistics export' : 'Экспорт статистики',
    defaultPath: join(app.getPath('documents'), filename),
    filters:
      format === 'json'
        ? [{ name: 'JSON', extensions: ['json'] }]
        : [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (picked.canceled || !picked.filePath) return { status: 'canceled' }

  const payload = format === 'json' ? buildJson(data) : await renderPdf(buildReportHtml(data))
  await writeFile(picked.filePath, payload)
  return { status: 'saved', path: picked.filePath }
}

export async function runExport(
  owner: BrowserWindow | null,
  options: ExportOptions
): Promise<ExportResult> {
  const data = collect(options)
  if (!data) return { status: 'empty' }
  return save(owner, data, options.format)
}

export async function runManualExport(
  owner: BrowserWindow | null,
  options: ManualExportOptions
): Promise<ExportResult> {
  const data = collectManual(options)
  if (!data) return { status: 'empty' }
  return save(owner, data, options.format === 'json' ? 'json' : 'pdf')
}
