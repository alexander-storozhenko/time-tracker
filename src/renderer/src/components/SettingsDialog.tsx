import { useEffect, useState } from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Switch
} from '@morze/ui'
import type { AppLanguage, Settings } from '@shared/types'
import { playLimitChime } from '@/lib/chime'
import { t } from '@/lib/i18n'
import { useStore } from '@/lib/store'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function Row({
  label,
  hint,
  checked,
  onChange
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (value: boolean) => void
}): React.JSX.Element {
  return (
    <div className="setting-row">
      <div>
        <div className="setting-row__text">{label}</div>
        <div className="setting-row__hint">{hint}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  )
}

export function SettingsDialog({ open, onOpenChange }: Props): React.JSX.Element {
  const { state, dispatch } = useStore()
  const [path, setPath] = useState('')

  useEffect(() => {
    if (open) void window.tracker.dataPath().then(setPath)
  }, [open])

  const set = (patch: Partial<Settings>): void => dispatch({ type: 'settings/update', patch })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t().close}>
        <DialogHeader>
          <DialogTitle>{t().settings}</DialogTitle>
          <DialogDescription>{t().settingsDesc}</DialogDescription>
        </DialogHeader>

        <div style={{ padding: 'var(--space-3) 0' }}>
          <Row
            label={t().autoAdvanceLabel}
            hint={t().autoAdvanceHint}
            checked={state.settings.autoAdvance}
            onChange={(autoAdvance) => set({ autoAdvance })}
          />
          <Row
            label={t().soundLabel}
            hint={t().soundHint}
            checked={state.settings.sound}
            // Switching it on plays it: nobody should have to run over a limit
            // to find out what they just enabled.
            onChange={(sound) => {
              set({ sound })
              if (sound) playLimitChime()
            }}
          />
          <Row
            label={t().notifLabel}
            hint={t().notifHint}
            checked={state.settings.notifications}
            onChange={(notifications) => set({ notifications })}
          />

          <div className="setting-row" style={{ borderBottom: 0 }}>
            <div>
              <div className="setting-row__text">{t().languageLabel}</div>
              <div className="setting-row__hint">{t().languageHint}</div>
            </div>
            <div className="preset-row" role="group" aria-label={t().languageLabel}>
              {(['system', 'ru', 'en'] as AppLanguage[]).map((option) => (
                <Button
                  key={option}
                  type="button"
                  size="xs"
                  variant={state.settings.language === option ? 'primary' : 'outline'}
                  onClick={() => set({ language: option })}
                >
                  {option === 'system' ? t().langSystem : option === 'ru' ? 'Русский' : 'English'}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <p className="setting-row__hint" style={{ maxWidth: 'none', wordBreak: 'break-all' }}>
          {t().dbPath} <code>{path || '…'}</code>
        </p>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>{t().done}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
