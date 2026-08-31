import { useId, useRef, useState } from 'react'
import {
  Button,
  Field,
  FieldError,
  FieldHint,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Textarea
} from '@morze/ui'
import {
  ACCENTS,
  MANUAL_MAX_DESCRIPTION,
  MANUAL_MAX_HOURS,
  MANUAL_MAX_NAME,
  MANUAL_MIN_HOURS,
  type Accent,
  type ManualEntry
} from '@shared/types'
import { tone } from '@/lib/accents'
import { t } from '@/lib/i18n'
import {
  endOf,
  groupByDay,
  hoursOf,
  newEntryId,
  shortDate,
  type ManualController
} from '@/lib/manual'
import { toast } from '@/lib/toast'
import { formatCompact, formatDuration, shiftISO, todayISO } from '@/lib/time'
import { EmojiIcon, ICONS } from './EmojiIcon'
import { FolderIcon, PencilIcon, PlusIcon, TrashIcon } from './icons'

/**
 * A report written by hand: the lines the tracker never saw, typed in after
 * the fact. Its name and the library it is saved into sit on top; the composer
 * sits under the list, so the two read as one movement — what the report says,
 * and the next line going into it.
 */

interface Props {
  manual: ManualController
}

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function ManualReport({ manual }: Props): React.JSX.Element {
  const { draft, dirty, reports } = manual
  const entries = draft.entries
  const onChange = manual.setEntries

  const nameId = useId()
  const titleId = useId()
  const titleErrorId = useId()
  const durationErrorId = useId()
  const titleRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState<string>(todayISO)
  /** Empty is a valid answer: the clock is optional, the hours are not. */
  const [startTime, setStartTime] = useState('')
  const [hours, setHours] = useState('1')
  const [icon, setIcon] = useState<string | null>(null)
  const [accent, setAccent] = useState<Accent>('amber')
  /** Set while an existing line is being reworked rather than a new one typed. */
  const [editingId, setEditingId] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)
  /** Two-step delete for a saved report, like the task rows next door. */
  const [armedId, setArmedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const parsedHours = Number(hours)
  const hoursValid =
    hours.trim() !== '' &&
    Number.isFinite(parsedHours) &&
    parsedHours >= MANUAL_MIN_HOURS &&
    parsedHours <= MANUAL_MAX_HOURS
  const durationSec = hoursValid ? Math.round(parsedHours * 3600) : 0
  const titleValid = title.trim().length > 0
  // A blank clock is a choice; a half-typed one is a mistake.
  const timeValid = startTime === '' || CLOCK.test(startTime)
  const valid = titleValid && hoursValid && timeValid && ISO_DATE.test(date)

  // Where this line lands on the clock, shown live so a mistyped length is
  // caught by reading the end time rather than by re-doing the arithmetic.
  const ends = timeValid && hoursValid ? endOf(startTime, durationSec) : null

  const days = groupByDay(entries)
  const editing = editingId !== null

  const reset = (): void => {
    setEditingId(null)
    setTitle('')
    setDescription('')
    setTouched(false)
  }

  const submit = (event: React.FormEvent): void => {
    event.preventDefault()
    setTouched(true)
    if (!valid) return

    const entry: ManualEntry = {
      id: editingId ?? newEntryId(),
      title: title.trim(),
      description: description.trim(),
      date,
      startTime: startTime === '' ? null : startTime,
      durationSec,
      icon,
      accent
    }
    onChange(
      editingId ? entries.map((e) => (e.id === editingId ? entry : e)) : [...entries, entry]
    )

    // The next line usually follows the one just written: the clock moves to
    // where this one ended (over midnight if it went that far), the colour and
    // the icon stay. Only the title starts empty.
    if (!editingId && ends) {
      setStartTime(ends.time)
      if (ends.dayShift !== 0) setDate(shiftISO(date, ends.dayShift))
    }
    reset()
    titleRef.current?.focus()
  }

  const edit = (entry: ManualEntry): void => {
    setEditingId(entry.id)
    setTitle(entry.title)
    setDescription(entry.description)
    setDate(entry.date)
    setStartTime(entry.startTime ?? '')
    setHours(String(hoursOf(entry.durationSec)))
    setIcon(entry.icon)
    setAccent(entry.accent)
    setTouched(false)
    titleRef.current?.focus()
  }

  const remove = (entry: ManualEntry): void => {
    onChange(entries.filter((e) => e.id !== entry.id))
    if (entry.id === editingId) reset()
  }

  /** Every library action can hit the database; none of them may run twice. */
  const run = (action: () => Promise<void>): void => {
    if (busy) return
    setBusy(true)
    setArmedId(null)
    action()
      .catch((err) => {
        console.error('[manual] report action failed:', err)
        toast({ title: t().manualSaveFailed, tone: 'danger' })
      })
      .finally(() => setBusy(false))
  }

  return (
    <div className="form-grid">
      <Field>
        <div className="export-tasks__head">
          <Label htmlFor={nameId}>{t().manualReportLabel}</Label>
          <span className="manual-state" role="status">
            {dirty ? t().manualUnsaved : draft.id !== null ? t().manualSaved : ''}
          </span>
        </div>

        <div className="manual-form__top">
          <Input
            id={nameId}
            value={draft.name}
            maxLength={MANUAL_MAX_NAME}
            placeholder={t().manualNamePlaceholder}
            onChange={(e) => manual.setName(e.target.value)}
          />

          <Popover onOpenChange={(open) => !open && setArmedId(null)}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={t().manualLibraryAria}
                title={t().manualLibraryAria}
              >
                <FolderIcon width={16} height={16} />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="manual-pop manual-pop--list">
              <button
                type="button"
                className="mreport mreport--new"
                onClick={() => run(manual.create)}
              >
                <PlusIcon width={15} height={15} />
                <span className="mreport__name">{t().manualNewReport}</span>
              </button>

              {reports.length === 0 ? (
                <p className="empty" style={{ padding: 'var(--space-2)' }}>
                  {t().manualNoReports}
                </p>
              ) : (
                <ul className="mreport-list scroll-y">
                  {reports.map((report) => (
                    <li key={report.id} className="mreport-row">
                      <button
                        type="button"
                        className="mreport"
                        aria-current={report.id === draft.id || undefined}
                        onClick={() => run(() => manual.open(report.id))}
                      >
                        <span className="mreport__name" title={report.name}>
                          {report.name}
                        </span>
                        <span className="mreport__meta">
                          {t().manualCount(report.entryCount)} · {formatDuration(report.totalSec)}
                        </span>
                      </button>
                      {armedId === report.id ? (
                        <Button
                          type="button"
                          size="xs"
                          variant="destructive"
                          onClick={() => run(() => manual.remove(report.id))}
                        >
                          {t().deleteConfirm}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={t().manualDeleteReportAria(report.name)}
                          onClick={() => setArmedId(report.id)}
                        >
                          <TrashIcon width={14} height={14} />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </PopoverContent>
          </Popover>

          <Button
            type="button"
            className="manual-form__submit"
            disabled={busy || !dirty}
            onClick={() => run(manual.save)}
          >
            {t().save}
          </Button>
        </div>
      </Field>

      <Field>
        <div className="export-tasks__head">
          <Label>{t().manualEntriesLabel}</Label>
          {entries.length > 0 && (
            <span className="manual-total num">{formatDuration(
              entries.reduce((sum, e) => sum + e.durationSec, 0)
            )}</span>
          )}
        </div>

        {entries.length === 0 ? (
          <p className="empty" style={{ padding: 'var(--space-3)' }}>
            {t().manualEmpty}
          </p>
        ) : (
          <div className="manual-list scroll-y">
            {days.map((day) => (
              <section key={day.date} className="manual-day">
                <h4 className="manual-day__head">
                  <span>{shortDate(day.date)}</span>
                  <span className="num">{formatDuration(day.totalSec)}</span>
                </h4>
                <ul className="manual-day__rows">
                  {day.entries.map((entry) => {
                    const end = endOf(entry.startTime, entry.durationSec)
                    return (
                      <li
                        key={entry.id}
                        className="mrow"
                        style={tone(entry.accent)}
                        data-editing={entry.id === editingId || undefined}
                      >
                        <span
                          className={`mrow__mark${entry.icon ? ' mrow__mark--chip' : ''}`}
                          aria-hidden="true"
                        >
                          {entry.icon ? (
                            <EmojiIcon icon={entry.icon} size={15} />
                          ) : (
                            <i className="mrow__dot" />
                          )}
                        </span>
                        <span className="mrow__text">
                          <span className="mrow__title" title={entry.title}>
                            {entry.title}
                          </span>
                          {entry.description && (
                            <span className="mrow__desc" title={entry.description}>
                              {entry.description}
                            </span>
                          )}
                        </span>
                        <span className="mrow__when num">
                          {end && (
                            <>
                              {entry.startTime}–{end.time}
                              {end.dayShift > 0 && <sup className="mrow__next">+1</sup>}
                            </>
                          )}
                        </span>
                        <span className="mrow__time num">{formatCompact(entry.durationSec)}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={t().manualEditAria(entry.title)}
                          onClick={() => edit(entry)}
                        >
                          <PencilIcon width={14} height={14} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={t().manualDeleteAria(entry.title)}
                          onClick={() => remove(entry)}
                        >
                          <TrashIcon width={14} height={14} />
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Field>

      {/* Not a <form>: this sits inside the export dialog's own submit, and a
          nested one would either swallow the export or be swallowed by it. */}
      <Field>
        <div className="export-tasks__head">
          <Label htmlFor={titleId}>{editing ? t().manualEditEntry : t().manualNewEntry}</Label>
          {editing && (
            <Button type="button" variant="ghost" size="xs" onClick={reset}>
              {t().cancel}
            </Button>
          )}
        </div>

        <div className="manual-form">
          <div className="manual-form__top">
            <Input
              id={titleId}
              ref={titleRef}
              value={title}
              placeholder={t().manualTitlePlaceholder}
              aria-invalid={touched && !titleValid}
              aria-describedby={touched && !titleValid ? titleErrorId : undefined}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit(e)
              }}
            />
            <Button type="button" onClick={submit} className="manual-form__submit">
              {editing ? (
                t().save
              ) : (
                <>
                  <PlusIcon width={15} height={15} /> {t().manualAdd}
                </>
              )}
            </Button>
          </div>

          {/* Enter belongs to the text here, not to the form; the other two
              fields still file the line, and so does Ctrl/Cmd + Enter. */}
          <Textarea
            className="manual-form__note"
            rows={2}
            value={description}
            maxLength={MANUAL_MAX_DESCRIPTION}
            placeholder={t().manualDescPlaceholder}
            aria-label={t().manualDescAria}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(e)
            }}
          />

          <div className='manual-form__space-between'>

          <div className="manual-form__row">
            {/* Explicit widths: these are native pickers, and the kit's inputs
                shrink below their content rather than holding their ground. */}
            <Input
              type="date"
              inputSize="sm"
              value={date}
              aria-label={t().manualDateAria}
              onChange={(e) => setDate(e.target.value)}
              style={{ width: 148 }}
            />
            <Input
              type="number"
              inputSize="sm"
              min={MANUAL_MIN_HOURS}
              max={MANUAL_MAX_HOURS}
              step="any"
              value={hours}
              aria-label={t().manualHoursAria}
              aria-invalid={touched && !hoursValid}
              aria-describedby={touched && !hoursValid ? durationErrorId : undefined}
              onChange={(e) => setHours(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit(e)
              }}
              style={{ width: 72 }}
            />
            <span className="manual-form__unit" aria-hidden="true">
              {t().unitH}
            </span>
            <span className="manual-form__prefix" aria-hidden="true">
              {t().manualFrom}
            </span>
            <Input
              type="time"
              inputSize="sm"
              value={startTime}
              aria-label={t().manualStartAria}
              onChange={(e) => setStartTime(e.target.value)}
              style={{ width: 104 }}
            />

            {/* Only meaningful once there is a clock to count from. */}
            <span className="manual-form__end num" aria-hidden="true">
              {ends && (
                <>
                  → {ends.time}
                  {ends.dayShift > 0 && <sup className="mrow__next">+1</sup>}
                </>
              )}
            </span>
            </div>
            <div className="manual-form__row">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label={t().manualIconAria}
                  title={t().iconLabel}
                >
                  {icon ? <EmojiIcon icon={icon} size={17} /> : <span aria-hidden="true">—</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="manual-pop">
                <div className="icon-picker" role="group" aria-label={t().iconLabel}>
                  <button
                    type="button"
                    className="icon-swatch icon-swatch--none"
                    aria-pressed={icon === null}
                    aria-label={t().iconNone}
                    title={t().iconNone}
                    onClick={() => setIcon(null)}
                  >
                    —
                  </button>
                  {ICONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className="icon-swatch"
                      aria-pressed={icon === option}
                      aria-label={t().iconOption(option)}
                      onClick={() => setIcon(option)}
                    >
                      <EmojiIcon icon={option} size={19} />
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label={t().manualColorAria}
                  title={t().accent[accent]}
                >
                  <i className="manual-form__swatch" style={tone(accent)} aria-hidden="true" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="manual-pop manual-pop--narrow">
                <div className="accent-picker" role="group" aria-label={t().colorLabel}>
                  {ACCENTS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className="accent-swatch"
                      style={tone(option)}
                      aria-pressed={accent === option}
                      aria-label={t().accent[option]}
                      title={t().accent[option]}
                      onClick={() => setAccent(option)}
                    />
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          </div>


          {touched && !titleValid && <FieldError id={titleErrorId}>{t().manualTitleError}</FieldError>}
          {touched && !hoursValid && (
            <FieldError id={durationErrorId}>
              {t().manualHoursError(MANUAL_MIN_HOURS, MANUAL_MAX_HOURS)}
            </FieldError>
          )}
          {!touched && <FieldHint>{t().manualHint}</FieldHint>}
        </div>
      </Field>
    </div>
  )
}
