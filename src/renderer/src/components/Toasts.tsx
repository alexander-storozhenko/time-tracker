import { useEffect, useRef, useState } from 'react'
import { Alert, AlertDescription, AlertTitle, Button } from '@morze/ui'
import { t } from '@/lib/i18n'
import { onToast, type ToastItem } from '@/lib/toast'
import { CloseIcon } from './icons'

const AUTO_DISMISS_MS = 6000

/** One notification: the kit's Alert, plus what a toast needs on top of it —
 *  the auto-dismiss clock and a close button. */
function Toast({ item, onDone }: { item: ToastItem; onDone: () => void }): React.JSX.Element {
  // The dismiss clock must survive re-renders: the host re-renders four times
  // a second while a timer runs, and a fresh `onDone` identity every render
  // would reset the timeout forever. Depend on the id, read through a ref.
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  useEffect(() => {
    if (item.duration === null) return
    const id = setTimeout(() => onDoneRef.current(), item.duration ?? AUTO_DISMISS_MS)
    return () => clearTimeout(id)
  }, [item.id, item.duration])

  return (
    <Alert tone={item.tone ?? 'info'} className="toast" role="status">
      <AlertTitle>{item.title}</AlertTitle>
      {item.body && <AlertDescription>{item.body}</AlertDescription>}
      <Button
        variant="ghost"
        size="icon-xs"
        className="toast__close"
        aria-label={t().close}
        onClick={onDone}
      >
        <CloseIcon width={14} height={14} />
      </Button>
    </Alert>
  )
}

/** Bottom-right notification stack; mounted once in the shell. */
export function ToastHost(): React.JSX.Element {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => onToast((item) => setItems((current) => [...current, item])), [])

  const close = (item: ToastItem): void => {
    item.onClose?.()
    setItems((current) => current.filter((i) => i.id !== item.id))
  }

  return (
    <div
      className="toasts"
      aria-label={t().notifications}
      // A toast floats above modal dialogs; without this, its close button
      // registers as an "outside press" and dismisses the dialog underneath.
      onPointerDownCapture={(e) => e.stopPropagation()}
    >
      {items.map((item) => (
        <Toast key={item.id} item={item} onDone={() => close(item)} />
      ))}
    </div>
  )
}
