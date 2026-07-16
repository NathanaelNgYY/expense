// src/components/LazyFallback.tsx
import { useEffect, useState } from 'react'

const SPINNER_DELAY_MS = 150

/**
 * Suspense fallback for lazy screens. Blank for the first 150ms — most chunk loads finish
 * inside that window, so the common case stays flash-free — then a small centered spinner
 * so a slow network never reads as a dead app. Reduced-motion users get static text instead
 * (handled in CSS).
 */
export default function LazyFallback() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => setIsVisible(true), SPINNER_DELAY_MS)
    return () => clearTimeout(id)
  }, [])

  if (!isVisible) return null

  return (
    <div className="lazy-fallback" role="status">
      <span className="lazy-fallback__spinner" aria-hidden="true" />
      <span className="lazy-fallback__label">Loading…</span>
    </div>
  )
}
