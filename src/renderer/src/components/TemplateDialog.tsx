import { useEffect, useId, useState } from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldError,
  FieldHint,
  Input,
  Label,
  Switch,
  Textarea
} from '@morze/ui'
import { ACCENTS, type Accent } from '@shared/types'
import { tone } from '@/lib/accents'
import { t } from '@/lib/i18n'
import type { NewTemplate } from '@/lib/store'
import { EmojiIcon } from './EmojiIcon'

const PRESETS = [15, 25, 50, 90]

/** The macOS-flavoured shortlist: work, calls, writing, rest — and the poo. */
const ICONS = [
  '🧠', '💻', '🔍', '📞', '📥', '✍️', '📚', '🎨', '🧪', '🛠️', '🏃', '☕',
  '📝', '📊', '💬', '🐛', '🚀', '🎯', '🔥', '⚡', '🧘', '🎧', '💤', '💩'
] as const

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present when editing; absent when creating. */
  initial?: NewTemplate
  title: string
  /** Overrides the template-specific blurb, e.g. when editing a queued task. */
  subtitle?: string
  submitLabel: string
  onSubmit: (draft: NewTemplate) => void
}

export function TemplateDialog({
  open,
  onOpenChange,
  initial,
  title,
  subtitle,
  submitLabel,
  onSubmit
}: Props): React.JSX.Element {
  const nameId = useId()
  const descriptionId = useId()
  const minutesId = useId()
  const errorId = useId()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [minutes, setMinutes] = useState('25')
  const [unlimited, setUnlimited] = useState(false)
  const [overrun, setOverrun] = useState(false)
  const [accent, setAccent] = useState<Accent>('amber')
  const [icon, setIcon] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)

  // Re-seed on open so a cancelled edit never leaks into the next one.
  // On open ONLY: the parents rebuild `initial` on every render, and they
  // re-render four times a second on the timer tick — seeding on its identity
  // would wipe the user's unsaved edits (colour, limit) back to the stored
  // values a moment after every change.
  useEffect(() => {
    if (!open) return
    setName(initial?.title ?? '')
    setDescription(initial?.description ?? '')
    setUnlimited(initial ? initial.limitSec === null : false)
    setMinutes(initial?.limitSec ? String(Math.round(initial.limitSec / 60)) : '25')
    setOverrun(initial?.overrun ?? false)
    setAccent(initial?.accent ?? 'amber')
    setIcon(initial?.icon ?? null)
    setTouched(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `initial` has no stable identity; seed only on open.
  }, [open])

  const parsedMinutes = Number(minutes)
  const minutesValid =
    unlimited || (Number.isInteger(parsedMinutes) && parsedMinutes >= 1 && parsedMinutes <= 480)
  const nameValid = name.trim().length > 0
  const valid = nameValid && minutesValid

  const submit = (event: React.FormEvent): void => {
    event.preventDefault()
    setTouched(true)
    if (!valid) return
    onSubmit({
      title: name.trim(),
      description: description.trim(),
      limitSec: unlimited ? null : Math.round(parsedMinutes * 60),
      // A task with no limit has nothing to overrun; never store a flag that
      // could not apply and would confuse the next edit.
      overrun: unlimited ? false : overrun,
      accent,
      icon
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="tpl-dialog" closeLabel={t().close}>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {subtitle ?? t().tplDialogSubtitle}
            </DialogDescription>
          </DialogHeader>

          <div className="form-grid tpl-dialog__scroll">
            <Field>
              <Label htmlFor={nameId}>{t().nameLabel}</Label>
              <Input
                id={nameId}
                value={name}
                autoFocus
                placeholder={t().namePlaceholder}
                aria-invalid={touched && !nameValid}
                aria-describedby={touched && !nameValid ? errorId : undefined}
                onChange={(e) => setName(e.target.value)}
              />
              {touched && !nameValid && <FieldError id={errorId}>{t().nameError}</FieldError>}
            </Field>

            <Field>
              <Label htmlFor={descriptionId}>{t().descLabel}</Label>
              <Textarea
                id={descriptionId}
                value={description}
                rows={2}
                placeholder={t().descPlaceholder}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>

            <Field>
              <Label htmlFor={minutesId}>{t().limitLabel}</Label>
              <div className="preset-row">
                {PRESETS.map((preset) => (
                  <Button
                    key={preset}
                    type="button"
                    size="xs"
                    variant={!unlimited && parsedMinutes === preset ? 'primary' : 'outline'}
                    onClick={() => {
                      setUnlimited(false)
                      setMinutes(String(preset))
                    }}
                  >
                    {t().minShort(preset)}
                  </Button>
                ))}
                <Input
                  id={minutesId}
                  type="number"
                  inputSize="sm"
                  min={1}
                  max={480}
                  step={1}
                  value={unlimited ? '' : minutes}
                  disabled={unlimited}
                  aria-label={t().limitAria}
                  aria-invalid={touched && !minutesValid}
                  onChange={(e) => setMinutes(e.target.value)}
                  style={{ width: 92 }}
                />
              </div>
              {touched && !minutesValid ? (
                <FieldError>{t().limitError}</FieldError>
              ) : (
                <FieldHint>{t().limitHint}</FieldHint>
              )}
            </Field>

            <div style={{ marginTop: 'calc(var(--space-2) * -1)' }}>
              <div className="setting-row" style={{ paddingTop: 0 }}>
                <div>
                  <div className="setting-row__text">{t().unlimited}</div>
                  <div className="setting-row__hint">{t().unlimitedHint}</div>
                </div>
                <Switch checked={unlimited} onCheckedChange={setUnlimited} aria-label={t().unlimited} />
              </div>

              <div className="setting-row" style={{ borderBottom: 0 }}>
                <div>
                  <div className="setting-row__text">{t().overrunLabel}</div>
                  <div className="setting-row__hint">
                    {unlimited ? t().overrunNoLimit : t().overrunHint}
                  </div>
                </div>
                <Switch
                  checked={overrun}
                  disabled={unlimited}
                  onCheckedChange={setOverrun}
                  aria-label={t().overrunLabel}
                />
              </div>
            </div>

            <Field>
              <Label id={`${nameId}-icon`}>{t().iconLabel}</Label>
              <div className="icon-picker" role="group" aria-labelledby={`${nameId}-icon`}>
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
            </Field>

            <Field>
              <Label id={`${nameId}-accent`}>{t().colorLabel}</Label>
              <div className="accent-picker" role="group" aria-labelledby={`${nameId}-accent`}>
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
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t().cancel}
            </Button>
            <Button type="submit">{submitLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
