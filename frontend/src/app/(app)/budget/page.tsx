'use client'

import { useState } from 'react'
import { BookOpen, LayoutTemplate, CalendarCheck } from 'lucide-react'
import ExpenseLibrary from '@/components/budget/ExpenseLibrary'

const TABS = [
    { key: 'library', label: 'Expense Library', icon: BookOpen },
    { key: 'templates', label: 'Budget Templates', icon: LayoutTemplate },
    { key: 'sessions', label: 'Monthly Sessions', icon: CalendarCheck },
] as const

type Tab = typeof TABS[number]['key']

export default function BudgetPage() {
    const [activeTab, setActiveTab] = useState<Tab>('library')

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
            {activeTab === 'templates' && (
                <div className="flex flex-col items-center justify-center h-48 rounded-3xl border-2 border-dashed border-slate-200">
                    <LayoutTemplate className="h-8 w-8 text-slate-200 mb-3" />
                    <p className="text-sm font-semibold text-slate-400">Budget Templates</p>
                    <p className="text-xs text-slate-300 mt-1">Coming next</p>
                </div>
            )}
            {activeTab === 'sessions' && (
                <div className="flex flex-col items-center justify-center h-48 rounded-3xl border-2 border-dashed border-slate-200">
                    <CalendarCheck className="h-8 w-8 text-slate-200 mb-3" />
                    <p className="text-sm font-semibold text-slate-400">Monthly Sessions</p>
                    <p className="text-xs text-slate-300 mt-1">Coming next</p>
                </div>
            )}
        </div>
    )
}
