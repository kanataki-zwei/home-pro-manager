'use client'

import React, { lazy, Suspense, memo, useRef, useState, useEffect, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Skeleton } from '@/components/ui/skeleton'

// ─── Tab registry ────────────────────────────────────────────────────────────

const TABS = ['/home', '/household', '/networth', '/budget', '/admin'] as const
const N = TABS.length
const MIN_SWIPE = 50     // px to commit a swipe
const ANIM_MS   = 300    // snap animation duration
const SPRING    = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'

// Lazy-import every page — they stay mounted once first visited (keep-alive)
const Pages = [
    lazy(() => import('@/app/(app)/home/page')),
    lazy(() => import('@/app/(app)/household/page')),
    lazy(() => import('@/app/(app)/networth/page')),
    lazy(() => import('@/app/(app)/budget/page')),
    lazy(() => import('@/app/(app)/admin/page')),
] as const

// ─── Loading skeleton ────────────────────────────────────────────────────────

function PageFallback() {
    return (
        <div className="p-4 md:p-8 space-y-4">
            <Skeleton className="h-28 rounded-3xl" />
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3 md:gap-4">
                {[0, 1, 2].map(i => <Skeleton key={i} className="h-16 rounded-2xl" />)}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[0, 1, 2].map(i => <Skeleton key={i} className="h-44 rounded-3xl" />)}
            </div>
        </div>
    )
}

// Memoised so carousel re-renders don't re-mount the page component
const TabSlot = memo(function TabSlot({
    Page,
}: {
    Page: (typeof Pages)[number]
}) {
    return (
        <Suspense fallback={<PageFallback />}>
            <Page />
        </Suspense>
    )
})
TabSlot.displayName = 'TabSlot'

// ─── Carousel ────────────────────────────────────────────────────────────────

export default function TabCarousel() {
    const router   = useRouter()
    const pathname = usePathname()

    const routeIdx = TABS.findIndex(t => pathname.startsWith(t))
    const initIdx  = routeIdx >= 0 ? routeIdx : 0

    // Which tab is visually "current" — drives the strip position
    const [currentIdx, setCurrentIdx] = useState(initIdx)
    // Tabs that have been mounted at least once — they stay alive forever
    const [mounted, setMounted] = useState<Set<number>>(() => {
        const s = new Set<number>([initIdx])
        if (initIdx > 0)     s.add(initIdx - 1)
        if (initIdx < N - 1) s.add(initIdx + 1)
        return s
    })
    // Current gesture offset in px (1-to-1 with finger)
    const [dragPx,    setDragPx]    = useState(0)
    const [animating, setAnimating] = useState(false)

    const idxRef       = useRef(initIdx)
    const animatingRef = useRef(false)
    const touchStart   = useRef<{ x: number; y: number } | null>(null)
    const lockDir      = useRef<'h' | 'v' | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    idxRef.current = currentIdx

    // ── Sync with external navigation (BottomNav, Sidebar, browser back/fwd) ──
    useEffect(() => {
        if (routeIdx < 0 || animatingRef.current) return
        if (routeIdx === idxRef.current) return

        animatingRef.current = true
        setMounted(prev => new Set([...prev, routeIdx]))
        setAnimating(true)
        setCurrentIdx(routeIdx)
        setTimeout(() => {
            setAnimating(false)
            animatingRef.current = false
        }, ANIM_MS)
    }, [routeIdx])

    // ── Prefetch adjacent routes so the router cache stays warm ──────────────
    useEffect(() => {
        if (currentIdx > 0)     router.prefetch(TABS[currentIdx - 1])
        if (currentIdx < N - 1) router.prefetch(TABS[currentIdx + 1])
    }, [currentIdx, router])

    // ── Navigate to a new tab (called after swipe threshold met) ─────────────
    const navigateTo = useCallback((newIdx: number) => {
        if (newIdx < 0 || newIdx >= N || animatingRef.current) return

        animatingRef.current = true

        // Mount the target tab before the animation so content is ready
        setMounted(prev => new Set([...prev, newIdx]))

        // Animate the strip to the new tab position
        const targetDragPx = (idxRef.current - newIdx) * window.innerWidth
        setAnimating(true)
        setDragPx(targetDragPx)

        setTimeout(() => {
            // Atomic state flip: shift currentIdx + reset dragPx
            // The two transforms are mathematically identical so there's no visual jump:
            //   -(old/N)*100% + (old-new)*vw  ==  -(new/N)*100% + 0
            setCurrentIdx(newIdx)
            setDragPx(0)
            setAnimating(false)
            animatingRef.current = false

            // Mount new adjacent tabs for the next gesture
            setMounted(prev => {
                const next = new Set(prev)
                if (newIdx > 0)     next.add(newIdx - 1)
                if (newIdx < N - 1) next.add(newIdx + 1)
                return next
            })

            // Sync URL with the new active tab
            router.replace(TABS[newIdx], { scroll: false })
        }, ANIM_MS)
    }, [router])

    // ── Passive touchmove — must NOT be attached via React props ─────────────
    // React registers onTouchMove as non-passive at the root, which blocks
    // native scroll in PWA standalone mode on WebKit. Native + passive = safe.
    useEffect(() => {
        const el = containerRef.current
        if (!el) return

        const onMove = (e: TouchEvent) => {
            if (!touchStart.current || animatingRef.current) return
            const dx = e.touches[0].clientX - touchStart.current.x
            const dy = e.touches[0].clientY - touchStart.current.y

            // Decide scroll direction on the first significant movement
            if (!lockDir.current && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
                lockDir.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
            }
            if (lockDir.current !== 'h') return

            const idx    = idxRef.current
            const atLeft  = idx <= 0     && dx > 0
            const atRight = idx >= N - 1 && dx < 0
            const r = (atLeft || atRight) ? 0.15 : 1.0  // soft edge resistance

            // Pre-mount the tab we're swiping toward while the finger is still moving
            const targetIdx = dx < 0 ? idx + 1 : idx - 1
            if (targetIdx >= 0 && targetIdx < N) {
                setMounted(prev =>
                    prev.has(targetIdx) ? prev : new Set([...prev, targetIdx])
                )
            }

            setDragPx(dx * r)
        }

        el.addEventListener('touchmove', onMove, { passive: true })
        return () => el.removeEventListener('touchmove', onMove)
    }, [])

    const onTouchStart = (e: React.TouchEvent) => {
        if (animatingRef.current) return
        touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        lockDir.current = null
    }

    const onTouchEnd = (e: React.TouchEvent) => {
        if (!touchStart.current) return
        const dx = e.changedTouches[0].clientX - touchStart.current.x
        const dy = e.changedTouches[0].clientY - touchStart.current.y
        touchStart.current = null
        lockDir.current = null

        if (Math.abs(dx) >= MIN_SWIPE && Math.abs(dx) > Math.abs(dy)) {
            const newIdx = dx < 0 ? idxRef.current + 1 : idxRef.current - 1
            if (newIdx >= 0 && newIdx < N) {
                navigateTo(newIdx)
                return
            }
        }

        // Not a qualifying swipe — spring back to current position
        setAnimating(true)
        setDragPx(0)
        setTimeout(() => setAnimating(false), ANIM_MS)
    }

    // Strip is N×viewport wide.  translateX positions the active slot at the viewport.
    // Formula: -(currentIdx/N)*100%  shifts the strip by currentIdx full viewport widths.
    // Adding dragPx gives 1-to-1 finger tracking during a gesture.
    const translateX = `calc(${-(currentIdx / N) * 100}% + ${dragPx}px)`

    return (
        <div
            ref={containerRef}
            className="flex-1 min-h-0 overflow-hidden"
            style={{ touchAction: 'pan-y' }}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
        >
            <div
                className="flex h-full"
                style={{
                    width: `${N * 100}%`,
                    transform: `translateX(${translateX})`,
                    transition: animating ? `transform ${ANIM_MS}ms ${SPRING}` : 'none',
                    willChange: dragPx !== 0 || animating ? 'transform' : 'auto',
                }}
            >
                {TABS.map((_, i) => (
                    <div
                        key={i}
                        className="overflow-y-auto"
                        style={{ width: `${100 / N}%`, flex: '0 0 auto', height: '100%' }}
                    >
                        {mounted.has(i) ? (
                            <div className="p-4 md:p-8 pb-24 md:pb-8">
                                <TabSlot Page={Pages[i]} />
                            </div>
                        ) : null}
                    </div>
                ))}
            </div>
        </div>
    )
}
