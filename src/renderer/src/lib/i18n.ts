import type { Accent, AppLanguage } from '@shared/types'

/**
 * The whole UI's wording, both languages side by side. A typed dictionary
 * instead of string keys: a missing translation is a compile error, and every
 * parametrised phrase is a function, so word order stays free per language.
 */

export type Lang = 'ru' | 'en'

export interface Dict {
  // Generic chrome
  close: string
  cancel: string
  save: string
  done: string
  settings: string
  notifications: string

  // Theme
  themeDark: string
  themeLight: string

  // Topbar / statistics column
  stats: string
  statsShow: string
  statsHide: string
  statsSheetDesc: string
  today: string
  yesterday: string
  loading: string

  // Recovery toast
  recoveredTitle: string
  recoveredBody: (duration: string) => string

  // Sleep-pause toast
  sleepPausedTitle: string
  sleepPausedBody: string

  // Timer stage
  timer: string
  noLimit: string
  overLimit: (limit: string) => string
  ofLimit: (limit: string) => string
  addTask: string
  timeUp: string
  timeUpBody: (title: string, limit: string) => string
  resume: string
  startTask: string
  start: string
  pause: string
  finishTask: string
  finishHint: string
  spaceKey: string
  queueEmpty: string
  srPaused: (title: string) => string
  srOver: (title: string, time: string) => string
  srRunning: (title: string, time: string) => string
  srLeft: (title: string, time: string) => string

  // Queue
  queueAria: string
  queueEmptyWord: string
  queueSummary: (count: number, plan: string) => string
  clearDone: (count: number) => string
  dropHere: string
  editTaskTitle: string
  editTaskSubtitle: string
  currentTaskSr: string
  noStop: string
  restartTask: string
  makeCurrent: string
  actionWith: (action: string, title: string) => string
  edit: string
  removeFromQueue: (title: string) => string

  // Templates rail
  templates: string
  newTemplate: string
  createTemplate: string
  railEmpty: string
  tplAria: (title: string, limit: string, overrun: boolean) => string
  editTemplateAria: (title: string) => string
  deleteTemplateAria: (title: string) => string
  editTemplateTitle: string
  newTemplateTitle: string
  create: string
  overrunShort: string

  // Template dialog
  tplDialogSubtitle: string
  nameLabel: string
  namePlaceholder: string
  nameError: string
  descLabel: string
  descPlaceholder: string
  limitLabel: string
  minShort: (n: number) => string
  limitAria: string
  limitError: string
  limitHint: string
  unlimited: string
  unlimitedHint: string
  overrunLabel: string
  overrunNoLimit: string
  overrunHint: string
  iconLabel: string
  iconNone: string
  iconOption: (emoji: string) => string
  colorLabel: string
  accent: Record<Accent, string>

  // Settings dialog
  settingsDesc: string
  autoAdvanceLabel: string
  autoAdvanceHint: string
  soundLabel: string
  soundHint: string
  notifLabel: string
  notifHint: string
  pauseOnSleepLabel: string
  pauseOnSleepHint: string
  languageLabel: string
  languageHint: string
  langSystem: string
  dbPath: string

  // Export dialog
  exportWord: string
  exportTitle: string
  exportDesc: string
  period: string
  days7: string
  days30: string
  allTime: string
  customPeriod: string
  fromAria: string
  toAria: string
  tasksLabel: string
  selectAll: string
  deselectAll: string
  noRecords: string
  format: string
  pdfReport: string
  contents: string
  byDays: string
  byHours: string
  allRuns: string
  saved: string
  showInFolder: string
  emptyPeriod: string
  runsCount: (n: number) => string
  nothingSelected: string
  deleteTaskAria: (title: string) => string
  deleteConfirm: string
  exportFailed: string
  deleteFailed: string
  exporting: string
  exportBtn: string

  // Statistics panel
  todayEmptyText: string
  yesterdayEmptyText: string
  vsYesterday: string
  byLimitKpi: string
  streakDays: string
  longestKpi: string
  runsKpi: string
  restRow: (n: number) => string
  hoursAria: (spoken: string) => string
  hoursEmpty: string

  // Time units
  unitH: string
  unitMin: string
  lessThanMin: string
  zeroMin: string
}

/** 1 задача, 2 задачи, 5 задач. */
const ruPlural = (count: number, one: string, few: string, many: string): string => {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

const RU: Dict = {
  close: 'Закрыть',
  cancel: 'Отмена',
  save: 'Сохранить',
  done: 'Готово',
  settings: 'Настройки',
  notifications: 'Уведомления',

  themeDark: 'Тёмная тема',
  themeLight: 'Светлая тема',

  stats: 'Статистика',
  statsShow: 'Показать статистику',
  statsHide: 'Скрыть статистику',
  statsSheetDesc: 'Сегодня и вчера.',
  today: 'Сегодня',
  yesterday: 'Вчера',
  loading: 'Загрузка данных',

  recoveredTitle: 'Таймер восстановлен',
  recoveredBody: (duration) =>
    `Прошлый запуск закрылся на ходу. Записал ${duration} до последней отметки и поставил таймер на паузу.`,

  sleepPausedTitle: 'Таймер на паузе',
  sleepPausedBody: 'Компьютер уходил в сон — время до засыпания сохранено, сон в работу не записан.',

  timer: 'Таймер',
  noLimit: 'без лимита',
  overLimit: (limit) => `сверх ${limit}`,
  ofLimit: (limit) => `из ${limit}`,
  addTask: 'добавьте задачу',
  timeUp: 'Время вышло',
  timeUpBody: (title, limit) => `«${title}» — ${limit}`,
  resume: 'Продолжить',
  startTask: 'Начать задачу',
  start: 'Начать',
  pause: 'Пауза',
  finishTask: 'Завершить задачу',
  finishHint: 'Завершить и записать время',
  spaceKey: 'Пробел',
  queueEmpty: 'Очередь пуста',
  srPaused: (title) => `Пауза. ${title}`,
  srOver: (title, time) => `${title}: сверх лимита ${time}`,
  srRunning: (title, time) => `${title}: идёт ${time}`,
  srLeft: (title, time) => `${title}: осталось ${time}`,

  queueAria: 'Очередь задач',
  queueEmptyWord: 'пусто',
  queueSummary: (count, plan) =>
    `${count} ${ruPlural(count, 'задача', 'задачи', 'задач')} · план ${plan}`,
  clearDone: (count) => `Убрать завершённые (${count})`,
  dropHere: 'Перетащите сюда шаблон из левой колонки',
  editTaskTitle: 'Изменить задачу',
  editTaskSubtitle: 'Правки касаются только этой задачи в очереди — шаблон не изменится.',
  currentTaskSr: 'текущая задача:',
  noStop: 'без стопа',
  restartTask: 'Запустить заново',
  makeCurrent: 'Сделать текущей',
  actionWith: (action, title) => `${action}: ${title}`,
  edit: 'Изменить',
  removeFromQueue: (title) => `Убрать из очереди: ${title}`,

  templates: 'Шаблоны',
  newTemplate: 'Новый шаблон',
  createTemplate: 'Создать шаблон задачи',
  railEmpty: 'Пока пусто. Создайте первый шаблон — он станет кирпичиком дня.',
  tplAria: (title, limit, overrun) =>
    `${title}, ${limit}${overrun ? ', продолжает считать сверх лимита' : ''}. Добавить в очередь`,
  editTemplateAria: (title) => `Изменить шаблон «${title}»`,
  deleteTemplateAria: (title) => `Удалить шаблон «${title}»`,
  editTemplateTitle: 'Изменить шаблон',
  newTemplateTitle: 'Новый шаблон',
  create: 'Создать',
  overrunShort: 'сверх лимита',

  tplDialogSubtitle: 'Шаблон можно сколько угодно раз добавлять в очередь на день.',
  nameLabel: 'Название',
  namePlaceholder: 'Например, вёрстка навбара',
  nameError: 'Введите название задачи.',
  descLabel: 'Описание',
  descPlaceholder: 'Что именно сделать; ссылки, критерии готовности…',
  limitLabel: 'Лимит по времени',
  minShort: (n) => `${n} мин`,
  limitAria: 'Лимит в минутах',
  limitError: 'Укажите от 1 до 480 минут.',
  limitHint: 'Задача без лимита работает как секундомер.',
  unlimited: 'Без лимита',
  unlimitedHint: 'Считать время вверх, пока не остановлю.',
  overrunLabel: 'Продолжать после лимита',
  overrunNoLimit: 'Нечего превышать — у задачи нет лимита.',
  overrunHint:
    'Дойдя до лимита, задача не завершится: таймер продолжит считать время сверх плана.',
  iconLabel: 'Иконка',
  iconNone: 'Без иконки',
  iconOption: (emoji) => `Иконка ${emoji}`,
  colorLabel: 'Цвет',
  accent: {
    amber: 'Янтарный',
    violet: 'Фиолетовый',
    emerald: 'Изумрудный',
    sky: 'Небесный',
    rose: 'Розовый',
    slate: 'Серый'
  },

  settingsDesc: 'Поведение таймера и хранение данных.',
  autoAdvanceLabel: 'Сразу брать следующую',
  autoAdvanceHint:
    'После завершения задачи запускать следующую в очереди без нажатия play. Не касается задач, которые продолжают считать сверх лимита.',
  soundLabel: 'Звук по лимиту',
  soundHint: 'Тихий двухнотный сигнал, когда задача переходит свой лимит.',
  notifLabel: 'Уведомления',
  notifHint: 'Системное уведомление и подсветка окна, когда время вышло.',
  pauseOnSleepLabel: 'Пауза при сне компьютера',
  pauseOnSleepHint:
    'Когда компьютер засыпает, таймер встаёт на паузу — сон не идёт в зачёт. Выключено — часы идут сквозь сон.',
  languageLabel: 'Язык',
  languageHint: 'Интерфейс, отчёты и меню.',
  langSystem: 'Системный',
  dbPath: 'База данных SQLite:',

  exportWord: 'Экспорт',
  exportTitle: 'Экспорт статистики',
  exportDesc: 'JSON — для своих скриптов и таблиц, PDF — готовый отчёт.',
  period: 'Период',
  days7: '7 дней',
  days30: '30 дней',
  allTime: 'Всё время',
  customPeriod: 'Период…',
  fromAria: 'Начало периода',
  toAria: 'Конец периода',
  tasksLabel: 'Задачи',
  selectAll: 'Выбрать все',
  deselectAll: 'Снять все',
  noRecords: 'За выбранный период записей нет.',
  format: 'Формат',
  pdfReport: 'PDF-отчёт',
  contents: 'Содержимое',
  byDays: 'Разбивка по дням',
  byHours: 'Распределение по часам',
  allRuns: 'Список всех подходов',
  saved: 'Сохранено',
  showInFolder: 'Показать в папке',
  emptyPeriod: 'Нет данных за выбранный период.',
  runsCount: (n) => `${n} ${ruPlural(n, 'подход', 'подхода', 'подходов')}`,
  nothingSelected: 'Ничего не выбрано',
  deleteTaskAria: (title) => `Удалить записи за период: ${title}`,
  deleteConfirm: 'Удалить?',
  exportFailed: 'Экспорт не удался — попробуйте ещё раз.',
  deleteFailed: 'Не получилось удалить записи.',
  exporting: 'Экспортирую…',
  exportBtn: 'Экспортировать',

  todayEmptyText: 'Сегодня ещё ничего не отсчитано.',
  yesterdayEmptyText: 'Вчера записей нет.',
  vsYesterday: 'к вчерашнему',
  byLimitKpi: 'по лимиту',
  streakDays: 'дней подряд',
  longestKpi: 'макс. отрезок',
  runsKpi: 'подходов',
  restRow: (n) => `Остальное (${n})`,
  hoursAria: (spoken) => `Распределение по часам: ${spoken}`,
  hoursEmpty: 'пусто',

  unitH: 'ч',
  unitMin: 'мин',
  lessThanMin: '<1 мин',
  zeroMin: '0 мин'
}

const EN: Dict = {
  close: 'Close',
  cancel: 'Cancel',
  save: 'Save',
  done: 'Done',
  settings: 'Settings',
  notifications: 'Notifications',

  themeDark: 'Dark theme',
  themeLight: 'Light theme',

  stats: 'Statistics',
  statsShow: 'Show statistics',
  statsHide: 'Hide statistics',
  statsSheetDesc: 'Today and yesterday.',
  today: 'Today',
  yesterday: 'Yesterday',
  loading: 'Loading data',

  recoveredTitle: 'Timer recovered',
  recoveredBody: (duration) =>
    `The previous run closed mid-flight. Logged ${duration} up to the last heartbeat and paused the timer.`,

  sleepPausedTitle: 'Timer paused',
  sleepPausedBody: 'The computer went to sleep — time up to that point was saved; the sleep itself was not logged.',

  timer: 'Timer',
  noLimit: 'no limit',
  overLimit: (limit) => `over ${limit}`,
  ofLimit: (limit) => `of ${limit}`,
  addTask: 'add a task',
  timeUp: 'Time is up',
  timeUpBody: (title, limit) => `“${title}” — ${limit}`,
  resume: 'Resume',
  startTask: 'Start task',
  start: 'Start',
  pause: 'Pause',
  finishTask: 'Finish task',
  finishHint: 'Finish and log the time',
  spaceKey: 'Space',
  queueEmpty: 'Queue is empty',
  srPaused: (title) => `Paused. ${title}`,
  srOver: (title, time) => `${title}: ${time} over the limit`,
  srRunning: (title, time) => `${title}: ${time} on the clock`,
  srLeft: (title, time) => `${title}: ${time} left`,

  queueAria: 'Task queue',
  queueEmptyWord: 'empty',
  queueSummary: (count, plan) =>
    `${count} ${count === 1 ? 'task' : 'tasks'} · planned ${plan}`,
  clearDone: (count) => `Clear completed (${count})`,
  dropHere: 'Drag a template here from the left rail',
  editTaskTitle: 'Edit task',
  editTaskSubtitle: 'Changes apply to this queued task only — the template stays as is.',
  currentTaskSr: 'current task:',
  noStop: 'no stop',
  restartTask: 'Start again',
  makeCurrent: 'Make current',
  actionWith: (action, title) => `${action}: ${title}`,
  edit: 'Edit',
  removeFromQueue: (title) => `Remove from queue: ${title}`,

  templates: 'Templates',
  newTemplate: 'New template',
  createTemplate: 'Create a task template',
  railEmpty: 'Nothing here yet. Create the first template — the building block of a day.',
  tplAria: (title, limit, overrun) =>
    `${title}, ${limit}${overrun ? ', keeps counting past the limit' : ''}. Add to the queue`,
  editTemplateAria: (title) => `Edit template “${title}”`,
  deleteTemplateAria: (title) => `Delete template “${title}”`,
  editTemplateTitle: 'Edit template',
  newTemplateTitle: 'New template',
  create: 'Create',
  overrunShort: 'overrun',

  tplDialogSubtitle: 'A template can be added to the day’s queue any number of times.',
  nameLabel: 'Name',
  namePlaceholder: 'e.g. navbar layout',
  nameError: 'Enter a task name.',
  descLabel: 'Description',
  descPlaceholder: 'What exactly to do; links, definition of done…',
  limitLabel: 'Time limit',
  minShort: (n) => `${n} min`,
  limitAria: 'Limit in minutes',
  limitError: 'Enter 1 to 480 minutes.',
  limitHint: 'A task with no limit runs as a stopwatch.',
  unlimited: 'No limit',
  unlimitedHint: 'Count up until I stop it.',
  overrunLabel: 'Keep going past the limit',
  overrunNoLimit: 'Nothing to overrun — the task has no limit.',
  overrunHint:
    'At the limit the task does not finish: the clock keeps counting the overtime.',
  iconLabel: 'Icon',
  iconNone: 'No icon',
  iconOption: (emoji) => `Icon ${emoji}`,
  colorLabel: 'Colour',
  accent: {
    amber: 'Amber',
    violet: 'Violet',
    emerald: 'Emerald',
    sky: 'Sky',
    rose: 'Rose',
    slate: 'Slate'
  },

  settingsDesc: 'Timer behaviour and data storage.',
  autoAdvanceLabel: 'Auto-advance',
  autoAdvanceHint:
    'When a task finishes, start the next one in the queue without pressing play. Does not apply to tasks that keep counting past their limit.',
  soundLabel: 'Sound at the limit',
  soundHint: 'A quiet two-note chime when a task crosses its limit.',
  notifLabel: 'Notifications',
  notifHint: 'A system notification and window highlight when time is up.',
  pauseOnSleepLabel: 'Pause when the computer sleeps',
  pauseOnSleepHint:
    'When the machine suspends, the timer pauses — sleep does not count. Off, the clock runs straight through.',
  languageLabel: 'Language',
  languageHint: 'Interface, reports and the menu.',
  langSystem: 'System',
  dbPath: 'SQLite database:',

  exportWord: 'Export',
  exportTitle: 'Statistics export',
  exportDesc: 'JSON for your own scripts and sheets, PDF for a ready-made report.',
  period: 'Period',
  days7: '7 days',
  days30: '30 days',
  allTime: 'All time',
  customPeriod: 'Custom…',
  fromAria: 'Period start',
  toAria: 'Period end',
  tasksLabel: 'Tasks',
  selectAll: 'Select all',
  deselectAll: 'Deselect all',
  noRecords: 'No records in the selected period.',
  format: 'Format',
  pdfReport: 'PDF report',
  contents: 'Contents',
  byDays: 'Day-by-day breakdown',
  byHours: 'Hour-of-day distribution',
  allRuns: 'Every run listed',
  saved: 'Saved',
  showInFolder: 'Show in folder',
  emptyPeriod: 'No data for the selected period.',
  runsCount: (n) => `${n} ${n === 1 ? 'run' : 'runs'}`,
  nothingSelected: 'Nothing selected',
  deleteTaskAria: (title) => `Delete this period's records: ${title}`,
  deleteConfirm: 'Delete?',
  exportFailed: 'Export failed — try again.',
  deleteFailed: 'Could not delete the records.',
  exporting: 'Exporting…',
  exportBtn: 'Export',

  todayEmptyText: 'Nothing logged yet today.',
  yesterdayEmptyText: 'No records yesterday.',
  vsYesterday: 'vs yesterday',
  byLimitKpi: 'to the limit',
  streakDays: 'days in a row',
  longestKpi: 'longest run',
  runsKpi: 'runs',
  restRow: (n) => `Everything else (${n})`,
  hoursAria: (spoken) => `By hour of day: ${spoken}`,
  hoursEmpty: 'empty',

  unitH: 'h',
  unitMin: 'min',
  lessThanMin: '<1 min',
  zeroMin: '0 min'
}

const DICTS: Record<Lang, Dict> = { ru: RU, en: EN }

export function resolveLang(setting: AppLanguage): Lang {
  if (setting === 'ru' || setting === 'en') return setting
  return navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en'
}

/**
 * Module-level current language. The store provider stamps it on every render
 * (before any consumer renders), so plain helpers like the time formatters can
 * read it without threading a parameter through every call.
 */
let current: Lang = resolveLang('system')

export function setCurrentLang(lang: Lang): void {
  current = lang
}

export function currentLang(): Lang {
  return current
}

/** The active dictionary. Components re-render on settings changes (they all
 *  subscribe to the store), so reading it during render stays fresh. */
export function t(): Dict {
  return DICTS[current]
}
