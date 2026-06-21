'use client'

import { useEffect, useMemo, useState } from 'react'
import { useHousehold } from '@/context/HouseholdContext'
import { apiGet } from '@/lib/api'
import { toast } from 'sonner'
import { Layers, Receipt } from 'lucide-react'
import {
    ResponsiveContainer, PieChart, Pie, Cell, Tooltip as ReTooltip,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'

interface ExpenseTag { id: string; name: string; color: string | null }
interface ExpenseGroup { id: string; name: string; owner_id: string | null; is_deleted: boolean }
interface TagAssignment { id: string; tag: ExpenseTag }
interface Expense {
    id: string; name: string; amount: number; frequency: string
    monthly_amount: number; ownership_type: string
    joint_split_husband: number | null; joint_split_wife: number | null
    group_id: string | null; owner_id: string | null; is_deleted: boolean
    tag_assignments: TagAssignment[]
}

const GRADIENTS = [
    'linear-gradient(135deg, #0ea5e9, #6366f1)',
    'linear-gradient(135deg, #f43f5e, #f97316)',
    'linear-gradient(135deg, #10b981, #0ea5e9)',
    'linear-gradient(135deg, #8b5cf6, #ec4899)',
    'linear-gradient(135deg, #f59e0b, #ef4444)',
    'linear-gradient(135deg, #06b6d4, #10b981)',
]

const CHART_COLORS = ['#0ea5e9', '#f43f5e', '#10b981', '#8b5cf6', '#f59e0b', '#06b6d4', '#ec4899', '#14b8a6']

const OWNERSHIP_CHIP: Record<string, string> = {
    husband: 'bg-sky-50 text-sky-600',
    wife: 'bg-violet-50 text-violet-600',
    joint: 'bg-emerald-50 text-emerald-600',
}
const OWNERSHIP_LABELS: Record<string, string> = {
    husband: '👨 Husband', wife: '👩 Wife', joint: '🤝 Joint',
}

function toMonthly(amount: number, cadence: string): number {
    if (cadence === 'weekly') return (amount * 52) / 12
    if (cadence === 'annually') return amount / 12
    return amount
}

function fmt(n: number) {
    return `KES ${Math.abs(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtK(n: number) {
    if (n >= 1000) return `KES ${(n / 1000).toFixed(0)}K`
    return `KES ${n.toFixed(0)}`
}

function ChartTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null
    const d = payload[0]
    const name = d.name || d.payload?.name
    return (
        <div className="bg-white rounded-2xl border border-slate-100 px-3 py-2 shadow-lg text-xs">
            <p className="font-bold text-slate-700">{name}</p>
            <p className="font-black text-slate-900 mt-0.5">{fmt(d.value)}<span className="font-normal text-slate-400">/mo</span></p>
        </div>
    )
}

export default function BudgetReport() {
    const { household, members, currentUserId } = useHousehold()
    const [groups, setGroups] = useState<ExpenseGroup[]>([])
    const [expenses, setExpenses] = useState<Expense[]>([])
    const [loading, setLoading] = useState(true)
    const [scope, setScope] = useState<'all' | 'me'>('all')

    useEffect(() => {
        if (!household) return
        setLoading(true)
        Promise.all([
            apiGet<ExpenseGroup[]>(`/api/households/${household.id}/budget/groups`),
            apiGet<Expense[]>(`/api/households/${household.id}/budget/expenses`),
        ]).then(([g, e]) => {
            setGroups(g.filter(g => !g.is_deleted))
            setExpenses(e.filter(e => !e.is_deleted))
        }).catch(() => toast.error('Failed to load report'))
        .finally(() => setLoading(false))
    }, [household?.id])

    const myMember = useMemo(() =>
        members.find(m => m.user_id === currentUserId), [members, currentUserId])
    const myRole = myMember?.member_type.name.toLowerCase() ?? ''

    const effectiveAmount = (e: Expense): number | null => {
        if (scope === 'all') return Number(e.monthly_amount)
        if (e.owner_id !== null) return e.owner_id === currentUserId ? Number(e.monthly_amount) : null
        if (e.ownership_type === myRole) return Number(e.monthly_amount)
        if (e.ownership_type === 'joint') {
            const split = myRole === 'husband' ? (e.joint_split_husband ?? 50)
                        : myRole === 'wife'    ? (e.joint_split_wife    ?? 50)
                        : 0
            return Number(e.monthly_amount) * split / 100
        }
        return null
    }

    const scopedRows = useMemo(() => {
        return expenses.flatMap(e => {
            const amt = effectiveAmount(e)
            return amt !== null && amt > 0 ? [{ expense: e, amount: amt }] : []
        })
    }, [expenses, scope, currentUserId, myRole])

    const totalMonthly = scopedRows.reduce((s, r) => s + r.amount, 0)

    const byGroup = useMemo(() => {
        const map = new Map<string | null, { expense: Expense; amount: number }[]>()
        for (const row of scopedRows) {
            const key = row.expense.group_id
            if (!map.has(key)) map.set(key, [])
            map.get(key)!.push(row)
        }
        return map
    }, [scopedRows])

    const activeGroupCount = useMemo(() =>
        groups.filter(g => (byGroup.get(g.id) ?? []).length > 0).length,
    [groups, byGroup])

    // Donut chart data — groups + ungrouped
    const donutData = useMemo(() => {
        const result = groups.flatMap((g, i) => {
            const rows = byGroup.get(g.id) ?? []
            if (rows.length === 0) return []
            return [{ name: g.name, value: rows.reduce((s, r) => s + r.amount, 0), color: CHART_COLORS[i % CHART_COLORS.length] }]
        })
        const ungrouped = byGroup.get(null) ?? []
        if (ungrouped.length > 0) {
            result.push({ name: 'Ungrouped', value: ungrouped.reduce((s, r) => s + r.amount, 0), color: '#cbd5e1' })
        }
        return result
    }, [groups, byGroup])

    // Per-member allocated expenses (all scope only)
    const memberRows = useMemo(() => {
        if (scope !== 'all') return []
        const incomeMembers = members.filter(m => m.contributes_income && m.income_amount)
        const hhExp = expenses.filter(e => e.owner_id === null)
        return incomeMembers.map((m, i) => {
            const role = m.member_type.name.toLowerCase()
            const hhOwned = hhExp.filter(e => e.ownership_type === role)
                .reduce((s, e) => s + Number(e.monthly_amount), 0)
            const hhJoint = hhExp.filter(e => e.ownership_type === 'joint')
                .reduce((s, e) => {
                    const split = role === 'husband' ? (e.joint_split_husband ?? 50)
                                : role === 'wife'    ? (e.joint_split_wife    ?? 50)
                                : 0
                    return s + Number(e.monthly_amount) * split / 100
                }, 0)
            const personal = expenses.filter(e => e.owner_id === m.user_id)
                .reduce((s, e) => s + Number(e.monthly_amount), 0)
            const allocated = hhOwned + hhJoint + personal
            return { member: m, allocated, color: CHART_COLORS[i % CHART_COLORS.length], gradient: GRADIENTS[i % GRADIENTS.length] }
        })
    }, [expenses, members, scope])

    const totalAllocated = memberRows.reduce((s, r) => s + r.allocated, 0)
    const barData = memberRows.map(r => ({ name: r.member.name, allocated: r.allocated, color: r.color }))

    if (loading) return (
        <div className="flex items-center justify-center h-48">
            <div className="w-6 h-6 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
        </div>
    )

    return (
        <div className="space-y-6">
            {/* Scope toggle */}
            <div className="flex items-center gap-2 bg-slate-100 rounded-2xl p-1 w-fit">
                {(['all', 'me'] as const).map(s => (
                    <button key={s} onClick={() => setScope(s)}
                        className={`px-4 py-1.5 rounded-xl text-sm font-bold transition-all ${scope === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                        {s === 'all' ? '🏠 All Household' : '👤 Me'}
                    </button>
                ))}
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3">
                <div className="bg-white rounded-3xl p-4 border border-slate-100" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Monthly Total</p>
                    <p className="text-lg font-black text-slate-900">{fmt(totalMonthly)}</p>
                    <p className="text-xs text-slate-400 mt-0.5">/ mo</p>
                </div>
                <div className="bg-white rounded-3xl p-4 border border-slate-100" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                    <div className="flex items-center gap-1.5 mb-1">
                        <Receipt className="h-3 w-3 text-slate-400" />
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Expenses</p>
                    </div>
                    <p className="text-lg font-black text-slate-900">{scopedRows.length}</p>
                    <p className="text-xs text-slate-400 mt-0.5">line items</p>
                </div>
                <div className="bg-white rounded-3xl p-4 border border-slate-100" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                    <div className="flex items-center gap-1.5 mb-1">
                        <Layers className="h-3 w-3 text-slate-400" />
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Groups</p>
                    </div>
                    <p className="text-lg font-black text-slate-900">{activeGroupCount}</p>
                    <p className="text-xs text-slate-400 mt-0.5">active</p>
                </div>
            </div>

            {/* ── Charts ── */}
            {scopedRows.length > 0 && (
                <div className={`grid gap-4 ${scope === 'all' && memberRows.length > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>

                    {/* Donut — group breakdown */}
                    <div className="bg-white rounded-3xl border border-slate-100 p-5" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">By Group</p>
                        <ResponsiveContainer width="100%" height={180}>
                            <PieChart>
                                <Pie data={donutData} cx="50%" cy="50%"
                                    innerRadius={52} outerRadius={78}
                                    paddingAngle={2} dataKey="value" strokeWidth={0}>
                                    {donutData.map((entry, i) => (
                                        <Cell key={i} fill={entry.color} />
                                    ))}
                                </Pie>
                                <ReTooltip content={<ChartTooltip />} />
                            </PieChart>
                        </ResponsiveContainer>
                        {/* Legend */}
                        <div className="mt-3 space-y-1.5">
                            {donutData.map((entry, i) => {
                                const pct = totalMonthly > 0 ? (entry.value / totalMonthly) * 100 : 0
                                return (
                                    <div key={i} className="flex items-center gap-2">
                                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: entry.color }} />
                                        <p className="text-xs text-slate-600 truncate flex-1 min-w-0">{entry.name}</p>
                                        <p className="text-xs font-bold text-slate-500 flex-shrink-0">{pct.toFixed(0)}%</p>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* Horizontal bar — member comparison (all scope) */}
                    {scope === 'all' && memberRows.length > 0 && (
                        <div className="bg-white rounded-3xl border border-slate-100 p-5" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">By Member</p>
                            <ResponsiveContainer width="100%" height={180}>
                                <BarChart layout="vertical" data={barData}
                                    margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                                    <CartesianGrid horizontal={false} stroke="#f1f5f9" />
                                    <XAxis type="number" tickFormatter={fmtK}
                                        tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                    <YAxis type="category" dataKey="name" width={70}
                                        tick={{ fontSize: 11, fontWeight: 700, fill: '#475569' }} axisLine={false} tickLine={false} />
                                    <ReTooltip content={<ChartTooltip />} cursor={{ fill: '#f8fafc' }} />
                                    <Bar dataKey="allocated" radius={[0, 6, 6, 0]} maxBarSize={28}>
                                        {barData.map((entry, i) => (
                                            <Cell key={i} fill={entry.color} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                            {/* Totals */}
                            <div className="mt-3 space-y-1.5">
                                {memberRows.map(row => {
                                    const pct = totalAllocated > 0 ? (row.allocated / totalAllocated) * 100 : 0
                                    return (
                                        <div key={row.member.id} className="flex items-center gap-2">
                                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: row.color }} />
                                            <p className="text-xs text-slate-600 truncate flex-1 min-w-0">{row.member.name}</p>
                                            <p className="text-xs font-bold text-slate-500 flex-shrink-0">{pct.toFixed(0)}%</p>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Group breakdown list ── */}
            <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Expense Detail</p>

                {scopedRows.length === 0 && (
                    <div className="flex items-center justify-center h-32 rounded-3xl border-2 border-dashed border-slate-200">
                        <p className="text-sm text-slate-400">No expenses in this view</p>
                    </div>
                )}

                {groups.map((group, gi) => {
                    const rows = byGroup.get(group.id) ?? []
                    if (rows.length === 0) return null
                    const groupTotal = rows.reduce((s, r) => s + r.amount, 0)
                    const pct = totalMonthly > 0 ? (groupTotal / totalMonthly) * 100 : 0
                    return (
                        <div key={group.id} className="bg-white rounded-3xl border border-slate-100 overflow-hidden"
                            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                            <div className="flex items-center gap-3 px-5 py-4">
                                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm font-black flex-shrink-0"
                                    style={{ background: GRADIENTS[gi % GRADIENTS.length] }}>
                                    {group.name.charAt(0)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-3 mb-1.5">
                                        <p className="font-bold text-slate-900 text-sm">{group.name}</p>
                                        <p className="font-black text-slate-900 text-sm flex-shrink-0">
                                            {fmt(groupTotal)}<span className="text-xs font-normal text-slate-400">/mo</span>
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                            <div className="h-full rounded-full transition-all"
                                                style={{ width: `${pct}%`, background: GRADIENTS[gi % GRADIENTS.length] }} />
                                        </div>
                                        <span className="text-xs text-slate-400 flex-shrink-0">{pct.toFixed(0)}%</span>
                                    </div>
                                </div>
                            </div>
                            <div className="border-t border-slate-50 divide-y divide-slate-50">
                                {rows.map(({ expense, amount }) => (
                                    <div key={expense.id} className="flex items-center justify-between px-5 py-3 pl-16">
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-slate-700 truncate">{expense.name}</p>
                                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                                <span className={`px-1.5 py-0.5 rounded-md text-xs font-bold ${OWNERSHIP_CHIP[expense.ownership_type] ?? 'bg-slate-50 text-slate-500'}`}>
                                                    {OWNERSHIP_LABELS[expense.ownership_type] ?? expense.ownership_type}
                                                </span>
                                                {expense.ownership_type === 'joint' && scope === 'me' && (
                                                    <span className="text-xs text-slate-400">
                                                        {myRole === 'husband' ? expense.joint_split_husband : expense.joint_split_wife}% share
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <p className="text-sm font-bold text-slate-900 flex-shrink-0 ml-3">
                                            {fmt(amount)}<span className="text-xs font-normal text-slate-400">/mo</span>
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )
                })}

                {/* Ungrouped */}
                {(() => {
                    const rows = byGroup.get(null) ?? []
                    if (rows.length === 0) return null
                    const groupTotal = rows.reduce((s, r) => s + r.amount, 0)
                    const pct = totalMonthly > 0 ? (groupTotal / totalMonthly) * 100 : 0
                    return (
                        <div className="bg-white rounded-3xl border border-dashed border-slate-200 overflow-hidden"
                            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                            <div className="flex items-center gap-3 px-5 py-4">
                                <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-slate-100 text-slate-400 text-sm font-black flex-shrink-0">?</div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-3 mb-1.5">
                                        <p className="font-bold text-slate-500 text-sm">Ungrouped</p>
                                        <p className="font-black text-slate-900 text-sm flex-shrink-0">
                                            {fmt(groupTotal)}<span className="text-xs font-normal text-slate-400">/mo</span>
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                            <div className="h-full rounded-full bg-slate-300 transition-all" style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="text-xs text-slate-400 flex-shrink-0">{pct.toFixed(0)}%</span>
                                    </div>
                                </div>
                            </div>
                            <div className="border-t border-slate-50 divide-y divide-slate-50">
                                {rows.map(({ expense, amount }) => (
                                    <div key={expense.id} className="flex items-center justify-between px-5 py-3 pl-16">
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-slate-700 truncate">{expense.name}</p>
                                            <span className={`px-1.5 py-0.5 rounded-md text-xs font-bold ${OWNERSHIP_CHIP[expense.ownership_type] ?? 'bg-slate-50 text-slate-500'}`}>
                                                {OWNERSHIP_LABELS[expense.ownership_type] ?? expense.ownership_type}
                                            </span>
                                        </div>
                                        <p className="text-sm font-bold text-slate-900 flex-shrink-0 ml-3">
                                            {fmt(amount)}<span className="text-xs font-normal text-slate-400">/mo</span>
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )
                })()}
            </div>
        </div>
    )
}
