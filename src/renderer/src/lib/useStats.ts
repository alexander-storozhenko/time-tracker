import { useEffect, useState } from 'react'
import { emptyDayStats, type Accent, type DayStats } from '@shared/types'
import { useStore } from './store'
import { shiftISO, todayISO } from './time'

interface LiveStretch {
  seconds: number
  key: string
  title: string
  accent: Accent
}

/**
 * Today's number has to include the stretch that is running right now — it is
 * not a session until the timer is paused or stopped, and a total that sits
 * still while the clock ticks reads as broken.
 */
function withLiveStretch(stats: DayStats, live: LiveStretch | null): DayStats {
  if (!live || live.seconds < 1) return stats

  const tasks = stats.tasks.map((task) =>
    task.key === live.key ? { ...task, seconds: task.seconds + live.seconds } : task
  )
  if (!tasks.some((task) => task.key === live.key)) {
    tasks.push({
      key: live.key,
      title: live.title,
      accent: live.accent,
      seconds: live.seconds,
      runs: 1
    })
  }

  return {
    ...stats,
    totalSec: stats.totalSec + live.seconds,
    tasks: tasks.sort((a, b) => b.seconds - a.seconds),
    taskCount: tasks.length
  }
}

export interface Stats {
  today: DayStats
  yesterday: DayStats
  streak: number
}

/**
 * One source for every number on screen, so the top bar and the panel agree.
 * The two days come from SQL and only change when a session lands or the day
 * rolls; the running seconds are merged in here, on every tick.
 */
export function useStats(): Stats {
  const { state, now } = useStore()
  const today = todayISO()
  const yesterday = shiftISO(today, -1)

  const [stored, setStored] = useState<Stats>(() => ({
    today: emptyDayStats(today),
    yesterday: emptyDayStats(yesterday),
    streak: 0
  }))

  useEffect(() => {
    if (!state.ready) return
    let cancelled = false

    Promise.all([window.tracker.dayStats([today, yesterday]), window.tracker.streak(today)])
      .then(([days, streak]) => {
        if (cancelled) return
        setStored({
          today: days[today] ?? emptyDayStats(today),
          yesterday: days[yesterday] ?? emptyDayStats(yesterday),
          streak
        })
      })
      .catch((err) => console.error('[stats] query failed:', err))

    return () => {
      cancelled = true
    }
  }, [state.ready, state.statsVersion, today, yesterday])

  const item = state.activeId ? state.queue.find((q) => q.id === state.activeId) : undefined
  const live: LiveStretch | null =
    state.runningSince !== null && item
      ? {
          seconds: Math.max(0, (now - state.runningSince) / 1000),
          key: item.templateId ?? `title:${item.title}`,
          title: item.title,
          accent: item.accent
        }
      : null

  return { ...stored, today: withLiveStretch(stored.today, live) }
}
