import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem
} from '@morze/ui'
import type { ExportResult, ExportTask, ISODate } from '@shared/types'
import { tone } from '@/lib/accents'
import { t } from '@/lib/i18n'
import { toast } from '@/lib/toast'
import { useStore } from '@/lib/store'
import { formatCompact, formatDuration, shiftISO, todayISO } from '@/lib/time'
import { FolderIcon, TrashIcon } from './icons'

type Preset = 'today' | 'yesterday' | '7d' | '30d' | 'all' | 'custom'

const PRESETS: Preset[] = ['today', 'yesterday', '7d', '30d', 'all', 'custom']

function presetLabel(preset: Preset): string {
  switch (preset) {
    case 'today':
      return t().today
    case 'yesterday':
      return t().yesterday
    case '7d':
      return t().days7
    case '30d':
      return t().days30
    case 'all':
      return t().allTime
    case 'custom':
      return t().customPeriod
  }
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ExportDialog({ open, onOpenChange }: Props): React.JSX.Element {
  const { dispatch } = useStore()
  const [preset, setPreset] = useState<Preset>('7d')
  const [customFrom, setCustomFrom] = useState<ISODate>(shiftISO(todayISO(), -6))
  const [customTo, setCustomTo] = useState<ISODate>(todayISO())
  const [firstDate, setFirstDate] = useState<ISODate | null>(null)

  const [tasks, setTasks] = useState<ExportTask[]>([])
  /** Deselections survive a period change; a new task arrives selected. */
  const [excluded, setExcluded] = useState<Set<string>>(new Set())

  const [format, setFormat] = useState<'pdf' | 'json'>('pdf')
  const [includeDays, setIncludeDays] = useState(true)
  const [includeHours, setIncludeHours] = useState(true)
  const [includeSessions, setIncludeSessions] = useState(false)

  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ExportResult | null>(null)
  /** Two-step delete: the first click arms this row, the second erases. */
  const [armedKey, setArmedKey] = useState<string | null>(null)
  /** A double-click's second click must not count as the confirmation. */
  const armedAt = useRef(0)
  /** Bumped after a delete so the inventory effect re-queries. */
  const [inventoryVersion, setInventoryVersion] = useState(0)

  const today = todayISO()
  const { from, to } = useMemo((): { from: ISODate; to: ISODate } => {
    switch (preset) {
      case 'today':
        return { from: today, to: today }
      case 'yesterday':
        return { from: shiftISO(today, -1), to: shiftISO(today, -1) }
      case '7d':
        return { from: shiftISO(today, -6), to: today }
      case '30d':
        return { from: shiftISO(today, -29), to: today }
      case 'all':
        return { from: firstDate ?? today, to: today }
      case 'custom':
        // A reversed pair still makes a valid query instead of an empty one.
        return customFrom <= customTo
          ? { from: customFrom, to: customTo }
          : { from: customTo, to: customFrom }
    }
  }, [preset, today, firstDate, customFrom, customTo])

  // Re-seed transient state on open; keep период/формат — they are the kind of
  // choice that repeats from export to export.
  useEffect(() => {
    if (!open) return
    setResult(null)
    setBusy(false)
    setArmedKey(null)
  }, [open])

  // A different period lists different rows; an armed delete must not carry
  // over to whatever lands at the same position.
  useEffect(() => setArmedKey(null), [from, to])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    window.tracker
      .exportInventory(from, to)
      .then((inventory) => {
        if (cancelled) return
        setTasks(inventory.tasks)
        setFirstDate(inventory.firstDate)
      })
      .catch((err) => console.error('[export] inventory failed:', err))
    return () => {
      cancelled = true
    }
  }, [open, from, to, inventoryVersion])

  const selected = tasks.filter((t) => !excluded.has(t.key))
  const selectedSec = selected.reduce((sum, t) => sum + t.seconds, 0)
  const selectedRuns = selected.reduce((sum, t) => sum + t.runs, 0)
  const allSelected = tasks.length > 0 && selected.length === tasks.length

  const toggleTask = (key: string): void => {
    setExcluded((current) => {
      const next = new Set(current)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const toggleAll = (): void => {
    setExcluded(allSelected ? new Set(tasks.map((t) => t.key)) : new Set())
  }

  const removeTask = async (task: ExportTask): Promise<void> => {
    if (armedKey !== task.key) {
      setArmedKey(task.key)
      armedAt.current = Date.now()
      return
    }
    // The confirm button appears under the pointer mid double-click; a real
    // confirmation is a separate, later click.
    if (Date.now() - armedAt.current < 350) return
    setArmedKey(null)
    try {
      await window.tracker.deleteTaskSessions(from, to, task.key)
      setInventoryVersion((v) => v + 1)
      // Today's and yesterday's numbers may have just lost sessions.
      dispatch({ type: 'stats/invalidate' })
    } catch (err) {
      console.error('[export] delete failed:', err)
      toast({ title: t().deleteFailed, tone: 'danger' })
    }
  }

  // An armed delete left alone disarms itself — it must not lie in wait.
  useEffect(() => {
    if (armedKey === null) return
    const id = setTimeout(() => setArmedKey(null), 4000)
    return () => clearTimeout(id)
  }, [armedKey])

  const submit = async (): Promise<void> => {
    setBusy(true)
    setResult(null)
    try {
      const res = await window.tracker.runExport({
        format,
        from,
        to,
        taskKeys: allSelected ? null : selected.map((t) => t.key),
        includeSessions,
        includeDays,
        includeHours
      })
      setResult(res)
    } catch (err) {
      console.error('[export] failed:', err)
      toast({ title: t().exportFailed, tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t().close} style={{ width: 560, maxWidth: '94vw' }}>
        <DialogHeader>
          <DialogTitle>{t().exportTitle}</DialogTitle>
          <DialogDescription>{t().exportDesc}</DialogDescription>
        </DialogHeader>

        <div className="form-grid" style={{ padding: 'var(--space-5) 0' }}>
          <Field>
            <Label>{t().period}</Label>
            <div className="preset-row">
              {PRESETS.map((key) => (
                <Button
                  key={key}
                  type="button"
                  size="xs"
                  variant={preset === key ? 'primary' : 'outline'}
                  onClick={() => setPreset(key)}
                >
                  {presetLabel(key)}
                </Button>
              ))}
            </div>
            {preset === 'custom' && (
              <div className="export-dates">
                <Input
                  type="date"
                  inputSize="sm"
                  value={customFrom}
                  max={today}
                  aria-label={t().fromAria}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
                <span aria-hidden="true">—</span>
                <Input
                  type="date"
                  inputSize="sm"
                  value={customTo}
                  max={today}
                  aria-label={t().toAria}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </div>
            )}
          </Field>

          <Field>
            <div className="export-tasks__head">
              <Label>{t().tasksLabel}</Label>
              <Button type="button" variant="ghost" size="xs" onClick={toggleAll} disabled={tasks.length === 0}>
                {allSelected ? t().deselectAll : t().selectAll}
              </Button>
            </div>
            {tasks.length === 0 ? (
              <p className="empty" style={{ padding: 'var(--space-3)' }}>
                {t().noRecords}
              </p>
            ) : (
              <div className="export-tasks scroll-y">
                {tasks.map((task) => (
                  <label key={task.key} className="export-task" style={tone(task.accent)}>
                    <Checkbox
                      checked={!excluded.has(task.key)}
                      onCheckedChange={() => toggleTask(task.key)}
                      aria-label={task.title}
                    />
                    <i className="export-task__dot" aria-hidden="true" />
                    <span className="export-task__title">{task.title}</span>
                    <span className="export-task__time num">{formatCompact(task.seconds)}</span>
                    {armedKey === task.key ? (
                      <Button
                        type="button"
                        size="xs"
                        variant="destructive"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          void removeTask(task)
                        }}
                      >
                        {t().deleteConfirm}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t().deleteTaskAria(task.title)}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          void removeTask(task)
                        }}
                      >
                        <TrashIcon width={14} height={14} />
                      </Button>
                    )}
                  </label>
                ))}
              </div>
            )}
          </Field>

          <div className="export-columns">
            <Field>
              <Label id="export-format-label">{t().format}</Label>
              <RadioGroup
                value={format}
                onValueChange={(value) => setFormat(value as 'pdf' | 'json')}
                aria-labelledby="export-format-label"
              >
                <label className="export-check">
                  <RadioGroupItem value="pdf" /> {t().pdfReport}
                </label>
                <label className="export-check">
                  <RadioGroupItem value="json" /> JSON
                </label>
              </RadioGroup>
            </Field>

            <Field>
              <Label>{t().contents}</Label>
              <label className="export-check">
                <Checkbox checked={includeDays} onCheckedChange={(v) => setIncludeDays(v === true)} />
                {t().byDays}
              </label>
              <label className="export-check">
                <Checkbox checked={includeHours} onCheckedChange={(v) => setIncludeHours(v === true)} />
                {t().byHours}
              </label>
              <label className="export-check">
                <Checkbox
                  checked={includeSessions}
                  onCheckedChange={(v) => setIncludeSessions(v === true)}
                />
                {t().allRuns}
              </label>
            </Field>
          </div>
        </div>

        <DialogFooter style={{ alignItems: 'center' }}>
          <span className="export-status" role="status">
            {result?.status === 'saved' ? (
              <>
                {t().saved}
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => result.path && window.tracker.revealPath(result.path)}
                >
                  <FolderIcon width={14} height={14} /> {t().showInFolder}
                </Button>
              </>
            ) : result?.status === 'empty' ? (
              t().emptyPeriod
            ) : selected.length > 0 ? (
              `${formatDuration(selectedSec)} · ${t().runsCount(selectedRuns)}`
            ) : (
              t().nothingSelected
            )}
          </span>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t().close}
          </Button>
          <Button type="button" onClick={submit} disabled={busy || selected.length === 0}>
            {busy ? t().exporting : t().exportBtn}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
