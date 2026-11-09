'use client'

import { Sparkles, Building2, User, Sun, Moon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHousehold } from '@/context/HouseholdContext'
import { useTheme } from '@/context/ThemeContext'

export default function MobileHeader() {
    const { viewMode, setViewMode } = useHousehold()
    const { theme, toggleTheme } = useTheme()

    return (
        <div className="md:hidden flex items-center gap-3 h-14 px-4 border-b border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-900 shrink-0">
            <div className="flex items-center gap-2 flex-1">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)' }}>
                    <Sparkles className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="font-bold text-slate-900 dark:text-white text-base" style={{ fontFamily: 'Plus Jakarta Sans' }}>
                    HomePro
                </span>
            </div>

            <div data-tour="view-mode" className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-white/10 text-xs font-semibold">
                <button
                    onClick={() => setViewMode('household')}
                    className={cn(
                        'flex items-center gap-1 px-3 h-9 transition-all',
                        viewMode === 'household'
                            ? 'bg-sky-50 dark:bg-sky-500/20 text-sky-600 dark:text-sky-300'
                            : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                    )}
                >
                    <Building2 className="h-3 w-3" /> HH
                </button>
                <div className="w-px bg-slate-200 dark:bg-white/10" />
                <button
                    onClick={() => setViewMode('me')}
                    className={cn(
                        'flex items-center gap-1 px-3 h-9 transition-all',
                        viewMode === 'me'
                            ? 'bg-violet-50 dark:bg-violet-500/20 text-violet-600 dark:text-violet-300'
                            : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                    )}
                >
                    <User className="h-3 w-3" /> Me
                </button>
            </div>

            <button
                onClick={toggleTheme}
                className="p-2.5 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Toggle theme"
            >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
        </div>
    )
}
