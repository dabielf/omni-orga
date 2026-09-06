import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import './goals-redesign.css'

/** Native modal supplies focus containment and makes the background inert. */
export function GoalDialog({ title, onClose, children, compact = false }: {
  title: string
  onClose: () => void
  children: ReactNode
  compact?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null
    const dialog = ref.current!
    dialog.showModal()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        const items = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')).filter(item => item.getClientRects().length)
        const first = items[0], last = items.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeRef.current()
      }
    }
    dialog.addEventListener('keydown', onKey)
    return () => {
      dialog.removeEventListener('keydown', onKey)
      dialog.close()
      if (trigger?.isConnected) trigger.focus()
    }
  }, [])
  return (
    <dialog ref={ref} className={`goal-dialog${compact ? ' is-compact' : ''}`} aria-label={title}
      onCancel={event => { event.preventDefault(); onClose() }}
      onClick={event => { if (event.target === event.currentTarget) {
        const rect = event.currentTarget.getBoundingClientRect()
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose()
      } }}>
      <header className="goal-dialog-head"><h2>{title}</h2><button type="button" className="secondary-btn" onClick={onClose}>Close</button></header>
      {children}
    </dialog>
  )
}
