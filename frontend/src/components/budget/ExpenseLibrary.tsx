'use client'

import { useEffect, useState } from 'react'
import { useHousehold } from '@/context/HouseholdContext'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api'
import { toast } from 'sonner'
import {
    Plus, Trash2, Pencil, ChevronDown, ChevronRight, Tag, Layers,
    Wallet, RotateCcw, X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'

// ─── Types ───────────────────────────────────────────────────────

interface ExpenseTag { id: string; name: string; color: string | null }
interface ExpenseGroup { id: string; name: string; owner_id: string | null; is_deleted: boolean }
interface TagAssignment { id: string; tag: ExpenseTag }
interface Expense {
    id: string
    name: string
    amount: number
    frequency: string
    monthly_amount: number
    ownership_type: string
    joint_split_husband: number | null
    joint_split_wife: number | null
    group_id: string | null
    account_id: string | null
    owner_id: string | null
    is_deleted: boolean
    tag_assignments: TagAssignment[]
}
interface Account { id: string; name: string; account_type: string }

const FREQUENCY_LABELS: Record<string, string> = {
    daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', annual: 'Annual'
}

const OWNERSHIP_LABELS: Record<string, string> = {
    husband: '👨 Husband', wife: '👩 Wife', joint: '🤝 Joint'
}

const GRADIENTS = [
    'linear-gradient(135deg, #0ea5e9, #6366f1)',
    'linear-gradient(135deg, #f43f5e, #f97316)',
    'linear-gradient(135deg, #10b981, #0ea5e9)',
    'linear-gradient(135deg, #8b5cf6, #ec4899)',
    'linear-gradient(135deg, #f59e0b, #ef4444)',
    'linear-gradient(135deg, #06b6d4, #10b981)',
]

function SaveButton({ onClick, loading, label = 'Save' }: { onClick: () => void; loading: boolean; label?: string }) {
    return (
        <button
            onClick={onClick}
            disabled={loading}
            className="px-6 py-2 rounded-2xl font-bold text-white text-sm flex items-center gap-2 disabled:opacity-70 transition-opacity hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #0ea5e9, #6366f1)' }}>
            {loading && <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />}
            {loading ? 'Saving...' : label}
        </button>
    )
}

function formatKES(amount: number | string) {
    return `KES ${Number(amount).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function toMonthly(amount: number, cadence: string): number {
    if (cadence === 'weekly') return (amount * 52) / 12
    if (cadence === 'annually') return amount / 12
    return amount
}

// ─── Main Component ───────────────────────────────────────────────

export default function ExpenseLibrary() {
    const { household, accounts, members, currentUserId } = useHousehold()
    const [groups, setGroups] = useState<ExpenseGroup[]>([])
    const [expenses, setExpenses] = useState<Expense[]>([])
    const [tags, setTags] = useState<ExpenseTag[]>([])
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
    const [loading, setLoading] = useState(true)
    const [showDeleted, setShowDeleted] = useState(false)
    const [activeTab, setActiveTab] = useState<'household' | 'personal'>('household')

    // Group dialog
    const [groupDialog, setGroupDialog] = useState(false)
    const [editGroupDialog, setEditGroupDialog] = useState(false)
    const [editingGroup, setEditingGroup] = useState<ExpenseGroup | null>(null)
    const [groupName, setGroupName] = useState('')
    const [savingGroup, setSavingGroup] = useState(false)

    // Tag dialog
    const [tagDialog, setTagDialog] = useState(false)
    const [tagName, setTagName] = useState('')
    const [tagColor, setTagColor] = useState('#0ea5e9')
    const [savingTag, setSavingTag] = useState(false)
    const [editingTag, setEditingTag] = useState<ExpenseTag | null>(null)
    const [editTagName, setEditTagName] = useState('')
    const [editTagColor, setEditTagColor] = useState('#0ea5e9')

    // Expense dialog
    const [expenseDialog, setExpenseDialog] = useState(false)
    const [editExpenseDialog, setEditExpenseDialog] = useState(false)
    const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
    const [savingExpense, setSavingExpense] = useState(false)
    const [expenseForm, setExpenseForm] = useState({
        name: '', amount: '', frequency: 'monthly', ownership_type: 'joint',
        joint_split_husband: '50', joint_split_wife: '50',
        group_id: '', account_id: '', tag_ids: [] as string[]
    })

    useEffect(() => { if (household) loadAll() }, [household?.id, showDeleted])

    const loadAll = async () => {
        if (!household) return
        setLoading(true)
        try {
            const [g, e, t] = await Promise.all([
                apiGet<ExpenseGroup[]>(`/api/households/${household.id}/budget/groups?include_deleted=${showDeleted}`),
                apiGet<Expense[]>(`/api/households/${household.id}/budget/expenses?include_deleted=${showDeleted}`),
                apiGet<ExpenseTag[]>(`/api/households/${household.id}/budget/tags`),
            ])
            setGroups(g)
            setExpenses(e)
            setTags(t)
            // expand all groups by default
            setExpandedGroups(new Set(g.map(g => g.id)))
        } catch { toast.error('Failed to load expense library') }
        finally { setLoading(false) }
    }

    const toggleGroup = (id: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    }

    // ─── Group CRUD ───────────────────────────────────────────────

    const createGroup = async () => {
        if (!groupName.trim() || !household) return
        setSavingGroup(true)
        try {
            const data = await apiPost<ExpenseGroup>(`/api/households/${household.id}/budget/groups`, {
                name: groupName,
                personal: activeTab === 'personal'
            })
            setGroups(prev => [...prev, data])
            setExpandedGroups(prev => new Set([...prev, data.id]))
            setGroupName(''); setGroupDialog(false)
            toast.success('Group created!')
        } catch { toast.error('Failed to create group') }
        finally { setSavingGroup(false) }
    }

    const updateGroup = async () => {
        if (!editingGroup || !groupName.trim() || !household) return
        setSavingGroup(true)
        try {
            const data = await apiPatch<ExpenseGroup>(`/api/households/${household.id}/budget/groups/${editingGroup.id}`, { name: groupName })
            setGroups(prev => prev.map(g => g.id === data.id ? data : g))
            setEditGroupDialog(false); setEditingGroup(null)
            toast.success('Updated!')
        } catch { toast.error('Failed to update group') }
        finally { setSavingGroup(false) }
    }

    const deleteGroup = async (id: string) => {
        if (!household) return
        try {
            await apiDelete(`/api/households/${household.id}/budget/groups/${id}`)
            setGroups(prev => prev.map(g => g.id === id ? { ...g, is_deleted: true } : g))
            toast.success('Group removed')
        } catch { toast.error('Failed') }
    }

    const restoreGroup = async (id: string) => {
        if (!household) return
        try {
            const data = await apiPatch<ExpenseGroup>(`/api/households/${household.id}/budget/groups/${id}/restore`, {})
            setGroups(prev => prev.map(g => g.id === data.id ? data : g))
            toast.success('Restored!')
        } catch { toast.error('Failed') }
    }

    // ─── Tag CRUD ─────────────────────────────────────────────────

    const createTag = async () => {
        if (!tagName.trim() || !household) return
        setSavingTag(true)
        try {
            const data = await apiPost<ExpenseTag>(`/api/households/${household.id}/budget/tags`, { name: tagName, color: tagColor })
            setTags(prev => prev.some(t => t.id === data.id) ? prev : [...prev, data])
            setTagName(''); setTagDialog(false)
            toast.success('Tag created!')
        } catch { toast.error('Failed') }
        finally { setSavingTag(false) }
    }

    const deleteTag = async (id: string) => {
        if (!household) return
        try {
            await apiDelete(`/api/households/${household.id}/budget/tags/${id}`)
            setTags(prev => prev.filter(t => t.id !== id))
            toast.success('Tag removed')
        } catch { toast.error('Failed') }
    }

    const updateTag = async () => {
        if (!editingTag || !editTagName.trim() || !household) return
        setSavingTag(true)
        try {
            const data = await apiPatch<ExpenseTag>(`/api/households/${household.id}/budget/tags/${editingTag.id}`, { name: editTagName, color: editTagColor })
            setTags(prev => prev.map(t => t.id === data.id ? data : t))
            setEditingTag(null)
            toast.success('Tag updated!')
        } catch { toast.error('Failed') }
        finally { setSavingTag(false) }
    }

    // ─── Expense CRUD ─────────────────────────────────────────────

    const resetExpenseForm = () => setExpenseForm({
        name: '', amount: '', frequency: 'monthly', ownership_type: 'joint',
        joint_split_husband: '50', joint_split_wife: '50',
        group_id: '', account_id: '', tag_ids: []
    })

    const openEditExpense = (expense: Expense) => {
        setEditingExpense(expense)
        setExpenseForm({
            name: expense.name,
            amount: expense.amount.toString(),
            frequency: expense.frequency,
            ownership_type: expense.ownership_type,
            joint_split_husband: expense.joint_split_husband?.toString() || '50',
            joint_split_wife: expense.joint_split_wife?.toString() || '50',
            group_id: expense.group_id || '',
            account_id: expense.account_id || '',
            tag_ids: expense.tag_assignments.map(ta => ta.tag.id)
        })
        setEditExpenseDialog(true)
    }

    const buildExpensePayload = () => ({
        name: expenseForm.name,
        amount: parseFloat(expenseForm.amount),
        frequency: expenseForm.frequency,
        ownership_type: expenseForm.ownership_type,
        joint_split_husband: expenseForm.ownership_type === 'joint' ? parseFloat(expenseForm.joint_split_husband) : null,
        joint_split_wife: expenseForm.ownership_type === 'joint' ? parseFloat(expenseForm.joint_split_wife) : null,
        group_id: expenseForm.group_id || null,
        account_id: expenseForm.account_id || null,
        personal: activeTab === 'personal',
        tag_ids: expenseForm.tag_ids
    })

    const createExpense = async () => {
        if (!expenseForm.name || !expenseForm.amount || !household) return
        setSavingExpense(true)
        try {
            const data = await apiPost<Expense>(`/api/households/${household.id}/budget/expenses`, buildExpensePayload())
            setExpenses(prev => [...prev, data])
            resetExpenseForm(); setExpenseDialog(false)
            toast.success('Expense added!')
        } catch (e: any) {
            toast.error(e.message || 'Failed to add expense')
        }
        finally { setSavingExpense(false) }
    }

    const updateExpense = async () => {
        if (!editingExpense || !household) return
        setSavingExpense(true)
        try {
            const data = await apiPatch<Expense>(`/api/households/${household.id}/budget/expenses/${editingExpense.id}`, buildExpensePayload())
            setExpenses(prev => prev.map(e => e.id === data.id ? data : e))
            setEditExpenseDialog(false); setEditingExpense(null)
            toast.success('Updated!')
        } catch (e: any) {
            toast.error(e.message || 'Failed to update')
        }
        finally { setSavingExpense(false) }
    }

    const deleteExpense = async (id: string) => {
        if (!household) return
        try {
            await apiDelete(`/api/households/${household.id}/budget/expenses/${id}`)
            setExpenses(prev => prev.map(e => e.id === id ? { ...e, is_deleted: true } : e))
            toast.success('Expense removed')
        } catch { toast.error('Failed') }
    }

    const restoreExpense = async (id: string) => {
        if (!household) return
        try {
            const data = await apiPatch<Expense>(`/api/households/${household.id}/budget/expenses/${id}/restore`, {})
            setExpenses(prev => prev.map(e => e.id === data.id ? data : e))
            toast.success('Restored!')
        } catch { toast.error('Failed') }
    }

    const toggleTagOnForm = (tagId: string) => {
        setExpenseForm(prev => ({
            ...prev,
            tag_ids: prev.tag_ids.includes(tagId)
                ? prev.tag_ids.filter(id => id !== tagId)
                : [...prev.tag_ids, tagId]
        }))
    }

    // ─── Derived data ─────────────────────────────────────────────

    const visibleGroups = groups.filter(g =>
        (showDeleted || !g.is_deleted) &&
        (activeTab === 'household' ? g.owner_id === null : g.owner_id !== null)
    )

    const ungroupedExpenses = expenses.filter(e =>
        (showDeleted || !e.is_deleted) &&
        e.group_id === null &&
        (activeTab === 'household' ? e.owner_id === null : e.owner_id !== null)
    )

    const expensesForGroup = (groupId: string) => expenses.filter(e =>
        (showDeleted || !e.is_deleted) &&
        e.group_id === groupId
    )

    if (loading) return (
        <div className="flex items-center justify-center h-48">
            <div className="w-6 h-6 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
        </div>
    )

    return (
        <div className="space-y-6">

            {/* ── Toolbar ── */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2 bg-slate-100 rounded-2xl p-1">
                    {(['household', 'personal'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-1.5 rounded-xl text-sm font-bold transition-all capitalize ${activeTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                            {tab === 'household' ? '🏠 Household' : '👤 Personal'}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowDeleted(p => !p)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${showDeleted ? 'bg-amber-50 text-amber-600 border border-amber-200' : 'text-slate-400 hover:text-slate-600'}`}>
                        <RotateCcw className="h-3 w-3" />
                        {showDeleted ? 'Hide deleted' : 'Show deleted'}
                    </button>
                    <button onClick={() => setTagDialog(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold text-violet-600 bg-violet-50 hover:bg-violet-100 transition-colors">
                        <Tag className="h-3.5 w-3.5" /> Tags
                    </button>
                    <button onClick={() => setGroupDialog(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 transition-colors">
                        <Layers className="h-3.5 w-3.5" /> New Group
                    </button>
                    <button onClick={() => { resetExpenseForm(); setExpenseDialog(true) }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold text-white transition-colors"
                        style={{ background: 'linear-gradient(135deg, #0ea5e9, #6366f1)' }}>
                        <Plus className="h-3.5 w-3.5" /> Add Expense
                    </button>
                </div>
            </div>

            {/* ── Tags bar ── */}
            {tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {tags.map(tag => (
                        <span key={tag.id}
                            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold text-white"
                            style={{ background: tag.color || '#6366f1' }}>
                            {tag.name}
                        </span>
                    ))}
                </div>
            )}

            {/* ── Income vs Budgeted tracker ── */}
            {(() => {
                const incomeMembers = members.filter(m => m.contributes_income && m.income_amount)
                if (incomeMembers.length === 0) return null

                // ── Personal tab ──────────────────────────────────────────────
                if (activeTab === 'personal') {
                    const myMember = members.find(m => m.user_id === currentUserId && m.contributes_income && m.income_amount)
                    if (!myMember) {
                        return (
                            <div className="bg-slate-50 rounded-3xl border border-slate-100 px-5 py-4 text-sm text-slate-400">
                                No income linked to your account — set it on the Household page.
                            </div>
                        )
                    }
                    const currency = myMember.income_currency ?? 'KES'
                    const myIncome = toMonthly(Number(myMember.income_amount), myMember.income_cadence ?? 'monthly')
                    const fmt = (n: number) => `${currency} ${Math.abs(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    const hhAll = expenses.filter(e => !e.is_deleted && e.owner_id === null)
                    const role = myMember.member_type.name.toLowerCase()

                    const myHHOwned = hhAll
                        .filter(e => e.ownership_type === role)
                        .reduce((s, e) => s + Number(e.monthly_amount), 0)

                    const myHHJoint = hhAll
                        .filter(e => e.ownership_type === 'joint')
                        .reduce((s, e) => {
                            const split = role === 'husband' ? (e.joint_split_husband ?? 50)
                                        : role === 'wife'    ? (e.joint_split_wife    ?? 50)
                                        : 0
                            return s + Number(e.monthly_amount) * split / 100
                        }, 0)

                    const myPersonal = expenses
                        .filter(e => !e.is_deleted && e.owner_id === myMember.user_id)
                        .reduce((s, e) => s + Number(e.monthly_amount), 0)

                    const myAllocated = myHHOwned + myHHJoint + myPersonal
                    const myRemaining = myIncome - myAllocated
                    const myRemainingDisplay = Math.max(0, myRemaining)
                    const zeroBudgeted = myRemaining <= 0
                    const pct = myIncome > 0 ? Math.min((myAllocated / myIncome) * 100, 100) : 0
                    return (
                        <div className="bg-white rounded-3xl border border-slate-100 p-5"
                            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                            <div className="flex items-start justify-between gap-4 mb-4">
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Your Income</p>
                                    <p className="text-2xl font-black text-slate-900">{fmt(myIncome)}<span className="text-sm font-normal text-slate-400 ml-1">/ mo</span></p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Remaining</p>
                                    <p className="text-2xl font-black text-emerald-500">{fmt(myRemainingDisplay)}</p>
                                    <p className="text-xs text-slate-400 mt-0.5">{fmt(myAllocated)} allocated</p>
                                </div>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all ${pct > 85 ? 'bg-emerald-400' : 'bg-emerald-400'}`}
                                    style={{ width: `${pct}%` }} />
                            </div>
                            <div className="flex items-center justify-between mt-1.5">
                                <span className="text-xs text-slate-400">{pct.toFixed(0)}% of your income allocated</span>
                                {zeroBudgeted && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-600">
                                        🎯 Zero budgeted
                                    </span>
                                )}
                            </div>
                            {myAllocated > 0 && (
                                <div className="mt-3 pt-3 border-t border-slate-50 space-y-1">
                                    {myHHOwned > 0 && (
                                        <div className="flex justify-between text-xs">
                                            <span className="text-slate-400">HH · {myMember.member_type.name}</span>
                                            <span className="text-slate-600 font-medium">−{fmt(myHHOwned)}</span>
                                        </div>
                                    )}
                                    {myHHJoint > 0 && (
                                        <div className="flex justify-between text-xs">
                                            <span className="text-slate-400">HH · Joint share</span>
                                            <span className="text-slate-600 font-medium">−{fmt(myHHJoint)}</span>
                                        </div>
                                    )}
                                    {myPersonal > 0 && (
                                        <div className="flex justify-between text-xs">
                                            <span className="text-slate-400">Personal</span>
                                            <span className="text-slate-600 font-medium">−{fmt(myPersonal)}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )
                }

                // ── Household tab ─────────────────────────────────────────────
                // Primary currency: KES if any member uses it, otherwise first found
                const currencies = [...new Set(incomeMembers.map(m => m.income_currency ?? 'KES'))]
                const refCurrency = currencies.includes('KES') ? 'KES' : currencies[0]
                const fmt = (n: number) => `${refCurrency} ${Math.abs(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

                const hhExpenses = expenses.filter(e => !e.is_deleted && e.owner_id === null)

                // Each income member absorbs: HH expenses matching their role + their share of joint HH expenses + personal
                const memberRows = incomeMembers.map(m => {
                    const income = toMonthly(Number(m.income_amount), m.income_cadence ?? 'monthly')
                    const role = m.member_type.name.toLowerCase()

                    const hhOwned = hhExpenses
                        .filter(e => e.ownership_type === role)
                        .reduce((s, e) => s + Number(e.monthly_amount), 0)

                    const hhJoint = hhExpenses
                        .filter(e => e.ownership_type === 'joint')
                        .reduce((s, e) => {
                            const split = role === 'husband' ? (e.joint_split_husband ?? 50)
                                        : role === 'wife'    ? (e.joint_split_wife    ?? 50)
                                        : 0
                            return s + Number(e.monthly_amount) * split / 100
                        }, 0)

                    const personal = expenses
                        .filter(e => !e.is_deleted && e.owner_id === m.user_id)
                        .reduce((s, e) => s + Number(e.monthly_amount), 0)

                    const allocated = hhOwned + hhJoint + personal
                    return { member: m, income, hhOwned, hhJoint, personal, allocated, remaining: income - allocated }
                })

                const totalIncome = memberRows.reduce((s, r) => s + r.income, 0)
                const totalAllocated = memberRows.reduce((s, r) => s + r.allocated, 0)
                const netRemaining = totalIncome - totalAllocated
                const pct = totalIncome > 0 ? Math.min((totalAllocated / totalIncome) * 100, 100) : 0
                const over = netRemaining < 0

                return (
                    <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden"
                        style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                        {/* Header */}
                        <div className="p-5">
                            <div className="flex items-start justify-between gap-4 mb-4">
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Total Household Income</p>
                                    <p className="text-2xl font-black text-slate-900">{fmt(totalIncome)}<span className="text-sm font-normal text-slate-400 ml-1">/ mo</span></p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Net Remaining</p>
                                    <p className={`text-2xl font-black ${over ? 'text-red-500' : 'text-emerald-500'}`}>
                                        {over ? '−' : ''}{fmt(netRemaining)}
                                    </p>
                                    <p className="text-xs text-slate-400 mt-0.5">{fmt(totalAllocated)} allocated</p>
                                </div>
                            </div>
                            {/* Combined progress bar */}
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all ${over ? 'bg-red-400' : pct > 85 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                                    style={{ width: `${pct}%` }} />
                            </div>
                            <p className="text-xs text-slate-400 mt-1.5">{pct.toFixed(0)}% of total income allocated</p>
                        </div>

                        {/* Per-member breakdown */}
                        <div className="border-t border-slate-50">
                            {memberRows.map((row, i) => {
                                const memberPct = row.income > 0 ? Math.min((row.allocated / row.income) * 100, 100) : 0
                                const zeroBudgeted = row.remaining <= 0
                                const remainingDisplay = Math.max(0, row.remaining)
                                return (
                                    <div key={row.member.id} className="px-5 py-4 border-b border-slate-50 last:border-b-0">
                                        <div className="flex items-center justify-between gap-3 mb-2">
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <div className="w-7 h-7 rounded-xl flex items-center justify-center text-white text-xs font-black flex-shrink-0"
                                                    style={{ background: GRADIENTS[i % GRADIENTS.length] }}>
                                                    {row.member.name.charAt(0)}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-xs font-bold text-slate-700 truncate">{row.member.name}</p>
                                                    <p className="text-xs text-slate-400">{row.member.member_type.name} · {fmt(row.income)}/mo</p>
                                                </div>
                                            </div>
                                            <div className="text-right flex-shrink-0">
                                                <p className="text-sm font-bold text-emerald-600">{fmt(remainingDisplay)}</p>
                                                <p className="text-xs text-slate-400">remaining</p>
                                            </div>
                                        </div>
                                        <div className="ml-9 space-y-0.5 mb-2">
                                            {row.hhOwned > 0 && (
                                                <div className="flex justify-between text-xs">
                                                    <span className="text-slate-400">HH · {row.member.member_type.name}</span>
                                                    <span className="text-slate-600 font-medium">−{fmt(row.hhOwned)}</span>
                                                </div>
                                            )}
                                            {row.hhJoint > 0 && (
                                                <div className="flex justify-between text-xs">
                                                    <span className="text-slate-400">HH · Joint share</span>
                                                    <span className="text-slate-600 font-medium">−{fmt(row.hhJoint)}</span>
                                                </div>
                                            )}
                                            {row.personal > 0 && (
                                                <div className="flex justify-between text-xs">
                                                    <span className="text-slate-400">Personal</span>
                                                    <span className="text-slate-600 font-medium">−{fmt(row.personal)}</span>
                                                </div>
                                            )}
                                            {row.allocated === 0 && (
                                                <p className="text-xs text-slate-300 italic">No expenses allocated yet</p>
                                            )}
                                        </div>
                                        <div className="ml-9 flex items-center gap-3">
                                            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                <div className={`h-full rounded-full transition-all ${memberPct > 85 ? 'bg-emerald-400' : 'bg-sky-400'}`}
                                                    style={{ width: `${memberPct}%` }} />
                                            </div>
                                            {zeroBudgeted && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-600 flex-shrink-0">
                                                    🎯 Zero budgeted
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )
            })()}

            {/* ── Tag breakdown ── */}
            {(() => {
                const visibleExpenses = expenses.filter(e =>
                    !e.is_deleted &&
                    (activeTab === 'household' ? e.owner_id === null : e.owner_id !== null)
                )
                if (visibleExpenses.length === 0 || tags.length === 0) return null

                const totalMonthly = visibleExpenses.reduce((s, e) => s + Number(e.monthly_amount), 0)
                if (totalMonthly === 0) return null

                const tagRows = tags.map(tag => ({
                    id: tag.id,
                    name: tag.name,
                    color: tag.color || '#6366f1',
                    total: visibleExpenses
                        .filter(e => e.tag_assignments.some(ta => ta.tag.id === tag.id))
                        .reduce((s, e) => s + Number(e.monthly_amount), 0),
                })).filter(r => r.total > 0)

                const untaggedTotal = visibleExpenses
                    .filter(e => e.tag_assignments.length === 0)
                    .reduce((s, e) => s + Number(e.monthly_amount), 0)

                const allRows = [
                    ...tagRows,
                    ...(untaggedTotal > 0 ? [{ id: '__none', name: 'Untagged', color: '#cbd5e1', total: untaggedTotal }] : []),
                ]
                if (allRows.length === 0) return null

                return (
                    <div className="bg-white rounded-3xl border border-slate-100 p-5" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">Expenses by Tag</p>

                        {/* Stacked bar */}
                        <div className="flex h-3 rounded-full overflow-hidden gap-px mb-4">
                            {allRows.map(row => (
                                <div key={row.id} style={{ width: `${(row.total / totalMonthly) * 100}%`, background: row.color }} />
                            ))}
                        </div>

                        {/* Legend rows */}
                        <div className="space-y-2">
                            {allRows.map(row => {
                                const pct = ((row.total / totalMonthly) * 100).toFixed(1)
                                return (
                                    <div key={row.id} className="flex items-center gap-3">
                                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: row.color }} />
                                        <span className="text-sm text-slate-600 flex-1">{row.name}</span>
                                        <span className="text-xs text-slate-400 w-10 text-right">{pct}%</span>
                                        <span className="text-sm font-bold text-slate-800 w-32 text-right">{formatKES(row.total)}<span className="text-xs font-normal text-slate-400">/mo</span></span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )
            })()}

            {/* ── Groups + Expenses ── */}
            <div className="space-y-4">
                {visibleGroups.map((group, gi) => {
                    const groupExpenses = expensesForGroup(group.id)
                    const isExpanded = expandedGroups.has(group.id)
                    const monthlyTotal = groupExpenses.filter(e => !e.is_deleted).reduce((sum, e) => sum + e.monthly_amount, 0)

                    return (
                        <div key={group.id}
                            className={`bg-white rounded-3xl border transition-all overflow-hidden ${group.is_deleted ? 'opacity-50 border-dashed border-slate-200' : 'border-slate-100'}`}
                            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>

                            {/* Group header */}
                            <div className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors"
                                onClick={() => toggleGroup(group.id)}>
                                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm font-black flex-shrink-0"
                                    style={{ background: GRADIENTS[gi % GRADIENTS.length] }}>
                                    {group.name.charAt(0)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-slate-900">{group.name}</p>
                                    <p className="text-xs text-slate-400">{groupExpenses.filter(e => !e.is_deleted).length} expenses · {formatKES(monthlyTotal)}/mo</p>
                                </div>
                                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                    {group.is_deleted ? (
                                        <button onClick={() => restoreGroup(group.id)}
                                            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 transition-all">
                                            <RotateCcw className="h-3.5 w-3.5" />
                                        </button>
                                    ) : (
                                        <>
                                            <button onClick={() => { setEditingGroup(group); setGroupName(group.name); setEditGroupDialog(true) }}
                                                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-sky-500 hover:bg-sky-50 transition-all">
                                                <Pencil className="h-3.5 w-3.5" />
                                            </button>
                                            <button onClick={() => deleteGroup(group.id)}
                                                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all">
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </>
                                    )}
                                </div>
                                {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0" />}
                            </div>

                            {/* Expenses in group */}
                            {isExpanded && (
                                <div className="border-t border-slate-50">
                                    {groupExpenses.length > 0 && (
                                        <div className="divide-y divide-slate-50">
                                            {groupExpenses.map(expense => (
                                                <ExpenseRow
                                                    key={expense.id}
                                                    expense={expense}
                                                    accounts={accounts as Account[]}
                                                    onEdit={() => openEditExpense(expense)}
                                                    onDelete={() => deleteExpense(expense.id)}
                                                    onRestore={() => restoreExpense(expense.id)}
                                                    showDeleted={showDeleted}
                                                />
                                            ))}
                                        </div>
                                    )}
                                    {/* Add-to-group footer — always visible when expanded and group is not deleted */}
                                    {!group.is_deleted && (
                                        <button
                                            onClick={() => { resetExpenseForm(); setExpenseForm(p => ({ ...p, group_id: group.id })); setExpenseDialog(true) }}
                                            className="flex items-center gap-2 w-full px-5 py-3 text-xs font-semibold text-slate-400 hover:text-sky-500 hover:bg-sky-50 transition-colors border-t border-slate-50">
                                            <Plus className="h-3.5 w-3.5" />
                                            Add expense to {group.name}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )
                })}

                {/* Ungrouped expenses */}
                {ungroupedExpenses.length > 0 && (
                    <div className="bg-white rounded-3xl border border-dashed border-slate-200 overflow-hidden"
                        style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                        <div className="px-5 py-3 bg-slate-50">
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Ungrouped</p>
                        </div>
                        <div className="divide-y divide-slate-50">
                            {ungroupedExpenses.map(expense => (
                                <ExpenseRow
                                    key={expense.id}
                                    expense={expense}
                                    accounts={accounts as Account[]}
                                    onEdit={() => openEditExpense(expense)}
                                    onDelete={() => deleteExpense(expense.id)}
                                    onRestore={() => restoreExpense(expense.id)}
                                    showDeleted={showDeleted}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {visibleGroups.length === 0 && ungroupedExpenses.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-40 rounded-3xl border-2 border-dashed border-slate-200">
                        <Wallet className="h-8 w-8 text-slate-200 mb-3" />
                        <p className="text-sm font-semibold text-slate-400">No expenses yet</p>
                        <p className="text-xs text-slate-300 mt-1">Create a group or add an expense to get started</p>
                    </div>
                )}
            </div>

            {/* ── Dialogs ── */}

            {/* New Group */}
            <Dialog open={groupDialog} onOpenChange={setGroupDialog}>
                <DialogContent className="rounded-3xl border-0" style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.15)' }}>
                    <DialogHeader><DialogTitle className="text-xl font-black">New Expense Group</DialogTitle></DialogHeader>
                    <div className="space-y-2 py-2">
                        <Label className="text-sm font-bold text-slate-700">Group Name</Label>
                        <Input className="h-12 rounded-2xl" placeholder="e.g. Household Bills, Savings..."
                            value={groupName} onChange={e => setGroupName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && createGroup()} />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="rounded-2xl" onClick={() => setGroupDialog(false)}>Cancel</Button>
                        <SaveButton onClick={createGroup} loading={savingGroup} label="Create Group" />
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Group */}
            <Dialog open={editGroupDialog} onOpenChange={setEditGroupDialog}>
                <DialogContent className="rounded-3xl border-0" style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.15)' }}>
                    <DialogHeader><DialogTitle className="text-xl font-black">Rename Group</DialogTitle></DialogHeader>
                    <div className="space-y-2 py-2">
                        <Input className="h-12 rounded-2xl" value={groupName}
                            onChange={e => setGroupName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && updateGroup()} />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="rounded-2xl" onClick={() => setEditGroupDialog(false)}>Cancel</Button>
                        <SaveButton onClick={updateGroup} loading={savingGroup} />
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Tags Manager */}
            <Dialog open={tagDialog} onOpenChange={open => { setTagDialog(open); if (!open) setEditingTag(null) }}>
                <DialogContent className="rounded-3xl border-0" style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.15)' }}>
                    <DialogHeader><DialogTitle className="text-xl font-black">Manage Tags</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-2">
                        {/* Existing tags list */}
                        <div className="space-y-2">
                            {tags.length === 0 && <p className="text-sm text-slate-400">No tags yet</p>}
                            {tags.map(tag => editingTag?.id === tag.id ? (
                                <div key={tag.id} className="flex items-center gap-2 p-2 rounded-2xl bg-slate-50 border border-slate-200">
                                    <input type="color" value={editTagColor} onChange={e => setEditTagColor(e.target.value)}
                                        className="w-8 h-8 rounded-xl border border-slate-200 cursor-pointer p-0.5 flex-shrink-0" />
                                    <Input className="h-8 rounded-xl flex-1 text-sm"
                                        value={editTagName}
                                        onChange={e => setEditTagName(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') updateTag(); if (e.key === 'Escape') setEditingTag(null) }}
                                        autoFocus />
                                    <button onClick={updateTag} disabled={savingTag}
                                        className="px-3 h-8 rounded-xl text-xs font-bold text-white bg-sky-500 hover:bg-sky-600 transition-colors disabled:opacity-50 flex-shrink-0">
                                        {savingTag ? '…' : 'Save'}
                                    </button>
                                    <button onClick={() => setEditingTag(null)}
                                        className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-200 transition-colors flex-shrink-0">
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            ) : (
                                <div key={tag.id} className="flex items-center gap-3 px-3 py-2 rounded-2xl hover:bg-slate-50 group">
                                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: tag.color || '#6366f1' }} />
                                    <span className="flex-1 text-sm font-semibold text-slate-800">{tag.name}</span>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => { setEditingTag(tag); setEditTagName(tag.name); setEditTagColor(tag.color || '#6366f1') }}
                                            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-sky-500 hover:bg-sky-50 transition-all">
                                            <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                        <button onClick={() => deleteTag(tag.id)}
                                            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all">
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* New tag form */}
                        <div className="border-t border-slate-100 pt-4 space-y-3">
                            <Label className="text-sm font-bold text-slate-700">New Tag</Label>
                            <div className="flex gap-2">
                                <Input className="h-10 rounded-2xl flex-1" placeholder="Tag name"
                                    value={tagName} onChange={e => setTagName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && createTag()} />
                                <input type="color" value={tagColor} onChange={e => setTagColor(e.target.value)}
                                    className="w-10 h-10 rounded-2xl border border-slate-200 cursor-pointer p-1" />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="rounded-2xl" onClick={() => { setTagDialog(false); setEditingTag(null) }}>Done</Button>
                        <SaveButton onClick={createTag} loading={savingTag} label="Add Tag" />
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Add Expense */}
            <Dialog open={expenseDialog} onOpenChange={setExpenseDialog}>
                <DialogContent className="rounded-3xl border-0 max-w-lg" style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.15)' }}>
                    <DialogHeader><DialogTitle className="text-xl font-black">Add Expense</DialogTitle></DialogHeader>
                    <ExpenseForm
                        form={expenseForm}
                        setForm={setExpenseForm}
                        groups={visibleGroups.filter(g => !g.is_deleted)}
                        accounts={accounts as Account[]}
                        tags={tags}
                        onToggleTag={toggleTagOnForm}
                    />
                    <DialogFooter>
                        <Button variant="outline" className="rounded-2xl" onClick={() => setExpenseDialog(false)}>Cancel</Button>
                        <SaveButton onClick={createExpense} loading={savingExpense} label="Add Expense" />
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Expense */}
            <Dialog open={editExpenseDialog} onOpenChange={setEditExpenseDialog}>
                <DialogContent className="rounded-3xl border-0 max-w-lg" style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.15)' }}>
                    <DialogHeader><DialogTitle className="text-xl font-black">Edit Expense</DialogTitle></DialogHeader>
                    <ExpenseForm
                        form={expenseForm}
                        setForm={setExpenseForm}
                        groups={visibleGroups.filter(g => !g.is_deleted)}
                        accounts={accounts as Account[]}
                        tags={tags}
                        onToggleTag={toggleTagOnForm}
                    />
                    <DialogFooter>
                        <Button variant="outline" className="rounded-2xl" onClick={() => setEditExpenseDialog(false)}>Cancel</Button>
                        <SaveButton onClick={updateExpense} loading={savingExpense} />
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

// ─── Expense Row ──────────────────────────────────────────────────

function ExpenseRow({ expense, accounts, onEdit, onDelete, onRestore, showDeleted }: {
    expense: Expense
    accounts: Account[]
    onEdit: () => void
    onDelete: () => void
    onRestore: () => void
    showDeleted: boolean
}) {
    const sourceAccount = expense.account_id ? accounts.find(a => a.id === expense.account_id) : null
    return (
        <div className={`flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors group ${expense.is_deleted ? 'opacity-50' : ''}`}>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-800 text-sm">{expense.name}</p>
                    {expense.tag_assignments.map(ta => (
                        <span key={ta.id} className="px-2 py-0.5 rounded-full text-xs font-bold text-white"
                            style={{ background: ta.tag.color || '#6366f1' }}>
                            {ta.tag.name}
                        </span>
                    ))}
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <p className="text-xs text-slate-400">
                        {OWNERSHIP_LABELS[expense.ownership_type]}
                        {expense.ownership_type === 'joint' && ` · ${expense.joint_split_husband}% / ${expense.joint_split_wife}%`}
                        {' · '}{FREQUENCY_LABELS[expense.frequency]}
                    </p>
                    {sourceAccount && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-500">
                            <Wallet className="h-2.5 w-2.5" />
                            {sourceAccount.name}
                        </span>
                    )}
                </div>
            </div>
            <div className="text-right flex-shrink-0">
                <p className="font-black text-slate-900 text-sm">{formatKES(expense.monthly_amount)}<span className="text-xs font-normal text-slate-400">/mo</span></p>
                {expense.frequency !== 'monthly' && (
                    <p className="text-xs text-slate-400">{formatKES(expense.amount)} {expense.frequency}</p>
                )}
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                {expense.is_deleted ? (
                    <button onClick={onRestore}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 transition-all">
                        <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                ) : (
                    <>
                        <button onClick={onEdit}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-sky-500 hover:bg-sky-50 transition-all">
                            <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={onDelete}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all">
                            <Trash2 className="h-3.5 w-3.5" />
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}

// ─── Expense Form (shared by Add + Edit) ─────────────────────────

function ExpenseForm({ form, setForm, groups, accounts, tags, onToggleTag }: {
    form: any
    setForm: (fn: (prev: any) => any) => void
    groups: ExpenseGroup[]
    accounts: Account[]
    tags: ExpenseTag[]
    onToggleTag: (id: string) => void
}) {
    const set = (key: string, value: string) => setForm((p: any) => ({ ...p, [key]: value }))

    const handleHusbandSplit = (val: string) => {
        const h = parseFloat(val) || 0
        setForm((p: any) => ({ ...p, joint_split_husband: val, joint_split_wife: (100 - h).toString() }))
    }

    return (
        <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
            <div className="space-y-2">
                <Label className="text-sm font-bold text-slate-700">Expense Name</Label>
                <Input className="h-12 rounded-2xl" placeholder="e.g. Rent, Internet, Netflix..."
                    value={form.name} onChange={e => set('name', e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                    <Label className="text-sm font-bold text-slate-700">Amount</Label>
                    <Input type="number" className="h-12 rounded-2xl" placeholder="0"
                        value={form.amount} onChange={e => set('amount', e.target.value)} />
                </div>
                <div className="space-y-2">
                    <Label className="text-sm font-bold text-slate-700">Frequency</Label>
                    <Select value={form.frequency} onValueChange={val => set('frequency', val)}>
                        <SelectTrigger className="h-12 rounded-2xl"><SelectValue /></SelectTrigger>
                        <SelectContent className="rounded-2xl">
                            {Object.entries(FREQUENCY_LABELS).map(([val, label]) => (
                                <SelectItem key={val} value={val}>{label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="space-y-2">
                <Label className="text-sm font-bold text-slate-700">Ownership</Label>
                <Select value={form.ownership_type} onValueChange={val => set('ownership_type', val)}>
                    <SelectTrigger className="h-12 rounded-2xl"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-2xl">
                        <SelectItem value="joint">🤝 Joint</SelectItem>
                        <SelectItem value="husband">👨 Husband</SelectItem>
                        <SelectItem value="wife">👩 Wife</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {form.ownership_type === 'joint' && (
                <div className="space-y-2">
                    <Label className="text-sm font-bold text-slate-700">Split</Label>
                    <div className="flex items-center gap-3">
                        <div className="flex-1">
                            <p className="text-xs text-slate-400 mb-1">Husband %</p>
                            <Input type="number" min="0" max="100" className="h-10 rounded-xl text-center"
                                value={form.joint_split_husband} onChange={e => handleHusbandSplit(e.target.value)} />
                        </div>
                        <div className="text-slate-300 font-bold mt-4">+</div>
                        <div className="flex-1">
                            <p className="text-xs text-slate-400 mb-1">Wife %</p>
                            <Input type="number" min="0" max="100" className="h-10 rounded-xl text-center"
                                value={form.joint_split_wife} onChange={e => set('joint_split_wife', e.target.value)} />
                        </div>
                        <div className="mt-4 text-xs font-bold text-slate-400">= 100%</div>
                    </div>
                </div>
            )}

            <div className="space-y-2">
                <Label className="text-sm font-bold text-slate-700">Group <span className="font-normal text-slate-400">(optional)</span></Label>
                <Select value={form.group_id || 'none'} onValueChange={val => set('group_id', val === 'none' ? '' : val)}>
                    <SelectTrigger className="h-12 rounded-2xl"><SelectValue placeholder="No group" /></SelectTrigger>
                    <SelectContent className="rounded-2xl">
                        <SelectItem value="none">No group</SelectItem>
                        {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label className="text-sm font-bold text-slate-700">Source Account <span className="font-normal text-slate-400">(optional)</span></Label>
                <Select value={form.account_id || 'none'} onValueChange={val => set('account_id', val === 'none' ? '' : val)}>
                    <SelectTrigger className="h-12 rounded-2xl"><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent className="rounded-2xl">
                        <SelectItem value="none">None</SelectItem>
                        {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>

            {tags.length > 0 && (
                <div className="space-y-2">
                    <Label className="text-sm font-bold text-slate-700">Tags</Label>
                    <div className="flex flex-wrap gap-2">
                        {tags.map(tag => {
                            const selected = form.tag_ids.includes(tag.id)
                            return (
                                <button key={tag.id} onClick={() => onToggleTag(tag.id)}
                                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all border-2 ${selected ? 'text-white border-transparent' : 'bg-white border-slate-200 text-slate-500'}`}
                                    style={selected ? { background: tag.color || '#6366f1', borderColor: 'transparent' } : {}}>
                                    {tag.name}
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}
