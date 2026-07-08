'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Wallet, Users, Settings, LogOut, Sparkles, BarChart3, Building2, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { signOut } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { useHousehold } from '@/context/HouseholdContext'

const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: Home },
    { name: 'Household', href: '/household', icon: Users },
    { name: 'Budget', href: '/budget', icon: Wallet },
    { name: 'Net Worth', href: '/networth', icon: BarChart3 },
    { name: 'Settings', href: '/settings', icon: Settings },
]

export default function Sidebar() {
    const pathname = usePathname()
    const router = useRouter()
    const { household, viewMode, setViewMode } = useHousehold()

    const handleSignOut = async () => {
        await signOut()
        router.push('/auth/login')
    }

    return (
        <div className="w-64 flex flex-col" style={{
            background: 'linear-gradient(160deg, #0f172a 0%, #0c2340 50%, #0f172a 100%)',
        }}>
            {/* Logo */}
            <div className="p-6 pb-4">
                <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)' }}>
                        <Sparkles className="h-4 w-4 text-white" />
                    </div>
                    <span className="text-white font-bold text-lg" style={{ fontFamily: 'Plus Jakarta Sans' }}>
                        HomePro
                    </span>
                </div>
                {household && (
                    <p className="text-xs mt-3 px-1" style={{ color: '#94a3b8' }}>{household.name}</p>
                )}
                {/* View mode toggle */}
                <div className="flex mt-3 rounded-lg overflow-hidden border border-white/10 text-xs font-semibold">
                    <button
                        onClick={() => setViewMode('household')}
                        className={cn(
                            'flex-1 flex items-center justify-center gap-1.5 py-1.5 transition-all',
                            viewMode === 'household'
                                ? 'bg-sky-500/20 text-sky-300'
                                : 'text-slate-500 hover:text-slate-300'
                        )}>
                        <Building2 className="h-3 w-3" />
                        HH
                    </button>
                    <div className="w-px bg-white/10" />
                    <button
                        onClick={() => setViewMode('me')}
                        className={cn(
                            'flex-1 flex items-center justify-center gap-1.5 py-1.5 transition-all',
                            viewMode === 'me'
                                ? 'bg-violet-500/20 text-violet-300'
                                : 'text-slate-500 hover:text-slate-300'
                        )}>
                        <User className="h-3 w-3" />
                        Me
                    </button>
                </div>
            </div>

            {/* Divider */}
            <div className="mx-4 mb-4" style={{ height: '1px', background: 'rgba(255,255,255,0.06)' }} />

            {/* Navigation */}
            <nav className="flex-1 px-3 space-y-1">
                {navigation.map((item) => {
                    const isActive = pathname.startsWith(item.href)
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                                isActive
                                    ? 'text-white'
                                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                            )}
                            style={isActive ? {
                                background: 'linear-gradient(135deg, rgba(14,165,233,0.2), rgba(56,189,248,0.1))',
                                boxShadow: 'inset 0 0 0 1px rgba(14,165,233,0.2)'
                            } : {}}
                        >
                            <item.icon className={cn('h-4 w-4', isActive ? 'text-sky-400' : '')} />
                            {item.name}
                            {isActive && (
                                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-sky-400" />
                            )}
                        </Link>
                    )
                })}
            </nav>

            {/* Sign out */}
            <div className="p-3 mb-2">
                <div className="mb-3 mx-1" style={{ height: '1px', background: 'rgba(255,255,255,0.06)' }} />
                <button
                    onClick={handleSignOut}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-all duration-200 w-full"
                >
                    <LogOut className="h-4 w-4" />
                    Sign out
                </button>
            </div>
        </div>
    )
}