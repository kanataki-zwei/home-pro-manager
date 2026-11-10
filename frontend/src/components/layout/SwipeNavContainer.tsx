'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useRef, useState, useEffect } from 'react'

const TABS = ['/home', '/household', '/networth', '/budget', '/admin']
const MIN_SWIPE_PX = 60
const DRAG_RESISTANCE = 0.28   // content follows at 28% of finger distance
const EDGE_RESISTANCE = 0.07   // near-zero movement at first/last tab

export default function SwipeNavContainer({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const pathname = usePathname()
    const [offset, setOffset] = useState(0)
    const [snapping, setSnapping] = useState(false)
    const touchStart = useRef<{ x: number; y: number } | null>(null)
    const lockDir = useRef<'h' | 'v' | null>(null)

    const idx = TABS.findIndex(t => pathname.startsWith(t))

    // Prefetch adjacent tabs so navigation is instant
    useEffect(() => {
        if (idx > 0) router.prefetch(TABS[idx - 1])
        if (idx < TABS.length - 1) router.prefetch(TABS[idx + 1])
    }, [idx, router])

    const snapTo = (target: number, then?: () => void) => {
        setSnapping(true)
        setOffset(target)
        setTimeout(() => {
            then?.()
            setOffset(0)
            setSnapping(false)
        }, 180)
    }

    return (
        // Outer: clips overflow when content translates
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Inner: receives the transform */}
            <div
                className="flex-1 flex flex-col min-w-0"
                style={{
                    transform: offset !== 0 ? `translateX(${offset}px)` : undefined,
                    transition: snapping
                        ? 'transform 0.18s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
                        : 'none',
                    willChange: offset !== 0 ? 'transform' : 'auto',
                    touchAction: 'pan-y',
                }}
                onTouchStart={e => {
                    if (snapping) return
                    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
                    lockDir.current = null
                }}
                onTouchMove={e => {
                    if (!touchStart.current || snapping) return
                    const dx = e.touches[0].clientX - touchStart.current.x
                    const dy = e.touches[0].clientY - touchStart.current.y

                    // Lock scroll direction after 8px of movement
                    if (!lockDir.current && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
                        lockDir.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
                    }
                    if (lockDir.current !== 'h') return

                    // Edge resistance when at first or last tab
                    const atEdge = (dx > 0 && idx <= 0) || (dx < 0 && idx >= TABS.length - 1)
                    setOffset(dx * (atEdge ? EDGE_RESISTANCE : DRAG_RESISTANCE))
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
                            // Push slightly further in swipe direction, then navigate
                            snapTo(dx < 0 ? -36 : 36, () => router.push(target))
                            return
                        }
                    }
                    // Spring back only if content actually moved horizontally
                    if (offset !== 0) snapTo(0)
                }}
            >
                {children}
            </div>
        </div>
    )
}
