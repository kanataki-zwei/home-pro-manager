'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { BookOpen, LayoutTemplate, CalendarCheck, BarChart2 } from 'lucide-react'
import { useHousehold } from '@/context/HouseholdContext'
import { toast } from 'sonner'
import ExpenseLibrary from '@/components/budget/ExpenseLibrary'
import BudgetReport from '@/components/budget/BudgetReport'
import MonthlySession from '@/components/budget/MonthlySession'

const TABS = [
    { key: 'library', label: 'Expense Library', icon: BookOpen },
    { key: 'reports', label: 'Reports', icon: BarChart2 },
    { key: 'templates', label: 'Budget Templates', icon: LayoutTemplate },
    { key: 'sessions', label: 'Monthly Sessions', icon: CalendarCheck },
] as const

type Tab = typeof TABS[number]['key']

function BudgetPageInner() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { household, members, loading } = useHousehold()
    const [activeTab, setActiveTab] = useState<Tab>(
        (searchParams.get('tab') as Tab | null) ?? 'library'
    )
    const autoFilter = searchParams.get('filter') === 'todo' && searchParams.get('tab') === 'sessions'

    useEffect(() => {
        if (loading) return
        if (!household) { router.replace('/household'); return }
        const hasIncome = members.some(m => m.contributes_income && m.income_amount)
        if (!hasIncome) {
            toast.error('Set household income first', {
                description: 'Add income for at least one member before budgeting.',
            })
            router.replace('/household')
        }
    }, [loading, household, members])

    if (loading || !household || !members.some(m => m.contributes_income && m.income_amount)) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-6 h-6 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
            </div>
        )
    }

    return (
        <div className="max-w-4xl space-y-6">
            {/* Header */}
            <div>
                <p className="text-xs font-bold uppercase tracking-widest text-sky-500 mb-2">Budget</p>
                <h1 className="text-4xl font-black text-slate-900 leading-tight">Zero-Based Budget</h1>
                <p className="text-slate-400 mt-1">Every shilling has a purpose</p>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-slate-100">
                {TABS.map(tab => {
                    const Icon = tab.icon
                    const active = activeTab === tab.key
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-all -mb-px ${
                                active
                                    ? 'border-sky-500 text-sky-600'
                                    : 'border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-200'
                            }`}>
                            <Icon className="h-4 w-4" />
                            {tab.label}
                        </button>
                    )
                })}
            </div>

            {/* Tab content */}
            {activeTab === 'library' && <ExpenseLibrary />}
            {activeTab === 'reports' && <BudgetReport />}
            {activeTab === 'templates' && (
                <div className="flex flex-col items-center justify-center h-48 rounded-3xl border-2 border-dashed border-slate-200">
                    <LayoutTemplate className="h-8 w-8 text-slate-200 mb-3" />
                    <p className="text-sm font-semibold text-slate-400">Budget Templates</p>
                    <p className="text-xs text-slate-300 mt-1">Coming next</p>
                </div>
            )}
            {activeTab === 'sessions' && <MonthlySession autoFilter={autoFilter} />}
        </div>
    )
}

export default function BudgetPage() {
    return (
        <Suspense>
            <BudgetPageInner />
        </Suspense>
    )
}
