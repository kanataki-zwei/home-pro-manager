'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
    Home, Wallet, Users, ShieldCheck, LogOut, Sparkles, BarChart3,
    Building2, User, PanelLeftClose, PanelLeftOpen, Sun, Moon, X, Compass,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { signOut } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { useHousehold } from '@/context/HouseholdContext'
import { useSidebar } from '@/context/SidebarContext'
import { useTheme } from '@/context/ThemeContext'
import { useTour } from '@/context/TourContext'

const navigation = [
    { name: 'Home', href: '/home', icon: Home },
    { name: 'Household', href: '/household', icon: Users },
    { name: 'Net Worth', href: '/networth', icon: BarChart3 },
    { name: 'Budget', href: '/budget', icon: Wallet },
    { name: 'Admin', href: '/admin', icon: ShieldCheck },
]

const BG = { background: 'linear-gradient(160deg, #0f172a 0%, #0c2340 50%, #0f172a 100%)' }
const DIVIDER = { height: '1px', background: 'rgba(255,255,255,0.06)' }

export default function Sidebar() {
    const pathname = usePathname()
    const router = useRouter()
    const { household, viewMode, setViewMode } = useHousehold()
    const { isCollapsed, toggleSidebar, isMobileOpen, setMobileOpen } = useSidebar()
    const { theme, toggleTheme } = useTheme()
    const { startTour } = useTour()

    const handleSignOut = async () => {
        await signOut()
        router.push('/auth/login')
    }

    const viewModeToggle = (mobile = false) => (
        <div data-tour="view-mode" className={cn('flex rounded-lg overflow-hidden border border-white/10 text-xs font-semibold', mobile ? 'mx-5 mb-4' : 'mt-3')}>
            <button
                onClick={() => setViewMode('household')}
                className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-2 transition-all',
                    viewMode === 'household' ? 'bg-sky-500/20 text-sky-300' : 'text-slate-500 hover:text-slate-300'
                )}>
                <Building2 className="h-3 w-3" /> HH
            </button>
            <div className="w-px bg-white/10" />
            <button
                onClick={() => setViewMode('me')}
                className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-2 transition-all',
                    viewMode === 'me' ? 'bg-violet-500/20 text-violet-300' : 'text-slate-500 hover:text-slate-300'
                )}>
                <User className="h-3 w-3" /> Me
            </button>
        </div>
    )

    const navLinks = (onNavigate?: () => void) => (
        <nav data-tour="sidebar-nav" className="flex-1 px-3 space-y-0.5">
            {navigation.map((item) => {
                const isActive = pathname.startsWith(item.href)
                return (
                    <Link
                        key={item.name}
                        href={item.href}
                        onClick={onNavigate}
                        className={cn(
                            'flex items-center gap-3 px-3 rounded-xl text-sm font-medium transition-all duration-200 min-h-[44px]',
                            isActive ? 'text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'
                        )}
                        style={isActive ? {
                            background: 'linear-gradient(135deg, rgba(14,165,233,0.2), rgba(56,189,248,0.1))',
                            boxShadow: 'inset 0 0 0 1px rgba(14,165,233,0.2)'
                        } : {}}
                    >
                        <item.icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-sky-400' : '')} />
                        {item.name}
                        {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-sky-400" />}
                    </Link>
                )
            })}
        </nav>
    )

    const footer = () => (
        <div className="p-3 mb-2">
            <div className="mb-3 mx-1" style={DIVIDER} />
            <button
                onClick={startTour}
                className="flex items-center gap-3 px-3 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-all duration-200 w-full min-h-[44px]"
            >
                <Compass className="h-4 w-4" />
                <span>Take a tour</span>
            </button>
            <button
                onClick={toggleTheme}
                className="flex items-center gap-3 px-3 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-all duration-200 w-full min-h-[44px]"
            >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
            </button>
            <button
                onClick={handleSignOut}
                className="flex items-center gap-3 px-3 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-all duration-200 w-full min-h-[44px]"
            >
                <LogOut className="h-4 w-4" />
                <span>Sign out</span>
            </button>
        </div>
    )

    return (
        <>
            {/* ── Mobile backdrop ───────────────────────────────────────────── */}
            <div
                className={cn(
                    'fixed inset-0 z-40 bg-black/50 transition-opacity md:hidden',
                    isMobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                )}
                onClick={() => setMobileOpen(false)}
            />

            {/* ── Mobile drawer ─────────────────────────────────────────────── */}
            <div
                className={cn(
                    'flex flex-col md:hidden fixed inset-y-0 left-0 z-50 w-72 transition-transform duration-200',
                    isMobileOpen ? 'translate-x-0' : '-translate-x-full'
                )}
                style={BG}
            >
                <div className="flex items-center justify-between px-5 pt-5 pb-3">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)' }}>
                            <Sparkles className="h-4 w-4 text-white" />
                        </div>
                        <span className="text-white font-bold text-lg" style={{ fontFamily: 'Plus Jakarta Sans' }}>
                            HomePro
                        </span>
                    </div>
                    <button
                        onClick={() => setMobileOpen(false)}
                        className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
                {household && (
                    <p className="text-xs px-6 mb-2" style={{ color: '#94a3b8' }}>{household.name}</p>
                )}
                {viewModeToggle(true)}
                <div className="mx-4 mb-3" style={DIVIDER} />
                {navLinks(() => setMobileOpen(false))}
                {footer()}
            </div>

            {/* ── Desktop sidebar ───────────────────────────────────────────── */}
            <div
                className={cn(
                    'hidden md:flex flex-col shrink-0 transition-all duration-200',
                    isCollapsed ? 'w-16' : 'w-64'
                )}
                style={BG}
            >
                <div className={cn('pt-5 pb-4', isCollapsed ? 'px-3' : 'px-5')}>
                    {isCollapsed ? (
                        <div className="flex flex-col items-center gap-3">
                            <button
                                onClick={toggleSidebar}
                                title="Expand sidebar"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                            >
                                <PanelLeftOpen className="h-4 w-4" />
                            </button>
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                                style={{ background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)' }}>
                                <Sparkles className="h-4 w-4 text-white" />
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                                        style={{ background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)' }}>
                                        <Sparkles className="h-4 w-4 text-white" />
                                    </div>
                                    <span className="text-white font-bold text-lg" style={{ fontFamily: 'Plus Jakarta Sans' }}>
                                        HomePro
                                    </span>
                                </div>
                                <button
                                    onClick={toggleSidebar}
                                    title="Collapse sidebar"
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                                >
                                    <PanelLeftClose className="h-4 w-4" />
                                </button>
                            </div>
                            {household && (
                                <p className="text-xs mt-2 px-1" style={{ color: '#94a3b8' }}>{household.name}</p>
                            )}
                            {viewModeToggle(false)}
                        </>
                    )}
                </div>

                <div className="mx-4 mb-4" style={DIVIDER} />

                <nav data-tour="sidebar-nav" className="flex-1 px-3 space-y-1">
                    {navigation.map((item) => {
                        const isActive = pathname.startsWith(item.href)
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                title={isCollapsed ? item.name : undefined}
                                className={cn(
                                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                                    isCollapsed && 'justify-center px-0',
                                    isActive ? 'text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'
                                )}
                                style={isActive ? {
                                    background: 'linear-gradient(135deg, rgba(14,165,233,0.2), rgba(56,189,248,0.1))',
                                    boxShadow: 'inset 0 0 0 1px rgba(14,165,233,0.2)'
                                } : {}}
                            >
                                <item.icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-sky-400' : '')} />
                                {!isCollapsed && (
                                    <>
                                        {item.name}
                                        {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-sky-400" />}
                                    </>
                                )}
                            </Link>
                        )
                    })}
                </nav>

                <div className="p-3 mb-2">
                    <div className="mb-3 mx-1" style={DIVIDER} />
                    <button
                        onClick={startTour}
                        title={isCollapsed ? 'Take a tour' : undefined}
                        className={cn(
                            'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-all duration-200 w-full',
                            isCollapsed && 'justify-center px-0'
                        )}
                    >
                        <Compass className="h-4 w-4" />
                        {!isCollapsed && <span>Take a tour</span>}
                    </button>
                    <button
                        onClick={toggleTheme}
                        title={isCollapsed ? (theme === 'dark' ? 'Light mode' : 'Dark mode') : undefined}
                        className={cn(
                            'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-all duration-200 w-full',
                            isCollapsed && 'justify-center px-0'
                        )}
                    >
                        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                        {!isCollapsed && <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>}
                    </button>
                    <button
                        onClick={handleSignOut}
                        title={isCollapsed ? 'Sign out' : undefined}
                        className={cn(
                            'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-all duration-200 w-full',
                            isCollapsed && 'justify-center px-0'
                        )}
                    >
                        <LogOut className="h-4 w-4" />
                        {!isCollapsed && <span>Sign out</span>}
                    </button>
                </div>
            </div>
        </>
    )
}
