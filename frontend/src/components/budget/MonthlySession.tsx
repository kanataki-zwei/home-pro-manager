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
    todo:     { label: 'To Do',    idle: 'text-slate-500 border border-slate-200 hover:bg-slate-50',    active: 'bg-slate-100 text-slate-800 border border-slate-300 font-semibold' },
    paid:     { label: 'Paid',     idle: 'text-emerald-600 border border-emerald-200 hover:bg-emerald-50', active: 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold' },
    reserved: { label: 'Reserved', idle: 'text-amber-600 border border-amber-200 hover:bg-amber-50',    active: 'bg-amber-100 text-amber-800 border border-amber-300 font-semibold' },
    na:       { label: 'N/A',      idle: 'text-slate-300 border border-slate-100 hover:bg-slate-50',    active: 'bg-slate-50 text-slate-500 border border-slate-200 font-semibold' },
}

// ─── Helpers ──────────────────────────────────────────────────────

function fmt(n: number) {
    return `KES ${n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function monthStart(year: number, monthIdx: number) {
    // Returns "YYYY-MM-01"
    return `${year}-${String(monthIdx + 1).padStart(2, '0')}-01`
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
    onBack: (updated: SessionDetail) => void
}) {
    const [items, setItems] = useState<SessionItem[]>(session.items)
    const [updatingId, setUpdatingId] = useState<string | null>(null)
    const isPast = session.month.slice(0, 10) < currentMonthStart

    const groupMap = new Map(groups.map(g => [g.id, g.name]))

    // Group items by group_id
    const grouped = new Map<string, SessionItem[]>()
    for (const item of items) {
        const key = item.expense.group_id ?? '__none__'
        if (!grouped.has(key)) grouped.set(key, [])
        grouped.get(key)!.push(item)
    }

    // Compute totals from item statuses
    const totalAllocated = items.reduce((s, i) => s + i.allocated_amount, 0)
    const totalPaid = items.filter(i => i.status === 'paid').reduce((s, i) => s + i.allocated_amount, 0)

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
                    onClick={() => onBack({ ...session, items })}
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

            {/* Summary */}
            <div className="flex gap-3 flex-wrap">
                <div className="bg-slate-50 rounded-2xl px-5 py-3">
                    <p className="text-xs text-slate-400 font-medium">Allocated</p>
                    <p className="text-lg font-black text-slate-800">{fmt(totalAllocated)}</p>
                </div>
                <div className="bg-emerald-50 rounded-2xl px-5 py-3">
                    <p className="text-xs text-emerald-500 font-medium">Paid</p>
                    <p className="text-lg font-black text-emerald-700">{fmt(totalPaid)}</p>
                </div>
                <div className="bg-sky-50 rounded-2xl px-5 py-3">
                    <p className="text-xs text-sky-500 font-medium">Items</p>
                    <p className="text-lg font-black text-sky-700">{items.length}</p>
                </div>
            </div>

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
                                            const disabled = isPast || isUpdating
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
    const { household } = useHousehold()
    const [sessions, setSessions] = useState<SessionSummary[]>([])
    const [groups, setGroups] = useState<ExpenseGroup[]>([])
    const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null)
    const [loading, setLoading] = useState(true)
    const [startingSession, setStartingSession] = useState(false)
    const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null)

    const today = new Date()
    const currentYear = today.getFullYear()
    const currentMonthIdx = today.getMonth()  // 0-based
    const currMonthStart = monthStart(currentYear, currentMonthIdx)

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
    // Key: "YYYY-MM" → session summary
    const sessionsByMonth = new Map(
        sessions.map(s => [s.month.slice(0, 7), s])
    )

    return (
        <div className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{currentYear}</p>

            <div className="grid grid-cols-3 gap-3">
                {MONTH_NAMES.map((name, idx) => {
                    const mStart = monthStart(currentYear, idx)
                    const monthKey = mStart.slice(0, 7)  // "YYYY-MM"
                    const session = sessionsByMonth.get(monthKey)
                    const isFuture = mStart > currMonthStart
                    const isCurrent = mStart === currMonthStart
                    const isLoading = loadingSessionId === session?.id

                    // Future months
                    if (isFuture) {
                        return (
                            <div key={idx} className="rounded-2xl border border-slate-100 bg-slate-50 p-4 opacity-40">
                                <p className="text-sm font-bold text-slate-400">{name}</p>
                                <p className="text-xs text-slate-300 mt-1">Upcoming</p>
                            </div>
                        )
                    }

                    // Past month, no session
                    if (!session && !isCurrent) {
                        return (
                            <div key={idx} className="rounded-2xl border border-slate-100 bg-white p-4">
                                <p className="text-sm font-bold text-slate-500">{name}</p>
                                <p className="text-xs text-slate-300 mt-1">No budget</p>
                            </div>
                        )
                    }

                    // Current month, no session
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
                                    {startingSession ? 'Starting…' : 'Start this month\'s budget'}
                                </button>
                            </div>
                        )
                    }

                    // Has session (past or current)
                    const allocated = session!.total_allocated ?? 0
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
                            <p className={`text-sm font-bold ${isCurrent ? 'text-sky-700' : 'text-slate-700'}`}>
                                {name}
                            </p>
                            {isCurrent && <p className="text-xs text-sky-400 mt-0.5">Current month</p>}
                            <p className="text-xs text-slate-400 mt-2">{fmt(allocated)}</p>
                            <span className={`inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                                session!.status === 'closed'
                                    ? 'bg-emerald-50 text-emerald-600'
                                    : 'bg-amber-50 text-amber-600'
                            }`}>
                                {session!.status}
                            </span>
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
