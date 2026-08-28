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
  type Session
} from '../shared/types'
import * as db from './db'
import { resolveAppLang } from './lang'
import { buildReportHtml, type ReportData, type ReportDay, type ReportTask } from './report'

const sessionKey = (s: Session): string => s.templateId ?? `title:${s.title}`

/** Everything both formats need, aggregated once from the filtered sessions. */
function collect(options: ExportOptions): { data: ReportData; sessions: Session[] } | null {
  let sessions = db.sessionsBetween(options.from, options.to)
  if (options.taskKeys !== null) {
    const wanted = new Set(options.taskKeys)
    sessions = sessions.filter((s) => wanted.has(sessionKey(s)))
  }
  if (sessions.length === 0) return null

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
    const dayTask = day.taskMap.get(key) ?? { title: s.title, accent: s.accent, seconds: 0 }
    dayTask.seconds += s.durationSec
    day.taskMap.set(key, dayTask)
    dayMap.set(s.date, day)

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

  return {
    data: {
      lang: resolveAppLang(db.languageSetting()),
      from: options.from,
      to: options.to,
      generatedAt: Date.now(),
      totalSec,
      runs: sessions.length,
      dayCount: days.length,
      reachedLimit,
      longestSec,
      tasks,
      days: options.includeDays ? days : null,
      bands: options.includeHours ? bands : null,
      sessions: options.includeSessions ? sessions : null
    },
    sessions
  }
}

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
        startedAt: new Date(s.startedAt).toISOString(),
        endedAt: new Date(s.endedAt).toISOString(),
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

export async function runExport(
  owner: BrowserWindow | null,
  options: ExportOptions
): Promise<ExportResult> {
  const collected = collect(options)
  if (!collected) return { status: 'empty' }

  const extension = options.format
  const filename = `time-tracker_${options.from}_${options.to}.${extension}`
  const picked = await dialog.showSaveDialog(owner ?? BrowserWindow.getAllWindows()[0], {
    title: collected.data.lang === 'en' ? 'Statistics export' : 'Экспорт статистики',
    defaultPath: join(app.getPath('documents'), filename),
    filters:
      options.format === 'json'
        ? [{ name: 'JSON', extensions: ['json'] }]
        : [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (picked.canceled || !picked.filePath) return { status: 'canceled' }

  const payload =
    options.format === 'json'
      ? buildJson(collected.data)
      : await renderPdf(buildReportHtml(collected.data))

  await writeFile(picked.filePath, payload)
  return { status: 'saved', path: picked.filePath }
}
