'use client'

import { useEffect, useState } from 'react'
import { useHousehold } from '@/context/HouseholdContext'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api'
import { toast } from 'sonner'
import { ArrowLeft, Trash2 } from 'lucide-react'

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
    expense_id: string | null
    expense: Expense | null
    notes: string | null
    reference_number: string | null
    ad_hoc_name: string | null
    ad_hoc_amount: number | string | null
    allocated_amount: number
    status: string   // todo | paid | reserved | na
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
    onSessionUpdate,
}: {
    session: SessionDetail
    groups: ExpenseGroup[]
    currentMonthStart: string
    householdId: string
    onBack: () => void
    onSessionUpdate: (id: string, status: string) => void
}) {
    const [items, setItems] = useState<SessionItem[]>(session.items)
    const [updatingId, setUpdatingId] = useState<string | null>(null)
    const [pendingNa, setPendingNa] = useState<{ itemId: string; note: string } | null>(null)
    const [pendingPaidRef, setPendingPaidRef] = useState<{ itemId: string; ref: string } | null>(null)
    const [showAdHocForm, setShowAdHocForm] = useState(false)
    const [adHocName, setAdHocName] = useState('')
    const [adHocAmount, setAdHocAmount] = useState('')
    const [addingAdHoc, setAddingAdHoc] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [sessionStatus, setSessionStatus] = useState(session.status)
    const [closingSession, setClosingSession] = useState(false)
    const [resetting, setResetting] = useState(false)
    const [showResetConfirm, setShowResetConfirm] = useState(false)

    const isPast = session.month.slice(0, 10) < currentMonthStart
    const isReadOnly = isPast || sessionStatus === 'closed'
    const groupMap = new Map(groups.map(g => [g.id, g.name]))

    function requiresRef(item: SessionItem): boolean {
        if (!item.expense_id) return false
        const name = item.expense?.name?.toLowerCase() ?? ''
        const groupName = groupMap.get(item.expense?.group_id ?? '')?.toLowerCase() ?? ''
        return name.includes('rent') || groupName === 'education'
    }

    const grouped = new Map<string, SessionItem[]>()
    for (const item of items) {
        const key = item.expense_id === null
            ? '__adhoc__'
            : (item.expense?.group_id ?? '__none__')
        if (!grouped.has(key)) grouped.set(key, [])
        grouped.get(key)!.push(item)
    }
    const adHocItems = grouped.get('__adhoc__') ?? []
    const libraryGroups = [...grouped.entries()].filter(([k]) => k !== '__adhoc__')

    const freedUp = items
        .filter(i => i.expense_id !== null && i.status === 'na')
        .reduce((s, i) => s + Number(i.allocated_amount), 0)
    const adHocUsed = adHocItems.reduce((s, i) => s + Number(i.allocated_amount), 0)
    const adHocAvailable = Math.max(freedUp - adHocUsed, 0)

    const totalOriginalAllocated = items.reduce((s, i) => s + Number(i.allocated_amount), 0)
    const totalAllocated = items.filter(i => i.status !== 'na').reduce((s, i) => s + Number(i.allocated_amount), 0)
    const totalPaid      = items.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.allocated_amount), 0)
    const totalReserved  = items.filter(i => i.status === 'reserved').reduce((s, i) => s + Number(i.allocated_amount), 0)
    const totalTodo      = items.filter(i => i.status === 'todo').reduce((s, i) => s + Number(i.allocated_amount), 0)
    const totalRemaining = totalAllocated - totalPaid - totalReserved
    const countPaid     = items.filter(i => i.status === 'paid').length
    const countReserved = items.filter(i => i.status === 'reserved').length
    const countTodo     = items.filter(i => i.status === 'todo').length
    const countNa       = items.filter(i => i.status === 'na').length

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

    async function confirmNa(itemId: string, note: string) {
        setUpdatingId(itemId)
        try {
            const updated = await apiPatch<SessionItem>(
                `/api/households/${householdId}/budget/sessions/${session.id}/items/${itemId}`,
                { status: 'na', notes: note }
            )
            setItems(prev => prev.map(i => i.id === itemId ? updated : i))
            setPendingNa(null)
        } catch {
            toast.error('Failed to update status')
        } finally {
            setUpdatingId(null)
        }
    }

    async function confirmPaid(itemId: string, ref: string) {
        setUpdatingId(itemId)
        try {
            const updated = await apiPatch<SessionItem>(
                `/api/households/${householdId}/budget/sessions/${session.id}/items/${itemId}`,
                { status: 'paid', reference_number: ref }
            )
            setItems(prev => prev.map(i => i.id === itemId ? updated : i))
            setPendingPaidRef(null)
        } catch {
            toast.error('Failed to update status')
        } finally {
            setUpdatingId(null)
        }
    }

    async function addAdHoc() {
        const trimmedName = adHocName.trim()
        const parsedAmount = parseFloat(adHocAmount)
        if (!trimmedName || isNaN(parsedAmount) || parsedAmount <= 0) return
        setAddingAdHoc(true)
        try {
            const created = await apiPost<SessionItem>(
                `/api/households/${householdId}/budget/sessions/${session.id}/items`,
                { name: trimmedName, amount: parsedAmount }
            )
            setItems(prev => [created, ...prev])
            setAdHocName('')
            setAdHocAmount('')
            setShowAdHocForm(false)
        } catch {
            toast.error('Failed to add expense')
        } finally {
            setAddingAdHoc(false)
        }
    }

    async function deleteAdHoc(itemId: string) {
        setDeletingId(itemId)
        try {
            await apiDelete(`/api/households/${householdId}/budget/sessions/${session.id}/items/${itemId}`)
            setItems(prev => prev.filter(i => i.id !== itemId))
        } catch {
            toast.error('Failed to delete expense')
        } finally {
            setDeletingId(null)
        }
    }

    async function closeSession() {
        setClosingSession(true)
        try {
            await apiPatch(`/api/households/${householdId}/budget/sessions/${session.id}`, { status: 'closed' })
            setSessionStatus('closed')
            onSessionUpdate(session.id, 'closed')
            toast.success(`${session.name} marked as complete`)
        } catch {
            toast.error('Failed to close session')
        } finally {
            setClosingSession(false)
        }
    }

    async function resetSession() {
        setResetting(true)
        try {
            const data = await apiPost<SessionDetail>(
                `/api/households/${householdId}/budget/sessions/${session.id}/reset`,
                {}
            )
            setItems(data.items)
            setShowResetConfirm(false)
            toast.success(`${session.name} reset to default`)
        } catch {
            toast.error('Failed to reset session')
        } finally {
            setResetting(false)
        }
    }

    function renderItemRow(item: SessionItem, isLast: boolean) {
        const isUpdating = updatingId === item.id
        const disabled = isReadOnly || isUpdating
        const isAdHoc = item.expense_id === null
        const displayName = isAdHoc ? (item.ad_hoc_name ?? 'One-time expense') : (item.expense?.name ?? 'Unknown expense')
        const isPendingNa = pendingNa?.itemId === item.id

        return (
            <div key={item.id} className={!isLast ? 'border-b border-slate-100' : ''}>
                <div className="flex items-center gap-4 px-5 py-4">
                    <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold truncate ${item.status === 'na' ? 'text-slate-400' : 'text-slate-800'}`}>
                            {displayName}
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
                                    onClick={() => {
                                        if (isActive || disabled) return
                                        if (pendingNa?.itemId === item.id) setPendingNa(null)
                                        if (pendingPaidRef?.itemId === item.id) setPendingPaidRef(null)
                                        if (s === 'na') {
                                            setPendingNa({ itemId: item.id, note: '' })
                                        } else if (s === 'paid' && requiresRef(item)) {
                                            setPendingPaidRef({ itemId: item.id, ref: '' })
                                        } else {
                                            updateStatus(item.id, s)
                                        }
                                    }}
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
                        {isAdHoc && !isReadOnly && (
                            <button
                                onClick={() => deleteAdHoc(item.id)}
                                disabled={deletingId === item.id}
                                className="ml-1 p-1 text-slate-300 hover:text-red-400 transition-colors disabled:opacity-40">
                                <Trash2 className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                </div>
                {item.status === 'na' && item.notes && !isPendingNa && (
                    <div className="mx-5 mb-3 px-3 py-2 rounded-lg bg-slate-100 border-l-2 border-slate-300">
                        <p className="text-xs text-slate-500 italic">{item.notes}</p>
                    </div>
                )}
                {item.status === 'paid' && item.reference_number && (
                    <div className="mx-5 mb-3 px-3 py-2 rounded-lg bg-emerald-50 border-l-2 border-emerald-300">
                        <p className="text-xs text-emerald-600 font-medium">Ref: {item.reference_number}</p>
                    </div>
                )}
                {pendingPaidRef?.itemId === item.id && (
                    <div className="px-5 pb-4 space-y-2 border-t border-slate-100 pt-3">
                        <p className="text-xs font-medium text-slate-600">Payment reference number <span className="text-red-400">*</span></p>
                        <input
                            type="text"
                            autoFocus
                            placeholder="e.g. TXN-2026-06-001"
                            value={pendingPaidRef.ref}
                            onChange={e => setPendingPaidRef({ ...pendingPaidRef, ref: e.target.value })}
                            className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-white"
                        />
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => confirmPaid(item.id, pendingPaidRef.ref)}
                                disabled={!pendingPaidRef.ref.trim() || isUpdating}
                                className="text-xs font-semibold bg-emerald-600 text-white rounded-lg px-3 py-1.5 disabled:opacity-40 hover:bg-emerald-700 transition-colors">
                                Confirm Paid
                            </button>
                            <button
                                onClick={() => setPendingPaidRef(null)}
                                className="text-xs text-slate-500 hover:text-slate-700 transition-colors">
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
                {isPendingNa && (
                    <div className="px-5 pb-4 space-y-2 border-t border-slate-100 pt-3">
                        <textarea
                            className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-slate-300"
                            placeholder="Why is this N/A? (required)"
                            rows={2}
                            value={pendingNa.note}
                            onChange={e => setPendingNa({ ...pendingNa, note: e.target.value })}
                        />
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => confirmNa(item.id, pendingNa.note)}
                                disabled={!pendingNa.note.trim() || isUpdating}
                                className="text-xs font-semibold bg-slate-700 text-white rounded-lg px-3 py-1.5 disabled:opacity-40 hover:bg-slate-800 transition-colors">
                                Confirm N/A
                            </button>
                            <button
                                onClick={() => setPendingNa(null)}
                                className="text-xs text-slate-500 hover:text-slate-700 transition-colors">
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </div>
        )
    }

    const showAdHocSection = adHocItems.length > 0 || (!isReadOnly && showAdHocForm) || freedUp > 0

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
                {sessionStatus === 'closed' && (
                    <span className="text-xs font-semibold bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full">
                        Complete
                    </span>
                )}
                {isPast && sessionStatus !== 'closed' && (
                    <span className="text-xs font-semibold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                        Read-only
                    </span>
                )}
                {!isReadOnly && (
                    <div className="ml-auto flex items-center gap-2">
                        {showResetConfirm ? (
                            <>
                                <span className="text-xs text-slate-500">Reset all items to default?</span>
                                <button
                                    onClick={resetSession}
                                    disabled={resetting}
                                    className="text-xs font-semibold bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                                    {resetting ? 'Resetting…' : 'Yes, reset'}
                                </button>
                                <button
                                    onClick={() => setShowResetConfirm(false)}
                                    className="text-xs text-slate-500 hover:text-slate-700 transition-colors">
                                    Cancel
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={() => setShowResetConfirm(true)}
                                className="text-xs font-semibold text-slate-400 hover:text-red-500 border border-slate-200 hover:border-red-200 px-3 py-1.5 rounded-lg transition-colors">
                                Clear & Reset
                            </button>
                        )}
                        <button
                            onClick={closeSession}
                            disabled={closingSession}
                            className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                            {closingSession ? 'Saving…' : 'Mark as Complete'}
                        </button>
                    </div>
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

            {/* Freed-up budget row — appears once any item is marked N/A */}
            {freedUp > 0 && (
                <div className="grid grid-cols-2 gap-3">
                    <StatCard
                        label="Freed Up (N/A)"
                        value={fmt(freedUp)}
                        sub={`${items.filter(i => i.status === 'na' && i.expense_id !== null).length} expense(s) skipped`}
                        colorClass="bg-violet-50"
                        labelClass="text-violet-500"
                        valueClass="text-violet-700"
                    />
                    <StatCard
                        label="Available for Ad-hoc"
                        value={fmt(adHocAvailable)}
                        sub={adHocUsed > 0 ? `${fmt(adHocUsed)} used` : 'No one-time expenses yet'}
                        colorClass="bg-sky-50"
                        labelClass="text-sky-500"
                        valueClass="text-sky-700"
                    />
                </div>
            )}

            {/* Progress bar */}
            {items.length > 0 && (
                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <p className="text-xs font-medium text-slate-400">Status distribution</p>
                        <p className="text-xs text-slate-400">{items.length} item{items.length !== 1 ? 's' : ''}</p>
                    </div>
                    {totalOriginalAllocated > 0 && (
                        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
                            <div className="h-full bg-emerald-400 transition-all duration-500"
                                style={{ width: `${(totalPaid / totalOriginalAllocated) * 100}%` }} />
                            <div className="h-full bg-amber-300 transition-all duration-500"
                                style={{ width: `${(totalReserved / totalOriginalAllocated) * 100}%` }} />
                            <div className="h-full bg-slate-300 transition-all duration-500"
                                style={{ width: `${(totalTodo / totalOriginalAllocated) * 100}%` }} />
                            <div className="h-full bg-slate-200 transition-all duration-500"
                                style={{ width: `${(freedUp / totalOriginalAllocated) * 100}%` }} />
                        </div>
                    )}
                    <div className="grid grid-cols-4 gap-3">
                        {([
                            { label: 'Paid',     dot: 'bg-emerald-400', text: 'text-emerald-700', count: countPaid,     amount: totalPaid },
                            { label: 'Reserved', dot: 'bg-amber-300',   text: 'text-amber-600',   count: countReserved, amount: totalReserved },
                            { label: 'To Do',    dot: 'bg-slate-300',   text: 'text-slate-600',   count: countTodo,     amount: totalTodo },
                            { label: 'N/A',      dot: 'bg-slate-200',   text: 'text-slate-400',   count: countNa,       amount: freedUp },
                        ] as const).map(({ label, dot, text, count, amount }) => (
                            <div key={label}>
                                <div className="flex items-center gap-1.5 mb-1">
                                    <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                                    <span className="text-xs text-slate-400">{label}</span>
                                </div>
                                <p className={`text-sm font-bold ${text}`}>{count}</p>
                                <p className="text-xs text-slate-400">{fmtCompact(amount)}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {items.length === 0 && !showAdHocForm && (
                <div className="flex items-center justify-center h-32 rounded-2xl border-2 border-dashed border-slate-200">
                    <p className="text-sm text-slate-400">No expenses found for this session</p>
                </div>
            )}

            {/* Library item groups */}
            {libraryGroups.map(([groupId, groupItems]) => (
                <div key={groupId} className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                        {groupId === '__none__'
                            ? 'Uncategorized'
                            : (groupMap.get(groupId) ?? 'Unknown group')}
                    </p>
                    <div className="rounded-2xl border border-slate-100 overflow-hidden">
                        {groupItems.map((item, idx) =>
                            renderItemRow(item, idx === groupItems.length - 1)
                        )}
                    </div>
                </div>
            ))}

            {/* Ad-hoc section */}
            {showAdHocSection && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                            One-time expenses
                        </p>
                        {freedUp > 0 && (
                            <span className="text-xs text-slate-500">
                                {fmt(adHocAvailable)} available of {fmt(freedUp)} freed
                            </span>
                        )}
                    </div>
                    {adHocItems.length > 0 && (
                        <div className="rounded-2xl border border-slate-100 overflow-hidden">
                            {adHocItems.map((item, idx) =>
                                renderItemRow(item, idx === adHocItems.length - 1)
                            )}
                        </div>
                    )}
                    {!isReadOnly && showAdHocForm && (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                            {adHocAvailable <= 0 ? (
                                <p className="text-xs text-slate-400 italic">
                                    No freed budget — mark expenses as N/A first
                                </p>
                            ) : (
                                <p className="text-xs text-slate-500">
                                    Available: {fmt(adHocAvailable)}
                                </p>
                            )}
                            <input
                                type="text"
                                placeholder="Expense name"
                                value={adHocName}
                                onChange={e => setAdHocName(e.target.value)}
                                disabled={adHocAvailable <= 0}
                                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white disabled:opacity-40"
                            />
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-400 shrink-0">KES</span>
                                <input
                                    type="number"
                                    placeholder="Amount"
                                    min="0"
                                    step="0.01"
                                    value={adHocAmount}
                                    onChange={e => setAdHocAmount(e.target.value)}
                                    disabled={adHocAvailable <= 0}
                                    className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white disabled:opacity-40"
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={addAdHoc}
                                    disabled={
                                        addingAdHoc ||
                                        !adHocName.trim() ||
                                        !adHocAmount ||
                                        adHocAvailable <= 0 ||
                                        parseFloat(adHocAmount) > adHocAvailable
                                    }
                                    className="text-xs font-semibold bg-slate-700 text-white rounded-lg px-4 py-1.5 hover:bg-slate-800 transition-colors disabled:opacity-40">
                                    {addingAdHoc ? 'Adding…' : 'Add'}
                                </button>
                                <button
                                    onClick={() => { setShowAdHocForm(false); setAdHocName(''); setAdHocAmount('') }}
                                    className="text-xs text-slate-500 hover:text-slate-700 transition-colors">
                                    ✕ Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Bottom add button — always accessible when not in form mode */}
            {!isReadOnly && !showAdHocForm && (
                <button
                    onClick={() => setShowAdHocForm(true)}
                    className="w-full text-sm text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl py-3 hover:border-slate-300 hover:text-slate-600 transition-colors">
                    + Add one-time expense
                </button>
            )}
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
    const [startingMonth, setStartingMonth] = useState<string | null>(null)
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

    async function startSession(month: string) {
        if (!household) return
        setStartingMonth(month)
        try {
            const data = await apiPost<SessionDetail>(
                `/api/households/${household.id}/budget/sessions`,
                { month }
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
            setStartingMonth(null)
        }
    }

    function handleSessionUpdate(id: string, status: string) {
        setSessions(prev => prev.map(s => s.id === id ? { ...s, status } : s))
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
                onSessionUpdate={handleSessionUpdate}
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
                    const isStarting = startingMonth === mStart

                    if (!session && !isCurrent && !isFuture) {
                        return (
                            <div key={idx} className="rounded-2xl border border-slate-100 bg-white p-4">
                                <p className="text-sm font-bold text-slate-500">{name}</p>
                                <p className="text-xs text-slate-300 mt-1">No budget</p>
                            </div>
                        )
                    }

                    if (!session && (isCurrent || isFuture)) {
                        const borderColor = isCurrent ? 'border-sky-200 bg-sky-50' : 'border-violet-200 bg-violet-50'
                        const labelColor = isCurrent ? 'text-sky-700' : 'text-violet-700'
                        const subColor = isCurrent ? 'text-sky-400' : 'text-violet-400'
                        const btnColor = isCurrent
                            ? 'bg-sky-500 hover:bg-sky-600'
                            : 'bg-violet-500 hover:bg-violet-600'
                        return (
                            <div key={idx} className={`rounded-2xl border-2 ${borderColor} p-4 flex flex-col gap-3`}>
                                <div>
                                    <p className={`text-sm font-bold ${labelColor}`}>{name}</p>
                                    <p className={`text-xs ${subColor} mt-0.5`}>
                                        {isCurrent ? 'Current month' : 'Future month'}
                                    </p>
                                </div>
                                <button
                                    onClick={() => startSession(mStart)}
                                    disabled={isStarting}
                                    className={`text-xs font-bold ${btnColor} text-white rounded-xl px-3 py-2 transition-colors disabled:opacity-60`}>
                                    {isStarting ? 'Starting…' : "Start this month's budget"}
                                </button>
                            </div>
                        )
                    }

                    // Has session
                    const tileNameColor = isCurrent ? 'text-sky-700' : isFuture ? 'text-violet-700' : 'text-slate-700'
                    const tileBorder = isCurrent
                        ? 'border-sky-200 bg-sky-50 hover:border-sky-300'
                        : isFuture
                            ? 'border-violet-200 bg-violet-50 hover:border-violet-300'
                            : 'border-slate-200 bg-white hover:border-slate-300'

                    return (
                        <button
                            key={idx}
                            onClick={() => openSession(session!.id)}
                            disabled={isLoading}
                            className={`rounded-2xl border p-4 text-left transition-all hover:shadow-md disabled:opacity-70 ${tileBorder}`}>
                            <div className="flex items-start justify-between gap-2">
                                <p className={`text-sm font-bold ${tileNameColor}`}>
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
                            {isFuture && <p className="text-xs text-violet-400 mt-0.5">Future month</p>}
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
