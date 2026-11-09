'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useRef } from 'react'

const TABS = ['/home', '/household', '/networth', '/budget', '/admin']
const MIN_SWIPE_PX = 60

export default function SwipeNavContainer({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const pathname = usePathname()
    const start = useRef<{ x: number; y: number } | null>(null)

    return (
        <div
            className="flex-1 flex flex-col min-w-0 overflow-hidden"
            onTouchStart={e => {
                start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
            }}
            onTouchEnd={e => {
                if (!start.current) return
                const dx = e.changedTouches[0].clientX - start.current.x
                const dy = e.changedTouches[0].clientY - start.current.y
                start.current = null

                // Only handle clearly horizontal swipes
                if (Math.abs(dx) < MIN_SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return

                const idx = TABS.findIndex(t => pathname.startsWith(t))
                if (idx === -1) return

                if (dx < 0 && idx < TABS.length - 1) router.push(TABS[idx + 1])
                else if (dx > 0 && idx > 0) router.push(TABS[idx - 1])
            }}
        >
            {children}
        </div>
    )
}
