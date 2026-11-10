'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useHousehold } from '@/context/HouseholdContext'
import { apiGet } from '@/lib/api'
import { toast } from 'sonner'
import { Layers, Receipt, Maximize2, AlignLeft, BarChart2 as BarChartIcon, Disc, TrendingUp } from 'lucide-react'
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, Tooltip as ReTooltip,
    PieChart, Pie, Legend, LineChart, Line, ReferenceLine,
} from 'recharts'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

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
    const pct: number | undefined = d.payload?.pct
    return (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 px-3 py-2.5 shadow-lg text-xs min-w-[160px]">
            <div className="flex items-center gap-1.5 mb-1.5">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.payload?.color ?? d.fill }} />
                <p className="font-bold text-slate-700 dark:text-slate-200">{name}</p>
            </div>
            <p className="font-black text-slate-900 dark:text-white">{fmt(d.value)}<span className="font-normal text-slate-400">/mo</span></p>
            {pct !== undefined && <p className="text-slate-400 mt-0.5">{pct.toFixed(1)}% of total</p>}
        </div>
    )
}

// ── Chart type system ───────────────────────────────────────────────────────

type ByGroupChartType = 'bar-h' | 'bar-v' | 'donut'
type TrendChartType   = 'bar' | 'line'

const CHART_PREFS_KEY = 'hpm_report_chart_prefs'

function getChartPrefs(): { byGroup: ByGroupChartType; trend: TrendChartType } {
    if (typeof window === 'undefined') return { byGroup: 'bar-h', trend: 'bar' }
    try {
        const p = JSON.parse(localStorage.getItem(CHART_PREFS_KEY) ?? '{}')
        return { byGroup: p.byGroup ?? 'bar-h', trend: p.trend ?? 'bar' }
    } catch { return { byGroup: 'bar-h', trend: 'bar' } }
}

function saveChartPref(key: 'byGroup' | 'trend', value: string) {
    try {
        const p = JSON.parse(localStorage.getItem(CHART_PREFS_KEY) ?? '{}')
        localStorage.setItem(CHART_PREFS_KEY, JSON.stringify({ ...p, [key]: value }))
    } catch {}
}

const BY_GROUP_TYPES = [
    { key: 'bar-h' as ByGroupChartType, label: 'Horizontal', Icon: AlignLeft },
    { key: 'bar-v' as ByGroupChartType, label: 'Vertical',   Icon: BarChartIcon },
    { key: 'donut' as ByGroupChartType, label: 'Donut',      Icon: Disc },
]
const TREND_TYPES = [
    { key: 'bar'  as TrendChartType, label: 'Stacked Bar', Icon: BarChartIcon },
    { key: 'line' as TrendChartType, label: 'Line',        Icon: TrendingUp },
]

// Truncated tick for horizontal-bar Y axis (long group names)
function TruncatedYTick({ x, y, payload }: any) {
    const max = 13
    const text = payload.value.length > max ? `${payload.value.slice(0, max)}…` : payload.value
    return <text x={x} y={y} dy={4} textAnchor="end" fontSize={11} fontWeight={700} fill="#64748b">{text}</text>
}

// Angled tick for vertical-bar X axis
function AngledXTick({ x, y, payload }: any) {
    const max = 9
    const text = payload.value.length > max ? `${payload.value.slice(0, max)}…` : payload.value
    return (
        <g transform={`translate(${x},${y})`}>
            <text x={0} y={0} dy={10} textAnchor="end" fontSize={10} fontWeight={700} fill="#64748b" transform="rotate(-40)">
                {text}
            </text>
        </g>
    )
}

function ByGroupChartView({ data, type, height = 220 }: {
    data: { name: string; value: number; color: string; pct: number }[]
    type: ByGroupChartType
    height?: number
}) {
    const yAxisWidth = Math.min(90, Math.max(55, Math.max(...data.map(d => d.name.length)) * 6.5))

    if (type === 'bar-h') {
        return (
            <ResponsiveContainer width="100%" height={height}>
                <BarChart layout="vertical" data={data} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid horizontal={false} stroke="#f1f5f9" strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={fmtK}
                        tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={yAxisWidth}
                        tick={<TruncatedYTick />} axisLine={false} tickLine={false} />
                    <ReTooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={30}>
                        {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        )
    }

    if (type === 'bar-v') {
        return (
            <ResponsiveContainer width="100%" height={height}>
                <BarChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 48 }}>
                    <CartesianGrid vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={<AngledXTick />} axisLine={false} tickLine={false} interval={0} />
                    <YAxis tickFormatter={fmtK} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={55} />
                    <ReTooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={40}>
                        {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        )
    }

    return (
        <ResponsiveContainer width="100%" height={height}>
            <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    innerRadius="35%" outerRadius="62%" paddingAngle={2}>
                    {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <ReTooltip content={<ChartTooltip />} />
                <Legend iconType="circle" iconSize={8}
                    formatter={(value: string) => (
                        <span style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>{value}</span>
                    )} />
            </PieChart>
        </ResponsiveContainer>
    )
}

function TrendChartView({ data, groupNames, type, height = 220 }: {
    data: Record<string, number | string>[]
    groupNames: string[]
    type: TrendChartType
    height?: number
}) {
    const sharedTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload?.length) return null
        const total = (payload as any[]).reduce((s: number, p: any) => s + (p.value || 0), 0)
        return (
            <div className="bg-white rounded-2xl border border-slate-100 px-3 py-2.5 shadow-lg text-xs min-w-[160px]">
                <p className="font-black text-slate-700 mb-2">{label}</p>
                {(payload as any[]).filter(p => p.value > 0).map((p: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-4 mb-1">
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.fill ?? p.stroke }} />
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
    }

    if (type === 'line') {
        return (
            <ResponsiveContainer width="100%" height={height}>
                <LineChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 600 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={fmtK} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={60} />
                    <ReTooltip content={sharedTooltip} />
                    {groupNames.map((name, i) => (
                        <Line key={name} type="monotone" dataKey={name}
                            stroke={CHART_COLORS[i % CHART_COLORS.length]}
                            strokeWidth={2} dot={{ r: 3, fill: CHART_COLORS[i % CHART_COLORS.length] }} activeDot={{ r: 5 }} />
                    ))}
                </LineChart>
            </ResponsiveContainer>
        )
    }

    return (
        <ResponsiveContainer width="100%" height={height}>
            <BarChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }} barSize={28}>
                <CartesianGrid vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 600 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtK} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={60} />
                <ReTooltip content={sharedTooltip} cursor={{ fill: '#f8fafc' }} />
                {groupNames.map((name, i) => (
                    <Bar key={name} dataKey={name} stackId="a"
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                        radius={i === groupNames.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                    />
                ))}
            </BarChart>
        </ResponsiveContainer>
    )
}

interface SavingsTrendApiData {
    months: {
        month: string
        household_savings_rate: number
        members: { member_id: string; name: string; savings_rate: number }[]
    }[]
}

export default function BudgetReport() {
    const { household, members, currentUserId, viewMode } = useHousehold()
    const [groups, setGroups] = useState<ExpenseGroup[]>([])
    const [expenses, setExpenses] = useState<Expense[]>([])
    const [trendSessions, setTrendSessions] = useState<SessionTrend[]>([])
    const [variance, setVariance] = useState<VarianceData | null>(null)
    const [loading, setLoading] = useState(true)
    const scope = viewMode === 'me' ? 'me' : 'all'
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
    const [byGroupChartType, setByGroupChartType] = useState<ByGroupChartType>(() => getChartPrefs().byGroup)
    const [trendChartType, setTrendChartType]     = useState<TrendChartType>(() => getChartPrefs().trend)
    const [modalChart, setModalChart] = useState<'byGroup' | 'trend' | null>(null)
    const [pendingType, setPendingType] = useState<string>('bar-h')

    // Savings carousel
    const savingsSwipeRef = useRef<HTMLDivElement>(null)
    const [savingsPage, setSavingsPage] = useState(0)
    const touchStartX = useRef(0)
    const touchStartY = useRef(0)
    const [savingsTrend, setSavingsTrend] = useState<SavingsTrendApiData | null>(null)
    const [savingsTrendLoading, setSavingsTrendLoading] = useState(true)

    function openModal(chart: 'byGroup' | 'trend') {
        setPendingType(chart === 'byGroup' ? byGroupChartType : trendChartType)
        setModalChart(chart)
    }

    function applyChartType() {
        if (!modalChart) return
        if (modalChart === 'byGroup') setByGroupChartType(pendingType as ByGroupChartType)
        else setTrendChartType(pendingType as TrendChartType)
        saveChartPref(modalChart, pendingType)
        setModalChart(null)
    }

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

    const isSavingsTagged = (e: Expense) =>
        e.tag_assignments.some(ta => ta.tag.name.toLowerCase() === 'savings')

    const isInvestmentsTagged = (e: Expense) =>
        e.tag_assignments.some(ta => ['investments', 'investment'].includes(ta.tag.name.toLowerCase()))

    const savingsRows = scopedRows.filter(r => isSavingsTagged(r.expense))
    const totalSavingsMonthly = savingsRows.reduce((s, r) => s + r.amount, 0)

    const investmentRows = scopedRows.filter(r => isInvestmentsTagged(r.expense))
    const totalInvestmentsMonthly = investmentRows.reduce((s, r) => s + r.amount, 0)

    const scopedIncome = useMemo(() => {
        const incomeMembers = scope === 'me'
            ? members.filter(m => m.user_id === currentUserId && m.contributes_income && m.income_amount)
            : members.filter(m => m.contributes_income && m.income_amount)
        return incomeMembers.reduce((s, m) => s + toMonthly(Number(m.income_amount), m.income_cadence ?? 'monthly'), 0)
    }, [members, scope, currentUserId])

    const librarySavingsRate = scopedIncome > 0 ? (totalSavingsMonthly / scopedIncome) * 100 : 0

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

            // Savings rate = savings-tagged expenses for this member / income
            const memberSavings = expenses.filter(e => !e.is_deleted && isSavingsTagged(e)).reduce((s, e) => {
                if (e.owner_id !== null) return e.owner_id === m.user_id ? s + Number(e.monthly_amount) : s
                if (e.ownership_type === role) return s + Number(e.monthly_amount)
                if (e.ownership_type === 'joint') {
                    const split = role === 'husband' ? (e.joint_split_husband ?? 50)
                                : role === 'wife'    ? (e.joint_split_wife    ?? 50) : 0
                    return s + Number(e.monthly_amount) * split / 100
                }
                return s
            }, 0)
            const savingsRate = income > 0 ? (memberSavings / income) * 100 : 0

            return {
                member: m, income, hhOwned, hhJoint, personal,
                allocated, remaining, savingsRate, memberSavings,
                color: CHART_COLORS[i % CHART_COLORS.length],
                gradient: GRADIENTS[i % GRADIENTS.length],
            }
        })
    }, [expenses, members, scope])

    const barGroupData = useMemo(() =>
        donutData.map(d => ({ ...d, pct: totalMonthly > 0 ? (d.value / totalMonthly) * 100 : 0 })),
    [donutData, totalMonthly])

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

    // Savings trend fetch
    useEffect(() => {
        if (!household) return
        setSavingsTrendLoading(true)
        apiGet<SavingsTrendApiData>(`/api/households/${household.id}/budget/savings-trend`)
            .then(setSavingsTrend)
            .catch(() => {})
            .finally(() => setSavingsTrendLoading(false))
    }, [household?.id])

    // Native touch listeners for savings swipe (passive, avoids blocking WebKit scroll)
    useEffect(() => {
        if (loading) return
        const el = savingsSwipeRef.current
        if (!el) return
        const onStart = (e: TouchEvent) => {
            touchStartX.current = e.touches[0].clientX
            touchStartY.current = e.touches[0].clientY
        }
        const onEnd = (e: TouchEvent) => {
            const dx = e.changedTouches[0].clientX - touchStartX.current
            const dy = e.changedTouches[0].clientY - touchStartY.current
            if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
                setSavingsPage(dx < 0 ? 1 : 0)
            }
        }
        el.addEventListener('touchstart', onStart, { passive: true })
        el.addEventListener('touchend', onEnd, { passive: true })
        return () => {
            el.removeEventListener('touchstart', onStart)
            el.removeEventListener('touchend', onEnd)
        }
    }, [loading])

    const savingsTrendChart = useMemo(() => {
        if (!savingsTrend || savingsTrend.months.length === 0) return { data: [], memberNames: [] as string[] }
        const memberNames = savingsTrend.months[0].members.map(m => m.name)
        const data = savingsTrend.months.map(m => {
            const point: Record<string, string | number> = {
                month: new Date(m.month + 'T00:00:00').toLocaleDateString('en-KE', { month: 'short', year: '2-digit' }),
                Household: Number(m.household_savings_rate),
            }
            for (const mem of m.members) { point[mem.name] = Number(mem.savings_rate) }
            return point
        })
        return { data, memberNames }
    }, [savingsTrend])

    const savingsTrendTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload?.length) return null
        return (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 px-3 py-2.5 shadow-lg text-xs min-w-[140px]">
                <p className="font-black text-slate-700 dark:text-slate-200 mb-2">{label}</p>
                {(payload as any[]).map((p: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-3 mb-1">
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.stroke }} />
                            <span className="text-slate-500">{p.name}</span>
                        </div>
                        <span className="font-bold text-slate-700 dark:text-slate-200">{Number(p.value).toFixed(1)}%</span>
                    </div>
                ))}
            </div>
        )
    }

    if (loading) return (
        <div className="flex items-center justify-center h-48">
            <div className="w-6 h-6 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
        </div>
    )

    return (
        <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="bg-white dark:bg-slate-800 rounded-3xl p-4 border border-slate-100 dark:border-slate-700" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Monthly Total</p>
                    <p className="text-lg font-black text-slate-900 dark:text-white">{fmt(totalMonthly)}</p>
                    <p className="text-xs text-slate-400 mt-0.5">/ mo</p>
                </div>
                <div className="bg-white dark:bg-slate-800 rounded-3xl p-4 border border-slate-100 dark:border-slate-700" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                    <div className="flex items-center gap-1.5 mb-1">
                        <Receipt className="h-3 w-3 text-slate-400" />
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Expenses</p>
                    </div>
                    <p className="text-lg font-black text-slate-900 dark:text-white">{scopedRows.length}</p>
                    <p className="text-xs text-slate-400 mt-0.5">line items</p>
                </div>
                <div className="bg-white dark:bg-slate-800 rounded-3xl p-4 border border-slate-100 dark:border-slate-700" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                    <div className="flex items-center gap-1.5 mb-1">
                        <Layers className="h-3 w-3 text-slate-400" />
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Groups</p>
                    </div>
                    <p className="text-lg font-black text-slate-900 dark:text-white">{activeGroupCount}</p>
                    <p className="text-xs text-slate-400 mt-0.5">active</p>
                </div>
                <div className="bg-white dark:bg-slate-800 rounded-3xl p-4 border border-slate-100 dark:border-slate-700" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Savings Rate</p>
                    <p className={`text-lg font-black ${librarySavingsRate >= 20 ? 'text-emerald-600' : librarySavingsRate >= 10 ? 'text-amber-500' : 'text-slate-900 dark:text-white'}`}>
                        {librarySavingsRate.toFixed(1)}%
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{fmt(totalSavingsMonthly)} tagged</p>
                </div>
            </div>

            {/* ── By Group bar chart + Budget Split ── */}
            {barGroupData.length > 0 && (() => {
                const pureExpenses = Math.max(0, totalMonthly - totalSavingsMonthly - totalInvestmentsMonthly)
                const expPct  = scopedIncome > 0 ? (pureExpenses             / scopedIncome) * 100 : 0
                const savPct  = scopedIncome > 0 ? (totalSavingsMonthly      / scopedIncome) * 100 : 0
                const invPct  = scopedIncome > 0 ? (totalInvestmentsMonthly  / scopedIncome) * 100 : 0
                const splitTotal = expPct + savPct + invPct
                return (
                    <div className="flex gap-4 items-stretch">
                        {/* Bar chart — 80% */}
                        <div className="flex-[4] bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 p-5" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                            <div className="flex items-center justify-between mb-4">
                                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">By Group</p>
                                <button onClick={() => openModal('byGroup')}
                                    className="p-1 rounded-lg text-slate-300 hover:text-slate-500 dark:hover:text-slate-300 transition-colors">
                                    <Maximize2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                            <ByGroupChartView
                                data={barGroupData}
                                type={byGroupChartType}
                                height={
                                    byGroupChartType === 'donut' ? 260
                                    : byGroupChartType === 'bar-v' ? 220
                                    : Math.max(180, barGroupData.length * 38)
                                }
                            />
                        </div>

                        {/* Budget split card — 20% */}
                        <div className="flex-[1] bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 p-5 flex flex-col" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">Budget Split</p>

                            {/* Ratio display */}
                            <div className="flex items-end gap-1 mb-1">
                                <span className="text-2xl font-black text-slate-900 dark:text-white leading-none">{Math.round(expPct)}</span>
                                <span className="text-sm font-bold text-slate-300 dark:text-slate-600 mb-0.5">:</span>
                                <span className="text-2xl font-black text-emerald-500 leading-none">{Math.round(savPct)}</span>
                                <span className="text-sm font-bold text-slate-300 dark:text-slate-600 mb-0.5">:</span>
                                <span className="text-2xl font-black text-violet-500 leading-none">{Math.round(invPct)}</span>
                            </div>
                            <p className="text-xs text-slate-400 mb-4">Exp · Sav · Inv</p>

                            {/* Stacked bar */}
                            <div className="flex h-2 rounded-full overflow-hidden gap-px mb-5">
                                {expPct > 0 && <div style={{ width: `${splitTotal > 0 ? (expPct / splitTotal) * 100 : 0}%`, background: '#0ea5e9' }} />}
                                {savPct > 0 && <div style={{ width: `${splitTotal > 0 ? (savPct / splitTotal) * 100 : 0}%`, background: '#10b981' }} />}
                                {invPct > 0 && <div style={{ width: `${splitTotal > 0 ? (invPct / splitTotal) * 100 : 0}%`, background: '#8b5cf6' }} />}
                                {splitTotal === 0 && <div className="w-full bg-slate-100 dark:bg-slate-700" />}
                            </div>

                            {/* Rows */}
                            <div className="space-y-3 mt-auto">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-2 h-2 rounded-full flex-shrink-0 bg-sky-400" />
                                        <p className="text-xs text-slate-500 dark:text-slate-400">Expenses</p>
                                    </div>
                                    <p className="text-xs font-black text-slate-900 dark:text-white">{expPct.toFixed(1)}%</p>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-2 h-2 rounded-full flex-shrink-0 bg-emerald-400" />
                                        <p className="text-xs text-slate-500 dark:text-slate-400">Savings</p>
                                    </div>
                                    <p className="text-xs font-black text-emerald-500">{savPct.toFixed(1)}%</p>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-2 h-2 rounded-full flex-shrink-0 bg-violet-400" />
                                        <p className="text-xs text-slate-500 dark:text-slate-400">Investments</p>
                                    </div>
                                    <p className="text-xs font-black text-violet-500">{invPct > 0 ? invPct.toFixed(1) + '%' : '—'}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            })()}

            {/* ── Savings Breakdown ── */}
            {(scope === 'all' ? memberRows.length > 0 : scopedIncome > 0) && (
                <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Savings</p>

                    {/* Swipeable panels */}
                    <div ref={savingsSwipeRef} className="overflow-hidden">
                        <div className="flex transition-transform duration-300 ease-out"
                             style={{ transform: `translateX(${savingsPage * -100}%)` }}>

                            {/* Panel 1 — savings rate card */}
                            <div className="w-full flex-shrink-0">
                                <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                                    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50 dark:border-slate-700">
                                        <div>
                                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                                                {scope === 'all' ? 'Household Total' : 'Your Savings'}
                                            </p>
                                            <p className="text-sm font-black text-slate-900 dark:text-white mt-1">
                                                {fmt(totalSavingsMonthly)}<span className="text-xs font-normal text-slate-400">/mo</span>
                                            </p>
                                            <p className="text-xs text-slate-400 mt-0.5">tagged as savings</p>
                                        </div>
                                        <div className={`text-3xl font-black ${
                                            librarySavingsRate >= 20 ? 'text-emerald-600'
                                            : librarySavingsRate >= 10 ? 'text-amber-500'
                                            : 'text-slate-400'
                                        }`}>
                                            {librarySavingsRate.toFixed(1)}%
                                        </div>
                                    </div>
                                    {scope === 'all' && (
                                        <div className="divide-y divide-slate-50 dark:divide-slate-700">
                                            {memberRows.map(row => {
                                                const isMe = row.member.user_id === currentUserId
                                                return (
                                                    <div key={row.member.id} className="flex items-center gap-3 px-5 py-3.5">
                                                        <div className="w-8 h-8 rounded-2xl flex items-center justify-center text-white text-sm font-black flex-shrink-0"
                                                            style={{ background: row.gradient }}>
                                                            {row.member.name.charAt(0)}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{row.member.name}</p>
                                                                {isMe && <span className="px-1.5 py-0.5 rounded-md text-xs font-bold bg-sky-50 text-sky-600 flex-shrink-0">You</span>}
                                                            </div>
                                                            {row.memberSavings > 0
                                                                ? <p className="text-xs text-slate-400 mt-0.5">{fmt(row.memberSavings)}<span className="text-slate-300">/mo tagged</span></p>
                                                                : <p className="text-xs text-slate-300 mt-0.5">No savings tagged</p>
                                                            }
                                                        </div>
                                                        <div className="text-right flex-shrink-0">
                                                            <p className={`text-xl font-black ${
                                                                row.savingsRate >= 20 ? 'text-emerald-600'
                                                                : row.savingsRate >= 10 ? 'text-amber-500'
                                                                : 'text-slate-300'
                                                            }`}>
                                                                {row.savingsRate.toFixed(1)}%
                                                            </p>
                                                            <p className="text-xs text-slate-400">of income</p>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Panel 2 — savings rate trend (last 6 months) */}
                            <div className="w-full flex-shrink-0">
                                <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 p-5" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                                    {savingsTrendLoading ? (
                                        <div className="flex items-center justify-center h-48">
                                            <div className="w-5 h-5 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
                                        </div>
                                    ) : savingsTrendChart.data.length === 0 ? (
                                        <div className="flex items-center justify-center h-48">
                                            <p className="text-sm text-slate-400">No session data yet</p>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex items-center justify-between mb-4">
                                                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Savings Rate Trend</p>
                                                <span className="text-xs text-slate-400">{savingsTrendChart.data.length} months</span>
                                            </div>
                                            <ResponsiveContainer width="100%" height={200}>
                                                <LineChart data={savingsTrendChart.data} margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
                                                    <CartesianGrid vertical={false} stroke="#f1f5f9" />
                                                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} axisLine={false} tickLine={false} />
                                                    <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={36} domain={[0, 'auto']} />
                                                    <ReTooltip content={savingsTrendTooltip} />
                                                    <ReferenceLine y={50} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 4"
                                                        label={{ value: '50%', position: 'insideTopRight', fontSize: 9, fill: '#f59e0b', fontWeight: 700 }} />
                                                    <Line dataKey="Household" stroke="#0ea5e9" strokeWidth={2.5}
                                                        dot={{ r: 3, fill: '#0ea5e9' }} activeDot={{ r: 5 }} />
                                                    {savingsTrendChart.memberNames.map((name, i) => (
                                                        <Line key={name} type="monotone" dataKey={name}
                                                            stroke={CHART_COLORS[i % CHART_COLORS.length]}
                                                            strokeWidth={1.5} strokeDasharray="3 2"
                                                            dot={{ r: 2, fill: CHART_COLORS[i % CHART_COLORS.length] }} activeDot={{ r: 4 }} />
                                                    ))}
                                                </LineChart>
                                            </ResponsiveContainer>
                                            <div className="flex flex-wrap gap-3 mt-3">
                                                <div className="flex items-center gap-1.5">
                                                    <div className="w-4 h-0.5 bg-sky-500 rounded-full flex-shrink-0" />
                                                    <span className="text-xs text-slate-500 font-semibold">Household</span>
                                                </div>
                                                {savingsTrendChart.memberNames.map((name, i) => (
                                                    <div key={name} className="flex items-center gap-1.5">
                                                        <div className="w-4 h-0.5 rounded-full flex-shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                                                        <span className="text-xs text-slate-500">{name}</span>
                                                    </div>
                                                ))}
                                                <div className="flex items-center gap-1.5">
                                                    <svg width="16" height="4" className="flex-shrink-0">
                                                        <line x1="0" y1="2" x2="16" y2="2" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="3 2" />
                                                    </svg>
                                                    <span className="text-xs text-slate-500">50% target</span>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                        </div>
                    </div>

                    {/* Pagination dots */}
                    <div className="flex justify-center gap-1.5 pt-1">
                        {[0, 1].map(i => (
                            <button key={i} onClick={() => setSavingsPage(i)}
                                className={`rounded-full transition-all duration-200 ${
                                    savingsPage === i
                                        ? 'w-4 h-1.5 bg-sky-500'
                                        : 'w-1.5 h-1.5 bg-slate-300 dark:bg-slate-600'
                                }`}
                            />
                        ))}
                    </div>
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
                        <div key={group.id} className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 overflow-hidden"
                            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                            <div className="flex items-center gap-3 px-5 py-4">
                                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm font-black flex-shrink-0"
                                    style={{ background: GRADIENTS[gi % GRADIENTS.length] }}>
                                    {group.name.charAt(0)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-3 mb-1.5">
                                        <p className="font-bold text-slate-900 dark:text-white text-sm">{group.name}</p>
                                        <p className="font-black text-slate-900 dark:text-white text-sm flex-shrink-0">
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
                            <div className="border-t border-slate-50 dark:border-slate-700 divide-y divide-slate-50 dark:divide-slate-700">
                                {rows.map(({ expense, amount }) => (
                                    <div key={expense.id} className="flex items-center justify-between px-5 py-3 pl-16">
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{expense.name}</p>
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
                                        <p className="text-sm font-bold text-slate-900 dark:text-white flex-shrink-0 ml-3">
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
                        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-dashed border-slate-200 dark:border-slate-600 overflow-hidden"
                            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                            <div className="flex items-center gap-3 px-5 py-4">
                                <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-300 text-sm font-black flex-shrink-0">?</div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-3 mb-1.5">
                                        <p className="font-bold text-slate-500 text-sm">Ungrouped</p>
                                        <p className="font-black text-slate-900 dark:text-white text-sm flex-shrink-0">
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
                            <div className="border-t border-slate-50 dark:border-slate-700 divide-y divide-slate-50 dark:divide-slate-700">
                                {rows.map(({ expense, amount }) => (
                                    <div key={expense.id} className="flex items-center justify-between px-5 py-3 pl-16">
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{expense.name}</p>
                                            <span className={`px-1.5 py-0.5 rounded-md text-xs font-bold ${OWNERSHIP_CHIP[expense.ownership_type] ?? 'bg-slate-50 text-slate-500'}`}>
                                                {OWNERSHIP_LABELS[expense.ownership_type] ?? expense.ownership_type}
                                            </span>
                                        </div>
                                        <p className="text-sm font-bold text-slate-900 dark:text-white flex-shrink-0 ml-3">
                                            {fmt(amount)}<span className="text-xs font-normal text-slate-400">/mo</span>
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )
                })()}
            </div>

            {/* ── Member Financial Portraits ── */}
            {scope === 'all' && memberRows.length > 0 && (
                <div className="space-y-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Member Portraits</p>
                    <div className={`grid gap-4 grid-cols-1 ${memberRows.length === 1 ? '' : 'md:grid-cols-2'}`}>
                        {memberRows.map(row => {
                            const { member, income, hhOwned, hhJoint, personal, allocated, remaining, savingsRate, memberSavings, gradient } = row
                            const isMe = member.user_id === currentUserId
                            const overspent = remaining < 0
                            const memberRole = member.member_type.name

                            const hhOwnedPct = income > 0 ? Math.min((hhOwned / income) * 100, 100) : 0
                            const hhJointPct = income > 0 ? Math.min((hhJoint / income) * 100, 100 - hhOwnedPct) : 0
                            const personalPct = income > 0 ? Math.min((personal / income) * 100, 100 - hhOwnedPct - hhJointPct) : 0
                            const remainingPct = Math.max(0, 100 - hhOwnedPct - hhJointPct - personalPct)
                            const assignedPct = income > 0 ? Math.min((allocated / income) * 100, 100) : 0

                            return (
                                <div key={member.id} className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 overflow-hidden"
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
                                                <p className="font-black text-slate-900 dark:text-white text-sm">{member.name}</p>
                                                <span className="px-1.5 py-0.5 rounded-md text-xs font-bold bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300">{memberRole}</span>
                                                {isMe && <span className="px-1.5 py-0.5 rounded-md text-xs font-bold bg-sky-50 text-sky-600">You</span>}
                                            </div>
                                            <p className="text-xs text-slate-400 mt-0.5">{fmt(income)}<span className="text-slate-300"> / mo income</span></p>
                                        </div>
                                    </div>

                                    {/* Stacked income allocation bar */}
                                    <div className="px-5 pb-3">
                                        <div className="flex h-3 rounded-full overflow-hidden gap-px bg-slate-100 dark:bg-slate-700">
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
                                    <div className="mx-5 mb-4 rounded-2xl bg-slate-50 dark:bg-slate-700/50 overflow-hidden divide-y divide-white dark:divide-slate-700">
                                        {hhOwned > 0 && (
                                            <div className="flex items-center justify-between px-4 py-2.5">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#0ea5e9' }} />
                                                    <p className="text-xs text-slate-500">HH · {memberRole}</p>
                                                </div>
                                                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{fmt(hhOwned)}<span className="text-slate-400 font-normal">/mo</span></p>
                                            </div>
                                        )}
                                        {hhJoint > 0 && (
                                            <div className="flex items-center justify-between px-4 py-2.5">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#8b5cf6' }} />
                                                    <p className="text-xs text-slate-500">HH · Joint share</p>
                                                </div>
                                                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{fmt(hhJoint)}<span className="text-slate-400 font-normal">/mo</span></p>
                                            </div>
                                        )}
                                        {personal > 0 && (
                                            <div className="flex items-center justify-between px-4 py-2.5">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#f59e0b' }} />
                                                    <p className="text-xs text-slate-500">Personal</p>
                                                </div>
                                                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{fmt(personal)}<span className="text-slate-400 font-normal">/mo</span></p>
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between px-4 py-2.5 bg-white/60 dark:bg-slate-800/60">
                                            <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Total Assigned</p>
                                            <p className="text-xs font-black text-slate-900 dark:text-white">{fmt(allocated)}<span className="text-slate-400 font-normal">/mo</span></p>
                                        </div>
                                    </div>

                                    {/* Remaining + savings rate */}
                                    <div className="mx-5 mb-4 rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-700">
                                        <div className={`flex items-center justify-between px-4 py-3 ${
                                            overspent ? 'bg-rose-50 dark:bg-rose-950/40' : 'bg-slate-50 dark:bg-slate-700/50'
                                        }`}>
                                            <div>
                                                <p className={`text-xs font-bold ${overspent ? 'text-rose-500' : 'text-slate-400'}`}>
                                                    {overspent ? '⚠ Overspent' : 'Remaining'}
                                                </p>
                                                <p className={`text-sm font-black mt-0.5 ${overspent ? 'text-rose-600' : 'text-slate-700 dark:text-slate-200'}`}>
                                                    {overspent ? '−' : ''}{fmt(Math.abs(remaining))}<span className="text-xs font-normal text-slate-400">/mo</span>
                                                </p>
                                            </div>
                                        </div>
                                        <div className={`flex items-center justify-between px-4 py-3 ${
                                            savingsRate >= 20 ? 'bg-emerald-50 dark:bg-emerald-950/40' : savingsRate >= 10 ? 'bg-amber-50 dark:bg-amber-950/40' : 'bg-white dark:bg-slate-800'
                                        }`}>
                                            <div>
                                                <p className="text-xs font-bold text-slate-400">Savings Rate</p>
                                                <p className="text-xs text-slate-400 mt-0.5">{fmt(memberSavings)} tagged savings</p>
                                            </div>
                                            <p className={`text-xl font-black ${
                                                savingsRate >= 20 ? 'text-emerald-600'
                                                : savingsRate >= 10 ? 'text-amber-500'
                                                : 'text-slate-400'
                                            }`}>
                                                {savingsRate.toFixed(1)}%
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
                <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 p-5" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Monthly Budget Trend</p>
                        <div className="flex items-center gap-2">
                            <p className="text-xs text-slate-400">{trendSessions.length} months</p>
                            <button onClick={() => openModal('trend')}
                                className="p-1 rounded-lg text-slate-300 hover:text-slate-500 dark:hover:text-slate-300 transition-colors">
                                <Maximize2 className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </div>
                    <TrendChartView data={trendChartData} groupNames={trendGroupNames} type={trendChartType} height={220} />
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
                        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 p-5" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                            <div className="flex items-center justify-between mb-3">
                                <div className="text-center">
                                    <p className="text-xs text-slate-400 font-medium">Budgeted</p>
                                    <p className="text-sm font-black text-slate-900 dark:text-white mt-0.5">{fmt(variance.total_budgeted)}</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-xs text-slate-400 font-medium">Paid</p>
                                    <p className="text-sm font-black text-slate-900 dark:text-white mt-0.5">{fmt(variance.total_paid)}</p>
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
                                    <div key={g.group_name} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden"
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
                                                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{g.group_name}</p>
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
                                            <div className="border-t border-slate-50 dark:border-slate-700 divide-y divide-slate-50 dark:divide-slate-700">
                                                {g.items.filter(it => it.paid > 0 || it.budgeted > 0).map(it => {
                                                    const iSaved = -it.variance
                                                    return (
                                                        <div key={it.item_id} className="flex items-center justify-between px-5 py-2.5 pl-16">
                                                            <p className="text-xs text-slate-600 dark:text-slate-300 truncate flex-1 min-w-0">{it.name}</p>
                                                            <div className="flex items-center gap-3 flex-shrink-0 text-xs">
                                                                <span className="text-slate-400">{fmt(it.budgeted)}</span>
                                                                <span className="text-slate-300">→</span>
                                                                <span className="font-bold text-slate-700 dark:text-slate-200">{fmt(it.paid)}</span>
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

            {/* ── Chart type modal ── */}
            <Dialog open={!!modalChart} onOpenChange={() => setModalChart(null)}>
                <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-2xl p-0 overflow-hidden gap-0">
                    <DialogHeader className="px-6 pt-5 pb-4 border-b border-slate-100 dark:border-slate-700">
                        <DialogTitle className="text-sm font-black text-slate-900 dark:text-white">
                            {modalChart === 'byGroup' ? 'By Group' : 'Monthly Budget Trend'}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="p-5 space-y-5">
                        {/* Live preview */}
                        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4">
                            {modalChart === 'byGroup' && (
                                <ByGroupChartView
                                    data={barGroupData}
                                    type={pendingType as ByGroupChartType}
                                    height={pendingType === 'donut' ? 280 : pendingType === 'bar-v' ? 260 : Math.max(200, barGroupData.length * 42)}
                                />
                            )}
                            {modalChart === 'trend' && (
                                <TrendChartView data={trendChartData} groupNames={trendGroupNames} type={pendingType as TrendChartType} height={260} />
                            )}
                        </div>

                        {/* Type selector */}
                        <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Chart Type</p>
                            <div className="flex flex-wrap gap-2">
                                {(modalChart === 'byGroup' ? BY_GROUP_TYPES : TREND_TYPES).map(({ key, label, Icon }) => (
                                    <button key={key} onClick={() => setPendingType(key)}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold border transition-all ${
                                            pendingType === key
                                                ? 'bg-sky-50 dark:bg-sky-500/10 border-sky-200 dark:border-sky-500/30 text-sky-600 dark:text-sky-400'
                                                : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-500'
                                        }`}>
                                        <Icon className="h-4 w-4" />
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="px-5 pb-5 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-700 pt-4">
                        <button onClick={() => setModalChart(null)}
                            className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
                            Cancel
                        </button>
                        <button onClick={applyChartType}
                            className="px-4 py-2 rounded-xl text-sm font-bold bg-sky-500 hover:bg-sky-600 text-white transition-colors">
                            Apply
                        </button>
                    </div>
                </DialogContent>
            </Dialog>

        </div>
    )
}
