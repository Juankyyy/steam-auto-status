import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { AppBackground } from '@/lib/tauri'
import type { StatusOrbStatus } from '@/components/StatusOrb'

type AppDotGridProps = {
  mode: AppBackground
  status: StatusOrbStatus
}

const GRID_SPACING = 16
const SPOTLIGHT_RADIUS = 180
const DOT_BASE_RADIUS = 1
const DOT_ACTIVE_RADIUS = 2.4
const FRAME_MS = 1000 / 30
const MAX_DPR = 2
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'
const FINE_POINTER = '(pointer: fine)'

/**
 * Dot-grid backdrop of the whole app shell.
 *
 * A fixed layer behind every route: the base grid is CSS and the active dots are painted on a
 * viewport-sized 2D canvas only while the pointer is over the window. Without a pointer there
 * is no spotlight at all (never a default position in the middle), and the canvas loop stops
 * as soon as the values settle.
 */
export function AppDotGrid({ mode, status }: AppDotGridProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useAppSpotlight(rootRef, canvasRef, mode)

  return (
    <div
      ref={rootRef}
      data-mode={mode}
      data-status={status}
      aria-hidden="true"
      className="app-backdrop"
    >
      {mode !== 'none' && (
        <>
          <span className="app-grid" />
          {mode === 'full' && <canvas ref={canvasRef} className="app-dots" />}
        </>
      )}
    </div>
  )
}

function useAppSpotlight(
  rootRef: RefObject<HTMLDivElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  mode: AppBackground,
) {
  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    if (!root || !canvas || mode !== 'full') return
    if (window.matchMedia(REDUCED_MOTION).matches || !window.matchMedia(FINE_POINTER).matches) {
      return
    }

    const context = canvas.getContext('2d')
    if (!context) return

    let width = 0
    let height = 0
    let frame = 0
    let lastFrame = 0
    let targetPresence = 0
    let presence = 0
    let hasPointer = false
    const target = { x: 0, y: 0 }
    const current = { x: 0, y: 0 }

    // Canvas cannot read CSS variables; resolve the state colour through a 0x0 probe that
    // inherits it from the root's data-status.
    const probe = document.createElement('span')
    probe.style.cssText =
      'position:absolute;width:0;height:0;visibility:hidden;pointer-events:none;color:var(--status-color)'
    root.appendChild(probe)
    let dotColor = window.getComputedStyle(probe).color || 'white'

    const readColor = () => {
      dotColor = window.getComputedStyle(probe).color || 'white'
    }

    const draw = () => {
      context.clearRect(0, 0, width, height)
      if (presence < 0.01) return
      context.fillStyle = dotColor
      const half = GRID_SPACING / 2
      for (let x = half; x < width; x += GRID_SPACING) {
        for (let y = half; y < height; y += GRID_SPACING) {
          const dx = x - current.x
          const dy = y - current.y
          const distance = Math.sqrt(dx * dx + dy * dy)
          if (distance > SPOTLIGHT_RADIUS) continue
          const ratio = 1 - distance / SPOTLIGHT_RADIUS
          const eased = ratio * ratio * (3 - 2 * ratio)
          // Keep the lit dots discreet: they only brighten to 25% over the 8% base grid.
          context.globalAlpha = (0.08 + 0.17 * eased) * presence
          context.beginPath()
          context.arc(
            x,
            y,
            DOT_BASE_RADIUS + (DOT_ACTIVE_RADIUS - DOT_BASE_RADIUS) * eased,
            0,
            Math.PI * 2,
          )
          context.fill()
        }
      }
      context.globalAlpha = 1
    }

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1)
      canvas.width = Math.max(1, Math.round(width * dpr))
      canvas.height = Math.max(1, Math.round(height * dpr))
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      draw()
    }

    const tick = (now: number) => {
      frame = 0
      const elapsed = now - lastFrame
      if (elapsed < FRAME_MS) {
        frame = requestAnimationFrame(tick)
        return
      }
      const dt = Math.min(0.05, Math.max(0.001, elapsed / 1000))
      lastFrame = now

      const follow = 1 - Math.exp(-dt / 0.06)
      current.x += (target.x - current.x) * follow
      current.y += (target.y - current.y) * follow
      const fade = 1 - Math.exp(-dt / (targetPresence > presence ? 0.07 : 0.16))
      presence += (targetPresence - presence) * fade
      if (Math.abs(targetPresence - presence) < 0.002) presence = targetPresence

      draw()

      const moving = Math.abs(target.x - current.x) > 0.15 || Math.abs(target.y - current.y) > 0.15
      if (moving || presence !== targetPresence) frame = requestAnimationFrame(tick)
    }

    const ensureFrame = () => {
      if (!frame) {
        lastFrame = performance.now()
        frame = requestAnimationFrame(tick)
      }
    }

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      target.x = event.clientX
      target.y = event.clientY
      // Snap when the pointer appears; never glide in from a previous position or the centre.
      if (!hasPointer || targetPresence === 0) {
        current.x = target.x
        current.y = target.y
        hasPointer = true
      }
      targetPresence = 1
      ensureFrame()
    }

    const onPointerLeave = () => {
      targetPresence = 0
      ensureFrame()
    }

    const statusObserver = new MutationObserver(() => {
      readColor()
      if (presence > 0) ensureFrame()
    })
    statusObserver.observe(root, { attributes: true, attributeFilter: ['data-status'] })

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('blur', onPointerLeave)
    document.documentElement.addEventListener('pointerleave', onPointerLeave)
    window.addEventListener('resize', resize)
    resize()

    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('blur', onPointerLeave)
      document.documentElement.removeEventListener('pointerleave', onPointerLeave)
      window.removeEventListener('resize', resize)
      statusObserver.disconnect()
      if (frame) cancelAnimationFrame(frame)
      probe.remove()
    }
  }, [mode, rootRef, canvasRef])
}
