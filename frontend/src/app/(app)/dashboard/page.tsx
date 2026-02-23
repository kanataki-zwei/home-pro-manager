'use client'

import { useHousehold } from '@/context/HouseholdContext'
import { Wallet, Users, TrendingUp, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'

export default function DashboardPage() {
    const { household, members, accounts, loading } = useHousehold()

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="w-6 h-6 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
        </div>
    )

    if (!household) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
                <div className="w-12 h-12 rounded-2xl bg-sky-50 flex items-center justify-center">
                    <Users className="h-6 w-6 text-sky-500" />
                </div>
                <p className="text-slate-500 font-medium">No household set up yet</p>
                <Link href="/household"
                    className="text-sm font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-1">
                    Set up your household <ArrowUpRight className="h-3 w-3" />
                </Link>
            </div>
        )
    }

    const totalBalance = accounts.reduce((sum, a) => sum + a.current_balance, 0)
    const currency = accounts[0]?.currency || 'KES'
    const jointAccounts = accounts.filter(a => a.ownership === 'joint')
    const individualAccounts = accounts.filter(a => a.ownership === 'individual')

    return (
        <div className="space-y-8 max-w-5xl">
            {/* Header */}
            <div>
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold uppercase tracking-widest text-sky-500">Overview</span>
                </div>
                <h1 className="text-3xl font-bold text-slate-900">{household.name}</h1>
                <p className="text-slate-400 mt-1 text-sm">Here's your household at a glance</p>
            </div>

            {/* Hero stat */}
            <div className="relative rounded-2xl overflow-hidden p-8"
                style={{ background: 'linear-gradient(135deg, #0f172a 0%, #0c2a4a 50%, #0f172a 100%)' }}>
                {/* Background decoration */}
                <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-10"
                    style={{ background: 'radial-gradient(circle, #38bdf8, transparent)', transform: 'translate(30%, -30%)' }} />
                <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full opacity-5"
                    style={{ background: 'radial-gradient(circle, #0ea5e9, transparent)', transform: 'translate(-30%, 30%)' }} />

                <div className="relative">
                    <p className="text-sky-400 text-sm font-semibold uppercase tracking-wider mb-2">Total Balance</p>
                    <p className="text-white font-bold mb-1" style={{ fontSize: '2.75rem', fontFamily: 'Plus Jakarta Sans', lineHeight: 1 }}>
                        {currency} {totalBalance.toLocaleString()}
                    </p>
                    <p className="text-slate-400 text-sm mt-3">{accounts.length} account{accounts.length !== 1 ? 's' : ''} across your household</p>
                </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4">
                {[
                    { label: 'Members', value: members.length, sub: members.map(m => m.name).join(', ') || 'None yet', icon: Users, color: 'sky' },
                    { label: 'Joint Accounts', value: jointAccounts.length, sub: `${currency} ${jointAccounts.reduce((s, a) => s + a.current_balance, 0).toLocaleString()}`, icon: Wallet, color: 'violet' },
                    { label: 'Individual Accounts', value: individualAccounts.length, sub: `${currency} ${individualAccounts.reduce((s, a) => s + a.current_balance, 0).toLocaleString()}`, icon: TrendingUp, color: 'emerald' },
                ].map((stat) => (
                    <div key={stat.label} className="bg-white rounded-2xl p-5 border border-slate-100"
                        style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)' }}>
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{stat.label}</p>
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center bg-${stat.color}-50`}>
                                <stat.icon className={`h-4 w-4 text-${stat.color}-500`} />
                            </div>
                        </div>
                        <p className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Plus Jakarta Sans' }}>{stat.value}</p>
                        <p className="text-xs text-slate-400 mt-1 truncate">{stat.sub}</p>
                    </div>
                ))}
            </div>

            {/* Accounts list */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-bold text-slate-900 text-lg">Accounts</h2>
                    <Link href="/household" className="text-sm text-sky-500 font-semibold hover:text-sky-600 flex items-center gap-1">
                        Manage <ArrowUpRight className="h-3 w-3" />
                    </Link>
                </div>
                {accounts.length === 0 ? (
                    <div className="rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center">
                        <p className="text-slate-400 text-sm">No accounts yet</p>
                        <Link href="/household" className="text-sky-500 text-sm font-semibold mt-1 inline-block">Add one →</Link>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {accounts.map((account, i) => {
                            const owner = members.find(m => m.id === account.household_member_id)
                            return (
                                <div key={account.id}
                                    className="bg-white rounded-2xl p-4 border border-slate-100 flex items-center justify-between group hover:border-sky-200 transition-all duration-200"
                                    style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm text-white"
                                            style={{ background: `hsl(${(i * 47) % 360}, 70%, 50%)` }}>
                                            {account.name.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="font-semibold text-slate-900 text-sm">{account.name}</p>
                                            <p className="text-xs text-slate-400 capitalize">
                                                {account.account_type} · {account.ownership}
                                                {owner ? ` · ${owner.name}` : ''}
                                            </p>
                                        </div>
                                    </div>
                                    <p className="font-bold text-slate-900" style={{ fontFamily: 'Plus Jakarta Sans' }}>
                                        {account.currency} {account.current_balance.toLocaleString()}
                                    </p>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}