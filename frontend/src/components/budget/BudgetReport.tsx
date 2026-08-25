'use client'

import { useEffect, useMemo, useState } from 'react'
import { useHousehold } from '@/context/HouseholdContext'
import { apiGet } from '@/lib/api'
import { toast } from 'sonner'
import { Layers, Receipt } from 'lucide-react'
import {
    ResponsiveContainer, PieChart, Pie, Cell, Tooltip as ReTooltip,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts'

interface ExpenseTag { id: string; name: string; color: string | null }
interface ExpenseGroup { id: string; name: string; owner_id: string | null; is_deleted: boolean }
interface GroupTrend { group_id: string | null; group_name: string; total: number }
interface SessionTrend { session_id: string; month: string; status: string; group_totals: GroupTrend[]; session_total: number }
interface VarianceItem { item_id: string; name: string; budgeted: number; paid: number; variance: number }
interface VarianceGroup { group_id: string | null; group_name: string; budgeted: number; paid: number; variance: number; items: VarianceItem[] }
interface VarianceData { session_id: string; month: string; status: string; total_budgeted: number; total_paid: number; total_variance: number; groups: VarianceGroup[] }
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
    const { household, members, currentUserId, viewMode } = useHousehold()
    const [groups, setGroups] = useState<ExpenseGroup[]>([])
    const [expenses, setExpenses] = useState<Expense[]>([])
    const [trendSessions, setTrendSessions] = useState<SessionTrend[]>([])
    const [variance, setVariance] = useState<VarianceData | null>(null)
    const [loading, setLoading] = useState(true)
    const [scope, setScope] = useState<'all' | 'me'>(() => viewMode === 'me' ? 'me' : 'all')
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

    useEffect(() => { setScope(viewMode === 'me' ? 'me' : 'all') }, [viewMode])

    useEffect(() => {
        if (!household) return
        setLoading(true)
        Promise.all([
            apiGet<ExpenseGroup[]>(`/api/households/${household.id}/budget/groups`),
            apiGet<Expense[]>(`/api/households/${household.id}/budget/expenses`),
            apiGet<{ sessions: SessionTrend[] }>(`/api/households/${household.id}/budget/trend`),
            apiGet<VarianceData>(`/api/households/${household.id}/budget/variance`).catch(() => null),
        ]).then(([g, e, t, v]) => {
            setGroups(g.filter(g => !g.is_deleted))
            setExpenses(e.filter(e => !e.is_deleted))
            setTrendSessions(t.sessions)
            setVariance(v)
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

    // Per-member allocated expenses (all scope only) — full breakdown
    const memberRows = useMemo(() => {
        if (scope !== 'all') return []
        const incomeMembers = members.filter(m => m.contributes_income && m.income_amount)
        const hhExp = expenses.filter(e => e.owner_id === null)
        return incomeMembers.map((m, i) => {
            const income = toMonthly(Number(m.income_amount), m.income_cadence ?? 'monthly')
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
            const remaining = income - allocated
            const savingsRate = income > 0 ? (remaining / income) * 100 : 0
            return {
                member: m, income, hhOwned, hhJoint, personal,
                allocated, remaining, savingsRate,
                color: CHART_COLORS[i % CHART_COLORS.length],
                gradient: GRADIENTS[i % GRADIENTS.length],
            }
        })
    }, [expenses, members, scope])

    const totalAllocated = memberRows.reduce((s, r) => s + r.allocated, 0)
    const barData = memberRows.map(r => ({ name: r.member.name, allocated: r.allocated, color: r.color }))

    // Month-over-month trend chart data
    const { trendChartData, trendGroupNames } = useMemo(() => {
        if (trendSessions.length < 2) return { trendChartData: [], trendGroupNames: [] }
        const allGroupNames = new Set<string>()
        for (const s of trendSessions) {
            for (const g of s.group_totals) allGroupNames.add(g.group_name)
        }
        const groupNames = Array.from(allGroupNames)
        const chartData = trendSessions.map(s => {
            const d: Record<string, number | string> = {
                month: new Date(s.month + 'T00:00:00').toLocaleDateString('en-KE', { month: 'short', year: '2-digit' }),
            }
            for (const name of groupNames) {
                const found = s.group_totals.find(g => g.group_name === name)
                d[name] = found ? Number(found.total) : 0
            }
            return d
        })
        return { trendChartData: chartData, trendGroupNames: groupNames }
    }, [trendSessions])

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

            {/* ── Member Financial Portraits ── */}
            {scope === 'all' && memberRows.length > 0 && (
                <div className="space-y-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Member Portraits</p>
                    <div className={`grid gap-4 ${memberRows.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                        {memberRows.map(row => {
                            const { member, income, hhOwned, hhJoint, personal, allocated, remaining, savingsRate, gradient } = row
                            const isMe = member.user_id === currentUserId
                            const overspent = remaining < 0
                            const memberRole = member.member_type.name

                            const hhOwnedPct = income > 0 ? Math.min((hhOwned / income) * 100, 100) : 0
                            const hhJointPct = income > 0 ? Math.min((hhJoint / income) * 100, 100 - hhOwnedPct) : 0
                            const personalPct = income > 0 ? Math.min((personal / income) * 100, 100 - hhOwnedPct - hhJointPct) : 0
                            const remainingPct = Math.max(0, 100 - hhOwnedPct - hhJointPct - personalPct)
                            const assignedPct = income > 0 ? Math.min((allocated / income) * 100, 100) : 0

                            return (
                                <div key={member.id} className="bg-white rounded-3xl border border-slate-100 overflow-hidden"
                                    style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>

                                    {/* Gradient accent band */}
                                    <div className="h-1 w-full" style={{ background: gradient }} />

                                    {/* Header */}
                                    <div className="flex items-center gap-3 px-5 pt-4 pb-3">
                                        <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-black text-base flex-shrink-0"
                                            style={{ background: gradient }}>
                                            {member.name.charAt(0)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="font-black text-slate-900 text-sm">{member.name}</p>
                                                <span className="px-1.5 py-0.5 rounded-md text-xs font-bold bg-slate-100 text-slate-500">{memberRole}</span>
                                                {isMe && <span className="px-1.5 py-0.5 rounded-md text-xs font-bold bg-sky-50 text-sky-600">You</span>}
                                            </div>
                                            <p className="text-xs text-slate-400 mt-0.5">{fmt(income)}<span className="text-slate-300"> / mo income</span></p>
                                        </div>
                                    </div>

                                    {/* Stacked income allocation bar */}
                                    <div className="px-5 pb-3">
                                        <div className="flex h-3 rounded-full overflow-hidden gap-px bg-slate-100">
                                            {hhOwnedPct > 0 && (
                                                <div style={{ width: `${hhOwnedPct}%`, background: '#0ea5e9' }} />
                                            )}
                                            {hhJointPct > 0 && (
                                                <div style={{ width: `${hhJointPct}%`, background: '#8b5cf6' }} />
                                            )}
                                            {personalPct > 0 && (
                                                <div style={{ width: `${personalPct}%`, background: '#f59e0b' }} />
                                            )}
                                            {remainingPct > 0 && (
                                                <div style={{ width: `${remainingPct}%`, background: '#10b981', opacity: 0.3 }} />
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                                            {hhOwned > 0 && (
                                                <div className="flex items-center gap-1">
                                                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#0ea5e9' }} />
                                                    <span className="text-xs text-slate-400">HH Role</span>
                                                </div>
                                            )}
                                            {hhJoint > 0 && (
                                                <div className="flex items-center gap-1">
                                                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#8b5cf6' }} />
                                                    <span className="text-xs text-slate-400">HH Joint</span>
                                                </div>
                                            )}
                                            {personal > 0 && (
                                                <div className="flex items-center gap-1">
                                                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#f59e0b' }} />
                                                    <span className="text-xs text-slate-400">Personal</span>
                                                </div>
                                            )}
                                            <p className="text-xs font-bold text-slate-500 ml-auto">{assignedPct.toFixed(0)}% assigned</p>
                                        </div>
                                    </div>

                                    {/* Breakdown rows */}
                                    <div className="mx-5 mb-4 rounded-2xl bg-slate-50 overflow-hidden divide-y divide-white">
                                        {hhOwned > 0 && (
                                            <div className="flex items-center justify-between px-4 py-2.5">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#0ea5e9' }} />
                                                    <p className="text-xs text-slate-500">HH · {memberRole}</p>
                                                </div>
                                                <p className="text-xs font-bold text-slate-700">{fmt(hhOwned)}<span className="text-slate-400 font-normal">/mo</span></p>
                                            </div>
                                        )}
                                        {hhJoint > 0 && (
                                            <div className="flex items-center justify-between px-4 py-2.5">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#8b5cf6' }} />
                                                    <p className="text-xs text-slate-500">HH · Joint share</p>
                                                </div>
                                                <p className="text-xs font-bold text-slate-700">{fmt(hhJoint)}<span className="text-slate-400 font-normal">/mo</span></p>
                                            </div>
                                        )}
                                        {personal > 0 && (
                                            <div className="flex items-center justify-between px-4 py-2.5">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#f59e0b' }} />
                                                    <p className="text-xs text-slate-500">Personal</p>
                                                </div>
                                                <p className="text-xs font-bold text-slate-700">{fmt(personal)}<span className="text-slate-400 font-normal">/mo</span></p>
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between px-4 py-2.5 bg-white/60">
                                            <p className="text-xs font-bold text-slate-700">Total Assigned</p>
                                            <p className="text-xs font-black text-slate-900">{fmt(allocated)}<span className="text-slate-400 font-normal">/mo</span></p>
                                        </div>
                                    </div>

                                    {/* Remaining + savings rate */}
                                    <div className={`mx-5 mb-5 flex items-center justify-between rounded-2xl px-4 py-3 ${
                                        overspent ? 'bg-rose-50 border border-rose-100' : 'bg-emerald-50 border border-emerald-100'
                                    }`}>
                                        <div>
                                            <p className={`text-xs font-bold ${overspent ? 'text-rose-500' : 'text-emerald-600'}`}>
                                                {overspent ? '⚠ Overspent' : '✓ Remaining'}
                                            </p>
                                            <p className={`text-base font-black mt-0.5 ${overspent ? 'text-rose-600' : 'text-emerald-700'}`}>
                                                {overspent ? '−' : ''}{fmt(Math.abs(remaining))}<span className="text-xs font-normal text-slate-400">/mo</span>
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-slate-400">savings rate</p>
                                            <p className={`text-lg font-black ${
                                                overspent ? 'text-rose-500'
                                                : savingsRate >= 20 ? 'text-emerald-600'
                                                : savingsRate >= 10 ? 'text-amber-500'
                                                : 'text-slate-500'
                                            }`}>
                                                {overspent ? '−' : ''}{Math.abs(savingsRate).toFixed(1)}%
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* ── Month-over-month trend ── */}
            {scope === 'all' && trendChartData.length >= 2 && (
                <div className="bg-white rounded-3xl border border-slate-100 p-5" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Monthly Budget Trend</p>
                        <p className="text-xs text-slate-400">{trendSessions.length} months</p>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={trendChartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }} barSize={28}>
                            <CartesianGrid vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 600 }} axisLine={false} tickLine={false} />
                            <YAxis tickFormatter={fmtK} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={60} />
                            <ReTooltip
                                content={({ active, payload, label }) => {
                                    if (!active || !payload?.length) return null
                                    const total = (payload as any[]).reduce((s: number, p: any) => s + (p.value || 0), 0)
                                    return (
                                        <div className="bg-white rounded-2xl border border-slate-100 px-3 py-2.5 shadow-lg text-xs min-w-[160px]">
                                            <p className="font-black text-slate-700 mb-2">{label}</p>
                                            {(payload as any[]).filter(p => p.value > 0).map((p: any, i: number) => (
                                                <div key={i} className="flex items-center justify-between gap-4 mb-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.fill }} />
                                                        <span className="text-slate-500 truncate max-w-[90px]">{p.name}</span>
                                                    </div>
                                                    <span className="font-bold text-slate-700 flex-shrink-0">{fmtK(p.value)}</span>
                                                </div>
                                            ))}
                                            <div className="border-t border-slate-100 pt-1 mt-1 flex items-center justify-between">
                                                <span className="text-slate-400">Total</span>
                                                <span className="font-black text-slate-900">{fmtK(total)}</span>
                                            </div>
                                        </div>
                                    )
                                }}
                                cursor={{ fill: '#f8fafc' }}
                            />
                            {trendGroupNames.map((name, i) => (
                                <Bar key={name} dataKey={name} stackId="a"
                                    fill={CHART_COLORS[i % CHART_COLORS.length]}
                                    radius={i === trendGroupNames.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                                />
                            ))}
                        </BarChart>
                    </ResponsiveContainer>
                    {/* Group legend */}
                    <div className="flex flex-wrap gap-3 mt-3">
                        {trendGroupNames.map((name, i) => (
                            <div key={name} className="flex items-center gap-1.5">
                                <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                                <span className="text-xs text-slate-500">{name}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Budget vs Actual Variance ── */}
            {scope === 'all' && variance && variance.total_paid > 0 && (() => {
                const monthLabel = new Date(variance.month + 'T00:00:00').toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })
                const totalSaved = -variance.total_variance
                const groups = variance.groups.filter(g => g.paid > 0 || g.budgeted > 0)
                return (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Budget vs Actual · {monthLabel}</p>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                totalSaved >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'
                            }`}>
                                {totalSaved >= 0 ? `${fmt(totalSaved)} under budget` : `${fmt(Math.abs(totalSaved))} over budget`}
                            </span>
                        </div>

                        {/* Summary bar */}
                        <div className="bg-white rounded-3xl border border-slate-100 p-5" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                            <div className="flex items-center justify-between mb-3">
                                <div className="text-center">
                                    <p className="text-xs text-slate-400 font-medium">Budgeted</p>
                                    <p className="text-sm font-black text-slate-900 mt-0.5">{fmt(variance.total_budgeted)}</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-xs text-slate-400 font-medium">Paid</p>
                                    <p className="text-sm font-black text-slate-900 mt-0.5">{fmt(variance.total_paid)}</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-xs text-slate-400 font-medium">Variance</p>
                                    <p className={`text-sm font-black mt-0.5 ${totalSaved >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                        {totalSaved >= 0 ? '−' : '+'}{fmt(Math.abs(variance.total_variance))}
                                    </p>
                                </div>
                            </div>
                            {/* Dual bar: budgeted vs paid */}
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-400 w-14 flex-shrink-0">Budget</span>
                                    <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-slate-300 rounded-full" style={{ width: '100%' }} />
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-400 w-14 flex-shrink-0">Paid</span>
                                    <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full transition-all ${totalSaved >= 0 ? 'bg-emerald-400' : 'bg-rose-400'}`}
                                            style={{ width: `${Math.min((variance.total_paid / variance.total_budgeted) * 100, 100)}%` }} />
                                    </div>
                                    <span className="text-xs font-bold text-slate-500 flex-shrink-0 w-9 text-right">
                                        {((variance.total_paid / variance.total_budgeted) * 100).toFixed(0)}%
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Per-group rows */}
                        <div className="space-y-2">
                            {groups.map((g, gi) => {
                                const gSaved = -g.variance
                                const isExpanded = expandedGroups.has(g.group_name)
                                const paidPct = g.budgeted > 0 ? Math.min((g.paid / g.budgeted) * 100, 120) : 0
                                return (
                                    <div key={g.group_name} className="bg-white rounded-2xl border border-slate-100 overflow-hidden"
                                        style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                                        <button
                                            className="w-full flex items-center gap-3 px-5 py-3.5 text-left"
                                            onClick={() => setExpandedGroups(prev => {
                                                const next = new Set(prev)
                                                next.has(g.group_name) ? next.delete(g.group_name) : next.add(g.group_name)
                                                return next
                                            })}>
                                            <div className="w-7 h-7 rounded-xl flex items-center justify-center text-white text-xs font-black flex-shrink-0"
                                                style={{ background: GRADIENTS[gi % GRADIENTS.length] }}>
                                                {g.group_name.charAt(0)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2 mb-1">
                                                    <p className="text-sm font-bold text-slate-800">{g.group_name}</p>
                                                    <span className={`text-xs font-bold flex-shrink-0 ${gSaved >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                                        {gSaved >= 0 ? '−' : '+'}{fmt(Math.abs(g.variance))}
                                                    </span>
                                                </div>
                                                <div className="flex h-1.5 rounded-full overflow-hidden bg-slate-100 gap-px">
                                                    <div className={`h-full rounded-full ${gSaved >= 0 ? 'bg-emerald-400' : 'bg-rose-400'}`}
                                                        style={{ width: `${Math.min(paidPct, 100)}%` }} />
                                                </div>
                                            </div>
                                            <span className="text-xs text-slate-300 flex-shrink-0">{isExpanded ? '▲' : '▼'}</span>
                                        </button>
                                        {isExpanded && (
                                            <div className="border-t border-slate-50 divide-y divide-slate-50">
                                                {g.items.filter(it => it.paid > 0 || it.budgeted > 0).map(it => {
                                                    const iSaved = -it.variance
                                                    return (
                                                        <div key={it.item_id} className="flex items-center justify-between px-5 py-2.5 pl-16">
                                                            <p className="text-xs text-slate-600 truncate flex-1 min-w-0">{it.name}</p>
                                                            <div className="flex items-center gap-3 flex-shrink-0 text-xs">
                                                                <span className="text-slate-400">{fmt(it.budgeted)}</span>
                                                                <span className="text-slate-300">→</span>
                                                                <span className="font-bold text-slate-700">{fmt(it.paid)}</span>
                                                                {it.variance !== 0 && (
                                                                    <span className={`font-bold ${iSaved >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                                                        {iSaved >= 0 ? '−' : '+'}{fmt(Math.abs(it.variance))}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )
            })()}

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
