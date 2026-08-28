import { useEffect, useRef, useState } from 'react'
import {
  Button,
  MorzeThemeProvider,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SidebarInset,
  SidebarProvider,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  useMorzeTheme
} from '@morze/ui'
import { ExportDialog } from '@/components/ExportDialog'
import { QueueList } from '@/components/QueueList'
import { SettingsDialog } from '@/components/SettingsDialog'
import { StatsPanel } from '@/components/StatsPanel'
import { TemplatesRail } from '@/components/TemplatesRail'
import { TimerStage } from '@/components/TimerStage'
import { ToastHost } from '@/components/Toasts'
import { toast } from '@/lib/toast'
import { ChartIcon, MoonIcon, SettingsIcon, SunIcon } from '@/components/icons'
import { t } from '@/lib/i18n'
import { StoreProvider, useStore } from '@/lib/store'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { useStats } from '@/lib/useStats'
import { formatDuration } from '@/lib/time'

/** Below this the third column starves the queue and moves into a drawer. */
const NARROW = '(max-width: 1120px)'
const STATS_KEY = 'tracker.stats'

function readStatsPref(): boolean {
  try {
    return window.localStorage.getItem(STATS_KEY) !== 'collapsed'
  } catch {
    // Site data blocked: the panel simply always starts open.
    return true
  }
}

function ThemeToggle(): React.JSX.Element {
  const { resolvedTheme, setTheme } = useMorzeTheme()
  const next = resolvedTheme === 'dark' ? 'light' : 'dark'
  const label = next === 'dark' ? t().themeDark : t().themeLight
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} onClick={() => setTheme(next)}>
          {resolvedTheme === 'dark' ? <MoonIcon /> : <SunIcon />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** Chart toggle, theme, settings — one cluster, rendered in the topbar while
 *  the right column is open and floating in the same corner when it folds, so
 *  none of the three ever leaves the screen. */
function ControlCluster({
  statsExpanded,
  statsLabel,
  onToggleStats,
  onOpenSettings
}: {
  statsExpanded: boolean
  statsLabel: string
  onToggleStats: () => void
  onOpenSettings: () => void
}): React.JSX.Element {
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t().stats}
            aria-expanded={statsExpanded}
            aria-controls="stats-column"
            onClick={onToggleStats}
          >
            <ChartIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{statsLabel} · ⇧⌘B</TooltipContent>
      </Tooltip>
      <ThemeToggle />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t().settings} onClick={onOpenSettings}>
            <SettingsIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t().settings}</TooltipContent>
      </Tooltip>
    </>
  )
}

/** The running day total, mirrored into the top bar so it survives the narrow
 *  layout where the statistics column is dropped entirely. */
function DayTotal(): React.JSX.Element {
  const { today } = useStats()
  return (
    <span style={{ fontSize: 12, color: 'var(--mz-text-dim)' }}>
      {t().today}{' '}
      <strong className="num" style={{ color: 'var(--mz-text)' }}>{formatDuration(today.totalSec)}</strong>
    </span>
  )
}

function Workspace(): React.JSX.Element {
  const { state, dismissRecovery } = useStore()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [statsShown, setStatsShown] = useState(readStatsPref)
  const [statsDrawer, setStatsDrawer] = useState(false)
  /** Queue scrolled → the dial morphs into its header form. */
  const [timerCompact, setTimerCompact] = useState(false)
  const narrow = useMediaQuery(NARROW)

  useEffect(() => {
    try {
      window.localStorage.setItem(STATS_KEY, statsShown ? 'open' : 'collapsed')
    } catch {
      /* nothing to persist to; the toggle still works for this session */
    }
  }, [statsShown])

  // Narrow enough and the column cannot be shown at all, so the same control
  // opens the drawer instead — the way the kit's own sidebar behaves on mobile.
  const statsVisible = statsShown && !narrow
  const toggleStats = (): void => {
    if (narrow) setStatsDrawer(true)
    else setStatsShown((open) => !open)
  }

  // Recovery lands in the bottom-right stack with the other notifications; it
  // sticks until read, since it explains where the extra minutes came from.
  const recoveryToasted = useRef(false)
  useEffect(() => {
    if (!state.ready || state.recoveredSec <= 0 || recoveryToasted.current) return
    recoveryToasted.current = true
    toast({
      title: t().recoveredTitle,
      body: t().recoveredBody(formatDuration(state.recoveredSec)),
      tone: 'info',
      duration: null,
      onClose: dismissRecovery
    })
  }, [state.ready, state.recoveredSec, dismissRecovery])

  // macOS-style scrollbars: any surface being scrolled carries `.scrolling`
  // for a moment, and only then (or under the pointer) its thumb is drawn —
  // see the ::-webkit-scrollbar rules.
  useEffect(() => {
    const timers = new WeakMap<Element, number>()
    const onScroll = (event: Event): void => {
      const el = event.target
      if (!(el instanceof Element)) return
      el.classList.add('scrolling')
      window.clearTimeout(timers.get(el))
      timers.set(
        el,
        window.setTimeout(() => el.classList.remove('scrolling'), 800)
      )
    }
    window.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => window.removeEventListener('scroll', onScroll, { capture: true })
  }, [])

  // Ctrl/⌘ + Shift + B mirrors the rail's own Ctrl/⌘ + B on the other side.
  // Capture phase + stopPropagation: the kit's own ⌘B handler ignores Shift
  // and would toggle the rail on the same press. `code` instead of `key`, so
  // the chord works on a Russian layout too (physical B, not the letter).
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.code !== 'KeyB' || !event.shiftKey) return
      if (!event.metaKey && !event.ctrlKey) return
      event.preventDefault()
      event.stopPropagation()
      toggleStats()
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  })

  if (!state.ready) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100dvh' }}>
        <Spinner label={t().loading} />
      </div>
    )
  }

  return (
    <SidebarProvider
      defaultOpen
      storageKey="tracker.rail"
      style={{ ['--mz-sidebar-w' as string]: '272px' }}
    >
      <TemplatesRail />

      <SidebarInset>
        <div className="workspace" data-stats={statsVisible ? 'open' : 'collapsed'}>
          {/* The right sidebar: the (brand-less) topbar above the statistics
              panel, both sharing one grid track. Collapsing the statistics
              hides the whole column; the floating chip below brings it back. */}
          {/* Collapsed, the column is clipped to zero width but its buttons
              would stay in the tab order; inert removes them for real. */}
          <div
            className={`rightbar${timerCompact ? ' rightbar--folded' : ''}`}
            inert={!statsVisible && !narrow}
          >
            <header className="topbar" inert={timerCompact}>
              <DayTotal />
              <span className="topbar__spacer" />
              <ControlCluster
                statsExpanded={narrow ? statsDrawer : statsShown}
                statsLabel={statsVisible ? t().statsHide : t().statsShow}
                onToggleStats={toggleStats}
                onOpenSettings={() => setSettingsOpen(true)}
              />
            </header>

            {/* The slot stays mounted and clips: the panel keeps its own width
                while the grid track shrinks, so nothing reflows mid-animation. */}
            <div className="stats-slot" id="stats-column">
              <StatsPanel onExport={() => setExportOpen(true)} />
            </div>
          </div>

          <div className="column">
            {/* Folded, the bar absorbs the topbar's whole crew: day total and
                the control cluster ride at its right end while the topbar
                itself collapses and the statistics rise into its place. */}
            <TimerStage
              compact={timerCompact}
              barExtras={
                <>
                  <DayTotal />
                  <ControlCluster
                    statsExpanded={narrow ? statsDrawer : statsShown}
                    statsLabel={statsVisible ? t().statsHide : t().statsShow}
                    onToggleStats={toggleStats}
                    onOpenSettings={() => setSettingsOpen(true)}
                  />
                </>
              }
            />
            <QueueList onScrolled={setTimerCompact} />
          </div>
        </div>

        {/* The right column is folded: the same cluster floats in its corner —
            unless the timer bar is holding it already. */}
        {!narrow && !statsVisible && !timerCompact && (
          <div className="topbar topbar--floating">
            <ControlCluster
              statsExpanded={false}
              statsLabel={t().statsShow}
              onToggleStats={toggleStats}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          </div>
        )}
      </SidebarInset>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />

      {/* Below 1120px the third column is dropped; the same panel opens here
          instead, so narrowing the window never hides the numbers for good. */}
      <Sheet open={statsDrawer} onOpenChange={setStatsDrawer}>
        <SheetContent side="right" style={{ width: 340 }}>
          <SheetHeader>
            <SheetTitle>{t().stats}</SheetTitle>
            <SheetDescription>{t().statsSheetDesc}</SheetDescription>
          </SheetHeader>
          <StatsPanel inDrawer onExport={() => setExportOpen(true)} />
        </SheetContent>
      </Sheet>

      <ToastHost />
    </SidebarProvider>
  )
}

export default function App(): React.JSX.Element {
  return (
    <MorzeThemeProvider defaultTheme="dark" storageKey="tracker.theme">
      <TooltipProvider delayDuration={300}>
        <StoreProvider>
          <Workspace />
        </StoreProvider>
      </TooltipProvider>
    </MorzeThemeProvider>
  )
}
