import { BAND_COUNT, BAND_HOURS, BAND_START_HOUR } from '../shared/types'
import type { Accent, ISODate, Session } from '../shared/types'

/**
 * The PDF is print-styled HTML rendered by an offscreen window. Everything in
 * this module is pure — no Electron imports — so the layout can be previewed
 * and tested outside the app.
 */

export interface ReportTask {
  title: string
  accent: Accent
  seconds: number
  runs: number
  /** Runs that went all the way to their planned limit. */
  reachedLimit: number
  /** 0…1 of the period total. */
  share: number
}

export interface ReportDay {
  date: ISODate
  totalSec: number
  runs: number
  tasks: Array<{ title: string; accent: Accent; seconds: number }>
}

export interface ReportData {
  lang: 'ru' | 'en'
  from: ISODate
  to: ISODate
  generatedAt: number
  totalSec: number
  runs: number
  dayCount: number
  reachedLimit: number
  longestSec: number
  tasks: ReportTask[]
  /** `null` when the section is switched off. */
  days: ReportDay[] | null
  /** Seconds per two-hour band from 08:00 to 22:00; `null` when off. */
  bands: number[] | null
  sessions: Session[] | null
}

/** The app's light-theme accents: the report prints on white. */
const ACCENT_HEX: Record<Accent, string> = {
  amber: '#c26a14',
  violet: '#7c4ae8',
  emerald: '#10af7a',
  sky: '#0e91d6',
  rose: '#e23c5c',
  slate: '#64748b'
}

const INK = '#1d1c24'
const MUTED = '#8a8794'
const HAIRLINE = '#e9e7f0'
const EMBER = '#c26a14'

interface ReportDict {
  locale: string
  totalTime: string
  runs: (n: number) => string
  tasks: (n: number) => string
  daysWithWork: (n: number) => string
  longestStretch: string
  tasksForPeriod: string
  toLimit: (n: number) => string
  hoursDist: string
  byDays: string
  allRuns: string
  thDate: string
  thTime: string
  thTask: string
  thDuration: string
  thToLimit: string
  reportTitle: string
  totalForPeriod: string
  generated: (when: string) => string
  unitH: string
  unitMin: string
  lessThanMin: string
  zeroMin: string
}

const REPORT_RU: ReportDict = {
  locale: 'ru-RU',
  totalTime: 'всего времени',
  runs: (n) => plural(n, 'подход', 'подхода', 'подходов'),
  tasks: (n) => plural(n, 'задача', 'задачи', 'задач'),
  daysWithWork: (n) => plural(n, 'день с работой', 'дня с работой', 'дней с работой'),
  longestStretch: 'самый долгий отрезок',
  tasksForPeriod: 'Задачи за период',
  toLimit: (n) => `${n} до лимита`,
  hoursDist: 'Распределение по часам',
  byDays: 'По дням',
  allRuns: 'Все подходы',
  thDate: 'Дата',
  thTime: 'Время',
  thTask: 'Задача',
  thDuration: 'Длит.',
  thToLimit: 'До лимита',
  reportTitle: 'Отчёт по времени',
  totalForPeriod: 'всего за период',
  generated: (when) => `Сформировано ${when}`,
  unitH: 'ч',
  unitMin: 'мин',
  lessThanMin: '<1 мин',
  zeroMin: '0 мин'
}

const REPORT_EN: ReportDict = {
  locale: 'en-US',
  totalTime: 'total time',
  runs: (n) => (n === 1 ? 'run' : 'runs'),
  tasks: (n) => (n === 1 ? 'task' : 'tasks'),
  daysWithWork: (n) => (n === 1 ? 'day with work' : 'days with work'),
  longestStretch: 'longest stretch',
  tasksForPeriod: 'Tasks over the period',
  toLimit: (n) => `${n} to the limit`,
  hoursDist: 'By hour of day',
  byDays: 'By day',
  allRuns: 'All runs',
  thDate: 'Date',
  thTime: 'Time',
  thTask: 'Task',
  thDuration: 'Dur.',
  thToLimit: 'To limit',
  reportTitle: 'Time report',
  totalForPeriod: 'total for period',
  generated: (when) => `Generated ${when}`,
  unitH: 'h',
  unitMin: 'min',
  lessThanMin: '<1 min',
  zeroMin: '0 min'
}

const dictOf = (data: ReportData): ReportDict => (data.lang === 'en' ? REPORT_EN : REPORT_RU)

const esc = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const duration = (d: ReportDict, totalSeconds: number): string => {
  const s = Math.max(0, Math.floor(totalSeconds))
  // Whole minutes first, then split — rounding the remainder alone yields 60
  // and prints «1 ч 60 мин» for anything within 30 s under the hour.
  const minutesTotal = Math.round(s / 60)
  const hours = Math.floor(minutesTotal / 60)
  const minutes = minutesTotal % 60
  if (hours === 0 && minutes === 0) return s > 0 ? d.lessThanMin : d.zeroMin
  if (hours === 0) return `${minutes} ${d.unitMin}`
  return minutes === 0
    ? `${hours} ${d.unitH}`
    : `${hours} ${d.unitH} ${minutes} ${d.unitMin}`
}

const compact = (d: ReportDict, totalSeconds: number): string => {
  const s = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}` : `${minutes} ${d.unitMin}`
}

const localDate = (iso: ISODate): Date => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const longDate = (locale: string, iso: ISODate): string =>
  new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(
    localDate(iso)
  )

const dayHeading = (locale: string, iso: ISODate): string => {
  const text = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).format(localDate(iso))
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const clockTime = (locale: string, epochMs: number): string =>
  new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(epochMs))

const plural = (count: number, one: string, few: string, many: string): string => {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

/** A palette lookup that survives an unknown accent from an old import. */
const hexOf = (accent: Accent): string => ACCENT_HEX[accent] ?? ACCENT_HEX.slate

const dot = (accent: Accent): string =>
  `<i class="dot" style="background:${hexOf(accent)}"></i>`

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function kpis(data: ReportData): string {
  const d = dictOf(data)
  const cells: Array<[string, string]> = [
    [duration(d, data.totalSec), d.totalTime],
    [String(data.runs), d.runs(data.runs)],
    [String(data.tasks.length), d.tasks(data.tasks.length)],
    [String(data.dayCount), d.daysWithWork(data.dayCount)],
    [duration(d, data.longestSec), d.longestStretch]
  ]
  return `<div class="kpis">${cells
    .map(([value, label]) => `<div class="kpi"><b>${value}</b><span>${label}</span></div>`)
    .join('')}</div>`
}

function taskTable(data: ReportData): string {
  const d = dictOf(data)
  const rows = data.tasks
    .map((task) => {
      const percent = Math.round(task.share * 100)
      const runsNote =
        `${task.runs} ${d.runs(task.runs)}` +
        (task.reachedLimit > 0 ? ` · ${d.toLimit(task.reachedLimit)}` : '')
      return `<div class="trow">
        <div class="trow__head">
          <span class="trow__title">${dot(task.accent)}${esc(task.title)}</span>
          <span class="trow__meta">${runsNote}</span>
          <span class="trow__time">${duration(d, task.seconds)}</span>
          <span class="trow__share">${percent}%</span>
        </div>
        <div class="trow__bar"><i style="width:${Math.max(1.5, task.share * 100)}%;background:${hexOf(task.accent)}"></i></div>
      </div>`
    })
    .join('')
  return `<section class="block"><h2>${d.tasksForPeriod}</h2>${rows}</section>`
}

function hoursChart(d: ReportDict, bands: number[]): string {
  // One label per band, derived from the same constants as the data — a
  // hand-written list once had 8 labels under 7 bars.
  const labels = Array.from({ length: BAND_COUNT }, (_, i) =>
    String(BAND_START_HOUR + i * BAND_HOURS).padStart(2, '0')
  )
  const peak = Math.max(...bands, 1)
  const bars = bands
    .map((seconds) => {
      const h = seconds === 0 ? 0 : Math.max(5, (seconds / peak) * 100)
      const value = seconds === 0 ? '' : `<em>${compact(d, seconds)}</em>`
      return `<div class="hcol">${value}<i style="height:${h}%" class="${seconds === 0 ? 'hbar hbar--empty' : 'hbar'}"></i></div>`
    })
    .join('')
  return `<section class="block block--keep"><h2>${d.hoursDist}</h2>
    <div class="hours">${bars}</div>
    <div class="hours__axis">${labels.map((l) => `<span>${l}</span>`).join('')}</div>
  </section>`
}

function dayBreakdown(d: ReportDict, days: ReportDay[]): string {
  const blocks = days
    .map((day) => {
      const rows = day.tasks
        .map(
          (task) => `<div class="drow">
            <span class="drow__title">${dot(task.accent)}${esc(task.title)}</span>
            <span class="drow__dots"></span>
            <span class="drow__time">${duration(d, task.seconds)}</span>
          </div>`
        )
        .join('')
      return `<div class="day">
        <div class="day__head">
          <span class="day__date">${dayHeading(d.locale, day.date)}</span>
          <span class="day__total">${duration(d, day.totalSec)}</span>
        </div>
        ${rows}
      </div>`
    })
    .join('')
  return `<section class="block"><h2>${d.byDays}</h2><div class="days">${blocks}</div></section>`
}

function sessionsTable(d: ReportDict, sessions: Session[], withYear: boolean): string {
  const shortDate = (iso: ISODate): string =>
    new Intl.DateTimeFormat(
      d.locale,
      withYear
        ? { day: 'numeric', month: 'short', year: 'numeric' }
        : { day: 'numeric', month: 'short' }
    ).format(localDate(iso))
  const rows = sessions
    .map(
      (s) => `<tr>
        <td>${shortDate(s.date)}</td>
        <td class="num">${clockTime(d.locale, s.startedAt)}–${clockTime(d.locale, s.endedAt)}</td>
        <td>${dot(s.accent)}${esc(s.title)}</td>
        <td class="num">${compact(d, s.durationSec)}</td>
        <td class="mark">${s.reachedLimit ? '✓' : ''}</td>
      </tr>`
    )
    .join('')
  return `<section class="block"><h2>${d.allRuns}</h2>
    <table class="sessions">
      <thead><tr><th>${d.thDate}</th><th>${d.thTime}</th><th>${d.thTask}</th><th>${d.thDuration}</th><th>${d.thToLimit}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function buildReportHtml(data: ReportData): string {
  const d = dictOf(data)
  const period =
    data.from === data.to
      ? longDate(d.locale, data.from)
      : `${longDate(d.locale, data.from)} — ${longDate(d.locale, data.to)}`
  const generated = new Intl.DateTimeFormat(d.locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(data.generatedAt))

  return `<!doctype html>
<html lang="${data.lang}">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    color: ${INK};
    font-size: 12px;
    line-height: 1.45;
  }
  .num { font-variant-numeric: tabular-nums; }

  header { padding-bottom: 16px; border-bottom: 2.5px solid ${EMBER}; }
  header .brand { font-size: 10px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: ${EMBER}; }
  header .row { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-top: 6px; }
  header h1 { font-size: 26px; letter-spacing: -0.01em; }
  header .period { color: ${MUTED}; margin-top: 3px; font-size: 13px; }
  header .total { text-align: right; }
  header .total b { display: block; font-size: 30px; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; }
  header .total span { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: ${MUTED}; }

  .kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin: 18px 0 6px; }
  .kpi { border: 1px solid ${HAIRLINE}; border-radius: 10px; padding: 10px 12px; break-inside: avoid; }
  .kpi b { display: block; font-size: 17px; font-variant-numeric: tabular-nums; }
  .kpi span { font-size: 9.5px; letter-spacing: 0.06em; text-transform: uppercase; color: ${MUTED}; }

  .block { margin-top: 26px; }
  .block--keep { break-inside: avoid; }
  h2 {
    font-size: 10.5px; letter-spacing: 0.12em; text-transform: uppercase; color: ${MUTED};
    padding-bottom: 6px; margin-bottom: 10px; border-bottom: 1px solid ${HAIRLINE};
  }
  .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 7px; vertical-align: 1px; }

  .trow { padding: 7px 0 9px; break-inside: avoid; }
  .trow__head { display: flex; align-items: baseline; gap: 10px; }
  .trow__title { font-size: 13px; font-weight: 600; }
  .trow__meta { color: ${MUTED}; font-size: 10.5px; }
  .trow__time { margin-left: auto; font-weight: 600; font-variant-numeric: tabular-nums; }
  .trow__share { width: 34px; text-align: right; color: ${MUTED}; font-variant-numeric: tabular-nums; }
  .trow__bar { height: 5px; border-radius: 99px; background: #f1eff6; margin-top: 6px; overflow: hidden; }
  .trow__bar i { display: block; height: 100%; border-radius: inherit; }

  .hours { display: flex; align-items: flex-end; gap: 8px; height: 96px; padding-top: 14px; }
  .hcol { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; gap: 4px; }
  .hcol em { font-style: normal; font-size: 9.5px; color: ${MUTED}; font-variant-numeric: tabular-nums; }
  .hbar { width: 100%; border-radius: 4px 4px 2px 2px; background: ${EMBER}; }
  .hbar--empty { background: #eeecf4; height: 3px !important; }
  .hours__axis { display: flex; gap: 8px; margin-top: 5px; color: ${MUTED}; font-size: 9.5px; }
  .hours__axis span { flex: 1; text-align: center; }

  .days { column-count: 2; column-gap: 28px; }
  .day { break-inside: avoid; margin-bottom: 16px; }
  .day__head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; padding-bottom: 4px; margin-bottom: 4px; border-bottom: 1px solid ${HAIRLINE}; }
  .day__date { font-size: 12.5px; font-weight: 600; }
  .day__total { font-weight: 600; font-variant-numeric: tabular-nums; }
  .drow { display: flex; align-items: baseline; gap: 6px; padding: 2.5px 0; font-size: 11.5px; }
  .drow__dots { flex: 1; border-bottom: 1px dotted #d9d6e3; }
  .drow__time { color: ${MUTED}; font-variant-numeric: tabular-nums; }

  table.sessions { width: 100%; border-collapse: collapse; font-size: 11px; }
  .sessions th {
    text-align: left; font-size: 9.5px; letter-spacing: 0.08em; text-transform: uppercase;
    color: ${MUTED}; font-weight: 600; padding: 4px 8px; border-bottom: 1px solid ${HAIRLINE};
  }
  .sessions td { padding: 4.5px 8px; border-bottom: 1px solid #f2f0f7; }
  .sessions tr:nth-child(even) td { background: #fafafc; }
  .sessions td.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .sessions td.mark { text-align: center; color: ${ACCENT_HEX.emerald}; }
  .sessions th:nth-child(4), .sessions td:nth-child(4) { text-align: right; }
  .sessions th:last-child { text-align: center; }

  footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid ${HAIRLINE}; color: ${MUTED}; font-size: 10px; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <header>
    <div class="brand">Time Tracker</div>
    <div class="row">
      <div>
        <h1>${d.reportTitle}</h1>
        <div class="period">${period}</div>
      </div>
      <div class="total"><b>${duration(d, data.totalSec)}</b><span>${d.totalForPeriod}</span></div>
    </div>
  </header>

  ${kpis(data)}
  ${taskTable(data)}
  ${data.bands ? hoursChart(d, data.bands) : ''}
  ${data.days ? dayBreakdown(d, data.days) : ''}
  ${data.sessions ? sessionsTable(d, data.sessions, data.from.slice(0, 4) !== data.to.slice(0, 4)) : ''}

  <footer>
    <span>${d.generated(generated)}</span>
    <span>Time Tracker</span>
  </footer>
</body>
</html>`
}
