'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Users, BarChart3, Wallet, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
    { name: 'Home',      href: '/home',      icon: Home },
    { name: 'Household', href: '/household',  icon: Users },
    { name: 'Net Worth', href: '/networth',   icon: BarChart3 },
    { name: 'Budget',    href: '/budget',     icon: Wallet },
    { name: 'Admin',     href: '/admin',      icon: ShieldCheck },
]

export default function BottomNav() {
    const pathname = usePathname()

    return (
        <nav
            data-tour="sidebar-nav"
            className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700/60"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
            <div className="flex">
                {NAV.map(item => {
                    const isActive = pathname.startsWith(item.href)
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 min-h-[56px] transition-colors active:opacity-70"
                        >
                            <div className={cn(
                                'w-11 h-7 rounded-xl flex items-center justify-center transition-colors',
                                isActive ? 'bg-sky-50 dark:bg-sky-500/15' : ''
                            )}>
                                <item.icon className={cn(
                                    'h-5 w-5 transition-colors',
                                    isActive ? 'text-sky-500' : 'text-slate-400 dark:text-slate-500'
                                )} />
                            </div>
                            <span className={cn(
                                'text-[10px] font-semibold leading-none transition-colors',
                                isActive ? 'text-sky-500' : 'text-slate-400 dark:text-slate-500'
                            )}>
                                {item.name}
                            </span>
                        </Link>
                    )
                })}
            </div>
        </nav>
    )
}
