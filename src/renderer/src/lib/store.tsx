import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode
} from 'react'
import {
  DEFAULT_SETTINGS,
  type Accent,
  type PersistedState,
  type QueueItem,
  type Session,
  type Settings,
  type Template
} from '@shared/types'
import { resolveLang, setCurrentLang, t } from './i18n'
import { toISODate, todayISO } from './time'
import { toast } from './toast'

const uid = (): string => crypto.randomUUID()

/**
 * A heartbeat lands every 5 seconds while running; a gap this wide means the
 * machine slept (or the process froze) mid-run. The stretch is then credited
 * only up to the last heartbeat and paused — same rule as cold-start recovery.
 */
const SLEEP_GAP_MS = 30_000

export interface NewTemplate {
  title: string
  description: string
  limitSec: number | null
  overrun: boolean
  accent: Accent
  icon: string | null
}

/** A template, ready to be queued or fed back into the edit dialog. */
export function templateToDraft(template: Template): NewTemplate {
  return {
    title: template.title,
    description: template.description,
    limitSec: template.limitSec,
    overrun: template.overrun,
    accent: template.accent,
    icon: template.icon
  }
}

/** A queue item, fed back into the same edit dialog templates use. */
export function itemToDraft(item: QueueItem): NewTemplate {
  return {
    title: item.title,
    description: item.description,
    limitSec: item.limitSec,
    overrun: item.overrun,
    accent: item.accent,
    icon: item.icon
  }
}

export type Action =
  | { type: 'hydrate'; data: PersistedState; recoveredSec: number; recoveredSession: Session | null }
  | { type: 'template/add'; draft: NewTemplate }
  | { type: 'template/update'; id: string; draft: NewTemplate }
  | { type: 'template/remove'; id: string }
  | { type: 'queue/add'; draft: NewTemplate; templateId: string | null; index?: number }
  | { type: 'queue/update'; id: string; draft: NewTemplate }
  | { type: 'queue/remove'; id: string }
  | { type: 'queue/move'; id: string; toIndex: number }
  | { type: 'queue/clearDone' }
  | { type: 'timer/start'; id: string; at: number }
  | { type: 'timer/pause'; at: number }
  | { type: 'timer/finish'; at: number; reachedLimit: boolean }
  | { type: 'timer/tick'; at: number }
  | { type: 'settings/update'; patch: Partial<Settings> }
  | { type: 'stats/invalidate' }
  | { type: 'day/roll'; today: string }
  | { type: 'sessions/flushed'; ids: string[] }

export interface State extends PersistedState {
  /**
   * Finished stretches waiting to be written. The reducer stays pure, so it
   * queues them here and an effect drains the queue into the database.
   */
  pendingSessions: Session[]
  /** Bumped whenever the session log changes, to re-run the statistics query. */
  statsVersion: number
  /** Seconds credited back after an unclean shutdown; surfaced once, then dismissed. */
  recoveredSec: number
  ready: boolean
}

export const initialState: State = {
  templates: [],
  queue: [],
  queueDate: todayISO(),
  activeId: null,
  runningSince: null,
  lastTickAt: null,
  settings: { ...DEFAULT_SETTINGS },
  pendingSessions: [],
  statsVersion: 0,
  recoveredSec: 0,
  ready: false
}

/** Seconds banked so far, including the stretch currently running. */
export function elapsedOf(state: State, item: QueueItem, now: number): number {
  if (state.activeId !== item.id || state.runningSince === null) return item.elapsedSec
  return item.elapsedSec + Math.max(0, (now - state.runningSince) / 1000)
}

/** Close the open stretch: bank its seconds on the item and hand back a session. */
function bank(
  state: State,
  at: number,
  reachedLimit: boolean
): { queue: QueueItem[]; session: Session | null } {
  const item = state.queue.find((q) => q.id === state.activeId)
  if (!item || state.runningSince === null) return { queue: state.queue, session: null }

  const runSec = Math.max(0, Math.round((at - state.runningSince) / 1000))

  // A stretch under two seconds is a mis-click, not work — and it must not
  // move the item's counter either, or the row and the day total disagree.
  if (runSec < 2) return { queue: state.queue, session: null }

  const queue = state.queue.map((q) =>
    q.id === item.id ? { ...q, elapsedSec: q.elapsedSec + runSec } : q
  )

  return {
    queue,
    session: {
      id: uid(),
      // Dated by when the stretch STARTED: work banked just past midnight
      // belongs to the evening it began, not to the new day.
      date: toISODate(new Date(state.runningSince)),
      templateId: item.templateId,
      title: item.title,
      accent: item.accent,
      startedAt: state.runningSince,
      endedAt: at,
      durationSec: runSec,
      limitSec: item.limitSec,
      reachedLimit
    }
  }
}

const withSession = (state: State, session: Session | null): Session[] =>
  session ? [...state.pendingSessions, session] : state.pendingSessions

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'hydrate':
      return {
        ...state,
        ...action.data,
        // The crash-recovered stretch becomes a real session, so the recovered
        // minutes reach the statistics and the export — and survive the
        // day-roll dispatched right after hydration.
        pendingSessions: action.recoveredSession
          ? [...state.pendingSessions, action.recoveredSession]
          : state.pendingSessions,
        recoveredSec: action.recoveredSec,
        ready: true
      }

    case 'template/add':
      return {
        ...state,
        templates: [...state.templates, { id: uid(), createdAt: Date.now(), ...action.draft }]
      }

    case 'template/update':
      return {
        ...state,
        templates: state.templates.map((t) => (t.id === action.id ? { ...t, ...action.draft } : t))
      }

    case 'template/remove':
      return { ...state, templates: state.templates.filter((t) => t.id !== action.id) }

    case 'queue/add': {
      const item: QueueItem = {
        id: uid(),
        templateId: action.templateId,
        title: action.draft.title,
        description: action.draft.description,
        limitSec: action.draft.limitSec,
        overrun: action.draft.overrun,
        accent: action.draft.accent,
        icon: action.draft.icon,
        elapsedSec: 0,
        status: 'pending',
        startedAt: null
      }
      const queue = [...state.queue]
      queue.splice(action.index ?? queue.length, 0, item)
      return { ...state, queue }
    }

    // Edits this queue instance only; the template it came from stays as is.
    case 'queue/update':
      return {
        ...state,
        queue: state.queue.map((q) => (q.id === action.id ? { ...q, ...action.draft } : q))
      }

    case 'queue/remove': {
      // Removing the running task closes its stretch first — the seconds are real.
      if (state.activeId === action.id && state.runningSince !== null) {
        const banked = bank(state, Date.now(), false)
        return {
          ...state,
          queue: banked.queue.filter((q) => q.id !== action.id),
          pendingSessions: withSession(state, banked.session),
          activeId: null,
          runningSince: null,
          lastTickAt: null
        }
      }
      return {
        ...state,
        queue: state.queue.filter((q) => q.id !== action.id),
        activeId: state.activeId === action.id ? null : state.activeId
      }
    }

    case 'queue/move': {
      const from = state.queue.findIndex((q) => q.id === action.id)
      if (from === -1) return state
      const queue = [...state.queue]
      const [moved] = queue.splice(from, 1)
      const to = Math.max(
        0,
        Math.min(queue.length, action.toIndex > from ? action.toIndex - 1 : action.toIndex)
      )
      queue.splice(to, 0, moved)
      return { ...state, queue }
    }

    case 'queue/clearDone':
      return { ...state, queue: state.queue.filter((q) => q.status !== 'done') }

    case 'timer/start': {
      // Switching tasks banks the outgoing one rather than losing its stretch.
      const banked =
        state.runningSince !== null && state.activeId !== null
          ? bank(state, action.at, false)
          : { queue: state.queue, session: null }

      const queue = banked.queue.map((q) => {
        if (q.id === action.id) {
          // Restarting a finished task is a fresh run: the clock starts from
          // zero. The recorded sessions stay — only the item's counter resets.
          if (q.status === 'done') {
            return { ...q, status: 'active' as const, elapsedSec: 0, startedAt: action.at }
          }
          return { ...q, status: 'active' as const, startedAt: q.startedAt ?? action.at }
        }
        return q.status === 'active' ? { ...q, status: 'pending' as const } : q
      })

      return {
        ...state,
        queue,
        pendingSessions: withSession(state, banked.session),
        activeId: action.id,
        runningSince: action.at,
        lastTickAt: action.at
      }
    }

    case 'timer/pause': {
      if (state.runningSince === null) return state
      const banked = bank(state, action.at, false)
      return {
        ...state,
        queue: banked.queue,
        pendingSessions: withSession(state, banked.session),
        runningSince: null,
        lastTickAt: null
      }
    }

    case 'timer/finish': {
      const id = state.activeId
      if (!id) return state
      const banked = bank(state, action.at, action.reachedLimit)
      return {
        ...state,
        queue: banked.queue.map((q) => (q.id === id ? { ...q, status: 'done' as const } : q)),
        pendingSessions: withSession(state, banked.session),
        activeId: null,
        runningSince: null,
        lastTickAt: null
      }
    }

    case 'timer/tick': {
      if (state.runningSince === null) return state
      // The suspend event is not delivered on every platform; the gap in the
      // heartbeat is the backstop. Bank up to the last mark, never to now —
      // a machine that slept overnight must not log the night as work.
      // Unless that is exactly what the user asked for: with `pauseOnSleep`
      // off the clock runs straight through, and a gap is just a late tick.
      const previous = state.lastTickAt ?? state.runningSince
      if (state.settings.pauseOnSleep && action.at - previous > SLEEP_GAP_MS) {
        const banked = bank(state, previous, false)
        return {
          ...state,
          queue: banked.queue,
          pendingSessions: withSession(state, banked.session),
          runningSince: null,
          lastTickAt: null
        }
      }
      return { ...state, lastTickAt: action.at }
    }

    // Sessions were changed outside the reducer (the export dialog's delete);
    // every consumer of the day stats re-queries.
    case 'stats/invalidate':
      return { ...state, statsVersion: state.statsVersion + 1 }

    case 'settings/update':
      return { ...state, settings: { ...state.settings, ...action.patch } }

    case 'day/roll': {
      if (state.queueDate === action.today) return state
      // A stretch still running at midnight is banked first — clearing the
      // queue must not destroy the minutes since the last pause.
      const banked =
        state.runningSince !== null && state.activeId !== null
          ? bank(state, Date.now(), false)
          : { queue: state.queue, session: null }
      return {
        ...state,
        queue: [],
        queueDate: action.today,
        activeId: null,
        runningSince: null,
        lastTickAt: null,
        pendingSessions: withSession(state, banked.session),
        statsVersion: state.statsVersion + 1
      }
    }

    case 'sessions/flushed':
      return {
        ...state,
        pendingSessions: state.pendingSessions.filter((s) => !action.ids.includes(s.id)),
        statsVersion: state.statsVersion + 1
      }

    default:
      return state
  }
}

interface StoreValue {
  state: State
  dispatch: React.Dispatch<Action>
  /** Epoch ms, re-read four times a second while a task is running. */
  now: number
  dismissRecovery: () => void
}

const StoreContext = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [now, setNow] = useState(() => Date.now())
  const [recoveryDismissed, setRecoveryDismissed] = useState(false)

  // ---- load ---------------------------------------------------------------
  useEffect(() => {
    let cancelled = false
    window.tracker.load().then((data) => {
      if (cancelled) return

      let recoveredSec = 0
      let recoveredSession: Session | null = null
      let restored = data

      // An unclean shutdown left a stretch open. Credit it only up to the last
      // heartbeat, never to now: a laptop that slept overnight must not bank
      // eight hours of "work". The timer comes back paused, not running.
      if (data.runningSince !== null && data.activeId !== null) {
        const until = data.lastTickAt ?? data.runningSince
        recoveredSec = Math.max(0, Math.round((until - data.runningSince) / 1000))
        const item = data.queue.find((q) => q.id === data.activeId)
        if (item && recoveredSec >= 2) {
          recoveredSession = {
            id: crypto.randomUUID(),
            date: toISODate(new Date(data.runningSince)),
            templateId: item.templateId,
            title: item.title,
            accent: item.accent,
            startedAt: data.runningSince,
            endedAt: until,
            durationSec: recoveredSec,
            limitSec: item.limitSec,
            reachedLimit: false
          }
        }
        restored = {
          ...data,
          runningSince: null,
          lastTickAt: null,
          queue: data.queue.map((q) =>
            q.id === data.activeId ? { ...q, elapsedSec: q.elapsedSec + recoveredSec } : q
          )
        }
      }

      dispatch({ type: 'hydrate', data: restored, recoveredSec, recoveredSession })
      dispatch({ type: 'day/roll', today: todayISO() })
    }).catch((err) => {
      // Better a console trace than a spinner that never resolves silently.
      console.error('[store] load failed:', err)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // ---- persist ------------------------------------------------------------
  // One effect per table. The reducer hands back the same array reference when
  // nothing changed, so a heartbeat writes the queue and touches nothing else.
  useEffect(() => {
    if (state.ready)
      window.tracker.saveTemplates(state.templates).catch((err) =>
        console.error('[store] saveTemplates failed:', err)
      )
  }, [state.ready, state.templates])

  useEffect(() => {
    if (state.ready)
      window.tracker.saveSettings(state.settings).catch((err) =>
        console.error('[store] saveSettings failed:', err)
      )
  }, [state.ready, state.settings])

  const queueTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const snapshot = useMemo(
    () => ({
      queue: state.queue,
      queueDate: state.queueDate,
      activeId: state.activeId,
      runningSince: state.runningSince,
      lastTickAt: state.lastTickAt
    }),
    [state.queue, state.queueDate, state.activeId, state.runningSince, state.lastTickAt]
  )

  useEffect(() => {
    if (!state.ready) return
    if (queueTimer.current) clearTimeout(queueTimer.current)
    queueTimer.current = setTimeout(() => void window.tracker.saveQueue(snapshot), 400)
    return () => {
      if (queueTimer.current) clearTimeout(queueTimer.current)
    }
  }, [state.ready, snapshot])

  // Debounced saves lose the last edit on quit; flush synchronously on unload.
  // Unwritten sessions ride along — a quit right after a stop must not lose
  // the stretch it just banked (writes are INSERT OR REPLACE, so a session
  // that already landed is overwritten harmlessly, never duplicated).
  useEffect(() => {
    const flush = (): void => {
      if (!state.ready) return
      void window.tracker.saveQueue(snapshot)
      for (const session of state.pendingSessions) void window.tracker.addSession(session)
    }
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [state.ready, snapshot, state.pendingSessions])

  // ---- drain finished stretches into the session log ----------------------
  const draining = useRef(false)
  useEffect(() => {
    if (state.pendingSessions.length === 0 || draining.current) return
    draining.current = true
    const batch = state.pendingSessions
    void Promise.allSettled(batch.map((session) => window.tracker.addSession(session))).then(
      (results) => {
        draining.current = false
        const landed = batch.filter((_, i) => results[i].status === 'fulfilled').map((s) => s.id)
        const failed = results.filter((r) => r.status === 'rejected')
        if (failed.length > 0) console.error('[store] could not write sessions:', failed)
        if (landed.length > 0) dispatch({ type: 'sessions/flushed', ids: landed })
      }
    )
  }, [state.pendingSessions])

  // ---- clock --------------------------------------------------------------
  const running = state.runningSince !== null
  useEffect(() => {
    if (!running) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [running])

  // Heartbeat for crash recovery — also what triggers the periodic queue save.
  // The tick doubles as the sleep detector: a gap makes the reducer clamp and
  // pause the stretch, and the same check here says why the timer stopped.
  // Both gates mirror the reducer's own, so the toast never fires without the
  // pause (or the other way round).
  const lastTickRef = useRef<number | null>(null)
  lastTickRef.current = state.lastTickAt
  const pauseOnSleepRef = useRef(true)
  pauseOnSleepRef.current = state.settings.pauseOnSleep
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      const at = Date.now()
      const previous = lastTickRef.current
      dispatch({ type: 'timer/tick', at })
      if (pauseOnSleepRef.current && previous !== null && at - previous > SLEEP_GAP_MS) {
        toast({
          title: t().sleepPausedTitle,
          body: t().sleepPausedBody,
          tone: 'info',
          duration: null
        })
      }
    }, 5_000)
    return () => clearInterval(id)
  }, [running])

  // The clean path: main says the machine is about to suspend, the stretch is
  // banked right here at its true end. Sleep is rest, not work — unless the
  // user switched `pauseOnSleep` off and wants wall-clock time.
  const runningRef = useRef(false)
  runningRef.current = running
  useEffect(() => {
    return window.tracker.onPowerSuspend(() => {
      if (!runningRef.current || !pauseOnSleepRef.current) return
      dispatch({ type: 'timer/pause', at: Date.now() })
      toast({
        title: t().sleepPausedTitle,
        body: t().sleepPausedBody,
        tone: 'info',
        duration: null
      })
    })
  }, [])

  // A window left open past midnight must not keep writing into yesterday.
  useEffect(() => {
    if (!state.ready) return
    const id = setInterval(() => dispatch({ type: 'day/roll', today: todayISO() }), 60_000)
    return () => clearInterval(id)
  }, [state.ready])

  const dismissRecovery = useCallback(() => setRecoveryDismissed(true), [])

  // Stamped during render, before any consumer renders: everything below the
  // provider — components and the plain time formatters — reads this language.
  setCurrentLang(resolveLang(state.settings.language))

  const value = useMemo<StoreValue>(
    () => ({
      state: recoveryDismissed ? { ...state, recoveredSec: 0 } : state,
      dispatch,
      now,
      dismissRecovery
    }),
    [state, now, recoveryDismissed, dismissRecovery]
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>')
  return ctx
}

export type { Template, QueueItem, Session, Settings }
