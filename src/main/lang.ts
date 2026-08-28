import { app } from 'electron'
import type { AppLanguage } from '../shared/types'

/** The system half of the language setting, decided by the OS locale. */
export function resolveAppLang(setting: AppLanguage): 'ru' | 'en' {
  if (setting === 'ru' || setting === 'en') return setting
  return app.getLocale().toLowerCase().startsWith('ru') ? 'ru' : 'en'
}
