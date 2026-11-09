'use client'

import { Plus } from 'lucide-react'
import { useQuickAdd } from '@/context/QuickAddContext'

export default function QuickAddFAB() {
    const { trigger } = useQuickAdd()

    return (
        <button
            onClick={trigger}
            aria-label="Quick add"
            className="md:hidden fixed z-40 w-14 h-14 rounded-full shadow-xl flex items-center justify-center active:scale-90 transition-transform"
            style={{
                bottom: 'calc(env(safe-area-inset-bottom) + 70px)',
                right: '16px',
                background: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
                boxShadow: '0 4px 20px rgba(14,165,233,0.4)',
            }}
        >
            <Plus className="h-6 w-6 text-white" strokeWidth={2.5} />
        </button>
    )
}
