import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, powerMonitor, shell } from 'electron'
import { join } from 'node:path'
import type {
  ExportOptions,
  ISODate,
  ManualDraft,
  ManualExportOptions,
  QueueSnapshot,
  Session,
  Settings,
  Template
} from '../shared/types'
import * as db from './db'
import { runExport, runManualExport } from './export'
import { resolveAppLang } from './lang'

/** Matches `--mz-bg` in dark, so the window never flashes white before React paints. */
const WINDOW_BG = '#12101a'

/**
 * Packaged, `resources/` is copied next to the app by electron-builder; in dev
 * it sits in the repo. Windows and macOS take the icon from the installer
 * metadata, but Linux reads it off the window itself.
 */
function iconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(app.getAppPath(), 'resources', 'icon.png')
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 960,
    minHeight: 660,
    show: false,
    backgroundColor: WINDOW_BG,
    autoHideMenuBar: true,
    title: 'Time Tracker',
    icon: iconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // External links belong in the browser, never inside the app shell.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const MENU_LABELS = {
  ru: { file: 'Файл', showData: 'Показать файл данных', view: 'Вид' },
  en: { file: 'File', showData: 'Show data file', view: 'View' }
}

function buildMenu(lang: 'ru' | 'en'): void {
  const labels = MENU_LABELS[lang]
  const isMac = process.platform === 'darwin'
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(isMac ? [{ role: 'appMenu' as const }] : []),
      {
        label: labels.file,
        submenu: [
          {
            label: labels.showData,
            click: () => shell.showItemInFolder(db.dbFilePath())
          },
          { type: 'separator' as const },
          isMac ? { role: 'close' as const } : { role: 'quit' as const }
        ]
      },
      { role: 'editMenu' },
      {
        label: labels.view,
        submenu: [
          { role: 'reload' as const },
          { role: 'toggleDevTools' as const },
          { type: 'separator' as const },
          { role: 'resetZoom' as const },
          { role: 'zoomIn' as const },
          { role: 'zoomOut' as const },
          { type: 'separator' as const },
          { role: 'togglefullscreen' as const }
        ]
      }
    ])
  )
}

// A second copy would open the same database, and every queue save is a full
// rewrite — two instances would silently clobber each other's queue. The lock
// makes a second launch hand over to the running window instead.
const hasLock = app.requestSingleInstanceLock()
if (!hasLock) {
  app.quit()
}

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

app.whenReady().then(() => {
  // `ready` can still fire on the losing instance while quit() is in flight;
  // it must not touch the database or open a window on its way out.
  if (!hasLock) return
  try {
    db.open()
  } catch (err) {
    // A dead database with no window reads as "the app is broken"; say why.
    dialog.showErrorBox(
      'Time Tracker',
      `Не удалось открыть базу данных:\n${err instanceof Error ? err.message : String(err)}`
    )
    app.quit()
    return
  }
  buildMenu(resolveAppLang(db.languageSetting()))

  ipcMain.handle('data:load', () => db.loadState())
  ipcMain.handle('data:path', () => db.dbFilePath())
  ipcMain.handle('templates:save', (_e, templates: Template[]) => db.saveTemplates(templates))
  ipcMain.handle('queue:save', (_e, snapshot: QueueSnapshot) => db.saveQueue(snapshot))
  ipcMain.handle('settings:save', (_e, settings: Settings) => {
    const before = resolveAppLang(db.languageSetting())
    db.saveSettings(settings)
    const after = resolveAppLang(settings.language)
    if (after !== before) buildMenu(after)
  })
  ipcMain.handle('session:add', (_e, session: Session) => db.addSession(session))
  ipcMain.handle('stats:days', (_e, dates: ISODate[]) => db.statsFor(dates))
  ipcMain.handle('stats:streak', (_e, today: ISODate) => db.streak(today))
  ipcMain.handle('export:inventory', (_e, range: { from: ISODate; to: ISODate }) =>
    db.exportInventory(range.from, range.to)
  )
  ipcMain.handle('export:run', (_e, options: ExportOptions) => runExport(mainWindow, options))
  ipcMain.handle('manual:load', () => db.loadManualDraft())
  ipcMain.handle('manual:save', (_e, draft: ManualDraft) => db.saveManualDraft(draft))
  ipcMain.handle('manual:list', () => db.manualReports())
  ipcMain.handle('manual:open', (_e, id: string) => db.manualReport(String(id)))
  ipcMain.handle('manual:store', (_e, draft: ManualDraft) => db.storeManualReport(draft))
  ipcMain.handle('manual:delete', (_e, id: string) => db.deleteManualReport(String(id)))
  ipcMain.handle('export:manual', (_e, options: ManualExportOptions) =>
    runManualExport(mainWindow, options)
  )
  ipcMain.handle('sessions:deleteTask', (_e, p: { from: ISODate; to: ISODate; key: string }) =>
    db.deleteTaskSessions(p.from, p.to, p.key)
  )
  // `ipcMain.on` throws crash the whole main process, unlike `handle`;
  // these three take renderer input, so they check it instead of trusting it.
  ipcMain.on('reveal:path', (_e, path: string) => {
    if (typeof path === 'string' && path) shell.showItemInFolder(path)
  })

  ipcMain.on('notify', (_event, payload: { title: string; body: string }) => {
    if (!Notification.isSupported() || !payload) return
    new Notification({ title: String(payload.title), body: String(payload.body), silent: false }).show()
  })

  /** Nudge the window when a task finishes while the app is in the background. */
  ipcMain.on('window:attention', () => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isFocused()) return
    mainWindow.flashFrame(true)
    if (process.platform === 'darwin') app.dock?.bounce('informational')
  })

  // Sleep is rest, not work: the renderer pauses the running stretch before
  // the machine suspends, so the night never lands in the log. (The reducer's
  // tick-gap clamp is the backstop where this event is not delivered.)
  powerMonitor.on('suspend', () => {
    mainWindow?.webContents.send('power:suspend')
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Checkpoints the WAL and releases the file handle instead of leaving it to the
// OS, so the next launch never has to recover a journal.
app.on('will-quit', () => db.close())
