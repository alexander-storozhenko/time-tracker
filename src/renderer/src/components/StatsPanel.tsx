import { Button, Separator, Tooltip, TooltipContent, TooltipTrigger } from '@morze/ui'
import { tone } from '@/lib/accents'
import { t } from '@/lib/i18n'
import type { DayStats, TaskTotal } from '@shared/types'
import { useStats } from '@/lib/useStats'
import { formatCompact, formatDuration } from '@/lib/time'
import { ChartIcon, ClockIcon, DownloadIcon, FlameIcon } from './icons'

function TaskRow({ task, max }: { task: TaskTotal; max: number }): React.JSX.Element {
  const ratio = max > 0 ? Math.max(0.04, task.seconds / max) : 0
  return (
    <div className="stat-row" style={tone(task.accent)}>
      <span className="stat-row__title" title={task.title}>
        {task.title}
      </span>
      <span className="stat-row__value num">{formatCompact(task.seconds)}</span>
      <span className="stat-row__bar">
        <i style={{ width: `${ratio * 100}%` }} />
      </span>
    </div>
  )
}

function Sparkline({ stats }: { stats: DayStats }): React.JSX.Element {
  const peak = Math.max(...stats.bands, 1)
  const labels = ['8–10', '10–12', '12–14', '14–16', '16–18', '18–20', '20–22']
  const spoken = stats.bands
    .map((sec, i) => (sec > 0 ? `${labels[i]} — ${formatCompact(sec)}` : null))
    .filter(Boolean)
    .join(', ')

  return (
    <div style={tone('amber')}>
      <div className="spark" role="img" aria-label={t().hoursAria(spoken || t().hoursEmpty)}>
        {stats.bands.map((seconds, index) => (
          <Tooltip key={index}>
            <TooltipTrigger asChild>
              <i
                data-empty={seconds === 0}
                style={{ height: `${Math.max(5, (seconds / peak) * 100)}%` }}
              />
            </TooltipTrigger>
            <TooltipContent>
              {labels[index]} · {formatCompact(seconds)}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      {/* Bars without a scale are decoration; three ticks are enough to read them. */}
      <div className="spark-axis" aria-hidden="true">
        <span>08</span>
        <span>14</span>
        <span>22</span>
      </div>
    </div>
  )
}

function DayBlock({
  title,
  stats,
  limit,
  emptyText
}: {
  title: string
  stats: DayStats
  limit: number
  emptyText: string
}): React.JSX.Element {
  const max = stats.tasks[0]?.seconds ?? 0
  const shown = stats.tasks.slice(0, limit)
  const restSec = stats.tasks.slice(limit).reduce((sum, t) => sum + t.seconds, 0)

  return (
    <section>
      <div className="stat-block__head">
        <h3 className="label" style={{ margin: 0 }}>
          {title}
        </h3>
        <span className="stat-block__total num">{formatDuration(stats.totalSec)}</span>
      </div>

      {stats.tasks.length === 0 ? (
        <p className="empty">{emptyText}</p>
      ) : (
        <>
          {shown.map((task) => (
            <TaskRow key={task.key} task={task} max={max} />
          ))}
          {restSec > 0 && (
            <div className="stat-row" style={tone('slate')}>
              <span className="stat-row__title">{t().restRow(stats.tasks.length - limit)}</span>
              <span className="stat-row__value num">{formatCompact(restSec)}</span>
            </div>
          )}
        </>
      )}
    </section>
  )
}

export function StatsPanel({
  inDrawer = false,
  onExport
}: {
  inDrawer?: boolean
  onExport?: () => void
}): React.JSX.Element {
  const { today: todayStats, yesterday: yesterdayStats, streak } = useStats()

  const delta = todayStats.totalSec - yesterdayStats.totalSec
  const hasComparison = yesterdayStats.totalSec > 0

  return (
    <aside
      className={inDrawer ? 'stats-drawer scroll-y' : 'stats-col column scroll-y'}
      aria-label={inDrawer ? undefined : t().stats}
    >
      {/* `.stats` must sit on the direct parent of the sections — that is what
          carries the gap between them. */}
      <div className={inDrawer ? 'stats stats--flush' : 'stats'}>
        {onExport && (
          <div className="stats__head">
            {/* The drawer's Sheet header already says «Статистика». */}
            {!inDrawer && <h2 className="stats__title">{t().stats}</h2>}
            <Button variant="ghost" size="xs" onClick={onExport}>
              <DownloadIcon width={14} height={14} /> {t().exportWord}
            </Button>
          </div>
        )}

        <DayBlock title={t().today} stats={todayStats} limit={5} emptyText={t().todayEmptyText} />

        {todayStats.totalSec > 0 && <Sparkline stats={todayStats} />}

        {hasComparison && (
          <p className={`delta ${delta >= 0 ? 'delta--up' : 'delta--down'}`} style={{ margin: 0 }}>
            <ChartIcon width={14} height={14} />
            {delta >= 0 ? '+' : '−'}
            {formatDuration(Math.abs(delta))} {t().vsYesterday}
          </p>
        )}

        <div className="kpis">
          <div className="kpi">
            <div className="kpi__value num">{todayStats.completed}</div>
            <div className="kpi__label">
              <ClockIcon width={12} height={12} style={{ verticalAlign: '-2px' }} /> {t().byLimitKpi}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi__value num">{streak}</div>
            <div className="kpi__label">
              <FlameIcon width={12} height={12} style={{ verticalAlign: '-2px' }} /> {t().streakDays}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi__value num">{formatCompact(todayStats.longestSec)}</div>
            <div className="kpi__label">{t().longestKpi}</div>
          </div>
          <div className="kpi">
            <div className="kpi__value num">{todayStats.runs}</div>
            <div className="kpi__label">{t().runsKpi}</div>
          </div>
        </div>

        <Separator />

        <DayBlock
          title={t().yesterday}
          stats={yesterdayStats}
          limit={4}
          emptyText={t().yesterdayEmptyText}
        />
      </div>
    </aside>
  )
}
