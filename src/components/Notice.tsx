import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import '../shared-states.css'

// A single stack per active surface keeps success and refresh failures readable together.
const stacks = new WeakMap<HTMLElement, { element: HTMLDivElement; readers: number }>()

/** Keep Undo usable inside a modal, and give focused readers time to act. */
export function Notice({ message, onDismiss, children, role = 'status' }: {
  message: string
  onDismiss?: () => void
  role?: 'status' | 'alert'
  children?: ReactNode
}) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [host, setHost] = useState<HTMLElement | null>(null)
  const noticeRef = useRef<HTMLDivElement>(null)
  const dismiss = useRef(onDismiss)
  dismiss.current = onDismiss
  useEffect(() => {
    let owner: HTMLElement | null = null
    let release = () => {}
    const syncSurface = () => {
      const open = document.querySelectorAll<HTMLDialogElement>('dialog[open]')
      const next = open.item(open.length - 1) ?? document.body
      if (next === owner) return
      release()
      owner = next
      let stack = stacks.get(next)
      if (!stack) {
        const element = document.createElement('div')
        element.className = 'notice-stack'
        next.appendChild(element)
        stack = { element, readers: 0 }
        stacks.set(next, stack)
      }
      const retained = stack
      retained.readers++
      setHost(retained.element)
      release = () => {
        if (--retained.readers === 0) {
          retained.element.remove()
          stacks.delete(next)
        }
      }
    }
    syncSurface()
    const observer = new MutationObserver(syncSurface)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] })
    return () => { observer.disconnect(); release() }
  }, [])
  useEffect(() => {
    setHovered(Boolean(noticeRef.current?.matches(':hover')))
    setFocused(Boolean(noticeRef.current?.contains(document.activeElement)))
  }, [host])
  useEffect(() => {
    if (hovered || focused || !onDismiss) return
    const timer = setTimeout(() => dismiss.current?.(), 6000)
    return () => clearTimeout(timer)
  }, [message, hovered, focused, Boolean(onDismiss)])
  const notice = <div ref={noticeRef} className="notice-chip" role={role}
    onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
    onFocus={() => setFocused(true)} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false)
    }}>
    <span>{message}</span>{children}
  </div>
  return host ? createPortal(notice, host) : notice
}
