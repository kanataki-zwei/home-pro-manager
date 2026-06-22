'use client'

import { useEffect, useState } from 'react'
import { useHousehold } from '@/context/HouseholdContext'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api'
import { toast } from 'sonner'
import { Users, Plus, Trash2, Pencil, Link, Wallet, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface MemberType { id: string; name: string }
interface Member {
    id: string; name: string; date_of_birth: string | null
    is_active: boolean; user_id: string | null; member_type: MemberType
    contributes_income: boolean
    income_amount: number | null
    income_currency: string | null
    income_cadence: string | null
}
interface Account {
    id: string; name: string; account_type: string; institution_type: string | null
    ownership: string; current_balance: number; currency: string; is_active: boolean
    household_member_id: string | null
}
interface Household { id: string; name: string; member_types: MemberType[] }
interface SystemUser { id: string; email: string; name: string | null }

const ACCOUNT_TYPES = [
    { value: 'checking',   icon: '🏧', label: 'Checking' },
    { value: 'savings',    icon: '💰', label: 'Savings' },
    { value: 'cash',       icon: '💵', label: 'Cash' },
    { value: 'investment', icon: '📊', label: 'Investment' },
    { value: 'credit',     icon: '💳', label: 'Credit' },
]
const ACCOUNT_TYPE_MAP = Object.fromEntries(ACCOUNT_TYPES.map(t => [t.value, t]))

const INSTITUTION_TYPES = [
    { value: 'bank',            icon: '🏦', label: 'Bank Account' },
    { value: 'money_market',    icon: '💹', label: 'Money Market' },
    { value: 'mobile_money',    icon: '📱', label: 'Mobile Money' },
    { value: 'direct_pay',      icon: '⚡', label: 'Direct Pay' },
    { value: 'insurance',       icon: '🛡️', label: 'Insurance' },
    { value: 'govt_securities', icon: '🏛️', label: 'Govt Securities' },
    { value: 'stocks_shares',   icon: '📈', label: 'Stocks & Shares' },
]
const INSTITUTION_TYPE_MAP = Object.fromEntries(INSTITUTION_TYPES.map(t => [t.value, t]))

function toMonthly(amount: number, cadence: string): number {
    if (cadence === 'weekly') return (amount * 52) / 12
    if (cadence === 'annually') return amount / 12
    return amount
}

function fmtMoney(amount: number, currency: string) {
    return `${currency} ${amount.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const GRADIENTS = [
    'linear-gradient(135deg, #0ea5e9, #6366f1)',
    'linear-gradient(135deg, #f43f5e, #f97316)',
    'linear-gradient(135deg, #10b981, #0ea5e9)',
    'linear-gradient(135deg, #8b5cf6, #ec4899)',
    'linear-gradient(135deg, #f59e0b, #ef4444)',
    'linear-gradient(135deg, #06b6d4, #10b981)',
]

const CHART_COLORS = ['#0ea5e9', '#f43f5e', '#10b981', '#8b5cf6', '#f59e0b', '#06b6d4']

function DonutChart({ slices, centerLabel, centerSub }: {
    slices: { color: string; pct: number }[]
    centerLabel: string
    centerSub: string
}) {
    const r = 40, cx = 56, cy = 56, sw = 13
    const C = 2 * Math.PI * r
    let cumulative = 0
    return (
        <div className="relative w-28 h-28 flex-shrink-0">
            <svg width="112" height="112" viewBox="0 0 112 112" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={sw} />
                {slices.map((sl, i) => {
                    const dash = sl.pct * C
                    const offset = -cumulative
                    cumulative += dash
                    return (
                        <circle key={i} cx={cx} cy={cy} r={r} fill="none"
                            stroke={sl.color} strokeWidth={sw}
                            strokeDasharray={`${dash} ${C - dash}`}
                            strokeDashoffset={offset} />
                    )
                })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                <p className="text-2xl font-black text-slate-900 leading-none">{centerLabel}</p>
                <p className="text-xs text-slate-400 mt-0.5">{centerSub}</p>
            </div>
        </div>
    )
}

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

export default function HouseholdPage() {
    const { household, members, accounts, loading: contextLoading, setHousehold, setMembers, setAccounts, currentUserId } = useHousehold()
    const [loading, setLoading] = useState(true)
    const [systemUsers, setSystemUsers] = useState<SystemUser[]>([])

    const [householdName, setHouseholdName] = useState('')
    const [creating, setCreating] = useState(false)
    const [editHouseholdDialog, setEditHouseholdDialog] = useState(false)
    const [editHouseholdName, setEditHouseholdName] = useState('')
    const [savingHousehold, setSavingHousehold] = useState(false)

    const [memberTypeDialog, setMemberTypeDialog] = useState(false)
    const [newMemberTypeName, setNewMemberTypeName] = useState('')
    const [savingMemberType, setSavingMemberType] = useState(false)

    const [memberDialog, setMemberDialog] = useState(false)
    const [newMember, setNewMember] = useState({ name: '', member_type_id: '', date_of_birth: '', user_id: '' })
    const [editMemberDialog, setEditMemberDialog] = useState(false)
    const [editingMember, setEditingMember] = useState<Member | null>(null)
    const [editMemberData, setEditMemberData] = useState({ name: '', member_type_id: '', date_of_birth: '', user_id: '' })
    const [savingMember, setSavingMember] = useState(false)
    const [incomeEdits, setIncomeEdits] = useState<Record<string, { amount: string; currency: string; cadence: string }>>({})
    const [savingIncome, setSavingIncome] = useState<string | null>(null)

    const [myAccountsOnly, setMyAccountsOnly] = useState(false)

    const [createUserDialog, setCreateUserDialog] = useState(false)
    const [newUser, setNewUser] = useState({ email: '', password: '', name: '' })
    const [creatingUser, setCreatingUser] = useState(false)

    const [accountDialog, setAccountDialog] = useState(false)
    const [newAccount, setNewAccount] = useState({ name: '', account_type: '', institution_type: '', ownership: 'joint', current_balance: 0, currency: 'KES', household_member_id: '' })
    const [editAccountDialog, setEditAccountDialog] = useState(false)
    const [editingAccount, setEditingAccount] = useState<Account | null>(null)
    const [editAccountData, setEditAccountData] = useState({ name: '', account_type: '', institution_type: '', ownership: 'joint', current_balance: 0, currency: 'KES', household_member_id: '' })
    const [savingAccount, setSavingAccount] = useState(false)

    useEffect(() => {
        if (!contextLoading) {
            setLoading(false)
            if (household) loadSystemUsers()
        }
    }, [contextLoading, household])

    const loadSystemUsers = async () => {
        try {
            const users = await apiGet<SystemUser[]>('/api/users/')
            setSystemUsers(users)
        } catch { console.error('Failed to load system users') }
    }

    const createHousehold = async () => {
        if (!householdName.trim()) return
        setCreating(true)
        try {
            const data = await apiPost<Household>('/api/households/', { name: householdName })
            setHousehold(data)
            toast.success('Household created!')
        } catch { toast.error('Failed to create household') }
        finally { setCreating(false) }
    }

    const updateHouseholdName = async () => {
        if (!editHouseholdName.trim() || !household) return
        setSavingHousehold(true)
        try {
            const data = await apiPatch<Household>(`/api/households/${household.id}`, { name: editHouseholdName })
            setHousehold(data); setEditHouseholdDialog(false)
            toast.success('Updated!')
        } catch { toast.error('Failed to update') }
        finally { setSavingHousehold(false) }
    }

    const addMemberType = async () => {
        if (!newMemberTypeName.trim() || !household) return
        setSavingMemberType(true)
        try {
            const data = await apiPost<MemberType>(`/api/households/${household.id}/member-types`, { name: newMemberTypeName })
            setHousehold({ ...household, member_types: [...household.member_types, data] })
            setNewMemberTypeName(''); setMemberTypeDialog(false)
            toast.success('Added!')
        } catch { toast.error('Failed') }
        finally { setSavingMemberType(false) }
    }

    const deleteMemberType = async (typeId: string) => {
        if (!household) return
        try {
            await apiDelete(`/api/households/${household.id}/member-types/${typeId}`)
            setHousehold({ ...household, member_types: household.member_types.filter(t => t.id !== typeId) })
        } catch { toast.error('Failed') }
    }

    const addMember = async () => {
        if (!newMember.name || !newMember.member_type_id || !household) return
        setSavingMember(true)
        try {
            const data = await apiPost<Member>(`/api/households/${household.id}/members`, {
                name: newMember.name, member_type_id: newMember.member_type_id,
                date_of_birth: newMember.date_of_birth || null, user_id: newMember.user_id || null
            })
            setMembers([...members, data])
            setNewMember({ name: '', member_type_id: '', date_of_birth: '', user_id: '' })
            setMemberDialog(false); toast.success('Member added!')
        } catch { toast.error('Failed') }
        finally { setSavingMember(false) }
    }

    const openEditMember = (member: Member) => {
        setEditingMember(member)
        setEditMemberData({ name: member.name, member_type_id: member.member_type.id, date_of_birth: member.date_of_birth || '', user_id: member.user_id || '' })
        setEditMemberDialog(true)
    }

    const updateMember = async () => {
        if (!editingMember || !household) return
        setSavingMember(true)
        try {
            const data = await apiPatch<Member>(`/api/households/${household.id}/members/${editingMember.id}`, {
                name: editMemberData.name, member_type_id: editMemberData.member_type_id,
                date_of_birth: editMemberData.date_of_birth || null, user_id: editMemberData.user_id || null
            })
            setMembers(members.map(m => m.id === data.id ? data : m))
            setEditMemberDialog(false); setEditingMember(null); toast.success('Updated!')
        } catch { toast.error('Failed') }
        finally { setSavingMember(false) }
    }

    const deleteMember = async (memberId: string) => {
        if (!household) return
        try {
            await apiDelete(`/api/households/${household.id}/members/${memberId}`)
            setMembers(members.filter(m => m.id !== memberId))
        } catch { toast.error('Failed') }
    }

    const createSystemUser = async () => {
        if (!newUser.email || !newUser.password) return
        setCreatingUser(true)
        try {
            const data = await apiPost<SystemUser>('/api/users/', newUser)
            setSystemUsers(prev => [...prev, data])
            if (memberDialog) setNewMember(prev => ({ ...prev, user_id: data.id }))
            if (editMemberDialog) setEditMemberData(prev => ({ ...prev, user_id: data.id }))
            setNewUser({ email: '', password: '', name: '' })
            setCreateUserDialog(false); toast.success('User created!')
        } catch { toast.error('Failed') }
        finally { setCreatingUser(false) }
    }

    const addAccount = async () => {
        if (!newAccount.name || !newAccount.account_type || !household) return
        setSavingAccount(true)
        try {
            const data = await apiPost<Account>(`/api/households/${household.id}/accounts`, {
                ...newAccount,
                household_member_id: newAccount.ownership === 'individual' && newAccount.household_member_id ? newAccount.household_member_id : null
            })
            setAccounts([...accounts, data])
            setNewAccount({ name: '', account_type: '', ownership: 'joint', current_balance: 0, currency: 'KES', household_member_id: '' })
            setAccountDialog(false); toast.success('Account added!')
        } catch { toast.error('Failed') }
        finally { setSavingAccount(false) }
    }

    const openEditAccount = (account: Account) => {
        setEditingAccount(account)
        setEditAccountData({ name: account.name, account_type: account.account_type, institution_type: account.institution_type || '', ownership: account.ownership, current_balance: account.current_balance, currency: account.currency, household_member_id: account.household_member_id || '' })
        setEditAccountDialog(true)
    }

    const updateAccount = async () => {
        if (!editingAccount || !household) return
        setSavingAccount(true)
        try {
            const payload = {
                name: editAccountData.name,
                account_type: editAccountData.account_type,
                institution_type: editAccountData.institution_type || null,
                ownership: editAccountData.ownership,
                current_balance: editAccountData.current_balance,
                currency: editAccountData.currency,
                household_member_id: editAccountData.ownership === 'individual'
                    ? (editAccountData.household_member_id || null)
                    : null
            }
            const data = await apiPatch<Account>(`/api/households/${household.id}/accounts/${editingAccount.id}`, payload)
            setAccounts(accounts.map(a => a.id === data.id ? data : a))
            setEditAccountDialog(false); setEditingAccount(null); toast.success('Updated!')
        } catch { toast.error('Failed') }
        finally { setSavingAccount(false) }
    }

    const deleteAccount = async (accountId: string) => {
        if (!household) return
        try {
            await apiDelete(`/api/households/${household.id}/accounts/${accountId}`)
            setAccounts(accounts.filter(a => a.id !== accountId))
        } catch { toast.error('Failed') }
    }

    const toggleIncome = async (member: Member) => {
        if (!household) return
        const next = !member.contributes_income
        const data = await apiPatch<Member>(`/api/households/${household.id}/members/${member.id}`, {
            contributes_income: next,
            ...(next ? {} : { income_amount: null, income_currency: null, income_cadence: null })
        }).catch(() => { toast.error('Failed'); return null })
        if (!data) return
        setMembers(members.map(m => m.id === data.id ? data : m))
        if (next) setIncomeEdits(prev => ({
            ...prev,
            [member.id]: { amount: '', currency: 'KES', cadence: 'monthly' }
        }))
        else setIncomeEdits(prev => { const n = { ...prev }; delete n[member.id]; return n })
    }

    const saveIncome = async (member: Member) => {
        if (!household) return
        const edit = incomeEdits[member.id]
        if (!edit?.amount || !edit.currency || !edit.cadence) {
            toast.error('Please fill in all income fields')
            return
        }
        setSavingIncome(member.id)
        try {
            const data = await apiPatch<Member>(`/api/households/${household.id}/members/${member.id}`, {
                income_amount: parseFloat(edit.amount),
                income_currency: edit.currency,
                income_cadence: edit.cadence,
            })
            setMembers(members.map(m => m.id === data.id ? data : m))
            setIncomeEdits(prev => { const n = { ...prev }; delete n[member.id]; return n })
            toast.success('Income saved!')
        } catch { toast.error('Failed to save income') }
        finally { setSavingIncome(null) }
    }

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="w-6 h-6 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
        </div>
    )

    if (!household) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: '#f8fafc' }}>
                <div className="w-full max-w-md">
                    <div className="text-center mb-8">
                        <div className="w-20 h-20 rounded-3xl mx-auto mb-5 flex items-center justify-center text-3xl"
                            style={{ background: 'linear-gradient(135deg, #0ea5e9, #6366f1)' }}>
                            🏠
                        </div>
                        <h1 className="text-3xl font-bold text-slate-900">Your Household</h1>
                        <p className="text-slate-400 mt-2">Give your household a name to begin</p>
                    </div>
                    <div className="bg-white rounded-3xl p-8 border border-slate-100"
                        style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.08)' }}>
                        <div className="space-y-4">
                            <Input placeholder="e.g. The Gichinis" value={householdName}
                                className="h-14 rounded-2xl text-lg border-slate-200 px-5"
                                onChange={e => setHouseholdName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && createHousehold()} />
                            <button onClick={createHousehold} disabled={creating}
                                className="w-full h-14 rounded-2xl font-bold text-white text-base flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-70"
                                style={{ background: 'linear-gradient(135deg, #0ea5e9, #6366f1)' }}>
                                {creating
                                    ? <><div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" /> Creating...</>
                                    : <>Let's go <ChevronRight className="h-5 w-5" /></>}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    const myMember = members.find(m => m.user_id === currentUserId)
    const visibleAccounts = myAccountsOnly
        ? accounts.filter(a =>
            a.ownership === 'joint' ||
            (a.ownership === 'individual' && a.household_member_id === myMember?.id)
          )
        : accounts

    return (
        <div className="max-w-4xl space-y-8">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-sky-500 mb-2">Your Household</p>
                    <h1 className="text-4xl font-black text-slate-900 leading-tight">{household.name}</h1>
                    <p className="text-slate-400 mt-1">{members.length} members · {accounts.length} accounts</p>
                </div>
                <button onClick={() => { setEditHouseholdName(household.name); setEditHouseholdDialog(true) }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-slate-500 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-200 transition-all">
                    <Pencil className="h-3.5 w-3.5" /> Rename
                </button>
            </div>

            {/* Member Types */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">Member Types</h2>
                        <p className="text-sm text-slate-400">Roles in your household</p>
                    </div>
                    <button onClick={() => setMemberTypeDialog(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold text-sky-600 bg-sky-50 hover:bg-sky-100 transition-colors">
                        <Plus className="h-3.5 w-3.5" /> Add
                    </button>
                </div>
                <div className="flex flex-wrap gap-2">
                    {household.member_types.map(type => (
                        <div key={type.id}
                            className="flex items-center gap-2 pl-4 pr-3 py-2 bg-white rounded-2xl border border-slate-200 hover:border-slate-300 transition-all group"
                            style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                            <span className="text-sm font-semibold text-slate-700">{type.name}</span>
                            <button onClick={() => deleteMemberType(type.id)}
                                className="w-5 h-5 rounded-lg flex items-center justify-center text-slate-300 hover:text-red-400 hover:bg-red-50 transition-all">
                                <Trash2 className="h-3 w-3" />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Members */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">Members</h2>
                        <p className="text-sm text-slate-400">People in your household</p>
                    </div>
                    <button onClick={() => setMemberDialog(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold text-sky-600 bg-sky-50 hover:bg-sky-100 transition-colors">
                        <Plus className="h-3.5 w-3.5" /> Add Member
                    </button>
                </div>

                {members.length === 0 ? (
                    <div onClick={() => setMemberDialog(true)}
                        className="flex flex-col items-center justify-center h-32 rounded-3xl border-2 border-dashed border-slate-200 cursor-pointer hover:border-sky-300 hover:bg-sky-50 transition-all">
                        <Users className="h-6 w-6 text-slate-300 mb-2" />
                        <p className="text-sm text-slate-400 font-medium">Add your first member</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {members.map((member, i) => (
                            <div key={member.id}
                                className="relative bg-white rounded-3xl p-5 border border-slate-100 hover:border-sky-200 hover:shadow-md transition-all group overflow-hidden"
                                style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                                <div className="absolute top-0 left-0 right-0 h-1 rounded-t-3xl"
                                    style={{ background: GRADIENTS[i % GRADIENTS.length] }} />
                                <div className="flex items-start justify-between mt-1">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-lg flex-shrink-0"
                                            style={{ background: GRADIENTS[i % GRADIENTS.length] }}>
                                            {member.name.charAt(0)}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="font-bold text-slate-900">{member.name}</p>
                                                {member.user_id === currentUserId && (
                                                    <span className="px-2 py-0.5 rounded-full text-xs font-bold text-white"
                                                        style={{ background: 'linear-gradient(135deg, #0ea5e9, #6366f1)' }}>
                                                        You
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-400 mt-0.5">{member.member_type.name}
                                                {member.date_of_birth ? ` · ${member.date_of_birth}` : ''}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => openEditMember(member)}
                                            className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-sky-500 hover:bg-sky-50 transition-all">
                                            <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                        <button onClick={() => deleteMember(member.id)}
                                            className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all">
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>
                                {member.user_id && (
                                    <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                                        <Link className="h-3 w-3" />
                                        <span>Linked to system user</span>
                                    </div>
                                )}

                                {/* Income section */}
                                <div className="mt-3 pt-3 border-t border-slate-50">
                                    <button
                                        onClick={() => toggleIncome(member)}
                                        className="flex items-center justify-between w-full group/toggle">
                                        <span className="text-xs font-semibold text-slate-500">Contributes to income</span>
                                        <div className={`relative w-9 h-5 rounded-full transition-colors ${member.contributes_income ? 'bg-sky-500' : 'bg-slate-200'}`}>
                                            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${member.contributes_income ? 'left-4' : 'left-0.5'}`} />
                                        </div>
                                    </button>

                                    {member.contributes_income && (
                                        <div className="mt-3 space-y-2">
                                            {/* Show saved values if not editing */}
                                            {!incomeEdits[member.id] && member.income_amount ? (
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs text-slate-500">
                                                        {member.income_currency} {Number(member.income_amount).toLocaleString('en-KE', { minimumFractionDigits: 2 })} / {member.income_cadence}
                                                    </span>
                                                    <button
                                                        onClick={() => setIncomeEdits(prev => ({ ...prev, [member.id]: { amount: String(member.income_amount ?? ''), currency: member.income_currency ?? 'KES', cadence: member.income_cadence ?? 'monthly' } }))}
                                                        className="text-xs font-semibold text-sky-500 hover:text-sky-700">
                                                        Edit
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    <div className="flex gap-2">
                                                        <input
                                                            type="number"
                                                            placeholder="Amount"
                                                            value={incomeEdits[member.id]?.amount ?? ''}
                                                            onChange={e => setIncomeEdits(prev => ({ ...prev, [member.id]: { ...prev[member.id], amount: e.target.value } }))}
                                                            className="flex-1 h-9 px-3 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-300"
                                                        />
                                                        <select
                                                            value={incomeEdits[member.id]?.currency ?? 'KES'}
                                                            onChange={e => setIncomeEdits(prev => ({ ...prev, [member.id]: { ...prev[member.id], currency: e.target.value } }))}
                                                            className="h-9 px-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white">
                                                            <option value="KES">KES</option>
                                                            <option value="USD">USD</option>
                                                            <option value="EUR">EUR</option>
                                                        </select>
                                                    </div>
                                                    <select
                                                        value={incomeEdits[member.id]?.cadence ?? 'monthly'}
                                                        onChange={e => setIncomeEdits(prev => ({ ...prev, [member.id]: { ...prev[member.id], cadence: e.target.value } }))}
                                                        className="w-full h-9 px-3 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white">
                                                        <option value="weekly">Weekly</option>
                                                        <option value="monthly">Monthly</option>
                                                        <option value="annually">Annually</option>
                                                    </select>
                                                    <button
                                                        onClick={() => saveIncome(member)}
                                                        disabled={savingIncome === member.id}
                                                        className="w-full h-9 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-60"
                                                        style={{ background: GRADIENTS[i % GRADIENTS.length] }}>
                                                        {savingIncome === member.id ? 'Saving…' : 'Save Income'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Income Summary */}
            {(() => {
                const incomeMembers = members.filter(m => m.contributes_income && m.income_amount)
                if (incomeMembers.length === 0) return null

                // Group totals by currency
                const totals: Record<string, number> = {}
                for (const m of incomeMembers) {
                    const currency = m.income_currency ?? 'KES'
                    const monthly = toMonthly(Number(m.income_amount), m.income_cadence ?? 'monthly')
                    totals[currency] = (totals[currency] ?? 0) + monthly
                }
                const rawTotal = incomeMembers.reduce((s, m) => s + toMonthly(Number(m.income_amount), m.income_cadence ?? 'monthly'), 0)

                return (
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h2 className="text-lg font-bold text-slate-900">Household Income</h2>
                                <p className="text-sm text-slate-400">Monthly income across all members</p>
                            </div>
                        </div>
                        <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden"
                            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                            {/* Donut chart */}
                            <div className="p-5 flex items-center gap-5 border-b border-slate-50">
                                <DonutChart
                                    slices={incomeMembers.map((m, i) => ({
                                        color: CHART_COLORS[i % CHART_COLORS.length],
                                        pct: rawTotal > 0 ? toMonthly(Number(m.income_amount), m.income_cadence ?? 'monthly') / rawTotal : 1 / incomeMembers.length,
                                    }))}
                                    centerLabel={String(incomeMembers.length)}
                                    centerSub={incomeMembers.length === 1 ? 'earner' : 'earners'}
                                />
                                <div className="flex-1 space-y-2.5 min-w-0">
                                    {incomeMembers.map((m, i) => {
                                        const monthly = toMonthly(Number(m.income_amount), m.income_cadence ?? 'monthly')
                                        const pct = rawTotal > 0 ? (monthly / rawTotal) * 100 : 100 / incomeMembers.length
                                        return (
                                            <div key={m.id} className="flex items-center gap-2 min-w-0">
                                                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                                    style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                                                <p className="text-xs font-semibold text-slate-700 truncate flex-1 min-w-0">{m.name}</p>
                                                <p className="text-xs font-bold text-slate-500 flex-shrink-0">{pct.toFixed(0)}%</p>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                            {/* Per-member rows */}
                            <div className="divide-y divide-slate-50">
                                {incomeMembers.map((member, i) => {
                                    const monthly = toMonthly(Number(member.income_amount), member.income_cadence ?? 'monthly')
                                    const currency = member.income_currency ?? 'KES'
                                    return (
                                        <div key={member.id} className="flex items-center justify-between px-5 py-3.5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm font-black flex-shrink-0"
                                                    style={{ background: GRADIENTS[i % GRADIENTS.length] }}>
                                                    {member.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-slate-800 text-sm">{member.name}</p>
                                                    <p className="text-xs text-slate-400">{member.member_type.name} · <span className="capitalize">{member.income_cadence}</span></p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-bold text-slate-900 text-sm">
                                                    {fmtMoney(Number(member.income_amount), currency)}
                                                    <span className="text-xs font-normal text-slate-400"> / {member.income_cadence}</span>
                                                </p>
                                                {member.income_cadence !== 'monthly' && (
                                                    <p className="text-xs text-slate-400">{fmtMoney(monthly, currency)} / mo</p>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                            {/* Total footer */}
                            <div className="px-5 py-4 border-t border-slate-100"
                                style={{ background: 'linear-gradient(135deg, #f0f9ff, #f5f3ff)' }}>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-bold text-slate-500">Total Monthly Income</span>
                                    <div className="text-right">
                                        {Object.entries(totals).map(([currency, total]) => (
                                            <p key={currency} className="font-black text-slate-900 text-base">
                                                {fmtMoney(total, currency)}
                                                <span className="text-xs font-normal text-slate-500 ml-1">/ mo</span>
                                            </p>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            })()}

            {/* Accounts */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">Accounts</h2>
                        <p className="text-sm text-slate-400">Bank and cash accounts</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex items-center bg-slate-100 rounded-xl p-1">
                            <button onClick={() => setMyAccountsOnly(false)}
                                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${!myAccountsOnly ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                All
                            </button>
                            <button onClick={() => setMyAccountsOnly(true)}
                                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${myAccountsOnly ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                Mine
                            </button>
                        </div>
                        <button onClick={() => setAccountDialog(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold text-sky-600 bg-sky-50 hover:bg-sky-100 transition-colors">
                            <Plus className="h-3.5 w-3.5" /> Add Account
                        </button>
                    </div>
                </div>

                {visibleAccounts.length > 0 && (() => {
                    const TYPE_COLORS  = ['bg-sky-400','bg-emerald-400','bg-amber-400','bg-rose-400','bg-slate-400']
                    const INST_COLORS  = ['bg-sky-500','bg-teal-400','bg-blue-400','bg-purple-400','bg-orange-400','bg-indigo-400','bg-pink-400']
                    const ownershipItems = [
                        { label: 'Joint',      color: 'bg-sky-400',    count: visibleAccounts.filter(a => a.ownership === 'joint').length },
                        { label: 'Individual', color: 'bg-violet-400', count: visibleAccounts.filter(a => a.ownership === 'individual').length },
                    ].filter(g => g.count > 0)
                    const typeItems = ACCOUNT_TYPES.map((t, i) => ({
                        label: t.label, color: TYPE_COLORS[i] ?? 'bg-slate-300',
                        count: visibleAccounts.filter(a => a.account_type === t.value).length,
                    })).filter(g => g.count > 0)
                    const instItems = [
                        ...INSTITUTION_TYPES.map((t, i) => ({
                            label: t.label, color: INST_COLORS[i] ?? 'bg-slate-300',
                            count: visibleAccounts.filter(a => a.institution_type === t.value).length,
                        })).filter(g => g.count > 0),
                        ...(visibleAccounts.filter(a => !a.institution_type).length > 0
                            ? [{ label: 'Untagged', color: 'bg-slate-200', count: visibleAccounts.filter(a => !a.institution_type).length }]
                            : []),
                    ]
                    const Bar = ({ items }: { items: { label: string; count: number; color: string }[] }) => {
                        const t = items.reduce((s, g) => s + g.count, 0)
                        return (
                            <div className="flex h-2 rounded-full overflow-hidden gap-px mb-3">
                                {items.map(g => <div key={g.label} className={g.color} style={{ width: `${(g.count / t) * 100}%` }} />)}
                            </div>
                        )
                    }
                    const Legend = ({ items }: { items: { label: string; count: number; color: string }[] }) => (
                        <div className="space-y-1.5">
                            {items.map(g => (
                                <div key={g.label} className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${g.color}`} />
                                        <span className="text-xs text-slate-500">{g.label}</span>
                                    </div>
                                    <span className="text-xs font-bold text-slate-800">{g.count}</span>
                                </div>
                            ))}
                        </div>
                    )
                    return (
                        <div className="grid grid-cols-3 gap-3 mb-5">
                            {[
                                { title: 'By Ownership',    items: ownershipItems },
                                { title: 'By Type',         items: typeItems },
                                { title: 'By Institution',  items: instItems },
                            ].map(({ title, items }) => (
                                <div key={title} className="bg-white rounded-2xl p-4 border border-slate-100" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">{title}</p>
                                    <Bar items={items} />
                                    <Legend items={items} />
                                </div>
                            ))}
                        </div>
                    )
                })()}

                {visibleAccounts.length === 0 ? (
                    <div onClick={() => setAccountDialog(true)}
                        className="flex flex-col items-center justify-center h-32 rounded-3xl border-2 border-dashed border-slate-200 cursor-pointer hover:border-sky-300 hover:bg-sky-50 transition-all">
                        <Wallet className="h-6 w-6 text-slate-300 mb-2" />
                        <p className="text-sm text-slate-400 font-medium">
                            {myAccountsOnly ? 'No accounts linked to you' : 'Add your first account'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {visibleAccounts.map((account, i) => {
                            const owner = members.find(m => m.id === account.household_member_id)
                            return (
                                <div key={account.id}
                                    className="bg-white rounded-3xl p-5 border border-slate-100 hover:border-sky-200 hover:shadow-md transition-all group flex items-center justify-between"
                                    style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
                                            style={{ background: `${GRADIENTS[(i + 2) % GRADIENTS.length].replace('linear-gradient(135deg, ', '').split(',')[0]}22` }}>
                                            {ACCOUNT_TYPE_MAP[account.account_type]?.icon ?? '🏧'}
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-900">{account.name}</p>
                                            <p className="text-xs text-slate-400 mt-0.5">
                                                {ACCOUNT_TYPE_MAP[account.account_type]?.label ?? account.account_type} · {account.ownership}
                                                {owner ? ` · ${owner.name}` : ''}
                                            </p>
                                            {account.institution_type && (
                                                <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-violet-50 text-violet-700 border border-violet-100">
                                                    {INSTITUTION_TYPE_MAP[account.institution_type]?.icon} {INSTITUTION_TYPE_MAP[account.institution_type]?.label}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <p className="font-black text-slate-900 text-lg" style={{ fontFamily: 'Plus Jakarta Sans' }}>
                                            {account.currency} {account.current_balance.toLocaleString()}
                                        </p>
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => openEditAccount(account)}
                                                className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-sky-500 hover:bg-sky-50 transition-all">
                                                <Pencil className="h-3.5 w-3.5" />
                                            </button>
                                            <button onClick={() => deleteAccount(account.id)}
                                                className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all">
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* ── Dialogs ─────────────────────────────────────── */}

            <Dialog open={editHouseholdDialog} onOpenChange={setEditHouseholdDialog}>
                <DialogContent className="rounded-3xl border-0" style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.15)' }}>
                    <DialogHeader><DialogTitle className="text-xl font-black">Rename Household</DialogTitle></DialogHeader>
                    <div className="space-y-2 py-2">
                        <Input className="h-12 rounded-2xl" value={editHouseholdName}
                            onChange={e => setEditHouseholdName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && updateHouseholdName()} />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="rounded-2xl" onClick={() => setEditHouseholdDialog(false)}>Cancel</Button>
                        <SaveButton onClick={updateHouseholdName} loading={savingHousehold} />
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={memberTypeDialog} onOpenChange={setMemberTypeDialog}>
                <DialogContent className="rounded-3xl border-0" style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.15)' }}>
                    <DialogHeader><DialogTitle className="text-xl font-black">New Member Type</DialogTitle></DialogHeader>
                    <div className="space-y-2 py-2">
                        <Input className="h-12 rounded-2xl" placeholder="e.g. Guardian, Nanny..." value={newMemberTypeName}
                            onChange={e => setNewMemberTypeName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && addMemberType()} />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="rounded-2xl" onClick={() => setMemberTypeDialog(false)}>Cancel</Button>
                        <SaveButton onClick={addMemberType} loading={savingMemberType} label="Add" />
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={memberDialog} onOpenChange={setMemberDialog}>
                <DialogContent className="rounded-3xl border-0" style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.15)' }}>
                    <DialogHeader><DialogTitle className="text-xl font-black">Add Member</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label className="text-sm font-bold text-slate-700">Full Name</Label>
                            <Input className="h-12 rounded-2xl" placeholder="e.g. Jane Doe" value={newMember.name}
                                onChange={e => setNewMember(prev => ({ ...prev, name: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm font-bold text-slate-700">Member Type</Label>
                            <Select onValueChange={val => setNewMember(prev => ({ ...prev, member_type_id: val }))}>
                                <SelectTrigger className="h-12 rounded-2xl"><SelectValue placeholder="Select type" /></SelectTrigger>
                                <SelectContent className="rounded-2xl">
                                    {household.member_types.map(type => (
                                        <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm font-bold text-slate-700">Date of Birth <span className="font-normal text-slate-400">(optional)</span></Label>
                            <Input type="date" className="h-12 rounded-2xl" value={newMember.date_of_birth}
                                onChange={e => setNewMember(prev => ({ ...prev, date_of_birth: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label className="text-sm font-bold text-slate-700">System User <span className="font-normal text-slate-400">(optional)</span></Label>
                                <button onClick={() => { setNewUser(prev => ({ ...prev, name: newMember.name })); setCreateUserDialog(true) }} className="text-xs font-bold text-sky-500 hover:text-sky-600">+ Create new</button>
                            </div>
                            <Select value={newMember.user_id} onValueChange={val => {
                                const user = systemUsers.find(u => u.id === val)
                                setNewMember(prev => ({ ...prev, user_id: val, name: user?.name || prev.name }))
                            }}>
                                <SelectTrigger className="h-12 rounded-2xl"><SelectValue placeholder="Link to a user" /></SelectTrigger>
                                <SelectContent className="rounded-2xl">
                                    {systemUsers.map(user => (
                                        <SelectItem key={user.id} value={user.id}>{user.name || user.email}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="rounded-2xl" onClick={() => setMemberDialog(false)}>Cancel</Button>
                        <SaveButton onClick={addMember} loading={savingMember} label="Add Member" />
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={editMemberDialog} onOpenChange={setEditMemberDialog}>
                <DialogContent className="rounded-3xl border-0" style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.15)' }}>
                    <DialogHeader><DialogTitle className="text-xl font-black">Edit Member</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label className="text-sm font-bold text-slate-700">Full Name</Label>
                            <Input className="h-12 rounded-2xl" value={editMemberData.name}
                                onChange={e => setEditMemberData(prev => ({ ...prev, name: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm font-bold text-slate-700">Member Type</Label>
                            <Select value={editMemberData.member_type_id} onValueChange={val => setEditMemberData(prev => ({ ...prev, member_type_id: val }))}>
                                <SelectTrigger className="h-12 rounded-2xl"><SelectValue /></SelectTrigger>
                                <SelectContent className="rounded-2xl">
                                    {household.member_types.map(type => (
                                        <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm font-bold text-slate-700">Date of Birth</Label>
                            <Input type="date" className="h-12 rounded-2xl" value={editMemberData.date_of_birth}
                                onChange={e => setEditMemberData(prev => ({ ...prev, date_of_birth: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label className="text-sm font-bold text-slate-700">System User</Label>
                                <button onClick={() => { setNewUser(prev => ({ ...prev, name: editMemberData.name })); setCreateUserDialog(true) }} className="text-xs font-bold text-sky-500 hover:text-sky-600">+ Create new</button>
                            </div>
                            <Select value={editMemberData.user_id} onValueChange={val => {
                                const user = systemUsers.find(u => u.id === val)
                                setEditMemberData(prev => ({ ...prev, user_id: val, name: user?.name || prev.name }))
                            }}>
                                <SelectTrigger className="h-12 rounded-2xl"><SelectValue placeholder="Link to a user" /></SelectTrigger>
                                <SelectContent className="rounded-2xl">
                                    {systemUsers.map(user => (
                                        <SelectItem key={user.id} value={user.id}>{user.name || user.email}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="rounded-2xl" onClick={() => setEditMemberDialog(false)}>Cancel</Button>
                        <SaveButton onClick={updateMember} loading={savingMember} />
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={createUserDialog} onOpenChange={setCreateUserDialog}>
                <DialogContent className="rounded-3xl border-0" style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.15)' }}>
                    <DialogHeader><DialogTitle className="text-xl font-black">Create System User</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label className="text-sm font-bold text-slate-700">Full Name</Label>
                            <Input className="h-12 rounded-2xl" placeholder="Jane Doe" value={newUser.name}
                                onChange={e => setNewUser(prev => ({ ...prev, name: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm font-bold text-slate-700">Email</Label>
                            <Input type="email" className="h-12 rounded-2xl" placeholder="jane@example.com" value={newUser.email}
                                onChange={e => setNewUser(prev => ({ ...prev, email: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm font-bold text-slate-700">Temporary Password</Label>
                            <Input type="password" className="h-12 rounded-2xl" placeholder="••••••••" value={newUser.password}
                                onChange={e => setNewUser(prev => ({ ...prev, password: e.target.value }))} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="rounded-2xl" onClick={() => setCreateUserDialog(false)}>Cancel</Button>
                        <SaveButton onClick={createSystemUser} loading={creatingUser} label="Create User" />
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={accountDialog} onOpenChange={setAccountDialog}>
                <DialogContent className="rounded-3xl border-0" style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.15)' }}>
                    <DialogHeader><DialogTitle className="text-xl font-black">Add Account</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label className="text-sm font-bold text-slate-700">Account Name</Label>
                            <Input className="h-12 rounded-2xl" placeholder="e.g. KCB Joint Account" value={newAccount.name}
                                onChange={e => setNewAccount(prev => ({ ...prev, name: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm font-bold text-slate-700">Account Type</Label>
                            <Select onValueChange={val => setNewAccount(prev => ({ ...prev, account_type: val }))}>
                                <SelectTrigger className="h-12 rounded-2xl"><SelectValue placeholder="Select type" /></SelectTrigger>
                                <SelectContent className="rounded-2xl">
                                    {ACCOUNT_TYPES.map(t => (
                                        <SelectItem key={t.value} value={t.value}>{t.icon} {t.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm font-bold text-slate-700">Institution Type <span className="text-slate-400 font-normal">(optional)</span></Label>
                            <Select onValueChange={val => setNewAccount(prev => ({ ...prev, institution_type: val }))}>
                                <SelectTrigger className="h-12 rounded-2xl"><SelectValue placeholder="e.g. Bank, Money Market…" /></SelectTrigger>
                                <SelectContent className="rounded-2xl">
                                    {INSTITUTION_TYPES.map(t => (
                                        <SelectItem key={t.value} value={t.value}>{t.icon} {t.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm font-bold text-slate-700">Currency</Label>
                            <Select value={newAccount.currency} onValueChange={val => setNewAccount(prev => ({ ...prev, currency: val }))}>
                                <SelectTrigger className="h-12 rounded-2xl"><SelectValue /></SelectTrigger>
                                <SelectContent className="rounded-2xl">
                                    <SelectItem value="KES">🇰🇪 KES — Kenyan Shilling</SelectItem>
                                    <SelectItem value="USD">🇺🇸 USD — US Dollar</SelectItem>
                                    <SelectItem value="EUR">🇪🇺 EUR — Euro</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm font-bold text-slate-700">Ownership</Label>
                            <Select defaultValue="joint" onValueChange={val => setNewAccount(prev => ({ ...prev, ownership: val, household_member_id: val === 'joint' ? '' : prev.household_member_id }))}>
                                <SelectTrigger className="h-12 rounded-2xl"><SelectValue /></SelectTrigger>
                                <SelectContent className="rounded-2xl">
                                    <SelectItem value="joint">🤝 Joint</SelectItem>
                                    <SelectItem value="individual">👤 Individual</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {newAccount.ownership === 'individual' && (
                            <div className="space-y-2">
                                <Label className="text-sm font-bold text-slate-700">Owner</Label>
                                <Select onValueChange={val => setNewAccount(prev => ({ ...prev, household_member_id: val }))}>
                                    <SelectTrigger className="h-12 rounded-2xl"><SelectValue placeholder="Select member" /></SelectTrigger>
                                    <SelectContent className="rounded-2xl">
                                        {members.map(m => (
                                            <SelectItem key={m.id} value={m.id}>{m.name} · {m.member_type.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label className="text-sm font-bold text-slate-700">Opening Balance</Label>
                            <Input type="number" className="h-12 rounded-2xl" placeholder="0" value={newAccount.current_balance}
                                onChange={e => setNewAccount(prev => ({ ...prev, current_balance: parseFloat(e.target.value) || 0 }))} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="rounded-2xl" onClick={() => setAccountDialog(false)}>Cancel</Button>
                        <SaveButton onClick={addAccount} loading={savingAccount} label="Add Account" />
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={editAccountDialog} onOpenChange={setEditAccountDialog}>
                <DialogContent className="rounded-3xl border-0" style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.15)' }}>
                    <DialogHeader><DialogTitle className="text-xl font-black">Edit Account</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label className="text-sm font-bold text-slate-700">Account Name</Label>
                            <Input className="h-12 rounded-2xl" value={editAccountData.name}
                                onChange={e => setEditAccountData(prev => ({ ...prev, name: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm font-bold text-slate-700">Account Type</Label>
                            <Select value={editAccountData.account_type} onValueChange={val => setEditAccountData(prev => ({ ...prev, account_type: val }))}>
                                <SelectTrigger className="h-12 rounded-2xl"><SelectValue /></SelectTrigger>
                                <SelectContent className="rounded-2xl">
                                    {ACCOUNT_TYPES.map(t => (
                                        <SelectItem key={t.value} value={t.value}>{t.icon} {t.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm font-bold text-slate-700">Institution Type <span className="text-slate-400 font-normal">(optional)</span></Label>
                            <Select value={editAccountData.institution_type || ''} onValueChange={val => setEditAccountData(prev => ({ ...prev, institution_type: val }))}>
                                <SelectTrigger className="h-12 rounded-2xl"><SelectValue placeholder="e.g. Bank, Money Market…" /></SelectTrigger>
                                <SelectContent className="rounded-2xl">
                                    {INSTITUTION_TYPES.map(t => (
                                        <SelectItem key={t.value} value={t.value}>{t.icon} {t.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm font-bold text-slate-700">Currency</Label>
                            <Select value={editAccountData.currency} onValueChange={val => setEditAccountData(prev => ({ ...prev, currency: val }))}>
                                <SelectTrigger className="h-12 rounded-2xl"><SelectValue /></SelectTrigger>
                                <SelectContent className="rounded-2xl">
                                    <SelectItem value="KES">🇰🇪 KES — Kenyan Shilling</SelectItem>
                                    <SelectItem value="USD">🇺🇸 USD — US Dollar</SelectItem>
                                    <SelectItem value="EUR">🇪🇺 EUR — Euro</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm font-bold text-slate-700">Ownership</Label>
                            <Select value={editAccountData.ownership} onValueChange={val => setEditAccountData(prev => ({ ...prev, ownership: val, household_member_id: val === 'joint' ? '' : prev.household_member_id }))}>
                                <SelectTrigger className="h-12 rounded-2xl"><SelectValue /></SelectTrigger>
                                <SelectContent className="rounded-2xl">
                                    <SelectItem value="joint">🤝 Joint</SelectItem>
                                    <SelectItem value="individual">👤 Individual</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {editAccountData.ownership === 'individual' && (
                            <div className="space-y-2">
                                <Label className="text-sm font-bold text-slate-700">Owner</Label>
                                <Select value={editAccountData.household_member_id} onValueChange={val => setEditAccountData(prev => ({ ...prev, household_member_id: val }))}>
                                    <SelectTrigger className="h-12 rounded-2xl"><SelectValue placeholder="Select member" /></SelectTrigger>
                                    <SelectContent className="rounded-2xl">
                                        {members.map(m => (
                                            <SelectItem key={m.id} value={m.id}>{m.name} · {m.member_type.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label className="text-sm font-bold text-slate-700">Current Balance</Label>
                            <Input type="number" className="h-12 rounded-2xl" value={editAccountData.current_balance}
                                onChange={e => setEditAccountData(prev => ({ ...prev, current_balance: parseFloat(e.target.value) || 0 }))} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="rounded-2xl" onClick={() => setEditAccountDialog(false)}>Cancel</Button>
                        <SaveButton onClick={updateAccount} loading={savingAccount} />
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
