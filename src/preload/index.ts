import { contextBridge, ipcRenderer } from 'electron'
import type {
  DayStats,
  ExportInventory,
  ExportOptions,
  ExportResult,
  ISODate,
  PersistedState,
  QueueSnapshot,
  Session,
  Settings,
  Template
} from '../shared/types'

/**
 * The renderer's entire privileged surface. Writes are split per table so a
 * heartbeat every five seconds touches the queue only, and never rewrites the
 * session log along with it.
 */
const api = {
  load: (): Promise<PersistedState> => ipcRenderer.invoke('data:load'),
  dataPath: (): Promise<string> => ipcRenderer.invoke('data:path'),
  saveTemplates: (templates: Template[]): Promise<void> =>
    ipcRenderer.invoke('templates:save', templates),
  saveQueue: (snapshot: QueueSnapshot): Promise<void> => ipcRenderer.invoke('queue:save', snapshot),
  saveSettings: (settings: Settings): Promise<void> =>
    ipcRenderer.invoke('settings:save', settings),
  addSession: (session: Session): Promise<void> => ipcRenderer.invoke('session:add', session),
  dayStats: (dates: ISODate[]): Promise<Record<ISODate, DayStats>> =>
    ipcRenderer.invoke('stats:days', dates),
  streak: (today: ISODate): Promise<number> => ipcRenderer.invoke('stats:streak', today),
  exportInventory: (from: ISODate, to: ISODate): Promise<ExportInventory> =>
    ipcRenderer.invoke('export:inventory', { from, to }),
  runExport: (options: ExportOptions): Promise<ExportResult> =>
    ipcRenderer.invoke('export:run', options),
  deleteTaskSessions: (from: ISODate, to: ISODate, key: string): Promise<number> =>
    ipcRenderer.invoke('sessions:deleteTask', { from, to, key }),
  revealPath: (path: string): void => ipcRenderer.send('reveal:path', path),
  notify: (title: string, body: string): void => ipcRenderer.send('notify', { title, body }),
  requestAttention: (): void => ipcRenderer.send('window:attention'),
  /** Fires just before the machine suspends; returns an unsubscribe. */
  onPowerSuspend: (listener: () => void): (() => void) => {
    const handler = (): void => listener()
    ipcRenderer.on('power:suspend', handler)
    return () => {
      ipcRenderer.removeListener('power:suspend', handler)
    }
  }
}

contextBridge.exposeInMainWorld('tracker', api)

export type TrackerApi = typeof api
