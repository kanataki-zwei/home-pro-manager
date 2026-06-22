'use client'

import { useEffect, useState } from 'react'
import { useHousehold } from '@/context/HouseholdContext'
import { apiGet, apiPost, apiPatch } from '@/lib/api'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────

interface SessionSummary {
    id: string
    month: string        // "2026-06-01"
    name: string
    status: string
    total_allocated: number | null
    total_paid: number | null
    total_remaining: number | null
}

interface ExpenseTag { id: string; name: string; color: string | null }
interface TagAssignment { id: string; tag: ExpenseTag }
interface Expense {
    id: string
    name: string
    monthly_amount: number
    ownership_type: string
    group_id: string | null
    owner_id: string | null
    tag_assignments: TagAssignment[]
}

interface SessionItem {
    id: string
    session_id: string
    expense_id: string
    allocated_amount: number
    status: string   // todo | paid | reserved | na
    expense: Expense
    created_at: string
    updated_at: string
}

interface SessionDetail {
    id: string
    month: string
    name: string
    status: string
    items: SessionItem[]
}

interface ExpenseGroup {
    id: string
    name: string
    owner_id: string | null
}

// ─── Constants ────────────────────────────────────────────────────

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
]

const STATUSES = ['todo', 'paid', 'reserved', 'na'] as const
type ItemStatus = typeof STATUSES[number]

const STATUS_CONFIG: Record<ItemStatus, { label: string; idle: string; active: string }> = {
    todo:     { label: 'To Do',    idle: 'text-slate-500 border border-slate-200 hover:bg-slate-50',       active: 'bg-slate-100 text-slate-800 border border-slate-300 font-semibold' },
    paid:     { label: 'Paid',     idle: 'text-emerald-600 border border-emerald-200 hover:bg-emerald-50', active: 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold' },
    reserved: { label: 'Reserved', idle: 'text-amber-600 border border-amber-200 hover:bg-amber-50',       active: 'bg-amber-100 text-amber-800 border border-amber-300 font-semibold' },
    na:       { label: 'N/A',      idle: 'text-slate-300 border border-slate-100 hover:bg-slate-50',       active: 'bg-slate-50 text-slate-500 border border-slate-200 font-semibold' },
}

// ─── Helpers ──────────────────────────────────────────────────────

function toMonthly(amount: number | string | null, cadence: string | null): number {
    const n = Number(amount ?? 0)
    if (cadence === 'weekly') return (n * 52) / 12
    if (cadence === 'annually') return n / 12
    return n
}

function fmt(n: number | string | null) {
    return `KES ${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtCompact(n: number | string | null) {
    const num = Number(n ?? 0)
    if (num >= 1_000_000) return `KES ${(num / 1_000_000).toFixed(1)}M`
    if (num >= 1_000) return `KES ${(num / 1_000).toFixed(1)}K`
    return `KES ${Math.round(num)}`
}

function monthStart(year: number, monthIdx: number) {
    return `${year}-${String(monthIdx + 1).padStart(2, '0')}-01`
}

// ─── Status card ─────────────────────────────────────────────────

function StatCard({
    label,
    value,
    sub,
    colorClass,
    labelClass,
    valueClass,
}: {
    label: string
    value: string
    sub?: string
    colorClass: string
    labelClass: string
    valueClass: string
}) {
    return (
        <div className={`rounded-2xl px-5 py-4 ${colorClass}`}>
            <p className={`text-xs font-semibold uppercase tracking-wide ${labelClass}`}>{label}</p>
            <p className={`text-xl font-black mt-1 ${valueClass}`}>{value}</p>
            {sub && <p className={`text-xs mt-0.5 ${labelClass} opacity-70`}>{sub}</p>}
        </div>
    )
}

// ─── Detail view ──────────────────────────────────────────────────

function SessionDetailView({
    session,
    groups,
    currentMonthStart,
    householdId,
    onBack,
}: {
    session: SessionDetail
    groups: ExpenseGroup[]
    currentMonthStart: string
    householdId: string
    onBack: () => void
}) {
    const [items, setItems] = useState<SessionItem[]>(session.items)
    const [updatingId, setUpdatingId] = useState<string | null>(null)
    const isPast = session.month.slice(0, 10) < currentMonthStart

    const groupMap = new Map(groups.map(g => [g.id, g.name]))

    const grouped = new Map<string, SessionItem[]>()
    for (const item of items) {
        const key = item.expense.group_id ?? '__none__'
        if (!grouped.has(key)) grouped.set(key, [])
        grouped.get(key)!.push(item)
    }

    const totalAllocated = items.reduce((s, i) => s + Number(i.allocated_amount), 0)
    const totalPaid      = items.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.allocated_amount), 0)
    const totalReserved  = items.filter(i => i.status === 'reserved').reduce((s, i) => s + Number(i.allocated_amount), 0)
    const totalRemaining = totalAllocated - totalPaid - totalReserved
    const paidPct = totalAllocated > 0 ? (totalPaid / totalAllocated) * 100 : 0
    const reservedPct = totalAllocated > 0 ? (totalReserved / totalAllocated) * 100 : 0

    async function updateStatus(itemId: string, newStatus: ItemStatus) {
        setUpdatingId(itemId)
        try {
            const updated = await apiPatch<SessionItem>(
                `/api/households/${householdId}/budget/sessions/${session.id}/items/${itemId}`,
                { status: newStatus }
            )
            setItems(prev => prev.map(i => i.id === itemId ? updated : i))
        } catch {
            toast.error('Failed to update status')
        } finally {
            setUpdatingId(null)
        }
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors">
                    <ArrowLeft className="h-4 w-4" />
                    All months
                </button>
                <div className="h-4 w-px bg-slate-200" />
                <h2 className="text-lg font-bold text-slate-800">{session.name}</h2>
                {isPast && (
                    <span className="text-xs font-semibold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                        Read-only
                    </span>
                )}
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-3">
                <StatCard
                    label="Allocated"
                    value={fmt(totalAllocated)}
                    colorClass="bg-slate-50"
                    labelClass="text-slate-400"
                    valueClass="text-slate-800"
                />
                <StatCard
                    label="Paid"
                    value={fmt(totalPaid)}
                    sub={totalReserved > 0 ? `+ ${fmt(totalReserved)} reserved` : undefined}
                    colorClass="bg-emerald-50"
                    labelClass="text-emerald-500"
                    valueClass="text-emerald-700"
                />
                <StatCard
                    label="Remaining"
                    value={fmt(Math.max(totalRemaining, 0))}
                    colorClass="bg-amber-50"
                    labelClass="text-amber-500"
                    valueClass="text-amber-700"
                />
            </div>

            {/* Progress bar */}
            {totalAllocated > 0 && (
                <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-slate-400 font-medium">
                        <span>Progress</span>
                        <span>{Math.round(paidPct + reservedPct)}% settled</span>
                    </div>
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
                        <div
                            className="h-full bg-emerald-400 transition-all duration-500"
                            style={{ width: `${paidPct}%` }}
                        />
                        <div
                            className="h-full bg-amber-300 transition-all duration-500"
                            style={{ width: `${reservedPct}%` }}
                        />
                    </div>
                    <div className="flex gap-4 text-xs text-slate-400">
                        <span className="flex items-center gap-1.5">
                            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
                            Paid
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="inline-block w-2 h-2 rounded-full bg-amber-300" />
                            Reserved
                        </span>
                    </div>
                </div>
            )}

            {items.length === 0 && (
                <div className="flex items-center justify-center h-32 rounded-2xl border-2 border-dashed border-slate-200">
                    <p className="text-sm text-slate-400">No expenses found for this session</p>
                </div>
            )}

            {/* Items grouped by expense group */}
            {[...grouped.entries()].map(([groupId, groupItems]) => (
                <div key={groupId} className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                        {groupId === '__none__'
                            ? 'Uncategorized'
                            : (groupMap.get(groupId) ?? 'Unknown group')}
                    </p>
                    <div className="rounded-2xl border border-slate-100 overflow-hidden">
                        {groupItems.map((item, idx) => {
                            const isLast = idx === groupItems.length - 1
                            const isUpdating = updatingId === item.id
                            const disabled = isPast || isUpdating
                            return (
                                <div
                                    key={item.id}
                                    className={`flex items-center gap-4 px-5 py-4 ${!isLast ? 'border-b border-slate-100' : ''}`}>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-slate-800 truncate">
                                            {item.expense.name}
                                        </p>
                                        <p className="text-xs text-slate-400">{fmt(item.allocated_amount)}</p>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        {STATUSES.map(s => {
                                            const cfg = STATUS_CONFIG[s]
                                            const isActive = item.status === s
                                            return (
                                                <button
                                                    key={s}
                                                    disabled={disabled}
                                                    onClick={() => !isActive && !disabled && updateStatus(item.id, s)}
                                                    className={`text-xs px-2.5 py-1 rounded-full transition-all ${
                                                        disabled
                                                            ? `opacity-60 cursor-not-allowed ${isActive ? cfg.active : cfg.idle}`
                                                            : isActive
                                                                ? cfg.active
                                                                : `${cfg.idle} cursor-pointer`
                                                    }`}>
                                                    {cfg.label}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            ))}
        </div>
    )
}

// ─── Main component ───────────────────────────────────────────────

export default function MonthlySession() {
    const { household, members } = useHousehold()
    const [sessions, setSessions] = useState<SessionSummary[]>([])
    const [groups, setGroups] = useState<ExpenseGroup[]>([])
    const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null)
    const [loading, setLoading] = useState(true)
    const [startingSession, setStartingSession] = useState(false)
    const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null)

    const today = new Date()
    const currentYear = today.getFullYear()
    const currentMonthIdx = today.getMonth()
    const currMonthStart = monthStart(currentYear, currentMonthIdx)

    // Total monthly household income
    const totalIncome = members
        .filter(m => m.contributes_income && m.income_amount)
        .reduce((sum, m) => sum + toMonthly(m.income_amount, m.income_cadence), 0)

    useEffect(() => {
        if (!household) return
        Promise.all([
            apiGet<SessionSummary[]>(`/api/households/${household.id}/budget/sessions`),
            apiGet<ExpenseGroup[]>(`/api/households/${household.id}/budget/groups`),
        ])
            .then(([s, g]) => { setSessions(s); setGroups(g) })
            .catch(() => toast.error('Failed to load sessions'))
            .finally(() => setLoading(false))
    }, [household])

    async function openSession(sessionId: string) {
        if (!household) return
        setLoadingSessionId(sessionId)
        try {
            const data = await apiGet<SessionDetail>(
                `/api/households/${household.id}/budget/sessions/${sessionId}`
            )
            setSelectedSession(data)
        } catch {
            toast.error('Failed to load session')
        } finally {
            setLoadingSessionId(null)
        }
    }

    async function startSession() {
        if (!household) return
        setStartingSession(true)
        try {
            const data = await apiPost<SessionDetail>(
                `/api/households/${household.id}/budget/sessions`,
                { month: currMonthStart }
            )
            const totalAllocated = data.items.reduce((s, i) => s + i.allocated_amount, 0)
            setSessions(prev => [...prev, {
                id: data.id, month: data.month, name: data.name, status: data.status,
                total_allocated: totalAllocated, total_paid: 0, total_remaining: totalAllocated,
            }])
            setSelectedSession(data)
        } catch (e: any) {
            toast.error('Failed to start session', { description: e.message })
        } finally {
            setStartingSession(false)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-48">
                <div className="w-6 h-6 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
            </div>
        )
    }

    // ── Detail view ───────────────────────────────────────────────
    if (selectedSession) {
        return (
            <SessionDetailView
                session={selectedSession}
                groups={groups}
                currentMonthStart={currMonthStart}
                householdId={household!.id}
                onBack={() => setSelectedSession(null)}
            />
        )
    }

    // ── Month grid ────────────────────────────────────────────────
    const sessionsByMonth = new Map(sessions.map(s => [s.month.slice(0, 7), s]))
    const currentSession = sessionsByMonth.get(currMonthStart.slice(0, 7))

    const budgeted  = currentSession?.total_allocated ?? null
    const paid      = currentSession?.total_paid ?? null
    const remaining = budgeted !== null && paid !== null ? Math.max(budgeted - paid, 0) : null

    return (
        <div className="space-y-6">
            {/* ── Status summary ─────────────────────────────────── */}
            <div className="grid grid-cols-4 gap-3">
                <StatCard
                    label="Monthly Income"
                    value={fmt(totalIncome)}
                    colorClass="bg-sky-50"
                    labelClass="text-sky-500"
                    valueClass="text-sky-800"
                />
                <StatCard
                    label="Budgeted"
                    value={budgeted !== null ? fmt(budgeted) : '—'}
                    sub={budgeted !== null && totalIncome > 0
                        ? `${Math.round((budgeted / totalIncome) * 100)}% of income`
                        : undefined}
                    colorClass="bg-slate-50"
                    labelClass="text-slate-400"
                    valueClass="text-slate-700"
                />
                <StatCard
                    label="Paid"
                    value={paid !== null ? fmt(paid) : '—'}
                    sub={paid !== null && budgeted ? `${Math.round((paid / budgeted) * 100)}% of budget` : undefined}
                    colorClass="bg-emerald-50"
                    labelClass="text-emerald-500"
                    valueClass="text-emerald-700"
                />
                <StatCard
                    label="Remaining"
                    value={remaining !== null ? fmt(remaining) : '—'}
                    sub={remaining !== null ? 'still to pay' : 'no session yet'}
                    colorClass="bg-amber-50"
                    labelClass="text-amber-500"
                    valueClass="text-amber-700"
                />
            </div>

            {/* ── Year label + grid ──────────────────────────────── */}
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{currentYear}</p>

            <div className="grid grid-cols-3 gap-3">
                {MONTH_NAMES.map((name, idx) => {
                    const mStart = monthStart(currentYear, idx)
                    const monthKey = mStart.slice(0, 7)
                    const session = sessionsByMonth.get(monthKey)
                    const isFuture = mStart > currMonthStart
                    const isCurrent = mStart === currMonthStart
                    const isLoading = loadingSessionId === session?.id

                    if (isFuture) {
                        return (
                            <div key={idx} className="rounded-2xl border border-slate-100 bg-slate-50 p-4 opacity-40">
                                <p className="text-sm font-bold text-slate-400">{name}</p>
                                <p className="text-xs text-slate-300 mt-1">Upcoming</p>
                            </div>
                        )
                    }

                    if (!session && !isCurrent) {
                        return (
                            <div key={idx} className="rounded-2xl border border-slate-100 bg-white p-4">
                                <p className="text-sm font-bold text-slate-500">{name}</p>
                                <p className="text-xs text-slate-300 mt-1">No budget</p>
                            </div>
                        )
                    }

                    if (!session && isCurrent) {
                        return (
                            <div key={idx} className="rounded-2xl border-2 border-sky-200 bg-sky-50 p-4 flex flex-col gap-3">
                                <div>
                                    <p className="text-sm font-bold text-sky-700">{name}</p>
                                    <p className="text-xs text-sky-400 mt-0.5">Current month</p>
                                </div>
                                <button
                                    onClick={startSession}
                                    disabled={startingSession}
                                    className="text-xs font-bold bg-sky-500 hover:bg-sky-600 text-white rounded-xl px-3 py-2 transition-colors disabled:opacity-60">
                                    {startingSession ? 'Starting…' : "Start this month's budget"}
                                </button>
                            </div>
                        )
                    }

                    // Has session
                    const allocated = Number(session!.total_allocated ?? 0)
                    const sessionPaid = Number(session!.total_paid ?? 0)
                    const sessionPct = allocated > 0 ? Math.round((sessionPaid / allocated) * 100) : 0

                    return (
                        <button
                            key={idx}
                            onClick={() => openSession(session!.id)}
                            disabled={isLoading}
                            className={`rounded-2xl border p-4 text-left transition-all hover:shadow-md disabled:opacity-70 ${
                                isCurrent
                                    ? 'border-sky-200 bg-sky-50 hover:border-sky-300'
                                    : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}>
                            <div className="flex items-start justify-between gap-2">
                                <p className={`text-sm font-bold ${isCurrent ? 'text-sky-700' : 'text-slate-700'}`}>
                                    {name}
                                </p>
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                                    session!.status === 'closed'
                                        ? 'bg-emerald-50 text-emerald-600'
                                        : 'bg-amber-50 text-amber-600'
                                }`}>
                                    {session!.status}
                                </span>
                            </div>
                            {isCurrent && <p className="text-xs text-sky-400 mt-0.5">Current month</p>}
                            <p className={`text-sm font-bold mt-2 ${isCurrent ? 'text-sky-800' : 'text-slate-800'}`}>
                                {fmtCompact(allocated)}
                            </p>
                            {allocated > 0 && (
                                <div className="mt-2 space-y-1">
                                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-emerald-400 rounded-full transition-all"
                                            style={{ width: `${sessionPct}%` }}
                                        />
                                    </div>
                                    <p className="text-xs text-slate-400">{sessionPct}% paid</p>
                                </div>
                            )}
                            {isLoading && (
                                <div className="mt-2 w-3 h-3 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
                            )}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
