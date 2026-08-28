import { useEffect, useRef, useState } from 'react'
import { Badge, Button, Tooltip, TooltipContent, TooltipTrigger } from '@morze/ui'
import type { QueueItem } from '@shared/types'
import { tone } from '@/lib/accents'
import { elapsedOf, itemToDraft, templateToDraft, useStore, type NewTemplate } from '@/lib/store'
import { t } from '@/lib/i18n'
import { formatClock, formatLimit } from '@/lib/time'
import { EmojiIcon } from './EmojiIcon'
import { GripIcon, PencilIcon, PlayIcon, TrashIcon } from './icons'
import { TemplateDialog } from './TemplateDialog'
import { TEMPLATE_DRAG_TYPE } from './TemplatesRail'

const QUEUE_DRAG_TYPE = 'application/x-tracker-queue'

export function QueueList({
  onScrolled
}: {
  /** Fires when the list crosses its scroll threshold — the timer's cue to
   *  morph into the header bar (true) or unfold back (false). */
  onScrolled?: (compact: boolean) => void
}): React.JSX.Element {
  const { state, dispatch, now } = useStore()
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const editing = state.queue.find((q) => q.id === editingId) ?? null
  const active = state.queue.find((q) => q.id === state.activeId) ?? null

  /* Folding is driven by the wheel GESTURE, not by the scroll position: a
     short queue never builds up any scrollTop, so a position-derived state
     could never fold for it (and the height it gains from the folding dial
     would bounce it right back). Wheel down anywhere on the canvas folds the
     dial into the bar; wheel up with the list at its top unfolds it. */
  const foldedRef = useRef(false)
  /* Scroll events fired by the browser clamping scrollTop while the layout
     is mid-morph must not flip the state back. */
  const settleUntil = useRef(0)
  const setFolded = (next: boolean): void => {
    if (next === foldedRef.current) return
    foldedRef.current = next
    settleUntil.current = Date.now() + 600
    onScrolled?.(next)
  }

  /* The scroll is global: a wheel anywhere in the window — the dial, the
     rails, the top bar — drives this list, as if the page scrolled, while
     the layout stays fixed and only the list actually moves. Surfaces with
     their own overflow (the side panels, dialog bodies) keep their native
     scroll, and modals never pass the wheel through. */
  const queueRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const queue = queueRef.current
    if (!queue) return
    const scrollsItself = (node: Element | null): boolean => {
      for (let el = node; el && el !== document.body; el = el.parentElement) {
        if (el.scrollHeight > el.clientHeight + 1) {
          const overflowY = getComputedStyle(el).overflowY
          if (overflowY === 'auto' || overflowY === 'scroll') return true
        }
      }
      return false
    }
    const onWheel = (event: WheelEvent): void => {
      // Any open modal owns the wheel entirely — including over the backdrop,
      // where scrolling (and folding) the canvas behind it reads as broken.
      if (document.querySelector('[role="dialog"]')) return
      const target = event.target as Element | null
      // Another scrolling surface (a side panel) owns this wheel — unless it
      // is the queue itself, whose native scroll should still fold the dial.
      const insideQueue = queue.contains(target)
      if (!insideQueue && scrollsItself(target)) return
      // The queue scrolls natively under its own pointer; adding on top of
      // that would double the speed.
      if (!(insideQueue && queue.scrollHeight > queue.clientHeight + 1)) {
        queue.scrollTop += event.deltaY
      }
      // A small dead zone keeps trackpad inertia from toggling the fold.
      if (event.deltaY > 4) setFolded(true)
      else if (event.deltaY < -4 && queue.scrollTop <= 1) setFolded(false)
    }
    window.addEventListener('wheel', onWheel, { passive: true })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  /* Scrollbar drags and keyboard scrolling have no wheel events; the scroll
     position covers them, with the same hysteresis as before. */
  const handleScroll = (event: React.UIEvent<HTMLDivElement>): void => {
    if (Date.now() < settleUntil.current) return
    const top = event.currentTarget.scrollTop
    if (top > 48) setFolded(true)
    else if (top < 8 && foldedRef.current) setFolded(false)
  }

  const plannedSec = state.queue
    .filter((q) => q.status !== 'done')
    .reduce((sum, q) => sum + (q.limitSec ?? 0), 0)
  const doneCount = state.queue.filter((q) => q.status === 'done').length

  /** A cancelled drag (Esc, or a drop outside the window) fires no drop and,
   *  for template drags, no dragend inside this component — the indicator
   *  would stay stuck without a global cleanup. */
  useEffect(() => {
    const clear = (): void => {
      setDropIndex(null)
      setDraggingId(null)
    }
    window.addEventListener('dragend', clear)
    window.addEventListener('drop', clear)
    return () => {
      window.removeEventListener('dragend', clear)
      window.removeEventListener('drop', clear)
    }
  }, [])

  /** The insertion index for a pointer at this height: before the first row
   *  whose midline is still below the pointer. Bound to the container, so the
   *  gaps and padding between cards are valid targets too. */
  const indexForY = (clientY: number): number => {
    const rows = [...(queueRef.current?.querySelectorAll<HTMLElement>('.qitem') ?? [])]
    for (let i = 0; i < rows.length; i++) {
      const rect = rows[i].getBoundingClientRect()
      if (clientY < rect.top + rect.height / 2) return i
    }
    return rows.length
  }

  /** Both drag sources land here; the payload decides insert vs. reorder. */
  const handleDrop = (event: React.DragEvent, index: number): void => {
    event.preventDefault()
    setDropIndex(null)
    setDraggingId(null)

    const templateId = event.dataTransfer.getData(TEMPLATE_DRAG_TYPE)
    if (templateId) {
      const template = state.templates.find((t) => t.id === templateId)
      if (!template) return
      dispatch({
        type: 'queue/add',
        templateId: template.id,
        index,
        draft: templateToDraft(template)
      })
      return
    }

    const queueId = event.dataTransfer.getData(QUEUE_DRAG_TYPE)
    if (queueId) dispatch({ type: 'queue/move', id: queueId, toIndex: index })
  }

  const allowDrop = (event: React.DragEvent): void => {
    const kinds = event.dataTransfer.types
    if (!kinds.includes(TEMPLATE_DRAG_TYPE) && !kinds.includes(QUEUE_DRAG_TYPE)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = kinds.includes(TEMPLATE_DRAG_TYPE) ? 'copy' : 'move'
    setDropIndex(indexForY(event.clientY))
  }

  return (
    <section className="queue-wrap column" aria-label={t().queueAria}>
      {/* The heading sits outside the scroller: scrolled away, the first card
          bleeds into the timer above it with nothing to separate them. */}
      <header className="queue__head">
        {/* The heading is the current task's title; with nothing running the
            line holds only the totals. */}
        {active && (
          <h2 className="label queue__now" style={{ margin: 0 }}>
            {active.title}
          </h2>
        )}
        <span className="queue__total num">
          {state.queue.length === 0
            ? t().queueEmptyWord
            : t().queueSummary(state.queue.length, formatLimit(plannedSec || null))}
        </span>
        {doneCount > 0 && (
          <Button variant="ghost" size="xs" onClick={() => dispatch({ type: 'queue/clearDone' })}>
            {t().clearDone(doneCount)}
          </Button>
        )}
      </header>

      <div
        ref={queueRef}
        className="queue scroll-y"
        onScroll={handleScroll}
        onDragOver={allowDrop}
        onDrop={(e) => handleDrop(e, indexForY(e.clientY))}
        onDragLeave={(e) => {
          // Leaving for a child fires this too; only a real exit clears.
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropIndex(null)
        }}
      >
        {state.queue.map((item, index) => (
        <QueueRow
          key={item.id}
          item={item}
          index={index}
          isActive={item.id === state.activeId}
          elapsed={elapsedOf(state, item, now)}
          dragging={draggingId === item.id}
          dropBefore={dropIndex === index}
          onDragStart={(e) => {
            e.dataTransfer.setData(QUEUE_DRAG_TYPE, item.id)
            e.dataTransfer.effectAllowed = 'move'
            setDraggingId(item.id)
          }}
          onDragEnd={() => {
            setDraggingId(null)
            setDropIndex(null)
          }}
          onStart={() => dispatch({ type: 'timer/start', id: item.id, at: Date.now() })}
          onEdit={() => setEditingId(item.id)}
          onRemove={() => dispatch({ type: 'queue/remove', id: item.id })}
          />
        ))}

        {/* The container above owns dragover/drop; this zone is the visual
            invitation and the after-last-row landing area. */}
        <div
          className={`dropzone dropzone--tall${dropIndex === state.queue.length ? ' dropzone--over' : ''}`}
        >
          {t().dropHere}
        </div>
      </div>

      <TemplateDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditingId(null)
        }}
        initial={editing ? itemToDraft(editing) : undefined}
        title={t().editTaskTitle}
        subtitle={t().editTaskSubtitle}
        submitLabel={t().save}
        onSubmit={(draft: NewTemplate) => {
          if (editingId) dispatch({ type: 'queue/update', id: editingId, draft })
        }}
      />
    </section>
  )
}

interface RowProps {
  item: QueueItem
  index: number
  isActive: boolean
  elapsed: number
  dragging: boolean
  dropBefore: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onStart: () => void
  onEdit: () => void
  onRemove: () => void
}

function QueueRow({
  item,
  index,
  isActive,
  elapsed,
  dragging,
  dropBefore,
  onDragStart,
  onDragEnd,
  onStart,
  onEdit,
  onRemove
}: RowProps): React.JSX.Element {
  const done = item.status === 'done'
  const ratio = item.limitSec ? Math.min(1, elapsed / item.limitSec) : 0
  const over = item.limitSec !== null && elapsed > item.limitSec

  const classes = [
    'qitem',
    isActive && 'qitem--active',
    done && 'qitem--done',
    dragging && 'qitem--dragging',
    dropBefore && 'qitem--dropbefore'
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <article
      className={classes}
      style={tone(item.accent)}
      draggable
      aria-label={`${index + 1}. ${item.title}`}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <span className="qitem__grip" aria-hidden="true" style={{ color: 'var(--mz-text-muted)' }}>
        <GripIcon width={16} height={16} />
      </span>

      <div className="qitem__body">
        <div className="qitem__title">
          {isActive && !done && (
            <>
              {/* The "current" badge, reduced to a live dot in the task's tone. */}
              <i className="qitem__pulse" aria-hidden="true" />
              <span className="visually-hidden">{t().currentTaskSr}</span>
            </>
          )}
          {item.icon !== null && (
            <span className="qitem__icon" aria-hidden="true">
              <EmojiIcon icon={item.icon} size={16} />
            </span>
          )}
          <span className="qitem__title-text">{item.title}</span>
        </div>
        {item.description !== '' && (
          <div className="qitem__desc" title={item.description}>
            {item.description}
          </div>
        )}
        <div className="qitem__meta">
          <span>{formatLimit(item.limitSec)}</span>
          {item.limitSec !== null && over && (
            <Badge variant="soft" tone="danger">
              +{formatClock(elapsed - item.limitSec)}
            </Badge>
          )}
          {item.limitSec !== null && item.overrun && !over && (
            <Badge variant="soft" tone="info">
              {t().noStop}
            </Badge>
          )}
        </div>
        {item.limitSec !== null && (
          <div className="qitem__bar">
            <i style={{ width: `${ratio * 100}%` }} />
          </div>
        )}
      </div>

      <span className="qitem__time num">{formatClock(elapsed)}</span>

      <div className="qitem__actions">
        {/* A done task keeps its play button: starting it re-opens the task
            and the clock picks up on top of the time already banked. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              disabled={isActive}
              aria-label={t().actionWith(done ? t().restartTask : t().makeCurrent, item.title)}
              onClick={onStart}
            >
              <PlayIcon width={14} height={14} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{done ? t().restartTask : t().makeCurrent}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t().actionWith(t().edit, item.title)}
              onClick={onEdit}
            >
              <PencilIcon width={14} height={14} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t().editTaskTitle}</TooltipContent>
        </Tooltip>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t().removeFromQueue(item.title)}
          onClick={onRemove}
        >
          <TrashIcon width={14} height={14} />
        </Button>
      </div>
    </article>
  )
}
