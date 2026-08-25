'use client'

import { useEffect, useState } from 'react'
import { useHousehold } from '@/context/HouseholdContext'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api'
import { toast } from 'sonner'
import { ArrowLeft, Trash2, Plus, GripVertical, Wallet, Tag } from 'lucide-react'
import {
    DndContext,
    closestCenter,
    PointerSensor,
    KeyboardSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core'
import {
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
    arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

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
    account_id: string | null
    tag_assignments: TagAssignment[]
}

interface Account { id: string; name: string }

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
    amount_paid: number
    status: string   // todo | paid | reserved | na
    tag_assignments: TagAssignment[]
    created_at: string
    updated_at: string
}

interface ExtraIncome {
    id: string
    session_id: string
    household_id: string
    amount: number
    narration: string
    created_at: string
}

interface SessionDetail {
    id: string
    month: string
    name: string
    status: string
    items: SessionItem[]
    extra_income: ExtraIncome[]
    monthly_income?: number | null
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
    label, value, sub, colorClass, labelClass, valueClass,
}: {
    label: string; value: string; sub?: string
    colorClass: string; labelClass: string; valueClass: string
}) {
    return (
        <div className={`rounded-2xl px-5 py-4 ${colorClass}`}>
            <p className={`text-xs font-semibold uppercase tracking-wide ${labelClass}`}>{label}</p>
            <p className={`text-xl font-black mt-1 ${valueClass}`}>{value}</p>
            {sub && <p className={`text-xs mt-0.5 ${labelClass} opacity-70`}>{sub}</p>}
        </div>
    )
}

// ─── DnD helpers ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HandleProps = Record<string, any>

function applyOrder<T>(arr: T[], order: string[], getId: (item: T) => string): T[] {
    if (order.length === 0) return arr
    const map = new Map(arr.map(item => [getId(item), item]))
    return [
        ...order.filter(id => map.has(id)).map(id => map.get(id)!),
        ...arr.filter(item => !order.includes(getId(item))),
    ]
}

function SortableGroupWrapper({
    id,
    disabled,
    children,
}: {
    id: string
    disabled: boolean
    children: (handleProps: HandleProps | undefined, isDragging: boolean) => React.ReactNode
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
    return (
        <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>
            {children(disabled ? undefined : { ...listeners, ...attributes }, isDragging)}
        </div>
    )
}

function SortableItemWrapper({
    id,
    disabled,
    isLast,
    render,
}: {
    id: string
    disabled: boolean
    isLast: boolean
    render: (isLast: boolean, handleProps: HandleProps | undefined) => React.ReactNode
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
    return (
        <div
            ref={setNodeRef}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            className={isDragging ? 'opacity-40' : ''}
        >
            {render(isLast, disabled ? undefined : { ...listeners, ...attributes })}
        </div>
    )
}

// ─── Detail view ──────────────────────────────────────────────────

function SessionDetailView({
    session,
    groups,
    accounts,
    tags,
    pastCutoff,
    householdId,
    viewMode,
    currentUserId,
    onBack,
    onSessionUpdate,
}: {
    session: SessionDetail
    groups: ExpenseGroup[]
    accounts: Account[]
    tags: ExpenseTag[]
    pastCutoff: string
    householdId: string
    viewMode: 'household' | 'me'
    currentUserId: string | null
    onBack: () => void
    onSessionUpdate: (id: string, status: string) => void
}) {
    const [items, setItems] = useState<SessionItem[]>(session.items)
    const displayItems = (viewMode === 'me' && currentUserId)
        ? items.filter(i => i.expense_id === null || i.expense?.owner_id === currentUserId)
        : items
    const [updatingId, setUpdatingId] = useState<string | null>(null)
    const [pendingNa, setPendingNa] = useState<{ itemId: string; note: string } | null>(null)
    const [pendingPaidRef, setPendingPaidRef] = useState<{ itemId: string; ref: string; amountPaid: string } | null>(null)
    const [showAdHocForm, setShowAdHocForm] = useState(false)
    const [adHocName, setAdHocName] = useState('')
    const [adHocAmount, setAdHocAmount] = useState('')
    const [addingAdHoc, setAddingAdHoc] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [sessionStatus, setSessionStatus] = useState(session.status)
    const [closingSession, setClosingSession] = useState(false)
    const [resetting, setResetting] = useState(false)
    const [showResetConfirm, setShowResetConfirm] = useState(false)
    const [syncing, setSyncing] = useState(false)
    const [viewByAccount, setViewByAccount] = useState(false)
    const [showUnpaidOnly, setShowUnpaidOnly] = useState(false)
    const [extraIncome, setExtraIncome] = useState<ExtraIncome[]>(session.extra_income ?? [])
    const [showExtraIncomeForm, setShowExtraIncomeForm] = useState(false)
    const [extraIncomeAmount, setExtraIncomeAmount] = useState('')
    const [extraIncomeNarration, setExtraIncomeNarration] = useState('')
    const [addingExtraIncome, setAddingExtraIncome] = useState(false)
    const [deletingExtraIncomeId, setDeletingExtraIncomeId] = useState<string | null>(null)
    const [tagPickerOpenId, setTagPickerOpenId] = useState<string | null>(null)

    async function toggleAdHocItemTag(itemId: string, tagId: string) {
        const item = items.find(i => i.id === itemId)
        if (!item) return
        const currentIds = item.tag_assignments.map(ta => ta.tag.id)
        const isRemoving = currentIds.includes(tagId)
        const newIds = isRemoving ? currentIds.filter(id => id !== tagId) : [...currentIds, tagId]
        const matchedTag = tags.find(t => t.id === tagId)
        setItems(prev => prev.map(i => {
            if (i.id !== itemId) return i
            const newAssignments = isRemoving
                ? i.tag_assignments.filter(ta => ta.tag.id !== tagId)
                : matchedTag ? [...i.tag_assignments, { id: `temp-${tagId}`, tag: matchedTag }] : i.tag_assignments
            return { ...i, tag_assignments: newAssignments }
        }))
        try {
            const updated = await apiPatch<SessionItem>(
                `/api/households/${householdId}/budget/sessions/${session.id}/items/${itemId}`,
                { status: item.status, tag_ids: newIds }
            )
            setItems(prev => prev.map(i => i.id === itemId ? updated : i))
        } catch {
            setItems(prev => prev.map(i => i.id === itemId ? item : i))
            toast.error('Failed to update tag')
        }
    }

    // ── Drag-to-reorder state (persisted in localStorage per session) ──
    const storageKey = `hpm_session_order_${session.id}`
    const [groupOrder, setGroupOrder] = useState<string[]>(() => {
        try { return JSON.parse(localStorage.getItem(storageKey) ?? '{}').groups ?? [] } catch { return [] }
    })
    const [itemOrders, setItemOrders] = useState<Record<string, string[]>>(() => {
        try { return JSON.parse(localStorage.getItem(storageKey) ?? '{}').items ?? {} } catch { return {} }
    })

    function persistOrder(groups: string[], items: Record<string, string[]>) {
        localStorage.setItem(storageKey, JSON.stringify({ groups, items }))
    }

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )

    const isPast = session.month.slice(0, 10) < pastCutoff
    const isReadOnly = isPast || sessionStatus === 'closed'
    const groupMap = new Map(groups.map(g => [g.id, g.name]))

    function requiresRef(item: SessionItem): boolean {
        if (!item.expense_id) return false
        const name = item.expense?.name?.toLowerCase() ?? ''
        const groupName = groupMap.get(item.expense?.group_id ?? '')?.toLowerCase() ?? ''
        return name.includes('rent') || groupName === 'education'
    }

    const grouped = new Map<string, SessionItem[]>()
    for (const item of displayItems) {
        const key = item.expense_id === null
            ? '__adhoc__'
            : (item.expense?.group_id ?? '__none__')
        if (!grouped.has(key)) grouped.set(key, [])
        grouped.get(key)!.push(item)
    }
    const adHocItems = grouped.get('__adhoc__') ?? []
    const libraryGroups = [...grouped.entries()].filter(([k]) => k !== '__adhoc__')

    const orderedLibraryGroups = applyOrder(libraryGroups, groupOrder, ([id]) => id)

    function orderedItemsForGroup(groupId: string, groupItems: SessionItem[]): SessionItem[] {
        return applyOrder(groupItems, itemOrders[groupId] ?? [], i => i.id)
    }

    function handleGroupDragEnd(event: DragEndEvent) {
        const { active, over } = event
        if (!over || active.id === over.id) return
        const ids = orderedLibraryGroups.map(([id]) => id)
        const newOrder = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)))
        setGroupOrder(newOrder)
        persistOrder(newOrder, itemOrders)
    }

    function handleItemDragEnd(groupId: string, groupItems: SessionItem[], event: DragEndEvent) {
        const { active, over } = event
        if (!over || active.id === over.id) return
        const ids = orderedItemsForGroup(groupId, groupItems).map(i => i.id)
        const newItemOrder = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)))
        const newItemOrders = { ...itemOrders, [groupId]: newItemOrder }
        setItemOrders(newItemOrders)
        persistOrder(groupOrder, newItemOrders)
    }

    const freedUp = displayItems
        .filter(i => i.expense_id !== null && i.status === 'na')
        .reduce((s, i) => s + Number(i.allocated_amount), 0)
    const adHocUsed = adHocItems.reduce((s, i) => s + Number(i.allocated_amount), 0)
    const extraIncomeTotal = extraIncome.reduce((s, e) => s + Number(e.amount), 0)
    const adHocAvailable = Math.max(freedUp + extraIncomeTotal - adHocUsed, 0)

    const totalOriginalAllocated = displayItems.reduce((s, i) => s + Number(i.allocated_amount), 0)
    const totalAllocated = displayItems.filter(i => i.status !== 'na').reduce((s, i) => s + Number(i.allocated_amount), 0)
    const totalPaid      = displayItems.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.allocated_amount), 0)
    const totalReserved  = displayItems.filter(i => i.status === 'reserved').reduce((s, i) => s + Number(i.allocated_amount), 0)
    const totalTodo      = displayItems.filter(i => i.status === 'todo').reduce((s, i) => s + Number(i.allocated_amount), 0)
    const totalRemaining = totalAllocated - totalPaid - totalReserved
    const countPaid     = displayItems.filter(i => i.status === 'paid').length
    const countReserved = displayItems.filter(i => i.status === 'reserved').length
    const countTodo     = displayItems.filter(i => i.status === 'todo').length
    const countNa       = displayItems.filter(i => i.status === 'na').length

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

    async function confirmPaid(itemId: string, ref: string, amountPaid: string) {
        setUpdatingId(itemId)
        try {
            const body: Record<string, unknown> = { status: 'paid', reference_number: ref || undefined }
            const parsed = parseFloat(amountPaid)
            if (!isNaN(parsed) && parsed > 0) body.amount_paid = parsed
            const updated = await apiPatch<SessionItem>(
                `/api/households/${householdId}/budget/sessions/${session.id}/items/${itemId}`,
                body
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

    async function addExtraIncome() {
        const parsed = parseFloat(extraIncomeAmount)
        if (isNaN(parsed) || parsed <= 0 || !extraIncomeNarration.trim()) return
        setAddingExtraIncome(true)
        try {
            const created = await apiPost<ExtraIncome>(
                `/api/households/${householdId}/budget/sessions/${session.id}/extra-income`,
                { amount: parsed, narration: extraIncomeNarration.trim() }
            )
            setExtraIncome(prev => [...prev, created])
            setExtraIncomeAmount('')
            setExtraIncomeNarration('')
            setShowExtraIncomeForm(false)
            toast.success('Extra income added')
        } catch {
            toast.error('Failed to add extra income')
        } finally {
            setAddingExtraIncome(false)
        }
    }

    async function deleteExtraIncome(id: string) {
        setDeletingExtraIncomeId(id)
        try {
            await apiDelete(`/api/households/${householdId}/budget/sessions/${session.id}/extra-income/${id}`)
            setExtraIncome(prev => prev.filter(e => e.id !== id))
            toast.success('Extra income removed')
        } catch {
            toast.error('Failed to remove extra income')
        } finally {
            setDeletingExtraIncomeId(null)
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

    async function syncExpenses() {
        setSyncing(true)
        try {
            const data = await apiPost<SessionDetail>(
                `/api/households/${householdId}/budget/sessions/${session.id}/sync-expenses`,
                {}
            )
            setItems(data.items)
            toast.success('Expenses synced from library')
        } catch {
            toast.error('Failed to sync expenses')
        } finally {
            setSyncing(false)
        }
    }

    function renderItemRow(item: SessionItem, isLast: boolean, dragHandleProps?: HandleProps) {
        const isUpdating = updatingId === item.id
        const disabled = isReadOnly || isUpdating
        const isAdHoc = item.expense_id === null
        const displayName = isAdHoc ? (item.ad_hoc_name ?? 'One-time expense') : (item.expense?.name ?? 'Unknown expense')
        const isPendingNa = pendingNa?.itemId === item.id

        return (
            <div key={item.id} className={!isLast ? 'border-b border-slate-100' : ''}>
                <div className="flex items-center gap-3 px-4 py-4">
                    {dragHandleProps && (
                        <button
                            type="button"
                            className="cursor-grab active:cursor-grabbing touch-none shrink-0 text-slate-300 hover:text-slate-400 transition-colors"
                            {...dragHandleProps}
                        >
                            <GripVertical className="h-4 w-4" />
                        </button>
                    )}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <p className={`text-sm font-semibold truncate ${item.status === 'na' ? 'text-slate-400' : 'text-slate-800'}`}>
                                {displayName}
                            </p>
                            {(isAdHoc ? item.tag_assignments : (item.expense?.tag_assignments ?? [])).map(ta => (
                                <span key={ta.id} className="px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white"
                                    style={{ background: ta.tag.color || '#6366f1' }}>
                                    {ta.tag.name}
                                </span>
                            ))}
                        </div>
                        <p className="text-xs text-slate-400">{fmt(item.allocated_amount)}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        {isAdHoc && !isReadOnly && tags.length > 0 && (
                            <div className="relative">
                                <button
                                    onClick={() => setTagPickerOpenId(tagPickerOpenId === item.id ? null : item.id)}
                                    className="p-1 text-slate-300 hover:text-indigo-500 transition-colors"
                                    title="Tag this expense">
                                    <Tag className="h-3.5 w-3.5" />
                                </button>
                                {tagPickerOpenId === item.id && (
                                    <div className="absolute right-0 top-6 z-20 bg-white rounded-xl border border-slate-200 shadow-lg p-2 min-w-[140px]"
                                        style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-2 pb-1.5">Tags</p>
                                        {tags.map(tag => {
                                            const active = item.tag_assignments.some(ta => ta.tag.id === tag.id)
                                            return (
                                                <button
                                                    key={tag.id}
                                                    onClick={() => toggleAdHocItemTag(item.id, tag.id)}
                                                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors text-left">
                                                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                                        style={{ background: tag.color || '#6366f1' }} />
                                                    <span className="text-xs text-slate-700 flex-1">{tag.name}</span>
                                                    {active && <span className="text-[10px] text-indigo-500 font-bold">✓</span>}
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
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
                                        } else if (s === 'paid') {
                                            setPendingPaidRef({ itemId: item.id, ref: '', amountPaid: '' })
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
                {item.status === 'paid' && (
                    <div className="mx-5 mb-3 flex items-center gap-2 flex-wrap">
                        {item.reference_number && (
                            <div className="px-3 py-1.5 rounded-lg bg-emerald-50 border-l-2 border-emerald-300">
                                <p className="text-xs text-emerald-600 font-medium">Ref: {item.reference_number}</p>
                            </div>
                        )}
                        {item.amount_paid > 0 && item.amount_paid !== item.allocated_amount && (() => {
                            const diff = item.amount_paid - item.allocated_amount
                            const over = diff > 0
                            return (
                                <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${over ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-700'}`}>
                                    {over ? `+${fmt(diff)} over` : `${fmt(Math.abs(diff))} saved`}
                                </span>
                            )
                        })()}
                    </div>
                )}
                {pendingPaidRef?.itemId === item.id && (
                    <div className="px-5 pb-4 space-y-2.5 border-t border-slate-100 pt-3">
                        <div className="space-y-1.5">
                            <p className="text-xs font-medium text-slate-600">
                                Actual amount paid
                                <span className="text-slate-400 font-normal ml-1">(leave blank to use budgeted {fmt(item.allocated_amount)})</span>
                            </p>
                            <input
                                type="number"
                                autoFocus
                                placeholder={String(Number(item.allocated_amount))}
                                value={pendingPaidRef.amountPaid}
                                onChange={e => setPendingPaidRef({ ...pendingPaidRef, amountPaid: e.target.value })}
                                className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-white"
                            />
                        </div>
                        {requiresRef(item) && (
                            <div className="space-y-1.5">
                                <p className="text-xs font-medium text-slate-600">Reference number <span className="text-red-400">*</span></p>
                                <input
                                    type="text"
                                    placeholder="e.g. TXN-2026-06-001"
                                    value={pendingPaidRef.ref}
                                    onChange={e => setPendingPaidRef({ ...pendingPaidRef, ref: e.target.value })}
                                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-white"
                                />
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => confirmPaid(item.id, pendingPaidRef.ref, pendingPaidRef.amountPaid)}
                                disabled={(requiresRef(item) && !pendingPaidRef.ref.trim()) || isUpdating}
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

    const showAdHocSection = adHocItems.length > 0 || (!isReadOnly && showAdHocForm) || freedUp > 0 || extraIncomeTotal > 0

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
                <div className="ml-auto flex items-center gap-3">
                    <div className="flex items-center bg-slate-100 rounded-xl p-0.5">
                        <button
                            onClick={() => setViewByAccount(false)}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${!viewByAccount ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                            By Group
                        </button>
                        <button
                            onClick={() => setViewByAccount(true)}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${viewByAccount ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                            By Account
                        </button>
                    </div>
                    {(() => {
                        const unpaidCount = displayItems.filter(i => i.status === 'todo' || i.status === 'reserved').length
                        return (
                            <button
                                onClick={() => setShowUnpaidOnly(p => !p)}
                                className={`text-xs font-bold px-3 py-1 rounded-xl border transition-all flex items-center gap-1.5 ${showUnpaidOnly ? 'bg-amber-50 text-amber-700 border-amber-200' : 'text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600'}`}>
                                Unpaid only
                                {unpaidCount > 0 && (
                                    <span className={`font-black ${showUnpaidOnly ? 'text-amber-500' : 'text-slate-400'}`}>
                                        {unpaidCount}
                                    </span>
                                )}
                            </button>
                        )
                    })()}
                    {!isReadOnly && <div className="flex items-center gap-2">
                        {sessionStatus === 'draft' && (
                            <button
                                onClick={syncExpenses}
                                disabled={syncing}
                                title="Update amounts from current expense library and add any new expenses"
                                className="text-xs font-semibold text-sky-600 hover:text-sky-700 border border-sky-200 hover:border-sky-300 bg-sky-50 hover:bg-sky-100 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5">
                                {syncing
                                    ? <span className="w-3 h-3 rounded-full border-2 border-sky-400 border-t-transparent animate-spin inline-block" />
                                    : <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4s1-2 5-2a6 6 0 0 1 6 6"/><path d="M15 12s-1 2-5 2a6 6 0 0 1-6-6"/><polyline points="1 1 1 4 4 4"/><polyline points="15 15 15 12 12 12"/></svg>
                                }
                                {syncing ? 'Syncing…' : 'Sync from Library'}
                            </button>
                        )}
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
                    </div>}
                </div>
            </div>

            {/* Velocity indicator — current month active session only */}
            {sessionStatus === 'active' && session.month.slice(0, 7) === new Date().toISOString().slice(0, 7) && (() => {
                const today = new Date()
                const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
                const daysElapsed = today.getDate()
                const timePct = daysElapsed / daysInMonth
                const paidPct = totalOriginalAllocated > 0 ? totalPaid / totalOriginalAllocated : 0
                const pace = paidPct - timePct
                const isAhead = pace > 0.1
                const isBehind = pace < -0.15
                const paceLabel = isAhead ? 'Ahead of pace' : isBehind ? 'Behind pace' : 'On track'
                const barColor = isAhead ? 'bg-emerald-400' : isBehind ? 'bg-red-400' : 'bg-sky-400'
                const textColor = isAhead ? 'text-emerald-600' : isBehind ? 'text-red-500' : 'text-sky-600'
                const bgColor = isAhead ? 'bg-emerald-50 border-emerald-100' : isBehind ? 'bg-red-50 border-red-100' : 'bg-sky-50 border-sky-100'

                return (
                    <div className={`rounded-2xl border px-5 py-4 ${bgColor}`}>
                        <div className="flex items-center justify-between mb-2.5">
                            <p className="text-xs font-semibold text-slate-500">
                                Day {daysElapsed} of {daysInMonth} &middot; {(timePct * 100).toFixed(0)}% through the month
                            </p>
                            <span className={`text-xs font-black ${textColor}`}>{paceLabel}</span>
                        </div>
                        <div className="relative h-2 bg-white/60 rounded-full overflow-hidden">
                            {/* Ghost: time elapsed */}
                            <div className="absolute inset-y-0 left-0 bg-slate-200 rounded-full"
                                style={{ width: `${(timePct * 100).toFixed(1)}%` }} />
                            {/* Paid bar */}
                            <div className={`absolute inset-y-0 left-0 rounded-full transition-all ${barColor}`}
                                style={{ width: `${Math.min(paidPct * 100, 100).toFixed(1)}%` }} />
                        </div>
                        <div className="flex items-center justify-between mt-1.5 text-xs text-slate-400">
                            <span>{fmt(totalPaid)} paid of {fmt(totalOriginalAllocated)}</span>
                            <span>{(paidPct * 100).toFixed(0)}% budget paid</span>
                        </div>
                    </div>
                )
            })()}

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

            {/* Income vs allocated — shown when historical income is available */}
            {session.monthly_income != null && session.monthly_income > 0 && (
                <div className="grid grid-cols-2 gap-3">
                    <StatCard
                        label="Monthly Income"
                        value={fmt(Number(session.monthly_income))}
                        sub="at time of session"
                        colorClass="bg-sky-50"
                        labelClass="text-sky-500"
                        valueClass="text-sky-700"
                    />
                    <StatCard
                        label="Unallocated"
                        value={fmt(Math.max(Number(session.monthly_income) - totalAllocated, 0))}
                        sub={Number(session.monthly_income) < totalAllocated ? 'Over-budgeted' : 'Unplanned buffer'}
                        colorClass={Number(session.monthly_income) < totalAllocated ? 'bg-red-50' : 'bg-violet-50'}
                        labelClass={Number(session.monthly_income) < totalAllocated ? 'text-red-400' : 'text-violet-500'}
                        valueClass={Number(session.monthly_income) < totalAllocated ? 'text-red-600' : 'text-violet-700'}
                    />
                </div>
            )}

            {/* Extra income section */}
            {(!isReadOnly || extraIncome.length > 0) && (
                <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-sky-500">Extra Income</p>
                            {extraIncomeTotal > 0 && (
                                <p className="text-base font-black text-sky-700 mt-0.5">{fmt(extraIncomeTotal)}</p>
                            )}
                        </div>
                        {!isReadOnly && !showExtraIncomeForm && (
                            <button
                                onClick={() => setShowExtraIncomeForm(true)}
                                className="flex items-center gap-1.5 text-xs font-semibold text-sky-600 hover:text-sky-800 border border-sky-200 hover:border-sky-400 bg-white hover:bg-sky-50 px-3 py-1.5 rounded-lg transition-colors">
                                <Plus className="h-3.5 w-3.5" />
                                Add income
                            </button>
                        )}
                    </div>
                    {extraIncome.length > 0 && (
                        <div className="divide-y divide-sky-100">
                            {extraIncome.map(e => (
                                <div key={e.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-sky-800 truncate">{e.narration}</p>
                                        <p className="text-xs text-sky-500">{fmt(e.amount)}</p>
                                    </div>
                                    {!isReadOnly && (
                                        <button
                                            onClick={() => deleteExtraIncome(e.id)}
                                            disabled={deletingExtraIncomeId === e.id}
                                            className="p-1 text-sky-300 hover:text-red-400 transition-colors disabled:opacity-40 shrink-0">
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                    {extraIncome.length === 0 && !showExtraIncomeForm && (
                        <p className="text-xs text-sky-400 italic">
                            No extra income added yet — add one-off income to expand the ad-hoc pool
                        </p>
                    )}
                    {showExtraIncomeForm && (
                        <div className="border-t border-sky-100 pt-3 space-y-2.5">
                            <input
                                type="text"
                                placeholder="Narration (e.g. Freelance project, bonus…)"
                                value={extraIncomeNarration}
                                onChange={e => setExtraIncomeNarration(e.target.value)}
                                className="w-full text-sm border border-sky-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white"
                            />
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-sky-400 shrink-0">KES</span>
                                <input
                                    type="number"
                                    placeholder="Amount"
                                    min="0"
                                    step="0.01"
                                    value={extraIncomeAmount}
                                    onChange={e => setExtraIncomeAmount(e.target.value)}
                                    className="flex-1 text-sm border border-sky-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white"
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={addExtraIncome}
                                    disabled={addingExtraIncome || !extraIncomeNarration.trim() || !extraIncomeAmount || parseFloat(extraIncomeAmount) <= 0}
                                    className="text-xs font-semibold bg-sky-600 text-white rounded-lg px-4 py-1.5 hover:bg-sky-700 transition-colors disabled:opacity-40">
                                    {addingExtraIncome ? 'Adding…' : 'Add Income'}
                                </button>
                                <button
                                    onClick={() => { setShowExtraIncomeForm(false); setExtraIncomeAmount(''); setExtraIncomeNarration('') }}
                                    className="text-xs text-slate-500 hover:text-slate-700 transition-colors">
                                    ✕ Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Freed-up budget row — appears once any item is marked N/A or extra income added */}
            {(freedUp > 0 || extraIncomeTotal > 0) && (
                <div className="grid grid-cols-2 gap-3">
                    <StatCard
                        label="Freed Up (N/A)"
                        value={fmt(freedUp)}
                        sub={`${displayItems.filter(i => i.status === 'na' && i.expense_id !== null).length} expense(s) skipped`}
                        colorClass="bg-violet-50"
                        labelClass="text-violet-500"
                        valueClass="text-violet-700"
                    />
                    <StatCard
                        label="Available for Ad-hoc"
                        value={fmt(adHocAvailable)}
                        sub={adHocUsed > 0 ? `${fmt(adHocUsed)} used` : 'Freed + extra income pool'}
                        colorClass="bg-sky-50"
                        labelClass="text-sky-500"
                        valueClass="text-sky-700"
                    />
                </div>
            )}

            {/* Progress bar */}
            {displayItems.length > 0 && (
                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <p className="text-xs font-medium text-slate-400">Status distribution</p>
                        <p className="text-xs text-slate-400">{displayItems.length} item{displayItems.length !== 1 ? 's' : ''}</p>
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

            {displayItems.length === 0 && !showAdHocForm && (
                <div className="flex items-center justify-center h-32 rounded-2xl border-2 border-dashed border-slate-200">
                    <p className="text-sm text-slate-400">No expenses found for this session</p>
                </div>
            )}

            {/* ── By Account view ── */}
            {viewByAccount && displayItems.length > 0 && (() => {
                const accountViewItems = showUnpaidOnly
                    ? displayItems.filter(i => i.status === 'todo' || i.status === 'reserved')
                    : displayItems
                if (accountViewItems.length === 0) return (
                    <div className="flex flex-col items-center justify-center h-32 rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50">
                        <span className="text-2xl">🎉</span>
                        <p className="text-sm font-bold text-emerald-600 mt-2">All caught up!</p>
                        <p className="text-xs text-emerald-400 mt-0.5">No unpaid expenses this month</p>
                    </div>
                )
                const byAccount = new Map<string | null, SessionItem[]>()
                for (const item of accountViewItems) {
                    const accountId = item.expense?.account_id ?? null
                    if (!byAccount.has(accountId)) byAccount.set(accountId, [])
                    byAccount.get(accountId)!.push(item)
                }

                const groups: { id: string | null; name: string; acctItems: SessionItem[] }[] = []
                for (const [accountId, acctItems] of byAccount.entries()) {
                    if (accountId === null) continue
                    const acc = accounts.find(a => a.id === accountId)
                    groups.push({ id: accountId, name: acc?.name ?? 'Unknown Account', acctItems })
                }
                groups.sort((a, b) => {
                    const ta = a.acctItems.reduce((s, i) => s + Number(i.allocated_amount), 0)
                    const tb = b.acctItems.reduce((s, i) => s + Number(i.allocated_amount), 0)
                    return tb - ta
                })
                const noAcctItems = byAccount.get(null) ?? []
                if (noAcctItems.length > 0) {
                    groups.push({ id: null, name: 'No Account', acctItems: noAcctItems })
                }

                return (
                    <div className="space-y-6">
                        {groups.map(({ id, name, acctItems }) => {
                            const total = acctItems.reduce((s, i) => s + Number(i.allocated_amount), 0)
                            const naTotal = acctItems
                                .filter(i => i.status === 'na')
                                .reduce((s, i) => s + Number(i.allocated_amount), 0)
                            const activeTotal = total - naTotal
                            const hasNa = naTotal > 0
                            return (
                                <div key={id ?? '__none__'} className="space-y-2">
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                        <div className="flex items-center gap-2">
                                            {id
                                                ? <Wallet className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                                                : <span className="text-xs text-slate-300 flex-shrink-0">—</span>}
                                            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{name}</p>
                                        </div>
                                        <div className="flex items-center gap-2 text-right">
                                            {hasNa && (
                                                <>
                                                    <span className="text-xs text-slate-400">{fmt(total)} total</span>
                                                    <span className="text-xs text-slate-300">·</span>
                                                </>
                                            )}
                                            <span className="text-xs font-bold text-slate-700">
                                                {fmt(activeTotal)}
                                            </span>
                                            {hasNa && (
                                                <span className="text-xs text-slate-400 whitespace-nowrap">
                                                    (−{fmt(naTotal)} N/A)
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="rounded-2xl border border-slate-100 overflow-hidden">
                                        {acctItems.map((item, idx) =>
                                            renderItemRow(item, idx === acctItems.length - 1)
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )
            })()}

            {/* ── Unpaid-only + by-group static view ── */}
            {showUnpaidOnly && !viewByAccount && (() => {
                const unpaidItems = displayItems.filter(i => i.status === 'todo' || i.status === 'reserved')
                if (unpaidItems.length === 0) return (
                    <div className="flex flex-col items-center justify-center h-32 rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50">
                        <span className="text-2xl">🎉</span>
                        <p className="text-sm font-bold text-emerald-600 mt-2">All caught up!</p>
                        <p className="text-xs text-emerald-400 mt-0.5">No unpaid expenses this month</p>
                    </div>
                )
                const filteredGrouped = new Map<string, SessionItem[]>()
                for (const item of unpaidItems) {
                    const key = item.expense_id === null ? '__adhoc__' : (item.expense?.group_id ?? '__none__')
                    if (!filteredGrouped.has(key)) filteredGrouped.set(key, [])
                    filteredGrouped.get(key)!.push(item)
                }
                const filteredLibraryGroups = [...filteredGrouped.entries()].filter(([k]) => k !== '__adhoc__')
                const filteredAdHoc = filteredGrouped.get('__adhoc__') ?? []
                return (
                    <div className="space-y-6">
                        {filteredLibraryGroups.map(([groupId, groupItems]) => {
                            const ordered = orderedItemsForGroup(groupId, groupItems)
                            return (
                                <div key={groupId} className="space-y-2">
                                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                                        {groupId === '__none__' ? 'Uncategorized' : (groupMap.get(groupId) ?? 'Unknown group')}
                                    </p>
                                    <div className="rounded-2xl border border-slate-100 overflow-hidden">
                                        {ordered.map((item, idx) => renderItemRow(item, idx === ordered.length - 1))}
                                    </div>
                                </div>
                            )
                        })}
                        {filteredAdHoc.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">One-time expenses</p>
                                <div className="rounded-2xl border border-slate-100 overflow-hidden">
                                    {filteredAdHoc.map((item, idx) => renderItemRow(item, idx === filteredAdHoc.length - 1))}
                                </div>
                            </div>
                        )}
                    </div>
                )
            })()}

            {/* Library item groups — drag to reorder sections and items */}
            {!viewByAccount && !showUnpaidOnly && <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleGroupDragEnd}>
                <SortableContext items={orderedLibraryGroups.map(([id]) => id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-6">
                        {orderedLibraryGroups.map(([groupId, groupItems]) => {
                            const ordered = orderedItemsForGroup(groupId, groupItems)
                            return (
                                <SortableGroupWrapper key={groupId} id={groupId} disabled={isReadOnly}>
                                    {(groupHandleProps, isDraggingGroup) => (
                                        <div className={`space-y-2 ${isDraggingGroup ? 'opacity-40' : ''}`}>
                                            <div className="flex items-center gap-2">
                                                {!isReadOnly && groupHandleProps && (
                                                    <button
                                                        type="button"
                                                        className="cursor-grab active:cursor-grabbing touch-none text-slate-300 hover:text-slate-500 transition-colors"
                                                        {...groupHandleProps}
                                                    >
                                                        <GripVertical className="h-4 w-4" />
                                                    </button>
                                                )}
                                                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                                                    {groupId === '__none__' ? 'Uncategorized' : (groupMap.get(groupId) ?? 'Unknown group')}
                                                </p>
                                            </div>
                                            <DndContext
                                                sensors={sensors}
                                                collisionDetection={closestCenter}
                                                onDragEnd={(e) => handleItemDragEnd(groupId, groupItems, e)}
                                            >
                                                <SortableContext items={ordered.map(i => i.id)} strategy={verticalListSortingStrategy}>
                                                    <div className="rounded-2xl border border-slate-100 overflow-hidden">
                                                        {ordered.map((item, idx) => (
                                                            <SortableItemWrapper
                                                                key={item.id}
                                                                id={item.id}
                                                                disabled={isReadOnly}
                                                                isLast={idx === ordered.length - 1}
                                                                render={(isLast, hp) => renderItemRow(item, isLast, hp)}
                                                            />
                                                        ))}
                                                    </div>
                                                </SortableContext>
                                            </DndContext>
                                        </div>
                                    )}
                                </SortableGroupWrapper>
                            )
                        })}
                    </div>
                </SortableContext>
            </DndContext>}

            {/* Ad-hoc section */}
            {!viewByAccount && !showUnpaidOnly && showAdHocSection && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                            One-time expenses
                        </p>
                        {(freedUp > 0 || extraIncomeTotal > 0) && (
                            <span className="text-xs text-slate-500">
                                {fmt(adHocAvailable)} available
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
                                    No pool available — mark expenses as N/A or add extra income first
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
            {!isReadOnly && !showAdHocForm && !showUnpaidOnly && (
                <button
                    onClick={() => setShowAdHocForm(true)}
                    className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-violet-700 bg-violet-50 border-2 border-violet-200 rounded-2xl py-3 hover:bg-violet-100 hover:border-violet-300 transition-colors">
                    <Plus className="h-4 w-4" />
                    Add one-time expense
                </button>
            )}
        </div>
    )
}

// ─── Main component ───────────────────────────────────────────────

export default function MonthlySession() {
    const { household, members, accounts, viewMode, currentUserId } = useHousehold()
    const financialStartMonth = household?.financial_start_month?.slice(0, 7) ?? null  // "YYYY-MM"
    const payDay = household?.pay_day ?? null
    const [sessions, setSessions] = useState<SessionSummary[]>([])
    const [groups, setGroups] = useState<ExpenseGroup[]>([])
    const [tags, setTags] = useState<ExpenseTag[]>([])
    const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null)
    const [loading, setLoading] = useState(true)
    const [startingMonth, setStartingMonth] = useState<string | null>(null)
    const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null)

    const today = new Date()
    const currentYear = today.getFullYear()
    const currentMonthIdx = today.getMonth()
    const currMonthStart = monthStart(currentYear, currentMonthIdx)

    const prevMonthStart = monthStart(
        currentMonthIdx === 0 ? currentYear - 1 : currentYear,
        currentMonthIdx === 0 ? 11 : currentMonthIdx - 1
    )

    // Grace period: the previous month stays editable for 5 days after the most recent pay day.
    // Logic: pay day is when salary lands; from that day you have 5 days to plan next month's
    // budget, and the current month stays open for last-minute adjustments during that window.
    // Falls back to a fixed 5-day window from the 1st if no pay day is configured.
    let pastCutoff: string
    if (payDay) {
        const todayDay = today.getDate()
        const lastPayDate = todayDay >= payDay
            ? new Date(currentYear, currentMonthIdx, payDay)
            : new Date(
                currentMonthIdx === 0 ? currentYear - 1 : currentYear,
                currentMonthIdx === 0 ? 11 : currentMonthIdx - 1,
                payDay
              )
        const graceEnd = new Date(lastPayDate)
        graceEnd.setDate(graceEnd.getDate() + 5)
        pastCutoff = today <= graceEnd ? prevMonthStart : currMonthStart
    } else {
        pastCutoff = today.getDate() <= 5 ? prevMonthStart : currMonthStart
    }

    // Total monthly household income
    const totalIncome = members
        .filter(m => m.contributes_income && m.income_amount)
        .reduce((sum, m) => sum + toMonthly(m.income_amount, m.income_cadence), 0)

    useEffect(() => {
        if (!household) return
        Promise.all([
            apiGet<SessionSummary[]>(`/api/households/${household.id}/budget/sessions`),
            apiGet<ExpenseGroup[]>(`/api/households/${household.id}/budget/groups`),
            apiGet<ExpenseTag[]>(`/api/households/${household.id}/budget/tags`),
        ])
            .then(([s, g, t]) => { setSessions(s); setGroups(g); setTags(t) })
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
                accounts={accounts as Account[]}
                tags={tags}
                pastCutoff={pastCutoff}
                householdId={household!.id}
                viewMode={viewMode}
                currentUserId={currentUserId}
                onBack={() => setSelectedSession(null)}
                onSessionUpdate={handleSessionUpdate}
            />
        )
    }

    // ── Month grid ────────────────────────────────────────────────
    const sessionsByMonth = new Map(sessions.map(s => [s.month.slice(0, 7), s]))
    const currentSession = sessionsByMonth.get(currMonthStart.slice(0, 7))

    // Payday banner: show when today >= pay_day and next month has no session
    const nextMonthStart = monthStart(
        currentMonthIdx === 11 ? currentYear + 1 : currentYear,
        currentMonthIdx === 11 ? 0 : currentMonthIdx + 1
    )
    const nextMonthKey = nextMonthStart.slice(0, 7)
    const nextMonthName = MONTH_NAMES[currentMonthIdx === 11 ? 0 : currentMonthIdx + 1]
    const showPaydayBanner = payDay !== null
        && today.getDate() >= payDay
        && !sessionsByMonth.has(nextMonthKey)

    return (
        <div className="space-y-6">

            {/* ── Payday banner ─────────────────────────────────── */}
            {showPaydayBanner && (
                <div className="flex items-center justify-between gap-4 bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-lg">💰</span>
                        </div>
                        <div>
                            <p className="text-sm font-bold text-emerald-800">It's payday — time to plan ahead</p>
                            <p className="text-xs text-emerald-600 mt-0.5">
                                You set the {payDay}{payDay === 1 ? 'st' : payDay === 2 ? 'nd' : payDay === 3 ? 'rd' : 'th'} as your pay day.
                                Set up your <span className="font-semibold">{nextMonthName}</span> budget now.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => startSession(nextMonthStart)}
                        disabled={startingMonth === nextMonthStart}
                        className="flex-shrink-0 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-4 py-2 transition-colors disabled:opacity-60">
                        {startingMonth === nextMonthStart ? 'Starting…' : `Start ${nextMonthName} Budget`}
                    </button>
                </div>
            )}

            {/* ── Year label + grid ──────────────────────────────── */}
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{currentYear}</p>

            <div className="grid grid-cols-3 gap-3">
                {MONTH_NAMES.map((name, idx) => {
                    const mStart = monthStart(currentYear, idx)
                    const monthKey = mStart.slice(0, 7)
                    const session = sessionsByMonth.get(monthKey)
                    const isFuture = mStart > currMonthStart
                    const isCurrent = mStart === currMonthStart

                    // Hide months before financial start month
                    if (financialStartMonth && monthKey < financialStartMonth && !session) {
                        return null
                    }
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
                    const allocated = Number(session!.total_allocated ?? 0)
                    const sessionPaid = Number(session!.total_paid ?? 0)
                    const sessionPct = allocated > 0 ? Math.round((sessionPaid / allocated) * 100) : 0
                    const tileNameColor = isCurrent ? 'text-sky-700' : isFuture ? 'text-violet-700' : 'text-slate-700'
                    const tileAmtColor = isCurrent ? 'text-sky-800' : isFuture ? 'text-violet-800' : 'text-slate-800'
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
                            <p className={`text-sm font-bold mt-2 ${tileAmtColor}`}>
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
