/**
 * In-app notifications, decoupled from React: any module fires `toast()`, the
 * single `ToastHost` mounted in the shell listens and renders the stack. No
 * context is threaded through the tree for what is a fire-and-forget event.
 */

export type ToastTone = 'info' | 'warning' | 'danger' | 'success'

export interface ToastInput {
  title: string
  body?: string
  tone?: ToastTone
  /** Milliseconds until auto-dismiss; `null` sticks until closed by hand. */
  duration?: number | null
  onClose?: () => void
}

export interface ToastItem extends ToastInput {
  id: string
}

type Listener = (item: ToastItem) => void

const listeners = new Set<Listener>()

export function toast(input: ToastInput): void {
  const item: ToastItem = { id: crypto.randomUUID(), ...input }
  listeners.forEach((listener) => listener(item))
}

export function onToast(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
