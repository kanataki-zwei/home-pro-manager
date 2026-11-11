'use client'

import { useEffect, useState, useRef } from 'react'
import { useHousehold } from '@/context/HouseholdContext'
import { apiGet } from '@/lib/api'
import { TrendingUp, TrendingDown, Shield, ShieldOff, ArrowUpRight, Wallet, ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import {
    ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
    ReferenceLine,
} from 'recharts'

// ─── Types ────────────────────────────────────────────────────────

interface Transaction {
    id: string
    account_id: string
    household_id: string
    amount: string
    narration: string
    transaction_type: 'credit' | 'debit'
    session_item_id: string | null
    created_at: string
}

// ─── Helpers ──────────────────────────────────────────────────────

function fmt(n: number, currency = 'KES') {
    return `${currency} ${n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtCompact(n: number) {
    if (n >= 1_000_000) return `KES ${(n / 1_000_000).toFixed(2)}M`
    if (n >= 1_000) return `KES ${(n / 1_000).toFixed(1)}K`
    return `KES ${Math.round(n).toLocaleString()}`
}

function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
}

const GRADIENTS = [
    'linear-gradient(135deg, #0ea5e9, #6366f1)',
    'linear-gradient(135deg, #f43f5e, #f97316)',
    'linear-gradient(135deg, #10b981, #0ea5e9)',
    'linear-gradient(135deg, #8b5cf6, #ec4899)',
    'linear-gradient(135deg, #f59e0b, #ef4444)',
    'linear-gradient(135deg, #06b6d4, #10b981)',
]

const SEGMENT_COLORS = ['#0ea5e9', '#10b981', '#8b5cf6', '#f59e0b', '#f43f5e', '#06b6d4']

const TYPE_LABELS: Record<string, string> = {
    bank:            'Bank',
    money_market:    'Money Market',
    mobile_money:    'Mobile Money',
    direct_pay:      'Direct Pay',
    insurance:       'Insurance',
    govt_securities: 'Govt. Securities',
    stocks_shares:   'Stocks & Shares',
    checking:        'Checking',
    savings:         'Savings',
    cash:            'Cash',
    investment:      'Investment',
    credit:          'Credit / Liability',
}

const TYPE_COLORS: Record<string, string> = {
    bank:            '#0ea5e9',
    money_market:    '#10b981',
    mobile_money:    '#8b5cf6',
    direct_pay:      '#f59e0b',
    insurance:       '#06b6d4',
    govt_securities: '#f43f5e',
    stocks_shares:   '#84cc16',
    checking:        '#6366f1',
    savings:         '#14b8a6',
    cash:            '#f97316',
    investment:      '#ec4899',
    credit:          '#ef4444',
}

// ─── Page ─────────────────────────────────────────────────────────

function toKES(amount: number, currency: string, fxRates: { currency: string; rate_to_kes: string }[]): number | null {
    if (currency === 'KES') return amount
    const rate = fxRates.find(r => r.currency === currency)
    if (!rate) return null
    return amount * Number(rate.rate_to_kes)
}

export default function NetWorthPage() {
    const { household, accounts, members, fxRates, loading, currentUserId, viewMode } = useHousehold()
    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [txnLoading, setTxnLoading] = useState(true)
    const [txnFilter, setTxnFilter] = useState<'all' | 'credit' | 'debit'>('all')
    const [sourceFilter, setSourceFilter] = useState<'all' | 'manual' | 'session'>('all')
    const [accountSort, setAccountSort] = useState<'name-asc' | 'name-desc' | 'amount-desc' | 'amount-asc'>('amount-desc')
    const [spreadSlide, setSpreadSlide] = useState(0)
    const [nwAccountPage, setNwAccountPage] = useState(0)
    const [exAccountPage, setExAccountPage] = useState(0)
    const [accountsPerPage, setAccountsPerPage] = useState(5)
    const [txnPage, setTxnPage] = useState(0)
    const [txnsPerPage, setTxnsPerPage] = useState(5)
    const spreadTouchStart = useRef<number>(0)
    const isMeMode = viewMode === 'me'

    useEffect(() => {
        if (!household) return
        setTxnLoading(true)
        apiGet<Transaction[]>(`/api/households/${household.id}/transactions`)
            .then(setTransactions)
            .catch(() => {})
            .finally(() => setTxnLoading(false))
    }, [household?.id])

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="w-6 h-6 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
        </div>
    )

    if (!household) return (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
            <Shield className="h-8 w-8 text-slate-300" />
            <p className="text-slate-500 font-medium">No household set up yet</p>
            <Link href="/household" className="text-sm font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-1">
                Set up your household <ArrowUpRight className="h-3 w-3" />
            </Link>
        </div>
    )

    // ── Derived ───────────────────────────────────────────────────

    const myMember = members.find(m => m.user_id === currentUserId)
    const visibleAccounts = isMeMode
        ? accounts.filter(a => a.ownership === 'joint' || a.household_member_id === myMember?.id)
        : accounts

    const netWorthAccounts = visibleAccounts.filter(a => a.contributes_to_net_worth && a.is_active)
    const excludedAccounts = visibleAccounts.filter(a => !a.contributes_to_net_worth && a.is_active)
    const liquidCashAccounts = visibleAccounts.filter(a => a.contributes_to_liquid_cash && a.is_active)

    const myAccountIds = new Set(visibleAccounts.map(a => a.id))
    const totalNetWorth = netWorthAccounts.reduce((s, a) => {
        const kes = toKES(Number(a.current_balance), a.currency, fxRates)
        return s + (kes ?? 0)
    }, 0)
    const totalLiquidCash = liquidCashAccounts.reduce((s, a) => {
        const kes = toKES(Number(a.current_balance), a.currency, fxRates)
        return s + (kes ?? 0)
    }, 0)
    const hasMissingRates = netWorthAccounts.some(
        a => a.currency !== 'KES' && !fxRates.find(r => r.currency === a.currency)
    )

    const accountMap = Object.fromEntries(accounts.map(a => [a.id, a]))

    function sortAccounts<T extends { name: string; current_balance: string | number; currency: string }>(arr: T[]): T[] {
        return [...arr].sort((a, b) => {
            if (accountSort === 'name-asc') return a.name.localeCompare(b.name)
            if (accountSort === 'name-desc') return b.name.localeCompare(a.name)
            const aKes = toKES(Number(a.current_balance), a.currency, fxRates) ?? Number(a.current_balance)
            const bKes = toKES(Number(b.current_balance), b.currency, fxRates) ?? Number(b.current_balance)
            return accountSort === 'amount-asc' ? aKes - bKes : bKes - aKes
        })
    }

    const scopedTransactions = isMeMode
        ? transactions.filter(t => myAccountIds.has(t.account_id))
        : transactions

    const filteredTxns = scopedTransactions.filter(t => {
        if (txnFilter !== 'all' && t.transaction_type !== txnFilter) return false
        if (sourceFilter === 'manual' && t.session_item_id !== null) return false
        if (sourceFilter === 'session' && t.session_item_id === null) return false
        return true
    })

    const totalDeposits = scopedTransactions
        .filter(t => t.transaction_type === 'credit')
        .reduce((s, t) => s + Number(t.amount), 0)

    const totalWithdrawals = scopedTransactions
        .filter(t => t.transaction_type === 'debit')
        .reduce((s, t) => s + Number(t.amount), 0)

    // Reconstruct monthly net worth trajectory from transaction history
    const netWorthTrajectory = (() => {
        const nwAccountIds = new Set(netWorthAccounts.map(a => a.id))
        const nwTxns = scopedTransactions.filter(t => nwAccountIds.has(t.account_id))
        if (nwTxns.length === 0) return []

        const today = new Date()
        const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
        const twelveMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 11, 1)
        const cutoffKey = `${twelveMonthsAgo.getFullYear()}-${String(twelveMonthsAgo.getMonth() + 1).padStart(2, '0')}`

        const earliestTxnMonth = nwTxns.reduce((min, t) => {
            const m = t.created_at.slice(0, 7)
            return m < min ? m : min
        }, currentMonthKey)
        const startKey = earliestTxnMonth > cutoffKey ? earliestTxnMonth : cutoffKey

        const months: string[] = []
        let cur = new Date(startKey + '-01T00:00:00')
        const end = new Date(currentMonthKey + '-01T00:00:00')
        while (cur <= end) {
            months.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`)
            cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
        }
        if (months.length < 2) return []

        // Monthly net worth delta (credit to asset / debit from liability = +nw)
        const monthlyDelta = new Map<string, number>()
        for (const t of nwTxns) {
            const month = t.created_at.slice(0, 7)
            if (month < startKey) continue
            const acct = accountMap[t.account_id]
            if (!acct) continue
            const isLiability = acct.account_type === 'credit'
            const amount = toKES(Number(t.amount), acct.currency, fxRates) ?? Number(t.amount)
            const impact = isLiability
                ? (t.transaction_type === 'debit' ? amount : -amount)
                : (t.transaction_type === 'credit' ? amount : -amount)
            monthlyDelta.set(month, (monthlyDelta.get(month) ?? 0) + impact)
        }

        // Build snapshots: current nw is latest, subtract deltas backwards
        const snapshots: { label: string; nw: number }[] = []
        let running = totalNetWorth
        for (const month of [...months].reverse()) {
            const d = new Date(month + '-01T00:00:00')
            const label = d.toLocaleDateString('en-KE', { month: 'short', year: '2-digit' })
            snapshots.unshift({ label, nw: Math.round(running) })
            running -= (monthlyDelta.get(month) ?? 0)
        }
        return snapshots
    })()

    const trajectoryDelta = netWorthTrajectory.length >= 2
        ? netWorthTrajectory[netWorthTrajectory.length - 1].nw - netWorthTrajectory[0].nw
        : 0
    const trajectoryDeltaPct = netWorthTrajectory.length >= 2 && netWorthTrajectory[0].nw !== 0
        ? (trajectoryDelta / Math.abs(netWorthTrajectory[0].nw)) * 100
        : 0
    const trajectoryColor = trajectoryDelta >= 0 ? '#10b981' : '#f43f5e'

    // ── Spread carousel data ──────────────────────────────────────

    // Slide 0: by institution type
    const spreadGroups = new Map<string, { kes: number; count: number }>()
    for (const a of netWorthAccounts) {
        const key = a.institution_type ?? a.account_type
        const kes = toKES(Number(a.current_balance), a.currency, fxRates) ?? 0
        const ex = spreadGroups.get(key) ?? { kes: 0, count: 0 }
        spreadGroups.set(key, { kes: ex.kes + kes, count: ex.count + 1 })
    }
    const sortedSpread = [...spreadGroups.entries()].sort((a, b) => b[1].kes - a[1].kes)
    const spreadTotal = sortedSpread.reduce((s, [, v]) => s + v.kes, 0)

    // Slide 1: by currency
    const currencyGroups = new Map<string, { native: number; kes: number; count: number }>()
    for (const a of netWorthAccounts) {
        const ex = currencyGroups.get(a.currency) ?? { native: 0, kes: 0, count: 0 }
        const kes = toKES(Number(a.current_balance), a.currency, fxRates) ?? 0
        currencyGroups.set(a.currency, { native: ex.native + Number(a.current_balance), kes: ex.kes + kes, count: ex.count + 1 })
    }
    const sortedCurrencies = [...currencyGroups.entries()].sort((a, b) => b[1].kes - a[1].kes)

    // Slide 2: monthly growth by institution type (last 30 days net flow)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const monthlyGrowth = new Map<string, number>()
    for (const t of scopedTransactions) {
        if (new Date(t.created_at) < thirtyDaysAgo) continue
        const account = accountMap[t.account_id]
        if (!account?.contributes_to_net_worth) continue
        const key = account.institution_type ?? account.account_type
        const kes = toKES(Number(t.amount), account.currency, fxRates) ?? Number(t.amount)
        const isLiability = account.account_type === 'credit'
        const impact = isLiability
            ? (t.transaction_type === 'debit' ? kes : -kes)
            : (t.transaction_type === 'credit' ? kes : -kes)
        monthlyGrowth.set(key, (monthlyGrowth.get(key) ?? 0) + impact)
    }
    const maxGrowthAbs = Math.max(...sortedSpread.map(([k]) => Math.abs(monthlyGrowth.get(k) ?? 0)), 1)

    // ── Paginated accounts & transactions ────────────────────────

    const sortedNwAccounts = sortAccounts(netWorthAccounts)
    const sortedExAccounts = sortAccounts(excludedAccounts)
    const nwTotalPages = accountsPerPage === 0 ? 1 : Math.ceil(sortedNwAccounts.length / accountsPerPage)
    const nwPageItems = accountsPerPage === 0 ? sortedNwAccounts : sortedNwAccounts.slice(nwAccountPage * accountsPerPage, (nwAccountPage + 1) * accountsPerPage)
    const exTotalPages = accountsPerPage === 0 ? 1 : Math.ceil(sortedExAccounts.length / accountsPerPage)
    const exPageItems = accountsPerPage === 0 ? sortedExAccounts : sortedExAccounts.slice(exAccountPage * accountsPerPage, (exAccountPage + 1) * accountsPerPage)
    const txnTotalPages = txnsPerPage === 0 ? 1 : Math.ceil(filteredTxns.length / txnsPerPage)
    const txnPageItems = txnsPerPage === 0 ? filteredTxns : filteredTxns.slice(txnPage * txnsPerPage, (txnPage + 1) * txnsPerPage)

    return (
        <div className="space-y-6">

            {/* Header */}
            <div>
                <span className="text-xs font-semibold uppercase tracking-widest text-emerald-500">Financial Health</span>
                <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mt-1">Net Worth</h1>
                <p className="text-slate-400 mt-1 text-sm">Track your assets and transaction history</p>
            </div>

            {/* Hero */}
            <div className="relative rounded-2xl overflow-hidden p-5 md:p-8"
                style={{ background: 'linear-gradient(135deg, #0f172a 0%, #064e3b 50%, #0f172a 100%)' }}>
                <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-10"
                    style={{ background: 'radial-gradient(circle, #34d399, transparent)', transform: 'translate(30%, -30%)' }} />
                <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full opacity-5"
                    style={{ background: 'radial-gradient(circle, #10b981, transparent)', transform: 'translate(-30%, 30%)' }} />
                <div className="relative grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div className="col-span-1">
                        <p className="text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-2">Total Net Worth</p>
                        <p className="text-white font-bold mb-2" style={{ fontSize: '2rem', lineHeight: 1 }}>
                            {fmtCompact(totalNetWorth)}
                        </p>
                        <p className="text-slate-400 text-xs">{netWorthAccounts.length} account{netWorthAccounts.length !== 1 ? 's' : ''} tracked</p>
                        {hasMissingRates && (
                            <p className="text-amber-400 text-xs mt-1.5">⚠ Some foreign accounts excluded — add FX rates in Settings</p>
                        )}
                    </div>
                    <div className="col-span-1">
                        <p className="text-sky-400 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1">
                            <Wallet className="h-3 w-3" /> Liquid Cash
                        </p>
                        <p className="text-white font-bold mb-2" style={{ fontSize: '2rem', lineHeight: 1 }}>
                            {fmtCompact(totalLiquidCash)}
                        </p>
                        <p className="text-slate-400 text-xs">{liquidCashAccounts.length} account{liquidCashAccounts.length !== 1 ? 's' : ''}</p>
                    </div>
                    <div>
                        <p className="text-teal-400 text-xs font-semibold uppercase tracking-wider mb-2">Total Deposits</p>
                        <p className="text-white font-bold mb-2" style={{ fontSize: '1.5rem', lineHeight: 1 }}>
                            {fmtCompact(totalDeposits)}
                        </p>
                        <p className="text-slate-400 text-xs">{scopedTransactions.filter(t => t.transaction_type === 'credit').length} entries</p>
                    </div>
                    <div>
                        <p className="text-rose-400 text-xs font-semibold uppercase tracking-wider mb-2">Total Withdrawals</p>
                        <p className="text-white font-bold mb-2" style={{ fontSize: '1.5rem', lineHeight: 1 }}>
                            {fmtCompact(totalWithdrawals)}
                        </p>
                        <p className="text-slate-400 text-xs">{scopedTransactions.filter(t => t.transaction_type === 'debit').length} entries</p>
                    </div>
                </div>

                {/* Stacked balance bar */}
                {totalNetWorth > 0 && (
                    <div className="relative mt-6">
                        <div className="flex h-2 rounded-full overflow-hidden gap-px">
                            {netWorthAccounts.map((a, i) => {
                                const kes = toKES(Number(a.current_balance), a.currency, fxRates) ?? 0
                                const pct = (kes / totalNetWorth) * 100
                                return (
                                    <div key={a.id}
                                        style={{ width: `${Math.max(pct, 0)}%`, background: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }} />
                                )
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Net Worth Trajectory */}
            {netWorthTrajectory.length >= 2 && (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-5"
                    style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)' }}>
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Net Worth Trajectory</p>
                            <div className="flex items-center gap-2 mt-1">
                                <span className={`text-sm font-black ${trajectoryDelta >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                    {trajectoryDelta >= 0 ? '+' : '−'}{fmtCompact(Math.abs(trajectoryDelta))}
                                </span>
                                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${trajectoryDelta >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-500'}`}>
                                    {trajectoryDelta >= 0 ? '▲' : '▼'} {Math.abs(trajectoryDeltaPct).toFixed(1)}%
                                </span>
                                <span className="text-xs text-slate-400">over {netWorthTrajectory.length} months</span>
                            </div>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={netWorthTrajectory} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="nwGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={trajectoryColor} stopOpacity={0.15} />
                                    <stop offset="95%" stopColor={trajectoryColor} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="label"
                                tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 600 }}
                                axisLine={false} tickLine={false} />
                            <YAxis tickFormatter={v => {
                                if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
                                if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}K`
                                return String(Math.round(v))
                            }}
                                tick={{ fontSize: 10, fill: '#94a3b8' }}
                                axisLine={false} tickLine={false} width={52} />
                            <ReTooltip
                                content={({ active, payload, label }) => {
                                    if (!active || !payload?.length) return null
                                    return (
                                        <div className="bg-white dark:bg-slate-700 rounded-2xl border border-slate-100 dark:border-slate-600 px-3 py-2 shadow-lg text-xs">
                                            <p className="font-bold text-slate-500 dark:text-slate-400 mb-1">{label}</p>
                                            <p className="font-black text-slate-900 dark:text-white">{fmt(payload[0].value as number)}</p>
                                        </div>
                                    )
                                }}
                                cursor={{ stroke: trajectoryColor, strokeWidth: 1, strokeDasharray: '4 4' }}
                            />
                            <ReferenceLine y={netWorthTrajectory[0].nw}
                                stroke="#e2e8f0" strokeDasharray="4 4" strokeWidth={1} />
                            <Line type="monotone" dataKey="nw"
                                stroke={trajectoryColor} strokeWidth={2.5}
                                dot={{ fill: trajectoryColor, r: 3, strokeWidth: 0 }}
                                activeDot={{ r: 5, fill: trajectoryColor, strokeWidth: 2, stroke: '#fff' }}
                                fill="url(#nwGradient)"
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Net Worth Spread — 3-slide carousel */}
            {netWorthAccounts.length > 0 && sortedSpread.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden"
                    style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)' }}>

                    {/* Card header */}
                    <div className="px-5 pt-5 pb-4 flex items-center justify-between border-b border-slate-50 dark:border-slate-700">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Net Worth Spread</p>
                            <p className="text-sm font-black text-slate-800 dark:text-slate-200 mt-0.5">{fmtCompact(spreadTotal)}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                            <div className="flex items-center gap-1">
                                {[0, 1, 2].map(i => (
                                    <button key={i} onClick={() => setSpreadSlide(i)}
                                        className={`rounded-full transition-all ${i === spreadSlide ? 'w-4 h-2 bg-sky-500' : 'w-2 h-2 bg-slate-200 dark:bg-slate-600 hover:bg-slate-300'}`} />
                                ))}
                            </div>
                            <p className="text-xs text-slate-400">
                                {spreadSlide === 0 ? 'By Institution' : spreadSlide === 1 ? 'By Currency' : 'Monthly Growth'}
                            </p>
                        </div>
                    </div>

                    {/* Swipeable slide area */}
                    <div
                        onTouchStart={e => { spreadTouchStart.current = e.touches[0].clientX }}
                        onTouchEnd={e => {
                            const delta = e.changedTouches[0].clientX - spreadTouchStart.current
                            if (Math.abs(delta) > 40) setSpreadSlide(s => Math.max(0, Math.min(2, s + (delta < 0 ? 1 : -1))))
                        }}>

                        {/* Slide 0: By Institution Type */}
                        {spreadSlide === 0 && (
                            <div className="p-5">
                                <div className="flex h-3 rounded-full overflow-hidden gap-px mb-5">
                                    {sortedSpread.map(([key, { kes }]) => (
                                        <div key={key} style={{ width: `${spreadTotal > 0 ? (kes / spreadTotal) * 100 : 0}%`, background: TYPE_COLORS[key] ?? '#94a3b8' }} />
                                    ))}
                                </div>
                                <div className="space-y-3">
                                    {sortedSpread.map(([key, { kes, count }]) => {
                                        const pct = spreadTotal > 0 ? (kes / spreadTotal) * 100 : 0
                                        const color = TYPE_COLORS[key] ?? '#94a3b8'
                                        return (
                                            <div key={key}>
                                                <div className="flex items-center justify-between mb-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                                                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{TYPE_LABELS[key] ?? key}</span>
                                                        <span className="text-xs text-slate-400">{count} acct{count !== 1 ? 's' : ''}</span>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{fmtCompact(kes)}</span>
                                                        <span className="text-xs text-slate-400 ml-2">{pct.toFixed(1)}%</span>
                                                    </div>
                                                </div>
                                                <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Slide 1: By Currency */}
                        {spreadSlide === 1 && (
                            <div className="p-5">
                                <div className="flex h-3 rounded-full overflow-hidden gap-px mb-5">
                                    {sortedCurrencies.map(([currency, { kes }], i) => (
                                        <div key={currency} style={{ width: `${spreadTotal > 0 ? (kes / spreadTotal) * 100 : 0}%`, background: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }} />
                                    ))}
                                </div>
                                <div className="space-y-3">
                                    {sortedCurrencies.map(([currency, { native, kes, count }], i) => {
                                        const pct = spreadTotal > 0 ? (kes / spreadTotal) * 100 : 0
                                        const color = SEGMENT_COLORS[i % SEGMENT_COLORS.length]
                                        return (
                                            <div key={currency}>
                                                <div className="flex items-center justify-between mb-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                                                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{currency}</span>
                                                        <span className="text-xs text-slate-400">{count} acct{count !== 1 ? 's' : ''}</span>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                                                            {currency === 'KES'
                                                                ? fmtCompact(native)
                                                                : `${currency} ${native.toLocaleString('en-KE', { maximumFractionDigits: 2 })}`}
                                                        </span>
                                                        {currency !== 'KES' && kes > 0 && (
                                                            <span className="text-xs text-slate-400 ml-1">≈ {fmtCompact(kes)}</span>
                                                        )}
                                                        <span className="text-xs text-slate-400 ml-2">{pct.toFixed(1)}%</span>
                                                    </div>
                                                </div>
                                                <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Slide 2: Monthly Growth Rate */}
                        {spreadSlide === 2 && (
                            <div className="p-5">
                                <p className="text-xs text-slate-400 mb-4">Net account growth · last 30 days</p>
                                <div className="space-y-3">
                                    {sortedSpread.map(([key, { kes: currentKes, count }]) => {
                                        const growth = monthlyGrowth.get(key) ?? 0
                                        const pctChange = currentKes > 0 ? (growth / currentKes) * 100 : 0
                                        const color = TYPE_COLORS[key] ?? '#94a3b8'
                                        const isPos = growth > 0
                                        const barPct = (Math.abs(growth) / maxGrowthAbs) * 100
                                        return (
                                            <div key={key}>
                                                <div className="flex items-center justify-between mb-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                                                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{TYPE_LABELS[key] ?? key}</span>
                                                        <span className="text-xs text-slate-400">{count} acct{count !== 1 ? 's' : ''}</span>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className={`text-sm font-bold ${growth === 0 ? 'text-slate-400' : isPos ? 'text-emerald-600' : 'text-rose-500'}`}>
                                                            {growth === 0 ? '—' : `${isPos ? '+' : '−'}${fmtCompact(Math.abs(growth))}`}
                                                        </span>
                                                        {growth !== 0 && (
                                                            <span className={`text-xs ml-1.5 ${isPos ? 'text-emerald-500' : 'text-rose-400'}`}>
                                                                {isPos ? '▲' : '▼'}{Math.abs(pctChange).toFixed(1)}%
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                                    <div className="h-full rounded-full transition-all"
                                                        style={{ width: `${growth === 0 ? 0 : barPct}%`, background: isPos ? '#10b981' : '#f43f5e' }} />
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Prev / Next nav */}
                    <div className="flex items-center justify-between px-5 py-3 border-t border-slate-50 dark:border-slate-700">
                        <button onClick={() => setSpreadSlide(s => Math.max(0, s - 1))} disabled={spreadSlide === 0}
                            className="flex items-center gap-1 text-xs font-semibold text-slate-500 disabled:opacity-30 hover:text-sky-500 disabled:hover:text-slate-500 transition-colors">
                            <ChevronLeft className="h-3.5 w-3.5" /> Prev
                        </button>
                        <span className="text-xs text-slate-400">
                            {spreadSlide === 0 ? 'By Institution' : spreadSlide === 1 ? 'By Currency' : 'Monthly Growth'}
                        </span>
                        <button onClick={() => setSpreadSlide(s => Math.min(2, s + 1))} disabled={spreadSlide === 2}
                            className="flex items-center gap-1 text-xs font-semibold text-slate-500 disabled:opacity-30 hover:text-sky-500 disabled:hover:text-slate-500 transition-colors">
                            Next <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>
            )}

            {/* Account breakdown */}
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Accounts</p>
                <div className="flex flex-wrap items-center gap-2">
                    {/* Sort */}
                    <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5 text-xs font-semibold">
                        {([
                            { key: 'name-asc',    label: 'A → Z' },
                            { key: 'name-desc',   label: 'Z → A' },
                            { key: 'amount-desc', label: 'Amount ↓' },
                            { key: 'amount-asc',  label: 'Amount ↑' },
                        ] as const).map(({ key, label }) => (
                            <button key={key} onClick={() => { setAccountSort(key); setNwAccountPage(0); setExAccountPage(0) }}
                                className={`px-3 py-1.5 rounded-lg transition-all ${accountSort === key ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
                                {label}
                            </button>
                        ))}
                    </div>
                    {/* Per-page */}
                    <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5 text-xs font-semibold">
                        {[3, 5, 10, 0].map(n => (
                            <button key={n} onClick={() => { setAccountsPerPage(n); setNwAccountPage(0); setExAccountPage(0) }}
                                className={`px-2.5 py-1.5 rounded-lg transition-all ${accountsPerPage === n ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
                                {n === 0 ? 'All' : n}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Net worth accounts */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden"
                    style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)' }}>
                    <div className="px-5 pt-5 pb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4 text-emerald-500" />
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Net Worth Accounts</p>
                        </div>
                        <Link href="/household" className="text-xs text-sky-500 font-semibold hover:text-sky-600 flex items-center gap-1">
                            Manage <ArrowUpRight className="h-3 w-3" />
                        </Link>
                    </div>

                    {netWorthAccounts.length === 0 ? (
                        <div className="px-5 pb-5">
                            <p className="text-sm text-slate-400">No accounts marked as contributing to net worth.</p>
                            <Link href="/household" className="text-xs text-sky-500 font-semibold mt-1 inline-block">Configure accounts →</Link>
                        </div>
                    ) : (
                        <>
                            <div className="divide-y divide-slate-50 dark:divide-slate-700">
                                {nwPageItems.map((a, i) => {
                                    const globalIdx = sortedNwAccounts.indexOf(a)
                                    const kes = toKES(Number(a.current_balance), a.currency, fxRates) ?? 0
                                    const pct = totalNetWorth > 0 ? ((kes / totalNetWorth) * 100).toFixed(1) : '0.0'
                                    return (
                                        <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                                style={{ background: SEGMENT_COLORS[globalIdx % SEGMENT_COLORS.length] }} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{a.name}</p>
                                                <p className="text-xs text-slate-400 capitalize">{a.account_type} · {a.ownership}</p>
                                            </div>
                                            <div className="text-right flex-shrink-0">
                                                <p className="text-sm font-bold text-slate-900 dark:text-white">{fmt(Number(a.current_balance), a.currency)}</p>
                                                {a.currency !== 'KES' && (() => {
                                                    const k = toKES(Number(a.current_balance), a.currency, fxRates)
                                                    return k != null
                                                        ? <p className="text-xs text-slate-400">≈ {fmt(k)}</p>
                                                        : <p className="text-xs text-amber-500">No FX rate</p>
                                                })()}
                                                <p className="text-xs text-slate-400">{pct}% of total</p>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                            {/* Pagination */}
                            {nwTotalPages > 1 && (
                                <div className="flex items-center justify-between px-5 py-2.5 border-t border-slate-50 dark:border-slate-700">
                                    <button onClick={() => setNwAccountPage(p => Math.max(0, p - 1))} disabled={nwAccountPage === 0}
                                        className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-sky-500 disabled:opacity-30 transition-colors">
                                        <ChevronLeft className="h-4 w-4" />
                                    </button>
                                    <span className="text-xs text-slate-400">{nwAccountPage + 1} / {nwTotalPages}</span>
                                    <button onClick={() => setNwAccountPage(p => Math.min(nwTotalPages - 1, p + 1))} disabled={nwAccountPage === nwTotalPages - 1}
                                        className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-sky-500 disabled:opacity-30 transition-colors">
                                        <ChevronRight className="h-4 w-4" />
                                    </button>
                                </div>
                            )}
                            <div className="flex items-center justify-between px-5 py-3 bg-slate-50 dark:bg-slate-700 border-t border-slate-100 dark:border-slate-600">
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Net Worth</p>
                                <p className="text-sm font-black text-slate-900 dark:text-white">{fmt(totalNetWorth)}</p>
                            </div>
                        </>
                    )}
                </div>

                {/* Excluded accounts */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden"
                    style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)' }}>
                    <div className="px-5 pt-5 pb-3 flex items-center gap-2">
                        <ShieldOff className="h-4 w-4 text-slate-400" />
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Excluded Accounts</p>
                    </div>

                    {excludedAccounts.length === 0 ? (
                        <div className="px-5 pb-5">
                            <p className="text-sm text-slate-400">All accounts are counted in your net worth.</p>
                        </div>
                    ) : (
                        <>
                            <div className="divide-y divide-slate-50 dark:divide-slate-700">
                                {exPageItems.map((a, i) => {
                                    const globalIdx = sortedExAccounts.indexOf(a)
                                    return (
                                        <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                                            <div className="w-7 h-7 rounded-xl flex items-center justify-center text-white text-xs font-black flex-shrink-0"
                                                style={{ background: GRADIENTS[globalIdx % GRADIENTS.length] }}>
                                                {a.name.charAt(0)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{a.name}</p>
                                                <p className="text-xs text-slate-400 capitalize">{a.account_type} · {a.ownership}</p>
                                            </div>
                                            <p className="text-sm font-bold text-slate-500 dark:text-slate-300 flex-shrink-0">{fmt(Number(a.current_balance), a.currency)}</p>
                                        </div>
                                    )
                                })}
                            </div>
                            {/* Pagination */}
                            {exTotalPages > 1 && (
                                <div className="flex items-center justify-between px-5 py-2.5 border-t border-slate-50 dark:border-slate-700">
                                    <button onClick={() => setExAccountPage(p => Math.max(0, p - 1))} disabled={exAccountPage === 0}
                                        className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-sky-500 disabled:opacity-30 transition-colors">
                                        <ChevronLeft className="h-4 w-4" />
                                    </button>
                                    <span className="text-xs text-slate-400">{exAccountPage + 1} / {exTotalPages}</span>
                                    <button onClick={() => setExAccountPage(p => Math.min(exTotalPages - 1, p + 1))} disabled={exAccountPage === exTotalPages - 1}
                                        className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-sky-500 disabled:opacity-30 transition-colors">
                                        <ChevronRight className="h-4 w-4" />
                                    </button>
                                </div>
                            )}
                            <div className="flex items-center justify-between px-5 py-3 bg-slate-50 dark:bg-slate-700 border-t border-slate-100 dark:border-slate-600">
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Total (excluded)</p>
                                <p className="text-sm font-black text-slate-500">
                                    {fmt(excludedAccounts.reduce((s, a) => s + Number(a.current_balance), 0))}
                                </p>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Transaction log */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden"
                style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)' }}>

                {/* Log header */}
                <div className="px-4 md:px-5 pt-4 md:pt-5 pb-3 md:pb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between border-b border-slate-100 dark:border-slate-700">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Transaction Log</p>
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Source filter */}
                        <div className="flex rounded-xl bg-slate-100 dark:bg-slate-700 p-0.5 text-xs font-semibold">
                            {(['all', 'manual', 'session'] as const).map(s => (
                                <button key={s} onClick={() => { setSourceFilter(s); setTxnPage(0) }}
                                    className={`px-2.5 py-1.5 rounded-lg capitalize transition-all ${sourceFilter === s ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
                                    {s === 'all' ? 'All' : s === 'manual' ? 'Manual' : 'Session'}
                                </button>
                            ))}
                        </div>
                        {/* Type filter */}
                        <div className="flex rounded-xl bg-slate-100 dark:bg-slate-700 p-0.5 text-xs font-semibold">
                            {(['all', 'credit', 'debit'] as const).map(f => (
                                <button key={f} onClick={() => { setTxnFilter(f); setTxnPage(0) }}
                                    className={`px-2.5 py-1.5 rounded-lg transition-all ${txnFilter === f ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
                                    {f === 'all' ? 'All' : f === 'credit' ? 'Deposits' : 'Withdrawals'}
                                </button>
                            ))}
                        </div>
                        {/* Per-page */}
                        <div className="flex rounded-xl bg-slate-100 dark:bg-slate-700 p-0.5 text-xs font-semibold">
                            {[5, 10, 25, 0].map(n => (
                                <button key={n} onClick={() => { setTxnsPerPage(n); setTxnPage(0) }}
                                    className={`px-2.5 py-1.5 rounded-lg transition-all ${txnsPerPage === n ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
                                    {n === 0 ? 'All' : n}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {txnLoading ? (
                    <div className="flex items-center gap-2 px-5 py-8 text-sm text-slate-400">
                        <div className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-transparent animate-spin" />
                        Loading transactions…
                    </div>
                ) : filteredTxns.length === 0 ? (
                    <div className="px-5 py-10 text-center">
                        <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-3">
                            <TrendingUp className="h-5 w-5 text-slate-400" />
                        </div>
                        <p className="text-sm font-medium text-slate-500">No transactions yet</p>
                        <p className="text-xs text-slate-400 mt-1">Add entries via accounts on the Household page, or mark session items as paid</p>
                    </div>
                ) : (
                    <>
                        {/* Column headers — desktop only */}
                        <div className="hidden md:grid grid-cols-[1fr_1.5fr_auto_auto] gap-4 px-5 py-2 bg-slate-50 dark:bg-slate-700 border-b border-slate-100 dark:border-slate-600 text-xs font-bold text-slate-400 uppercase tracking-wide">
                            <span>Date</span>
                            <span>Account · Narration</span>
                            <span>Source</span>
                            <span className="text-right">Amount</span>
                        </div>
                        <div className="divide-y divide-slate-50 dark:divide-slate-700">
                            {txnPageItems.map(t => {
                                const account = accountMap[t.account_id]
                                const isCredit = t.transaction_type === 'credit'
                                const badge = (
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${t.session_item_id ? 'bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                                        {t.session_item_id ? 'Session' : 'Manual'}
                                    </span>
                                )
                                const amountEl = (
                                    <div className="text-right flex-shrink-0">
                                        <p className={`text-sm font-bold ${isCredit ? 'text-emerald-600' : 'text-rose-500'}`}>
                                            {isCredit ? '+' : '−'}{fmt(Number(t.amount), account?.currency ?? 'KES')}
                                        </p>
                                        {account?.currency && account.currency !== 'KES' && (() => {
                                            const kes = toKES(Number(t.amount), account.currency, fxRates)
                                            return kes != null ? <p className="text-xs text-slate-400">≈ {fmt(kes)}</p> : null
                                        })()}
                                    </div>
                                )
                                return (
                                    <div key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                        {/* Mobile card layout */}
                                        <div className="flex items-center gap-3 px-4 py-3 md:hidden">
                                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${isCredit ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'bg-rose-50 dark:bg-rose-950/40'}`}>
                                                {isCredit
                                                    ? <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                                                    : <TrendingDown className="h-3.5 w-3.5 text-rose-500" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-2">
                                                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{t.narration}</p>
                                                    {amountEl}
                                                </div>
                                                <div className="flex items-center justify-between gap-2 mt-0.5">
                                                    <p className="text-xs text-slate-400 truncate">{account?.name ?? 'Unknown'} · {fmtDate(t.created_at)}</p>
                                                    {badge}
                                                </div>
                                            </div>
                                        </div>
                                        {/* Desktop table layout */}
                                        <div className="hidden md:grid grid-cols-[1fr_1.5fr_auto_auto] gap-4 px-5 py-3.5 items-center">
                                            <div>
                                                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{fmtDate(t.created_at)}</p>
                                                <p className="text-xs text-slate-400">{fmtTime(t.created_at)}</p>
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${isCredit ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'bg-rose-50 dark:bg-rose-950/40'}`}>
                                                        {isCredit
                                                            ? <TrendingUp className="h-3 w-3 text-emerald-500" />
                                                            : <TrendingDown className="h-3 w-3 text-rose-500" />}
                                                    </div>
                                                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{t.narration}</p>
                                                </div>
                                                <p className="text-xs text-slate-400 mt-0.5 pl-8">{account?.name ?? 'Unknown account'}</p>
                                            </div>
                                            {badge}
                                            {amountEl}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        {/* Pagination */}
                        {txnTotalPages > 1 && (
                            <div className="flex items-center justify-between px-5 py-2.5 border-t border-slate-50 dark:border-slate-700">
                                <button onClick={() => setTxnPage(p => Math.max(0, p - 1))} disabled={txnPage === 0}
                                    className="flex items-center gap-1 text-xs font-semibold text-slate-500 disabled:opacity-30 hover:text-sky-500 disabled:hover:text-slate-500 transition-colors">
                                    <ChevronLeft className="h-3.5 w-3.5" /> Prev
                                </button>
                                <span className="text-xs text-slate-400">
                                    {txnPage * (txnsPerPage || filteredTxns.length) + 1}–{Math.min((txnPage + 1) * (txnsPerPage || filteredTxns.length), filteredTxns.length)} of {filteredTxns.length}
                                </span>
                                <button onClick={() => setTxnPage(p => Math.min(txnTotalPages - 1, p + 1))} disabled={txnPage === txnTotalPages - 1}
                                    className="flex items-center gap-1 text-xs font-semibold text-slate-500 disabled:opacity-30 hover:text-sky-500 disabled:hover:text-slate-500 transition-colors">
                                    Next <ChevronRight className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        )}

                        {/* Footer summary */}
                        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-700 border-t border-slate-100 dark:border-slate-600 flex items-center justify-between">
                            <p className="text-xs text-slate-400">{filteredTxns.length} transaction{filteredTxns.length !== 1 ? 's' : ''}</p>
                            <div className="flex items-center gap-4 text-xs font-semibold">
                                <span className="text-emerald-600">
                                    +{fmt(filteredTxns.filter(t => t.transaction_type === 'credit').reduce((s, t) => s + Number(t.amount), 0))}
                                </span>
                                <span className="text-rose-500">
                                    −{fmt(filteredTxns.filter(t => t.transaction_type === 'debit').reduce((s, t) => s + Number(t.amount), 0))}
                                </span>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
