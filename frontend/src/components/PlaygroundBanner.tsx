'use client'

import { FlaskConical } from 'lucide-react'
import { usePlayground } from '@/context/PlaygroundContext'

export default function PlaygroundBanner() {
    const { isPlayground } = usePlayground()
    if (!isPlayground) return null

    return (
        <div className="flex items-center justify-between gap-4 px-4 py-2.5 shrink-0"
            style={{ background: 'linear-gradient(90deg, #d97706, #f59e0b)', borderBottom: '1px solid #b45309' }}>
            <div className="flex items-center gap-2 min-w-0">
                <FlaskConical className="h-4 w-4 text-white shrink-0" />
                <span className="text-sm font-bold text-white">Playground Mode</span>
                <span className="hidden sm:inline text-xs text-amber-100 font-medium">
                    · All numbers and data shown are demo only
                </span>
            </div>
            <span className="text-xs bg-white/20 text-white font-bold px-2.5 py-1 rounded-full shrink-0 tracking-wide">
                MOCK DATA
            </span>
        </div>
    )
}
