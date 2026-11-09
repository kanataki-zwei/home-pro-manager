'use client'

import { Sparkles, Building2, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHousehold } from '@/context/HouseholdContext'

export default function MobileHeader() {
    const { viewMode, setViewMode } = useHousehold()

    return (
        <div
            className="md:hidden bg-white dark:bg-slate-900 shrink-0"
            style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
            <div className="flex items-center gap-3 h-14 px-4 border-b border-slate-200 dark:border-slate-700/50">
                <div className="flex items-center gap-2 flex-1">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)' }}>
                        <Sparkles className="h-3.5 w-3.5 text-white" />
                    </div>
                    <span className="font-bold text-slate-900 dark:text-white text-base" style={{ fontFamily: 'Plus Jakarta Sans' }}>
                        HomePro
                    </span>
                </div>

                <button
                    data-tour="view-mode"
                    onClick={() => setViewMode(viewMode === 'household' ? 'me' : 'household')}
                    className={cn(
                        'flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-semibold border transition-all',
                        viewMode === 'household'
                            ? 'bg-sky-50 dark:bg-sky-500/20 text-sky-600 dark:text-sky-300 border-sky-200 dark:border-sky-500/30'
                            : 'bg-violet-50 dark:bg-violet-500/20 text-violet-600 dark:text-violet-300 border-violet-200 dark:border-violet-500/30'
                    )}
                    aria-label="Toggle view mode"
                >
                    {viewMode === 'household'
                        ? <><Building2 className="h-3.5 w-3.5" /> HH</>
                        : <><User className="h-3.5 w-3.5" /> Me</>
                    }
                </button>
            </div>
        </div>
    )
}
