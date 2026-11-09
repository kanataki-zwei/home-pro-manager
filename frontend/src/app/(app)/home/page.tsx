'use client'

import { useEffect, useState } from 'react'
import { useHousehold } from '@/context/HouseholdContext'
import { apiGet } from '@/lib/api'
import { Users, TrendingUp, Wallet, ArrowUpRight, Landmark } from 'lucide-react'
import Link from 'next/link'
import { Skeleton } from '@/components/ui/skeleton'

// ─── Types ────────────────────────────────────────────────────────

interface SessionMonthStats {
    session_id: string
    month: string
    status: string
    total_budgeted: number
    item_count: number
    paid_count: number
    paid_amount: number
    na_count: number
    extra_income_total: number
    savings_amount: number
    savings_rate: number
    salary_savings_rate: number
    extra_savings_rate: number
}

interface BudgetStats {
    total_income: number
    monthly_history: SessionMonthStats[]
    current_session: SessionMonthStats | null
}

// ─── Helpers ──────────────────────────────────────────────────────

function toMonthly(amount: number | string | null, cadence: string | null): number {
    const n = Number(amount ?? 0)
    if (cadence === 'weekly') return (n * 52) / 12
    if (cadence === 'annually') return n / 12
    return n
}

function fmtCompact(n: number) {
    if (n >= 1_000_000) return `KES ${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `KES ${(n / 1_000).toFixed(1)}K`
    return `KES ${Math.round(n).toLocaleString()}`
}

function fmt(n: number) {
    return `KES ${n.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function ordinal(d: number) {
    if (d >= 11 && d <= 13) return `${d}th`
    return `${d}${['st', 'nd', 'rd'][((d % 10) - 1)] ?? 'th'}`
}

function formatDate() {
    const now = new Date()
    return `${now.toLocaleDateString('en-KE', { weekday: 'long' })}, ${ordinal(now.getDate())} ${now.toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })}`
}

// ─── Page ─────────────────────────────────────────────────────────

export default function HomePage() {
    const { household, members, accounts, fxRates, loading, currentUserId } = useHousehold()
    const [budgetStats, setBudgetStats] = useState<BudgetStats | null>(null)
    const [statsLoading, setStatsLoading] = useState(true)

    useEffect(() => {
        if (!household) return
        setStatsLoading(true)
        apiGet<BudgetStats>(`/api/households/${household.id}/budget/stats`)
            .then(setBudgetStats)
            .catch(() => {})
            .finally(() => setStatsLoading(false))
    }, [household?.id])

    if (loading) return (
        <div className="space-y-6">
            <Skeleton className="h-28 rounded-3xl" />
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3 md:gap-4">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-2xl" />)}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-44 rounded-3xl" />)}
            </div>
        </div>
    )

    if (!household) return (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-sky-50 flex items-center justify-center">
                <Users className="h-6 w-6 text-sky-500" />
            </div>
            <p className="text-slate-500 font-medium">No household set up yet</p>
            <Link href="/household" className="text-sm font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-1">
                Set up your household <ArrowUpRight className="h-3 w-3" />
            </Link>
        </div>
    )

    // ── Derived values ────────────────────────────────────────────

    const totalMembers = members.length
    const earners = members.filter(m => m.contributes_income)
    const totalIncome = earners.reduce((s, m) => s + toMonthly(m.income_amount, m.income_cadence), 0)

    const totalNetWorth = accounts
        .filter(a => a.contributes_to_net_worth && a.is_active)
        .reduce((s, a) => {
            if (a.currency === 'KES') return s + Number(a.current_balance)
            const rate = fxRates.find(r => r.currency === a.currency)
            return s + (rate ? Number(a.current_balance) * Number(rate.rate_to_kes) : 0)
        }, 0)

    const monthHistory = (budgetStats?.monthly_history ?? [])
        .slice().sort((a, b) => a.month.localeCompare(b.month))
        .slice(-3)

    return (
        <div className="space-y-6">

            {/* ── Hero header ──────────────────────────────────────── */}
            <div
                className="rounded-3xl p-5 md:p-8"
                style={{ background: 'linear-gradient(135deg, #0f172a 0%, #0c2340 60%, #0f1f3d 100%)' }}
            >
                <p className="text-sky-400 text-sm font-medium mb-2 tracking-wide">Welcome back</p>
                <h1 className="text-2xl md:text-4xl font-bold text-white mb-3">{household.name}</h1>
                <p className="text-slate-500 text-sm">{formatDate()}</p>
            </div>

            {/* ── Quick callouts ───────────────────────────────────── */}
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3 md:gap-4">
                {/* Monthly Income callout */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl px-5 py-4 shadow-sm border border-slate-100 dark:border-slate-700 flex items-center gap-4">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)' }}>
                        <TrendingUp className="h-4 w-4 text-white" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs text-slate-400 font-medium">Monthly Income</p>
                        <p className="text-base font-bold text-slate-900 dark:text-white truncate">{fmtCompact(totalIncome)}</p>
                    </div>
                </div>

                {/* Members callout */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl px-5 py-4 shadow-sm border border-slate-100 dark:border-slate-700 flex items-center gap-4">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: 'linear-gradient(135deg, #8b5cf6, #a78bfa)' }}>
                        <Users className="h-4 w-4 text-white" />
                    </div>
                    <div>
                        <p className="text-xs text-slate-400 font-medium">Household Members</p>
                        <p className="text-base font-bold text-slate-900 dark:text-white">{totalMembers} {totalMembers === 1 ? 'member' : 'members'}</p>
                    </div>
                </div>

                {/* Earners callout */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl px-5 py-4 shadow-sm border border-slate-100 dark:border-slate-700 flex items-center gap-4">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: 'linear-gradient(135deg, #10b981, #34d399)' }}>
                        <Wallet className="h-4 w-4 text-white" />
                    </div>
                    <div>
                        <p className="text-xs text-slate-400 font-medium">Earners</p>
                        <p className="text-base font-bold text-slate-900 dark:text-white">{earners.length} of {totalMembers}</p>
                    </div>
                </div>
            </div>

            {/* ── Overview cards ───────────────────────────────────── */}
            <div>
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Overview</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                    {/* Monthly Income */}
                    <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-700">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                                style={{ background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)' }}>
                                <TrendingUp className="h-3.5 w-3.5 text-white" />
                            </div>
                            <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">Monthly Income</p>
                        </div>
                        <p className="text-2xl font-bold text-slate-900 dark:text-white mb-1">{fmtCompact(totalIncome)}</p>
                        <p className="text-xs text-slate-400 mb-4">
                            {fmt(totalIncome)} / month · {earners.length} {earners.length === 1 ? 'earner' : 'earners'}
                        </p>
                        {earners.length > 0 && (
                            <div className="space-y-3 pt-1 border-t border-slate-50 dark:border-slate-700">
                                {earners.map(m => {
                                    const amount = toMonthly(m.income_amount, m.income_cadence)
                                    const pct = totalIncome > 0 ? (amount / totalIncome) * 100 : 0
                                    return (
                                        <div key={m.id}>
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate max-w-[55%]">{m.name}</span>
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <span className="text-xs text-slate-400">{fmtCompact(amount)}</span>
                                                    <span className="text-xs font-semibold text-sky-600 w-8 text-right">{pct.toFixed(0)}%</span>
                                                </div>
                                            </div>
                                            <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full rounded-full"
                                                    style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #0ea5e9, #38bdf8)' }}
                                                />
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>

                    {/* Total Net Worth */}
                    <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-700">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                                style={{ background: 'linear-gradient(135deg, #8b5cf6, #a78bfa)' }}>
                                <Landmark className="h-3.5 w-3.5 text-white" />
                            </div>
                            <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">Total Net Worth</p>
                        </div>
                        <p className="text-2xl font-bold text-slate-900 dark:text-white mb-1">{fmtCompact(totalNetWorth)}</p>
                        <p className="text-xs text-slate-400 mb-4">
                            {fmt(totalNetWorth)} · {accounts.filter(a => a.contributes_to_net_worth && a.is_active).length} accounts
                        </p>
                        {(() => {
                            const nwAccounts = accounts
                                .filter(a => a.contributes_to_net_worth && a.is_active)
                                .map(a => {
                                    const balKes = a.currency === 'KES'
                                        ? Number(a.current_balance)
                                        : Number(a.current_balance) * Number(fxRates.find(r => r.currency === a.currency)?.rate_to_kes ?? 0)
                                    return { ...a, balKes }
                                })
                                .sort((a, b) => b.balKes - a.balKes)
                                .slice(0, 3)

                            if (nwAccounts.length === 0) return null
                            return (
                                <div className="space-y-3 pt-1 border-t border-slate-50 dark:border-slate-700">
                                    {nwAccounts.map(a => {
                                        const pct = totalNetWorth > 0 ? (a.balKes / totalNetWorth) * 100 : 0
                                        return (
                                            <div key={a.id}>
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate max-w-[55%]">{a.name}</span>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        <span className="text-xs text-slate-400">{fmtCompact(a.balKes)}</span>
                                                        <span className="text-xs font-semibold text-violet-600 w-8 text-right">{pct.toFixed(0)}%</span>
                                                    </div>
                                                </div>
                                                <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full"
                                                        style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #8b5cf6, #a78bfa)' }}
                                                    />
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )
                        })()}
                    </div>

                    {/* Savings vs Expenses */}
                    <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-700">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                                style={{ background: 'linear-gradient(135deg, #10b981, #34d399)' }}>
                                <Wallet className="h-3.5 w-3.5 text-white" />
                            </div>
                            <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">Savings vs Expenses</p>
                        </div>

                        {statsLoading ? (
                            <div className="flex items-center justify-center h-16">
                                <div className="w-4 h-4 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
                            </div>
                        ) : monthHistory.length === 0 ? (
                            <div className="flex flex-col gap-1 pt-1">
                                <p className="text-sm font-medium text-slate-400">No budget history</p>
                                <Link href="/budget" className="text-xs font-semibold text-sky-500 hover:text-sky-600 flex items-center gap-0.5 mt-1">
                                    Start a budget <ArrowUpRight className="h-3 w-3" />
                                </Link>
                            </div>
                        ) : (
                            <div className="space-y-3 pt-1 border-t border-slate-50 dark:border-slate-700">
                                {monthHistory.map((m, i) => {
                                    const pct = Number(m.total_budgeted) > 0
                                        ? (Number(m.savings_amount) / Number(m.total_budgeted)) * 100 : 0
                                    const prev = monthHistory[i - 1]
                                    const prevPct = prev && Number(prev.total_budgeted) > 0
                                        ? (Number(prev.savings_amount) / Number(prev.total_budgeted)) * 100 : null
                                    const delta = prevPct !== null ? pct - prevPct : null
                                    const monthLabel = new Date(m.month + '-01').toLocaleDateString('en-KE', { month: 'short', year: 'numeric' })
                                    return (
                                        <div key={m.session_id}>
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{monthLabel}</span>
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    {delta !== null && (
                                                        <span className={`text-xs font-semibold ${delta > 0 ? 'text-emerald-500' : delta < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                                                            {delta > 0 ? '↑' : delta < 0 ? '↓' : '→'} {Math.abs(delta).toFixed(0)}pp
                                                        </span>
                                                    )}
                                                    <span className="text-xs font-semibold text-emerald-600 w-8 text-right">{pct.toFixed(0)}%</span>
                                                </div>
                                            </div>
                                            <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full rounded-full"
                                                    style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #10b981, #34d399)' }}
                                                />
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </div>
    )
}
