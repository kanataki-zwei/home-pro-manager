'use client'

import { useEffect, useState, useMemo } from 'react'
import { useHousehold } from '@/context/HouseholdContext'
import { apiGet } from '@/lib/api'
import { TrendingUp, TrendingDown, Shield, ShieldOff, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'

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

    const myAccountIds = new Set(visibleAccounts.map(a => a.id))
    const totalNetWorth = netWorthAccounts.reduce((s, a) => {
        const kes = toKES(Number(a.current_balance), a.currency, fxRates)
        return s + (kes ?? 0)
    }, 0)
    const hasMissingRates = netWorthAccounts.some(
        a => a.currency !== 'KES' && !fxRates.find(r => r.currency === a.currency)
    )

    const accountMap = Object.fromEntries(accounts.map(a => [a.id, a]))

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

    return (
        <div className="space-y-6 max-w-5xl">

            {/* Header */}
            <div>
                <span className="text-xs font-semibold uppercase tracking-widest text-emerald-500">Financial Health</span>
                <h1 className="text-3xl font-bold text-slate-900 mt-1">Net Worth</h1>
                <p className="text-slate-400 mt-1 text-sm">Track your assets and transaction history</p>
            </div>

            {/* Hero */}
            <div className="relative rounded-2xl overflow-hidden p-8"
                style={{ background: 'linear-gradient(135deg, #0f172a 0%, #064e3b 50%, #0f172a 100%)' }}>
                <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-10"
                    style={{ background: 'radial-gradient(circle, #34d399, transparent)', transform: 'translate(30%, -30%)' }} />
                <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full opacity-5"
                    style={{ background: 'radial-gradient(circle, #10b981, transparent)', transform: 'translate(-30%, 30%)' }} />
                <div className="relative grid grid-cols-3 gap-8">
                    <div className="col-span-1">
                        <p className="text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-2">Total Net Worth</p>
                        <p className="text-white font-bold mb-2" style={{ fontSize: '2.2rem', lineHeight: 1 }}>
                            {fmtCompact(totalNetWorth)}
                        </p>
                        <p className="text-slate-400 text-xs">{netWorthAccounts.length} account{netWorthAccounts.length !== 1 ? 's' : ''} tracked</p>
                        {hasMissingRates && (
                            <p className="text-amber-400 text-xs mt-1.5">⚠ Some foreign accounts excluded — add FX rates in Settings</p>
                        )}
                    </div>
                    <div>
                        <p className="text-sky-400 text-xs font-semibold uppercase tracking-wider mb-2">Total Deposits</p>
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
                                const pct = (Number(a.current_balance) / totalNetWorth) * 100
                                return (
                                    <div key={a.id}
                                        style={{ width: `${Math.max(pct, 0)}%`, background: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }} />
                                )
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Account breakdown */}
            <div className="grid grid-cols-2 gap-4">

                {/* Net worth accounts */}
                <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden"
                    style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)' }}>
                    <div className="px-5 pt-5 pb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4 text-emerald-500" />
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Net Worth Accounts</p>
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
                        <div className="divide-y divide-slate-50">
                            {netWorthAccounts.map((a, i) => {
                                const pct = totalNetWorth > 0 ? ((Number(a.current_balance) / totalNetWorth) * 100).toFixed(1) : '0.0'
                                return (
                                    <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                            style={{ background: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }} />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-slate-800 truncate">{a.name}</p>
                                            <p className="text-xs text-slate-400 capitalize">{a.account_type} · {a.ownership}</p>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <p className="text-sm font-bold text-slate-900">{fmt(Number(a.current_balance), a.currency)}</p>
                                            {a.currency !== 'KES' && (() => {
                                                const kes = toKES(Number(a.current_balance), a.currency, fxRates)
                                                return kes != null
                                                    ? <p className="text-xs text-slate-400">≈ {fmt(kes)}</p>
                                                    : <p className="text-xs text-amber-500">No FX rate</p>
                                            })()}
                                            <p className="text-xs text-slate-400">{pct}% of total</p>
                                        </div>
                                    </div>
                                )
                            })}
                            <div className="flex items-center justify-between px-5 py-3 bg-slate-50">
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Net Worth</p>
                                <p className="text-sm font-black text-slate-900">{fmt(totalNetWorth)}</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Excluded accounts */}
                <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden"
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
                        <div className="divide-y divide-slate-50">
                            {excludedAccounts.map((a, i) => (
                                <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                                    <div className="w-7 h-7 rounded-xl flex items-center justify-center text-white text-xs font-black flex-shrink-0"
                                        style={{ background: GRADIENTS[i % GRADIENTS.length] }}>
                                        {a.name.charAt(0)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-slate-800 truncate">{a.name}</p>
                                        <p className="text-xs text-slate-400 capitalize">{a.account_type} · {a.ownership}</p>
                                    </div>
                                    <p className="text-sm font-bold text-slate-500 flex-shrink-0">{fmt(Number(a.current_balance), a.currency)}</p>
                                </div>
                            ))}
                            <div className="flex items-center justify-between px-5 py-3 bg-slate-50">
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Total (excluded)</p>
                                <p className="text-sm font-black text-slate-500">
                                    {fmt(excludedAccounts.reduce((s, a) => s + Number(a.current_balance), 0))}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Transaction log */}
            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden"
                style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)' }}>

                {/* Log header */}
                <div className="px-5 pt-5 pb-4 flex items-center justify-between border-b border-slate-100">
                    <p className="text-sm font-bold text-slate-800">Transaction Log</p>
                    <div className="flex items-center gap-2">
                        {/* Source filter */}
                        <div className="flex rounded-xl bg-slate-100 p-0.5 text-xs font-semibold">
                            {(['all', 'manual', 'session'] as const).map(s => (
                                <button key={s} onClick={() => setSourceFilter(s)}
                                    className={`px-3 py-1.5 rounded-lg capitalize transition-all ${sourceFilter === s ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                    {s === 'all' ? 'All Sources' : s === 'manual' ? 'Manual' : 'Session'}
                                </button>
                            ))}
                        </div>
                        {/* Type filter */}
                        <div className="flex rounded-xl bg-slate-100 p-0.5 text-xs font-semibold">
                            {(['all', 'credit', 'debit'] as const).map(f => (
                                <button key={f} onClick={() => setTxnFilter(f)}
                                    className={`px-3 py-1.5 rounded-lg transition-all ${txnFilter === f ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                    {f === 'all' ? 'All' : f === 'credit' ? 'Deposits' : 'Withdrawals'}
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
                        <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                            <TrendingUp className="h-5 w-5 text-slate-400" />
                        </div>
                        <p className="text-sm font-medium text-slate-500">No transactions yet</p>
                        <p className="text-xs text-slate-400 mt-1">Add entries via accounts on the Household page, or mark session items as paid</p>
                    </div>
                ) : (
                    <>
                        {/* Column headers */}
                        <div className="grid grid-cols-[1fr_1.5fr_auto_auto] gap-4 px-5 py-2 bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wide">
                            <span>Date</span>
                            <span>Account · Narration</span>
                            <span>Source</span>
                            <span className="text-right">Amount</span>
                        </div>
                        <div className="divide-y divide-slate-50">
                            {filteredTxns.map(t => {
                                const account = accountMap[t.account_id]
                                const isCredit = t.transaction_type === 'credit'
                                return (
                                    <div key={t.id} className="grid grid-cols-[1fr_1.5fr_auto_auto] gap-4 px-5 py-3.5 items-center hover:bg-slate-50 transition-colors">
                                        {/* Date */}
                                        <div>
                                            <p className="text-sm font-medium text-slate-700">{fmtDate(t.created_at)}</p>
                                            <p className="text-xs text-slate-400">{fmtTime(t.created_at)}</p>
                                        </div>
                                        {/* Account + narration */}
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${isCredit ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                                                    {isCredit
                                                        ? <TrendingUp className="h-3 w-3 text-emerald-500" />
                                                        : <TrendingDown className="h-3 w-3 text-rose-500" />}
                                                </div>
                                                <p className="text-sm font-medium text-slate-800 truncate">{t.narration}</p>
                                            </div>
                                            <p className="text-xs text-slate-400 mt-0.5 pl-8">{account?.name ?? 'Unknown account'}</p>
                                        </div>
                                        {/* Source badge */}
                                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${t.session_item_id ? 'bg-sky-50 text-sky-600' : 'bg-slate-100 text-slate-500'}`}>
                                            {t.session_item_id ? 'Session' : 'Manual'}
                                        </span>
                                        {/* Amount */}
                                        <div className="text-right flex-shrink-0">
                                            <p className={`text-sm font-bold ${isCredit ? 'text-emerald-600' : 'text-rose-500'}`}>
                                                {isCredit ? '+' : '−'}{fmt(Number(t.amount), account?.currency ?? 'KES')}
                                            </p>
                                            {account?.currency && account.currency !== 'KES' && (() => {
                                                const kes = toKES(Number(t.amount), account.currency, fxRates)
                                                return kes != null
                                                    ? <p className="text-xs text-slate-400">≈ {fmt(kes)}</p>
                                                    : null
                                            })()}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        {/* Footer summary */}
                        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
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
