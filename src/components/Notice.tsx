import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import '../shared-states.css'

/** Keep Undo usable inside a modal, and give focused readers time to act. */
export function Notice({ message, onDismiss, children, role = 'status' }: {
  message: string
  onDismiss?: () => void
  role?: 'status' | 'alert'
  children?: ReactNode
}) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [dialog, setDialog] = useState<HTMLElement | null>(null)
  const dismiss = useRef(onDismiss)
  dismiss.current = onDismiss
  useEffect(() => {
    const syncDialog = () => {
      const open = document.querySelectorAll<HTMLDialogElement>('dialog[open]')
      setDialog(open.item(open.length - 1))
    }
    syncDialog()
    const observer = new MutationObserver(syncDialog)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] })
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (hovered || focused || !onDismiss) return
    const timer = setTimeout(() => dismiss.current?.(), 6000)
    return () => clearTimeout(timer)
  }, [message, hovered, focused, Boolean(onDismiss)])
  const notice = <div className="notice-chip" role={role} data-modal={dialog ? "true" : undefined}
    onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
    onFocus={() => setFocused(true)} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false)
    }}>
    <span>{message}</span>{children}
  </div>
  return dialog ? createPortal(notice, dialog) : notice
}
