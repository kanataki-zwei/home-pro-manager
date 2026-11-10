'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useRef, useState, useEffect } from 'react'

const TABS = ['/home', '/household', '/networth', '/budget', '/admin']
const MIN_SWIPE_PX = 60
const DRAG_RESISTANCE = 0.28
const EDGE_RESISTANCE = 0.07

export default function SwipeNavContainer({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const pathname = usePathname()
    const [offset, setOffset] = useState(0)
    const [snapping, setSnapping] = useState(false)
    const innerRef = useRef<HTMLDivElement>(null)
    const touchStart = useRef<{ x: number; y: number } | null>(null)
    const lockDir = useRef<'h' | 'v' | null>(null)
    // Refs keep handlers in sync without causing re-renders
    const snappingRef = useRef(false)
    const idxRef = useRef(0)

    const idx = TABS.findIndex(t => pathname.startsWith(t))
    idxRef.current = idx

    useEffect(() => {
        if (idx > 0) router.prefetch(TABS[idx - 1])
        if (idx < TABS.length - 1) router.prefetch(TABS[idx + 1])
    }, [idx, router])

    const snapTo = (target: number, then?: () => void) => {
        snappingRef.current = true
        setSnapping(true)
        setOffset(target)
        setTimeout(() => {
            then?.()
            setOffset(0)
            snappingRef.current = false
            setSnapping(false)
        }, 180)
    }

    // Attach touchmove as a PASSIVE native listener so the browser never has to
    // wait for JS before scrolling. React's onTouchMove is non-passive at the
    // root level, which blocks native scroll in PWA standalone mode on WebKit.
    useEffect(() => {
        const el = innerRef.current
        if (!el) return
        const onMove = (e: TouchEvent) => {
            if (!touchStart.current || snappingRef.current) return
            const dx = e.touches[0].clientX - touchStart.current.x
            const dy = e.touches[0].clientY - touchStart.current.y
            if (!lockDir.current && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
                lockDir.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
            }
            if (lockDir.current !== 'h') return
            const atEdge = (dx > 0 && idxRef.current <= 0) || (dx < 0 && idxRef.current >= TABS.length - 1)
            setOffset(dx * (atEdge ? EDGE_RESISTANCE : DRAG_RESISTANCE))
        }
        el.addEventListener('touchmove', onMove, { passive: true })
        return () => el.removeEventListener('touchmove', onMove)
    }, [])

    return (
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <div
                ref={innerRef}
                className="flex-1 flex flex-col min-w-0"
                style={{
                    transform: offset !== 0 ? `translateX(${offset}px)` : undefined,
                    transition: snapping
                        ? 'transform 0.18s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
                        : 'none',
                    willChange: offset !== 0 ? 'transform' : 'auto',
                }}
                onTouchStart={e => {
                    if (snappingRef.current) return
                    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
                    lockDir.current = null
                }}
                onTouchEnd={e => {
                    if (!touchStart.current) return
                    const dx = e.changedTouches[0].clientX - touchStart.current.x
                    const dy = e.changedTouches[0].clientY - touchStart.current.y
                    touchStart.current = null
                    lockDir.current = null

                    if (Math.abs(dx) >= MIN_SWIPE_PX && Math.abs(dx) > Math.abs(dy) && idx !== -1) {
                        const target = dx < 0 ? TABS[idx + 1] : TABS[idx - 1]
                        if (target) {
                            snapTo(dx < 0 ? -36 : 36, () => router.push(target))
                            return
                        }
                    }
                    if (offset !== 0) snapTo(0)
                }}
            >
                {children}
            </div>
        </div>
    )
}
