'use client'

import { useEffect, useState } from 'react'
import { useHousehold } from '@/context/HouseholdContext'
import { apiGet } from '@/lib/api'
import { Wallet, Users, TrendingUp, ArrowUpRight, CalendarDays, ChevronDown, ChevronUp } from 'lucide-react'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────

interface Expense {
    id: string
    monthly_amount: number | string
    is_deleted: boolean
    owner_id: string | null
    ownership_type: string
    joint_split_husband: number | null
    joint_split_wife: number | null
    tag_assignments: { id: string; tag: { id: string; name: string; color: string | null } }[]
}

interface SessionSummary { id: string; month: string; status: string }
interface ExpenseTag { id: string; name: string; color: string | null }

// ─── Helpers ──────────────────────────────────────────────────────

function toMonthly(amount: number | string | null, cadence: string | null): number {
    const n = Number(amount ?? 0)
    if (cadence === 'weekly') return (n * 52) / 12
    if (cadence === 'annually') return n / 12
    return n
}

function fmt(n: number) {
    return `KES ${n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtCompact(n: number) {
    if (n >= 1_000_000) return `KES ${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `KES ${(n / 1_000).toFixed(1)}K`
    return `KES ${Math.round(n).toLocaleString()}`
}

const GRADIENTS = [
    'linear-gradient(135deg, #0ea5e9, #6366f1)',
    'linear-gradient(135deg, #f43f5e, #f97316)',
    'linear-gradient(135deg, #10b981, #0ea5e9)',
    'linear-gradient(135deg, #8b5cf6, #ec4899)',
    'linear-gradient(135deg, #f59e0b, #ef4444)',
    'linear-gradient(135deg, #06b6d4, #10b981)',
]

// ─── Dashboard ────────────────────────────────────────────────────

export default function DashboardPage() {
    const { household, members, accounts, loading, currentUserId, viewMode } = useHousehold()
    const [expenses, setExpenses] = useState<Expense[]>([])
    const [sessions, setSessions] = useState<SessionSummary[]>([])
    const [tags, setTags] = useState<ExpenseTag[]>([])
    const [budgetLoading, setBudgetLoading] = useState(true)
    const [membersExpanded, setMembersExpanded] = useState(false)
    const [incomeExpanded, setIncomeExpanded] = useState(false)
    const [myAccountsOnly, setMyAccountsOnly] = useState(false)
    const isMeMode = viewMode === 'me'

    useEffect(() => {
        if (!household) return
        setBudgetLoading(true)
        Promise.all([
            apiGet<Expense[]>(`/api/households/${household.id}/budget/expenses`),
            apiGet<SessionSummary[]>(`/api/households/${household.id}/budget/sessions`),
            apiGet<ExpenseTag[]>(`/api/households/${household.id}/budget/tags`),
        ])
            .then(([e, s, t]) => { setExpenses(e); setSessions(s); setTags(t) })
            .catch(() => {})
            .finally(() => setBudgetLoading(false))
    }, [household?.id])

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="w-6 h-6 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
        </div>
    )

    if (!household) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
                <div className="w-12 h-12 rounded-2xl bg-sky-50 flex items-center justify-center">
                    <Users className="h-6 w-6 text-sky-500" />
                </div>
                <p className="text-slate-500 font-medium">No household set up yet</p>
                <Link href="/household"
                    className="text-sm font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-1">
                    Set up your household <ArrowUpRight className="h-3 w-3" />
                </Link>
            </div>
        )
    }

    // ── Derived numbers ───────────────────────────────────────────

    const myMember = members.find(m => m.user_id === currentUserId)
    const myRole = myMember?.member_type.name.toLowerCase() ?? ''

    const visibleAccounts = (isMeMode || myAccountsOnly)
        ? accounts.filter(a => a.ownership === 'joint' || a.household_member_id === myMember?.id)
        : accounts

    const totalBalance = visibleAccounts
        .filter(a => a.contributes_to_net_worth)
        .reduce((s, a) => s + Number(a.current_balance), 0)
    const currency = accounts[0]?.currency || 'KES'

    const allIncomeMembers = members.filter(m => m.contributes_income && m.income_amount)
    const incomeMembers = isMeMode
        ? allIncomeMembers.filter(m => m.user_id === currentUserId)
        : allIncomeMembers
    const totalIncome = incomeMembers.reduce((s, m) => s + toMonthly(m.income_amount, m.income_cadence), 0)

    const activeExpenses = expenses.filter(e => !e.is_deleted)
    const totalBudgeted = isMeMode
        ? activeExpenses.reduce((s, e) => {
            if (e.owner_id === currentUserId) return s + Number(e.monthly_amount)
            if (e.owner_id !== null) return s
            if (e.ownership_type === myRole) return s + Number(e.monthly_amount)
            if (e.ownership_type === 'joint') {
                const split = myRole === 'husband' ? (e.joint_split_husband ?? 50)
                            : myRole === 'wife'    ? (e.joint_split_wife    ?? 50) : 0
                return s + Number(e.monthly_amount) * split / 100
            }
            return s
        }, 0)
        : activeExpenses.reduce((s, e) => s + Number(e.monthly_amount), 0)
    const netRemaining = totalIncome - totalBudgeted
    const budgetPct = totalIncome > 0 ? Math.min((totalBudgeted / totalIncome) * 100, 100) : 0
    const isOver = netRemaining < 0

    const monthsTracked = sessions.length

    const visibleMembers = isMeMode ? members.filter(m => m.user_id === currentUserId) : members

    // ── Tag breakdown ─────────────────────────────────────────────
    const tagRows = tags.map(tag => ({
        ...tag,
        total: activeExpenses
            .filter(e => e.tag_assignments.some(ta => ta.tag.id === tag.id))
            .reduce((s, e) => s + Number(e.monthly_amount), 0),
    })).filter(r => r.total > 0).sort((a, b) => b.total - a.total)

    const untaggedTotal = activeExpenses
        .filter(e => e.tag_assignments.length === 0)
        .reduce((s, e) => s + Number(e.monthly_amount), 0)

    const allTagRows = [
        ...tagRows,
        ...(untaggedTotal > 0 ? [{ id: '__none', name: 'Untagged', color: '#cbd5e1', total: untaggedTotal }] : []),
    ]

    return (
        <div className="space-y-6 max-w-5xl">

            {/* Header */}
            <div>
                <span className="text-xs font-semibold uppercase tracking-widest text-sky-500">Overview</span>
                <h1 className="text-3xl font-bold text-slate-900 mt-1">{household.name}</h1>
                <p className="text-slate-400 mt-1 text-sm">Here's your household at a glance</p>
            </div>

            {/* Hero — dark card */}
            <div className="relative rounded-2xl overflow-hidden p-8"
                style={{ background: 'linear-gradient(135deg, #0f172a 0%, #0c2a4a 50%, #0f172a 100%)' }}>
                <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-10"
                    style={{ background: 'radial-gradient(circle, #38bdf8, transparent)', transform: 'translate(30%, -30%)' }} />
                <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full opacity-5"
                    style={{ background: 'radial-gradient(circle, #0ea5e9, transparent)', transform: 'translate(-30%, 30%)' }} />
                <div className="relative">
                    <div className="grid grid-cols-2 gap-8">
                        <div>
                            <p className="text-sky-400 text-xs font-semibold uppercase tracking-wider mb-2">Total Balance</p>
                            <p className="text-white font-bold mb-1" style={{ fontSize: '2.5rem', lineHeight: 1 }}>
                                {currency} {totalBalance.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                            <p className="text-slate-400 text-xs mt-2">
                            {visibleAccounts.filter(a => a.contributes_to_net_worth).length} net worth account{visibleAccounts.filter(a => a.contributes_to_net_worth).length !== 1 ? 's' : ''} · {myAccountsOnly ? 'your accounts' : 'household'}
                        </p>
                        </div>
                        {totalIncome > 0 && (
                            <div>
                                <p className="text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-2">Monthly Income</p>
                                <p className="text-white font-bold mb-1" style={{ fontSize: '2.5rem', lineHeight: 1 }}>
                                    {fmtCompact(totalIncome)}
                                </p>
                                <button
                                    onClick={() => setIncomeExpanded(v => !v)}
                                    className="flex items-center gap-1 text-slate-400 text-xs mt-2 hover:text-slate-200 transition-colors"
                                >
                                    {incomeMembers.length} contributor{incomeMembers.length !== 1 ? 's' : ''}
                                    {incomeExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                </button>
                            </div>
                        )}
                    </div>
                    {incomeExpanded && incomeMembers.length > 0 && (
                        <div className="mt-5 pt-5 border-t border-slate-700 grid grid-cols-1 gap-2">
                            {incomeMembers.map((m, i) => {
                                const income = toMonthly(m.income_amount, m.income_cadence)
                                return (
                                    <div key={m.id} className="flex items-center gap-3">
                                        <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-xs font-black flex-shrink-0"
                                            style={{ background: GRADIENTS[i % GRADIENTS.length] }}>
                                            {m.name.charAt(0)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <span className="text-sm font-semibold text-white">{m.name}</span>
                                            <span className="text-xs text-slate-400 ml-2">{m.member_type.name}</span>
                                        </div>
                                        <span className="text-sm font-bold text-emerald-400">{fmtCompact(income)}<span className="text-xs font-normal text-slate-400">/mo</span></span>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Key stats row */}
            <div className="grid grid-cols-4 gap-4 items-start">

                {/* Members — expandable */}
                <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden"
                    style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)' }}>
                    <button
                        className="w-full p-5 text-left"
                        onClick={() => setMembersExpanded(v => !v)}
                    >
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Members</p>
                            <div className="flex items-center gap-1">
                                <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-sky-50">
                                    <Users className="h-4 w-4 text-sky-500" />
                                </div>
                            </div>
                        </div>
                        <div className="flex items-end justify-between">
                            <div>
                                <p className="text-xl font-black text-slate-900">{visibleMembers.length}</p>
                                <p className="text-xs text-slate-400 mt-1">{membersExpanded ? 'Hide members' : 'Show members'}</p>
                            </div>
                            {membersExpanded ? <ChevronUp className="h-4 w-4 text-slate-400 mb-0.5" /> : <ChevronDown className="h-4 w-4 text-slate-400 mb-0.5" />}
                        </div>
                    </button>
                    {membersExpanded && visibleMembers.length > 0 && (
                        <div className="border-t border-slate-100 divide-y divide-slate-50">
                            {visibleMembers.map((m, i) => (
                                <div key={m.id} className="flex items-center gap-2 px-5 py-2.5">
                                    <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-xs font-black flex-shrink-0"
                                        style={{ background: GRADIENTS[i % GRADIENTS.length] }}>
                                        {m.name.charAt(0)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-slate-800 truncate">{m.name}</p>
                                        <p className="text-xs text-slate-400">{m.member_type.name}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {membersExpanded && visibleMembers.length === 0 && (
                        <p className="px-5 pb-4 text-xs text-slate-400">No members yet.</p>
                    )}
                </div>

                {/* Months Tracked */}
                <div className="bg-white rounded-2xl p-5 border border-slate-100"
                    style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)' }}>
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Months Tracked</p>
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-violet-50">
                            <CalendarDays className="h-4 w-4 text-violet-500" />
                        </div>
                    </div>
                    <p className="text-xl font-black text-slate-900">{monthsTracked}</p>
                    <p className="text-xs text-slate-400 mt-1">{monthsTracked === 0 ? 'No sessions yet' : `${sessions.filter(s => s.status === 'closed').length} closed`}</p>
                </div>

                {/* Budgeted / mo */}
                <div className="bg-white rounded-2xl p-5 border border-slate-100"
                    style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)' }}>
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Budgeted / mo</p>
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-amber-50">
                            <Wallet className="h-4 w-4 text-amber-500" />
                        </div>
                    </div>
                    <p className="text-xl font-black text-slate-900">{fmtCompact(totalBudgeted)}</p>
                    <p className="text-xs text-slate-400 mt-1">{totalIncome > 0 ? `${budgetPct.toFixed(0)}% of income` : 'No income set'}</p>
                </div>

                {/* Amount Not Budgeted */}
                <div className="bg-white rounded-2xl p-5 border border-slate-100"
                    style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)' }}>
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Amount Not Budgeted</p>
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isOver ? 'bg-red-50' : 'bg-emerald-50'}`}>
                            <TrendingUp className={`h-4 w-4 ${isOver ? 'text-red-500' : 'text-emerald-500'}`} />
                        </div>
                    </div>
                    <p className="text-xl font-black text-slate-900">{fmtCompact(Math.abs(netRemaining))}</p>
                    <p className="text-xs text-slate-400 mt-1">{isOver ? 'over budget' : 'unallocated'}</p>
                </div>

            </div>

            {/* Income + Tag breakdown — side by side */}
            <div className="grid grid-cols-2 gap-4">

                {/* Income contributors */}
                <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden"
                    style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)' }}>
                    <div className="px-5 pt-5 pb-3 flex items-center justify-between">
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Income Breakdown</p>
                        <Link href="/household" className="text-xs text-sky-500 font-semibold hover:text-sky-600 flex items-center gap-1">
                            Manage <ArrowUpRight className="h-3 w-3" />
                        </Link>
                    </div>
                    {incomeMembers.length === 0 ? (
                        <div className="px-5 pb-5">
                            <p className="text-sm text-slate-400">No income set up yet.</p>
                            <Link href="/household" className="text-xs text-sky-500 font-semibold mt-1 inline-block">Add income →</Link>
                        </div>
                    ) : (
                        <>
                            {/* Stacked bar */}
                            <div className="px-5 mb-3">
                                <div className="flex h-2 rounded-full overflow-hidden gap-px">
                                    {incomeMembers.map((m, i) => {
                                        const income = toMonthly(m.income_amount, m.income_cadence)
                                        const pct = totalIncome > 0 ? (income / totalIncome) * 100 : 100 / incomeMembers.length
                                        const color = GRADIENTS[i % GRADIENTS.length].match(/#[0-9a-f]{6}/gi)?.[0] ?? '#0ea5e9'
                                        return <div key={m.id} style={{ width: `${pct}%`, background: color }} />
                                    })}
                                </div>
                            </div>
                            <div className="divide-y divide-slate-50">
                                {incomeMembers.map((m, i) => {
                                    const income = toMonthly(m.income_amount, m.income_cadence)
                                    const pct = totalIncome > 0 ? ((income / totalIncome) * 100).toFixed(0) : '—'
                                    return (
                                        <div key={m.id} className="flex items-center gap-3 px-5 py-3">
                                            <div className="w-7 h-7 rounded-xl flex items-center justify-center text-white text-xs font-black flex-shrink-0"
                                                style={{ background: GRADIENTS[i % GRADIENTS.length] }}>
                                                {m.name.charAt(0)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-slate-800 truncate">{m.name}</p>
                                                <p className="text-xs text-slate-400">{m.member_type.name} · {pct}% of household</p>
                                            </div>
                                            <p className="text-sm font-bold text-slate-900 flex-shrink-0">{fmtCompact(income)}<span className="text-xs font-normal text-slate-400">/mo</span></p>
                                        </div>
                                    )
                                })}
                                <div className="flex items-center justify-between px-5 py-3 bg-slate-50">
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Total</p>
                                    <p className="text-sm font-black text-slate-900">{fmt(totalIncome)}<span className="text-xs font-normal text-slate-400">/mo</span></p>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Tag breakdown */}
                <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden"
                    style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)' }}>
                    <div className="px-5 pt-5 pb-3 flex items-center justify-between">
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Expenses by Tag</p>
                        <Link href="/budget" className="text-xs text-sky-500 font-semibold hover:text-sky-600 flex items-center gap-1">
                            View all <ArrowUpRight className="h-3 w-3" />
                        </Link>
                    </div>
                    {budgetLoading ? (
                        <div className="px-5 pb-5 flex items-center gap-2 text-sm text-slate-400">
                            <div className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-transparent animate-spin" />
                            Loading…
                        </div>
                    ) : allTagRows.length === 0 ? (
                        <div className="px-5 pb-5">
                            <p className="text-sm text-slate-400">No tagged expenses yet.</p>
                            <Link href="/budget" className="text-xs text-sky-500 font-semibold mt-1 inline-block">Set up budget →</Link>
                        </div>
                    ) : (
                        <>
                            <div className="px-5 mb-3">
                                <div className="flex h-2 rounded-full overflow-hidden gap-px">
                                    {allTagRows.map(row => (
                                        <div key={row.id}
                                            style={{ width: `${(row.total / totalBudgeted) * 100}%`, background: row.color || '#6366f1' }} />
                                    ))}
                                </div>
                            </div>
                            <div className="divide-y divide-slate-50">
                                {allTagRows.map(row => (
                                    <div key={row.id} className="flex items-center gap-3 px-5 py-3">
                                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: row.color || '#6366f1' }} />
                                        <p className="text-sm text-slate-700 flex-1">{row.name}</p>
                                        <p className="text-xs text-slate-400 w-10 text-right">
                                            {((row.total / totalBudgeted) * 100).toFixed(1)}%
                                        </p>
                                        <p className="text-sm font-bold text-slate-900 w-28 text-right">
                                            {fmtCompact(row.total)}<span className="text-xs font-normal text-slate-400">/mo</span>
                                        </p>
                                    </div>
                                ))}
                                <div className="flex items-center justify-between px-5 py-3 bg-slate-50">
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Total budgeted</p>
                                    <p className="text-sm font-black text-slate-900">{fmt(totalBudgeted)}<span className="text-xs font-normal text-slate-400">/mo</span></p>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Budget allocation bar */}
            {totalIncome > 0 && totalBudgeted > 0 && (
                <div className="bg-white rounded-2xl p-5 border border-slate-100"
                    style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)' }}>
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Budget vs Income</p>
                        {!isOver && netRemaining <= 0 && (
                            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">🎯 Zero budgeted</span>
                        )}
                    </div>
                    <div className="h-3 bg-slate-100 rounded-full overflow-hidden mb-2">
                        <div className={`h-full rounded-full transition-all ${isOver ? 'bg-red-400' : budgetPct > 85 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                            style={{ width: `${budgetPct}%` }} />
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>{budgetPct.toFixed(0)}% of income allocated</span>
                        <span className={isOver ? 'text-red-500 font-semibold' : 'text-emerald-600 font-semibold'}>
                            {isOver ? `${fmt(Math.abs(netRemaining))} over budget` : `${fmt(netRemaining)} unallocated`}
                        </span>
                    </div>
                </div>
            )}

            {/* Accounts list */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-bold text-slate-900 text-lg">Accounts</h2>
                    <div className="flex items-center gap-3">
                        {!isMeMode && (
                            <div className="flex rounded-xl bg-slate-100 p-0.5 text-xs font-semibold">
                                <button
                                    onClick={() => setMyAccountsOnly(false)}
                                    className={`px-3 py-1.5 rounded-lg transition-all ${!myAccountsOnly ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >All</button>
                                <button
                                    onClick={() => setMyAccountsOnly(true)}
                                    className={`px-3 py-1.5 rounded-lg transition-all ${myAccountsOnly ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >Mine</button>
                            </div>
                        )}
                        <Link href="/household" className="text-sm text-sky-500 font-semibold hover:text-sky-600 flex items-center gap-1">
                            Manage <ArrowUpRight className="h-3 w-3" />
                        </Link>
                    </div>
                </div>
                {visibleAccounts.length === 0 ? (
                    <div className="rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center">
                        <p className="text-slate-400 text-sm">{myAccountsOnly ? 'No accounts linked to you' : 'No accounts yet'}</p>
                        {!myAccountsOnly && <Link href="/household" className="text-sky-500 text-sm font-semibold mt-1 inline-block">Add one →</Link>}
                    </div>
                ) : (
                    <div className="space-y-2">
                        {visibleAccounts.map((account, i) => {
                            const owner = members.find(m => m.id === account.household_member_id)
                            return (
                                <div key={account.id}
                                    className="bg-white rounded-2xl p-4 border border-slate-100 flex items-center justify-between hover:border-sky-200 transition-all"
                                    style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm text-white"
                                            style={{ background: `hsl(${(i * 47) % 360}, 70%, 50%)` }}>
                                            {account.name.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="font-semibold text-slate-900 text-sm">{account.name}</p>
                                            <p className="text-xs text-slate-400 capitalize">
                                                {account.account_type} · {account.ownership}
                                                {owner ? ` · ${owner.name}` : ''}
                                            </p>
                                        </div>
                                    </div>
                                    <p className="font-bold text-slate-900">
                                        {account.currency} {Number(account.current_balance).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </p>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
