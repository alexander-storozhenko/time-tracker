import { useEffect, useMemo, useRef } from 'react'
import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@morze/ui'
import type { QueueItem } from '@shared/types'
import { tone } from '@/lib/accents'
import { t } from '@/lib/i18n'
import { playLimitChime } from '@/lib/chime'
import { elapsedOf, useStore } from '@/lib/store'
import { toast } from '@/lib/toast'
import { formatClock, formatLimit, speakClock } from '@/lib/time'
import { PauseIcon, PlayIcon, StopIcon } from './icons'

const RADIUS = 45
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

interface Shape {
  /** Seconds shown on the face. */
  display: number
  /** 0…1 of the planned limit; 0 when the task has none. */
  progress: number
  over: boolean
  elapsed: number
}

function shapeOf(item: QueueItem | null, elapsed: number): Shape {
  if (!item) return { display: 0, progress: 0, over: false, elapsed: 0 }
  if (item.limitSec === null) {
    // A stopwatch has no target to fill toward, so its bar is a sweep hand:
    // one full lap per minute, then start over — the dial reads as alive.
    return { display: elapsed, progress: (elapsed % 60) / 60, over: false, elapsed }
  }
  const remaining = item.limitSec - elapsed
  return {
    display: Math.abs(remaining),
    progress: Math.min(1, elapsed / item.limitSec),
    over: remaining < 0,
    elapsed
  }
}

export function TimerStage({
  compact = false,
  barExtras
}: {
  /** Driven by the queue's scroll: true morphs the dial into the header bar. */
  compact?: boolean
  /** Rendered at the bar's right end — the topbar's contents move in here
   *  while their own container is folded away. */
  barExtras?: React.ReactNode
}): React.JSX.Element {
  const { state, dispatch, now } = useStore()

  const active = state.queue.find((q) => q.id === state.activeId) ?? null
  const nextUp = state.queue.find((q) => q.status === 'pending') ?? null
  /** With nothing running the dial previews the task that `play` would pick up. */
  const subject = active ?? nextUp
  const running = state.runningSince !== null && active !== null

  const elapsed = active ? elapsedOf(state, active, now) : (subject?.elapsedSec ?? 0)
  const shape = shapeOf(subject, active ? elapsed : (subject?.elapsedSec ?? 0))

  const accent = subject?.accent ?? 'slate'
  const toneStyle = shape.over
    ? ({ ['--tone' as string]: 'var(--mz-danger-rgb)' } as React.CSSProperties)
    : tone(accent)

  const hint = subject
    ? subject.limitSec === null
      ? t().noLimit
      : shape.over
        ? t().overLimit(formatLimit(subject.limitSec))
        : t().ofLimit(formatLimit(subject.limitSec))
    : t().addTask


  // ---- limit reached ------------------------------------------------------
  const announcedFor = useRef<string | null>(null)

  // Reset per task, not per run — and BEFORE the limit effect below: effects
  // run in declaration order, and the reverse order re-announced (double
  // chime) on resuming an already-over task.
  useEffect(() => {
    announcedFor.current = null
  }, [state.activeId])

  useEffect(() => {
    if (!running || !active || active.limitSec === null) return
    if (elapsed < active.limitSec) return
    if (announcedFor.current === active.id) return
    announcedFor.current = active.id

    // The chime is the cue you get without looking; it fires even when system
    // notifications are switched off, since they are separate choices.
    if (state.settings.sound) playLimitChime()

    // The in-window cue: the bottom-right stack. The settings toggle governs
    // only the system notification, which serves the app-in-background case.
    toast({
      title: t().timeUp,
      body: t().timeUpBody(active.title, formatLimit(active.limitSec)),
      tone: 'warning'
    })

    if (state.settings.notifications) {
      window.tracker.notify(t().timeUp, t().timeUpBody(active.title, formatLimit(active.limitSec)))
      window.tracker.requestAttention()
    }

    // With overrun on, the limit is a marker rather than a stop: the clock keeps
    // running and the dial switches to counting the overtime.
    if (active.overrun) return

    dispatch({ type: 'timer/finish', at: Date.now(), reachedLimit: true })
    if (state.settings.autoAdvance) {
      const following = state.queue.find((q) => q.status === 'pending' && q.id !== active.id)
      if (following) dispatch({ type: 'timer/start', id: following.id, at: Date.now() })
    }
  }, [running, active, elapsed, state.settings, state.queue, dispatch])

  // ---- controls -----------------------------------------------------------
  const start = (): void => {
    const target = active ?? nextUp
    if (target) dispatch({ type: 'timer/start', id: target.id, at: Date.now() })
  }
  const pause = (): void => dispatch({ type: 'timer/pause', at: Date.now() })
  const stop = (): void => {
    if (!active) return
    const reached = active.limitSec !== null && elapsed >= active.limitSec
    dispatch({ type: 'timer/finish', at: Date.now(), reachedLimit: reached })
  }

  // Space is the transport key everywhere else; make it work here too.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return
      // Space also activates the focused switch/button, and must keep doing
      // so — especially inside dialogs, where toggling the timer underneath
      // would be pure sabotage.
      if (target?.closest('[role="dialog"], button, [role="switch"], [role="checkbox"], a, select')) return
      if (event.code !== 'Space') return
      event.preventDefault()
      running ? pause() : start()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /**
   * Coarse status for screen readers. It changes at most once a minute, so the
   * announcement stays useful instead of shouting a new number every tick.
   */
  const announcement = useMemo(() => {
    if (!subject) return t().queueEmpty
    if (!running) return t().srPaused(subject.title)
    return shape.over
      ? t().srOver(subject.title, speakClock(shape.display))
      : subject.limitSec === null
        ? t().srRunning(subject.title, speakClock(shape.display))
        : t().srLeft(subject.title, speakClock(shape.display))
    // `shape.display` is intentionally coarsened by `speakClock` to minutes.
  }, [subject, running, shape.over, subject?.limitSec, Math.floor(shape.display / 60)])

  return (
    <section className={`stage${compact ? ' stage--compact' : ''}`} aria-label={t().timer}>
      {/* Outside both inert halves, so it keeps announcing in either form. */}
      <p role="status" aria-live="polite" className="visually-hidden">
        {announcement}
      </p>

      {/* The header form. A 0fr→1fr grid wrapper unfolds it while the full
          dial collapses below — one continuous transformation, not a swap. */}
      <div className="stage-bar-wrap" inert={!compact}>
        {/* Rendered even with no subject: folded, this bar carries the day
            total and the control cluster — an empty queue must not strip
            the window of its settings and statistics buttons. */}
        <div
          className={`stage-bar${running ? ' stage-bar--running' : ''}${shape.over ? ' stage-bar--over' : ''}`}
          style={toneStyle}
        >
            <div className="stage-bar__smoke" aria-hidden="true">
              <i className="dial__blob dial__blob--1" />
              <i className="dial__blob dial__blob--2" />
              <i className="dial__blob dial__blob--3" />
              <i className="dial__blob dial__blob--4" />
            </div>
            <span className="stage-bar__time num">
              {shape.over && '+'}
              {formatClock(shape.display)}
            </span>
            <span className="stage-bar__hint">{hint}</span>
            <span className="stage-bar__actions">
              <Button
                size="icon-sm"
                onClick={start}
                disabled={running || !subject}
                aria-label={active ? t().resume : t().startTask}
              >
                <PlayIcon width={16} height={16} />
              </Button>
              <Button
                size="icon-sm"
                variant="secondary"
                onClick={pause}
                disabled={!running}
                aria-label={t().pause}
              >
                <PauseIcon width={16} height={16} />
              </Button>
              <Button
                size="icon-sm"
                variant="outline"
                onClick={stop}
                disabled={!active}
                aria-label={t().finishTask}
              >
                <StopIcon width={14} height={14} />
              </Button>
            </span>
            {barExtras && <span className="stage-bar__extras">{barExtras}</span>}
            {/* Limited tasks fill toward the limit; a stopwatch sweeps a lap
                a minute (keyed so the reset jumps instead of animating back). */}
            <span
              className="stage-bar__progress"
              aria-hidden="true"
              key={subject?.limitSec === null ? Math.floor(shape.elapsed / 60) : 'limit'}
            >
              <i style={{ width: `${shape.progress * 100}%` }} />
            </span>
        </div>
      </div>

      <div className="stage__full" inert={compact}>
      <div
        className={`dial${running ? ' dial--running' : ''}${shape.over ? ' dial--over' : ''}`}
        style={toneStyle}
      >
        {/* Aurora: three vast colour fields — the task's tone and its two
            analogous neighbours — plus a hot core, heavily blurred and
            screen-blended, each roaming its own slow path behind the dial.
            Visible only while time is moving. Decorative only: the running
            state is spoken by the live region below. */}
        <div className="dial__smoke" aria-hidden="true">
          <i className="dial__blob dial__blob--1" />
          <i className="dial__blob dial__blob--2" />
          <i className="dial__blob dial__blob--3" />
          <i className="dial__blob dial__blob--4" />
        </div>
        <div className="dial__face" />

        {/* The ring is rotated -90° so the arc starts at 12 o'clock. The shade
            gradients are radial and centred on the dial, so rotation cannot
            skew them; only the offset circles and the drop-shadow live in the
            rotated frame, where screen-up is svg +x — a circle is nudged
            screen-up by raising cx. */}
        <svg className="dial__ring" viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            {/* Both shades follow the stroke's own cross-section: each stop
                offset is a radius over 50. The groove (band 42–48) runs
                lip → wall → floor → wall → lip, darkest at its floor; the bar
                (band 42.7–47.3) runs edge → flank → crest → flank → edge,
                lightest along its crest. Concave and convex are literally the
                same profile read in opposite directions. */}
            <radialGradient id="dial-well-shade" gradientUnits="userSpaceOnUse" cx="50" cy="50" r="50">
              <stop offset="0.84" className="dial__well-stop-lip" />
              <stop offset="0.868" className="dial__well-stop-wall" />
              <stop offset="0.9" className="dial__well-stop-floor" />
              <stop offset="0.932" className="dial__well-stop-wall" />
              <stop offset="0.96" className="dial__well-stop-lip" />
            </radialGradient>
            <radialGradient id="dial-arc-shade" gradientUnits="userSpaceOnUse" cx="50" cy="50" r="50">
              <stop offset="0.854" className="dial__arc-stop-edge" />
              <stop offset="0.878" className="dial__arc-stop-flank" />
              <stop offset="0.9" className="dial__arc-stop-crest" />
              <stop offset="0.922" className="dial__arc-stop-flank" />
              <stop offset="0.946" className="dial__arc-stop-edge" />
            </radialGradient>
          </defs>

          {/* The groove: the radial shade digs it out (lit lips, shadowed
              floor); the two nudged circles add the light's direction — a soft
              shadow hugging whichever wall is screen-upper at that angle, a
              faint glare on the lower one. */}
          <circle className="dial__track" cx="50" cy="50" r={RADIUS} strokeWidth="6" />
          <circle className="dial__track-shade" cx="50.9" cy="50" r={RADIUS} strokeWidth="3" />
          <circle className="dial__track-glare" cx="48.8" cy="50" r={RADIUS} strokeWidth="1.6" />

          {subject !== null && (
            /* Keyed by tone: Chromium can fail to repaint a filtered stroke
               whose gradient stops change in place (the arc stays in the DOM
               but vanishes from the screen). Remounting the group on a colour
               change builds a fresh paint server, which always draws. The
               minute index joins the key for the no-limit sweep: at the top
               of each lap the arc resets by remounting instead of animating
               a full circle backwards. */
            <g
              key={`${shape.over ? 'over' : accent}${
                subject.limitSec === null ? `-${Math.floor(shape.elapsed / 60)}` : ''
              }`}
            >
              <circle
                className="dial__arc"
                cx="50"
                cy="50"
                r={RADIUS}
                strokeWidth="4.6"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={CIRCUMFERENCE * (1 - shape.progress)}
              />
              {/* Specular line on the crest: identical geometry (same centre,
                  radius and dash), so it tracks the bar exactly, caps
                  included. */}
              <circle
                className="dial__arc-sheen"
                cx="50"
                cy="50"
                r={RADIUS}
                strokeWidth="1.1"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={CIRCUMFERENCE * (1 - shape.progress)}
              />
            </g>
          )}
        </svg>

        <div className="dial__content">
          <div className="dial__time num">
            {shape.over && '+'}
            {formatClock(shape.display)}
          </div>
          <div className="dial__hint">{hint}</div>
        </div>
      </div>

      <div className="transport">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-lg"
              onClick={start}
              disabled={running || !subject}
              aria-label={active ? t().resume : t().startTask}
            >
              <PlayIcon width={20} height={20} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{active ? t().resume : t().start} · {t().spaceKey}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-lg"
              variant="secondary"
              onClick={pause}
              disabled={!running}
              aria-label={t().pause}
            >
              <PauseIcon width={20} height={20} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t().pause} · {t().spaceKey}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-lg"
              variant="outline"
              onClick={stop}
              disabled={!active}
              aria-label={t().finishTask}
            >
              <StopIcon width={18} height={18} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t().finishHint}</TooltipContent>
        </Tooltip>
      </div>

      </div>
    </section>
  )
}
