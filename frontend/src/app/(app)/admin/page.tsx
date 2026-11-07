'use client'

import { useEffect, useState } from 'react'
import { useHousehold } from '@/context/HouseholdContext'
import { apiGet, apiPatch, apiPost, apiPut, apiDelete } from '@/lib/api'
import { toast } from 'sonner'
import {
    ShieldCheck, User, Building2, Tags, Plus, Trash2, Save, Loader2, Pencil, X, Check,
    RefreshCw, Eye, CalendarDays, AlertTriangle, ShieldAlert, Users, Settings, Banknote,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type AdminTab = 'users' | 'budget' | 'system'
type UsersSubtab = 'profile' | 'household' | 'member-types'
type BudgetSubtab = 'calendar' | 'currency'
type SystemSubtab = 'view-mode' | 'danger-zone'

interface UserProfile {
    id: string
    email: string
    name: string | null
    created_at: string
}

interface MemberType {
    id: string
    name: string
    bg_color: string | null
    text_color: string | null
}

interface FxRate {
    id: string
    currency: string
    rate_to_kes: string
    updated_at: string
}

const COMMON_CURRENCIES = ['USD', 'EUR', 'GBP', 'TZS', 'UGX', 'ZAR', 'INR', 'AED', 'CAD', 'AUD']

export default function AdminPage() {
    const { household, fxRates, setFxRates, refreshHousehold, viewMode, setViewMode, currentUserId } = useHousehold()

    const [activeTab, setActiveTab] = useState<AdminTab>('users')
    const [usersSubtab, setUsersSubtab] = useState<UsersSubtab>('profile')
    const [budgetSubtab, setBudgetSubtab] = useState<BudgetSubtab>('calendar')
    const [systemSubtab, setSystemSubtab] = useState<SystemSubtab>('view-mode')

    // Profile state
    const [profile, setProfile] = useState<UserProfile | null>(null)
    const [profileName, setProfileName] = useState('')
    const [savingProfile, setSavingProfile] = useState(false)

    // Household state
    const [householdName, setHouseholdName] = useState('')
    const [savingHousehold, setSavingHousehold] = useState(false)

    // Budget calendar state
    const [startMonth, setStartMonth] = useState('')
    const [payDay, setPayDay] = useState('')
    const [gracePeriod, setGracePeriod] = useState('5')
    const [savingCalendar, setSavingCalendar] = useState(false)

    // Member types state
    const [memberTypes, setMemberTypes] = useState<MemberType[]>([])
    const [newTypeName, setNewTypeName] = useState('')
    const [addingType, setAddingType] = useState(false)
    const [deletingTypeId, setDeletingTypeId] = useState<string | null>(null)
    const [editingTypeId, setEditingTypeId] = useState<string | null>(null)
    const [editName, setEditName] = useState('')
    const [editBgColor, setEditBgColor] = useState<string | null>(null)
    const [editTextColor, setEditTextColor] = useState<string | null>(null)
    const [savingEditId, setSavingEditId] = useState<string | null>(null)

    // Clear data state
    const [showClearDialog, setShowClearDialog] = useState(false)
    const [clearLevel, setClearLevel] = useState<'sessions' | 'budget' | 'accounts' | 'everything'>('sessions')
    const [clearPassword, setClearPassword] = useState('')
    const [clearConfirm, setClearConfirm] = useState('')
    const [clearPasswordError, setClearPasswordError] = useState('')
    const [clearing, setClearing] = useState(false)

    // FX rates state
    const [localFxRates, setLocalFxRates] = useState<FxRate[]>([])
    const [newCurrency, setNewCurrency] = useState('')
    const [newRate, setNewRate] = useState('')
    const [savingRate, setSavingRate] = useState<string | null>(null)
    const [deletingRate, setDeletingRate] = useState<string | null>(null)
    const [editRates, setEditRates] = useState<Record<string, string>>({})

    useEffect(() => {
        apiGet<UserProfile>('/api/users/me').then((u) => {
            setProfile(u)
            setProfileName(u.name ?? '')
        })
    }, [])

    useEffect(() => {
        if (household) {
            setHouseholdName(household.name)
            setMemberTypes(household.member_types ?? [])
            setStartMonth(household.financial_start_month ? household.financial_start_month.slice(0, 7) : '')
            setPayDay(household.pay_day != null ? String(household.pay_day) : '')
            setGracePeriod(household.pay_day_grace_period != null ? String(household.pay_day_grace_period) : '5')
        }
    }, [household])

    useEffect(() => {
        setLocalFxRates(fxRates)
        const edits: Record<string, string> = {}
        fxRates.forEach(r => { edits[r.currency] = Number(r.rate_to_kes).toString() })
        setEditRates(edits)
    }, [fxRates])

    const saveProfile = async () => {
        if (!profileName.trim()) return
        setSavingProfile(true)
        try {
            const updated = await apiPatch<UserProfile>('/api/users/me', { name: profileName.trim() })
            setProfile(updated)
            setProfileName(updated.name ?? '')
            toast.success('Profile updated')
        } catch {
            toast.error('Failed to update profile')
        } finally {
            setSavingProfile(false)
        }
    }

    const saveHousehold = async () => {
        if (!household || !householdName.trim()) return
        setSavingHousehold(true)
        try {
            await apiPatch(`/api/households/${household.id}`, { name: householdName.trim() })
            await refreshHousehold()
            toast.success('Household name updated')
        } catch {
            toast.error('Failed to update household name')
        } finally {
            setSavingHousehold(false)
        }
    }

    const saveCalendar = async () => {
        if (!household) return
        setSavingCalendar(true)
        try {
            const body: Record<string, unknown> = {}
            if (startMonth) body.financial_start_month = `${startMonth}-01`
            else body.financial_start_month = null
            const pd = parseInt(payDay)
            body.pay_day = !isNaN(pd) && pd >= 1 && pd <= 28 ? pd : null
            const gp = parseInt(gracePeriod)
            body.pay_day_grace_period = !isNaN(gp) && gp >= 1 && gp <= 10 ? gp : null
            await apiPatch(`/api/households/${household.id}`, body)
            await refreshHousehold()
            toast.success('Budget calendar saved')
        } catch {
            toast.error('Failed to save calendar settings')
        } finally {
            setSavingCalendar(false)
        }
    }

    const addMemberType = async () => {
        if (!household || !newTypeName.trim()) return
        setAddingType(true)
        try {
            const created = await apiPost<MemberType>(
                `/api/households/${household.id}/member-types`,
                { name: newTypeName.trim() }
            )
            setMemberTypes((prev) => [...prev, created])
            setNewTypeName('')
            toast.success(`"${created.name}" added`)
        } catch {
            toast.error('Failed to add member type')
        } finally {
            setAddingType(false)
        }
    }

    const saveRate = async (currency: string) => {
        if (!household) return
        const rateVal = editRates[currency]
        if (!rateVal || isNaN(Number(rateVal)) || Number(rateVal) <= 0) {
            toast.error('Enter a valid rate greater than 0')
            return
        }
        setSavingRate(currency)
        try {
            const updated = await apiPut<FxRate>(
                `/api/households/${household.id}/fx-rates/${currency}`,
                { rate_to_kes: Number(rateVal) }
            )
            setLocalFxRates(prev => prev.map(r => r.currency === currency ? updated : r))
            setFxRates(localFxRates.map(r => r.currency === currency ? updated : r))
            toast.success(`${currency} → KES rate saved`)
        } catch {
            toast.error('Failed to save rate')
        } finally {
            setSavingRate(null)
        }
    }

    const addRate = async () => {
        if (!household || !newCurrency.trim() || !newRate.trim()) return
        const currency = newCurrency.trim().toUpperCase()
        const rateVal = Number(newRate)
        if (isNaN(rateVal) || rateVal <= 0) { toast.error('Enter a valid rate'); return }
        if (localFxRates.some(r => r.currency === currency)) {
            toast.error(`Rate for ${currency} already exists — edit it below`)
            return
        }
        setSavingRate(currency)
        try {
            const created = await apiPut<FxRate>(
                `/api/households/${household.id}/fx-rates/${currency}`,
                { rate_to_kes: rateVal }
            )
            const next = [...localFxRates, created]
            setLocalFxRates(next)
            setFxRates(next)
            setEditRates(prev => ({ ...prev, [currency]: rateVal.toString() }))
            setNewCurrency('')
            setNewRate('')
            toast.success(`${currency} → KES rate added`)
        } catch {
            toast.error('Failed to add rate')
        } finally {
            setSavingRate(null)
        }
    }

    const deleteRate = async (currency: string) => {
        if (!household) return
        setDeletingRate(currency)
        try {
            await apiDelete(`/api/households/${household.id}/fx-rates/${currency}`)
            const next = localFxRates.filter(r => r.currency !== currency)
            setLocalFxRates(next)
            setFxRates(next)
            setEditRates(prev => { const n = { ...prev }; delete n[currency]; return n })
            toast.success(`${currency} rate removed`)
        } catch {
            toast.error('Failed to remove rate')
        } finally {
            setDeletingRate(null)
        }
    }

    const deleteMemberType = async (typeId: string, typeName: string) => {
        if (!household) return
        setDeletingTypeId(typeId)
        try {
            await apiDelete(`/api/households/${household.id}/member-types/${typeId}`)
            setMemberTypes((prev) => prev.filter((t) => t.id !== typeId))
            toast.success(`"${typeName}" removed`)
        } catch {
            toast.error('Failed to remove member type')
        } finally {
            setDeletingTypeId(null)
        }
    }

    const startEditType = (type: MemberType) => {
        setEditingTypeId(type.id)
        setEditName(type.name)
        setEditBgColor(type.bg_color)
        setEditTextColor(type.text_color)
    }

    const cancelEditType = () => {
        setEditingTypeId(null)
        setEditName('')
        setEditBgColor(null)
        setEditTextColor(null)
    }

    const saveEditType = async () => {
        if (!household || !editingTypeId || !editName.trim()) return
        setSavingEditId(editingTypeId)
        try {
            const updated = await apiPatch<MemberType>(
                `/api/households/${household.id}/member-types/${editingTypeId}`,
                { name: editName.trim(), bg_color: editBgColor, text_color: editTextColor }
            )
            setMemberTypes(prev => prev.map(t => t.id === editingTypeId ? updated : t))
            cancelEditType()
            toast.success('Member type updated')
        } catch {
            toast.error('Failed to update member type')
        } finally {
            setSavingEditId(null)
        }
    }

    const openClearDialog = () => {
        setClearLevel('sessions')
        setClearPassword('')
        setClearConfirm('')
        setClearPasswordError('')
        setShowClearDialog(true)
    }

    const closeClearDialog = () => {
        if (clearing) return
        setShowClearDialog(false)
    }

    const clearLevelMeta = {
        sessions: {
            label: 'Budget Sessions',
            color: 'yellow',
            description: 'Removes all monthly budget sessions and their items. Account balances are corrected to remove any session-paid credits.',
            impact: ['Budget sessions', 'Session items', 'Session-linked account transactions'],
        },
        budget: {
            label: 'Full Budget',
            color: 'orange',
            description: 'Clears all budget sessions plus the entire expense library — groups, expenses, tags, and templates.',
            impact: ['Budget sessions', 'Session items', 'Session-linked account transactions', 'Expense groups', 'Expenses', 'Tags', 'Budget templates'],
        },
        accounts: {
            label: 'Account History',
            color: 'red',
            description: 'Clears all budget data and the complete account transaction history. All account balances are reset to zero.',
            impact: ['Everything in Full Budget', 'All manual account transactions', 'Account balances reset to 0'],
        },
        everything: {
            label: 'Everything',
            color: 'rose',
            description: 'Full household reset. Clears all data including accounts and members. Only your household name and profile remain.',
            impact: ['Everything in Account History', 'All accounts', 'All household members', 'Member types'],
        },
    } as const

    const handleClearData = async () => {
        if (clearConfirm !== 'DELETE') return
        if (!clearPassword) { setClearPasswordError('Password is required'); return }
        if (!household || !profile) return

        setClearing(true)
        setClearPasswordError('')

        try {
            await apiPost('/api/auth/verify-password', { password: clearPassword })
        } catch {
            setClearPasswordError('Incorrect password. Please try again.')
            setClearing(false)
            return
        }

        try {
            await apiDelete(`/api/households/${household.id}/data?level=${clearLevel}`)
            toast.success('Data cleared successfully')
            setShowClearDialog(false)
            await refreshHousehold()
            window.location.reload()
        } catch {
            toast.error('Failed to clear data. Please try again.')
        } finally {
            setClearing(false)
        }
    }

    const isOwner = household && currentUserId && household.created_by === currentUserId

    const tabs: { id: AdminTab; label: string; icon: React.ElementType }[] = [
        { id: 'users', label: 'Users', icon: Users },
        { id: 'budget', label: 'Budget Configs', icon: Banknote },
        { id: 'system', label: 'System Configs', icon: Settings },
    ]

    return (
        <>
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex items-center gap-3 mb-2">
                <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)' }}
                >
                    <ShieldCheck className="h-5 w-5 text-white" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Admin</h1>
                    <p className="text-sm text-slate-500">Manage users, budget settings, and system preferences</p>
                </div>
            </div>

            {/* Tab bar */}
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl">
                {tabs.map((tab) => {
                    const Icon = tab.icon
                    const isActive = activeTab === tab.id
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                                isActive
                                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                            }`}
                        >
                            <Icon className="h-4 w-4" />
                            {tab.label}
                        </button>
                    )
                })}
            </div>

            {/* ── Users tab ── */}
            {activeTab === 'users' && (
                <div className="space-y-5">
                    {/* Subtab bar */}
                    <div className="flex gap-6 border-b border-slate-200 dark:border-slate-700">
                        {([
                            { id: 'profile', label: 'Profile', icon: User },
                            { id: 'household', label: 'Household', icon: Building2 },
                            { id: 'member-types', label: 'Member Types', icon: Tags },
                        ] as { id: UsersSubtab; label: string; icon: React.ElementType }[]).map(({ id, label, icon: Icon }) => (
                            <button
                                key={id}
                                onClick={() => setUsersSubtab(id)}
                                className={cn(
                                    'flex items-center gap-1.5 pb-3 text-sm font-medium border-b-2 -mb-px transition-colors',
                                    usersSubtab === id
                                        ? 'border-sky-500 text-sky-600'
                                        : 'border-transparent text-slate-500 hover:text-slate-700'
                                )}
                            >
                                <Icon className="h-3.5 w-3.5" />
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* Profile */}
                    {usersSubtab === 'profile' && (
                        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-700">
                            <div className="space-y-4">
                                <div className="space-y-1.5">
                                    <Label htmlFor="profile-name" className="text-sm text-slate-600">Display name</Label>
                                    <Input
                                        id="profile-name"
                                        value={profileName}
                                        onChange={(e) => setProfileName(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && saveProfile()}
                                        placeholder="Your name"
                                        className="rounded-xl border-slate-200 focus:border-sky-400 focus:ring-sky-400"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-sm text-slate-600">Email</Label>
                                    <Input
                                        value={profile?.email ?? ''}
                                        disabled
                                        className="rounded-xl bg-slate-50 text-slate-400 border-slate-200"
                                    />
                                    <p className="text-xs text-slate-400">Email cannot be changed here.</p>
                                </div>
                                <div className="flex justify-end pt-1">
                                    <Button
                                        onClick={saveProfile}
                                        disabled={savingProfile || !profileName.trim() || profileName.trim() === (profile?.name ?? '')}
                                        className="rounded-xl gap-2"
                                        style={{ background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)' }}
                                    >
                                        {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                        Save
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Household */}
                    {usersSubtab === 'household' && (
                        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-700">
                            <div className="space-y-4">
                                <div className="space-y-1.5">
                                    <Label htmlFor="household-name" className="text-sm text-slate-600">Household name</Label>
                                    <Input
                                        id="household-name"
                                        value={householdName}
                                        onChange={(e) => setHouseholdName(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && saveHousehold()}
                                        placeholder="e.g. The Smiths"
                                        className="rounded-xl border-slate-200 focus:border-sky-400 focus:ring-sky-400"
                                    />
                                </div>
                                <div className="flex justify-end pt-1">
                                    <Button
                                        onClick={saveHousehold}
                                        disabled={savingHousehold || !householdName.trim() || householdName.trim() === household?.name}
                                        className="rounded-xl gap-2"
                                        style={{ background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)' }}
                                    >
                                        {savingHousehold ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                        Save
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Member Types */}
                    {usersSubtab === 'member-types' && (
                        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-700">
                            <p className="text-xs text-slate-400 mb-5">
                                Member types define roles in your household (e.g. Husband, Wife, Child). Customise colours to tell them apart at a glance.
                            </p>
                            <div className="space-y-2 mb-4">
                                {memberTypes.length === 0 ? (
                                    <p className="text-sm text-slate-400 py-2">No member types yet.</p>
                                ) : (
                                    memberTypes.map((type) => {
                                        const isEditing = editingTypeId === type.id
                                        const previewBg = (isEditing ? editBgColor : type.bg_color) ?? '#f1f5f9'
                                        const previewText = (isEditing ? editTextColor : type.text_color) ?? '#334155'
                                        return (
                                            <div key={type.id} className="rounded-xl border border-slate-100 overflow-hidden">
                                                {/* Row */}
                                                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-700">
                                                    <span
                                                        className="text-xs font-semibold px-2.5 py-1 rounded-full"
                                                        style={{ background: previewBg, color: previewText }}
                                                    >
                                                        {isEditing ? (editName || type.name) : type.name}
                                                    </span>
                                                    <div className="flex items-center gap-1">
                                                        {!isEditing ? (
                                                            <>
                                                                <button
                                                                    onClick={() => startEditType(type)}
                                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-sky-500 hover:bg-sky-50 transition-all"
                                                                >
                                                                    <Pencil className="h-3.5 w-3.5" />
                                                                </button>
                                                                <button
                                                                    onClick={() => deleteMemberType(type.id, type.name)}
                                                                    disabled={deletingTypeId === type.id}
                                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-50 transition-all disabled:opacity-50"
                                                                >
                                                                    {deletingTypeId === type.id
                                                                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                        : <Trash2 className="h-3.5 w-3.5" />}
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <button
                                                                    onClick={saveEditType}
                                                                    disabled={savingEditId === type.id || !editName.trim()}
                                                                    className="p-1.5 rounded-lg text-emerald-500 hover:bg-emerald-50 transition-all disabled:opacity-50"
                                                                >
                                                                    {savingEditId === type.id
                                                                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                        : <Check className="h-3.5 w-3.5" />}
                                                                </button>
                                                                <button
                                                                    onClick={cancelEditType}
                                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
                                                                >
                                                                    <X className="h-3.5 w-3.5" />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                                {/* Edit panel */}
                                                {isEditing && (
                                                    <div className="px-4 py-4 border-t border-slate-100 space-y-4">
                                                        <div>
                                                            <Label className="text-xs font-semibold text-slate-500 mb-1.5 block">Name</Label>
                                                            <Input
                                                                value={editName}
                                                                onChange={e => setEditName(e.target.value)}
                                                                onKeyDown={e => e.key === 'Enter' && saveEditType()}
                                                                className="h-9 rounded-xl border-slate-200 focus:border-sky-400 focus:ring-sky-400 text-sm"
                                                            />
                                                        </div>
                                                        <div>
                                                            <Label className="text-xs font-semibold text-slate-500 mb-1.5 block">Background colour</Label>
                                                            <div className="flex flex-wrap gap-2">
                                                                {[
                                                                    null,
                                                                    '#e0f2fe', '#ede9fe', '#d1fae5', '#fef3c7',
                                                                    '#ffe4e6', '#f3e8ff', '#dcfce7', '#fef9c3',
                                                                    '#0f172a', '#0ea5e9', '#8b5cf6', '#10b981',
                                                                    '#f59e0b', '#f43f5e',
                                                                ].map(c => {
                                                                    const bg = c ?? '#f1f5f9'
                                                                    const active = editBgColor === c
                                                                    return (
                                                                        <button
                                                                            key={c ?? 'default'}
                                                                            onClick={() => setEditBgColor(c)}
                                                                            title={c ?? 'default'}
                                                                            className={cn(
                                                                                'w-7 h-7 rounded-lg border-2 transition-all',
                                                                                active ? 'border-sky-500 scale-110' : 'border-transparent hover:border-slate-300'
                                                                            )}
                                                                            style={{ background: bg }}
                                                                        >
                                                                            {active && (
                                                                                <Check className="h-3 w-3 mx-auto"
                                                                                    style={{ color: c && ['#0f172a','#0ea5e9','#8b5cf6','#10b981','#f59e0b','#f43f5e'].includes(c) ? '#fff' : '#334155' }}
                                                                                />
                                                                            )}
                                                                        </button>
                                                                    )
                                                                })}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <Label className="text-xs font-semibold text-slate-500 mb-1.5 block">Text colour</Label>
                                                            <div className="flex flex-wrap gap-2">
                                                                {[
                                                                    null,
                                                                    '#0c4a6e', '#4c1d95', '#064e3b',
                                                                    '#78350f', '#881337', '#1e1b4b',
                                                                    '#ffffff', '#f8fafc',
                                                                ].map(c => {
                                                                    const col = c ?? '#334155'
                                                                    const active = editTextColor === c
                                                                    return (
                                                                        <button
                                                                            key={c ?? 'default'}
                                                                            onClick={() => setEditTextColor(c)}
                                                                            title={c ?? 'default'}
                                                                            className={cn(
                                                                                'w-7 h-7 rounded-lg border-2 transition-all flex items-center justify-center',
                                                                                active ? 'border-sky-500 scale-110' : 'border-slate-200 hover:border-slate-400'
                                                                            )}
                                                                            style={{ background: col === '#ffffff' || col === '#f8fafc' ? '#e2e8f0' : '#f8fafc' }}
                                                                        >
                                                                            <span className="text-xs font-black" style={{ color: col }}>A</span>
                                                                        </button>
                                                                    )
                                                                })}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })
                                )}
                            </div>
                            <div className="flex gap-2">
                                <Input
                                    value={newTypeName}
                                    onChange={(e) => setNewTypeName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && addMemberType()}
                                    placeholder="New member type name"
                                    className="rounded-xl border-slate-200 focus:border-sky-400 focus:ring-sky-400"
                                />
                                <Button
                                    onClick={addMemberType}
                                    disabled={addingType || !newTypeName.trim()}
                                    className="rounded-xl gap-1.5 shrink-0"
                                    style={{ background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)' }}
                                >
                                    {addingType ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                    Add
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Budget Configs tab ── */}
            {activeTab === 'budget' && (
                <div className="space-y-5">
                    {/* Subtab bar */}
                    <div className="flex gap-6 border-b border-slate-200 dark:border-slate-700">
                        {([
                            { id: 'calendar', label: 'Budget Calendar', icon: CalendarDays },
                            { id: 'currency', label: 'Currency & FX Rates', icon: RefreshCw },
                        ] as { id: BudgetSubtab; label: string; icon: React.ElementType }[]).map(({ id, label, icon: Icon }) => (
                            <button
                                key={id}
                                onClick={() => setBudgetSubtab(id)}
                                className={cn(
                                    'flex items-center gap-1.5 pb-3 text-sm font-medium border-b-2 -mb-px transition-colors',
                                    budgetSubtab === id
                                        ? 'border-sky-500 text-sky-600'
                                        : 'border-transparent text-slate-500 hover:text-slate-700'
                                )}
                            >
                                <Icon className="h-3.5 w-3.5" />
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* Budget Calendar */}
                    {budgetSubtab === 'calendar' && (
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                        <div className="flex items-center gap-2 mb-1">
                            <CalendarDays className="h-4 w-4 text-emerald-500" />
                            <h2 className="text-base font-semibold text-slate-800">Budget Calendar</h2>
                        </div>
                        <p className="text-xs text-slate-400 mb-5">
                            Control when your budget history starts and configure your pay cycle.
                        </p>
                        <div className="space-y-6">
                            {/* Start month */}
                            <div className="space-y-1.5">
                                <Label className="text-sm text-slate-600">Tracking start month</Label>
                                <p className="text-xs text-slate-400">Months before this date will be hidden from your budget grid.</p>
                                <input
                                    type="month"
                                    value={startMonth}
                                    onChange={e => setStartMonth(e.target.value)}
                                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-white text-slate-800"
                                />
                                {startMonth && (
                                    <button
                                        onClick={() => setStartMonth('')}
                                        className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
                                        Clear (show all history)
                                    </button>
                                )}
                            </div>

                            {/* Pay day */}
                            <div className="space-y-2">
                                <Label className="text-sm text-slate-600">Last pay day of the month</Label>
                                <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 space-y-2">
                                    <p className="text-xs font-semibold text-emerald-700">How forward-looking budgeting works</p>
                                    <p className="text-xs text-emerald-700 leading-relaxed">
                                        This app treats each month's salary as the funding for <span className="font-semibold">next month's</span> budget.
                                        For example, the salary you receive in July is what you use to plan August.
                                    </p>
                                    <p className="text-xs text-emerald-700 leading-relaxed">
                                        Once your pay day arrives, you'll see a prompt to start planning next month's budget.
                                        You have a configurable <span className="font-semibold">grace window</span> from your pay day to finalise it —
                                        during this window the current month's session also stays editable for any last-minute adjustments.
                                    </p>
                                    <p className="text-xs text-emerald-600 leading-relaxed border-t border-emerald-100 pt-2 mt-1">
                                        <span className="font-semibold">For households:</span> if different people get paid on different dates (e.g. the 20th and the 25th),
                                        enter the <span className="font-semibold">latest date</span> — the day the last salary lands.
                                    </p>
                                </div>
                                <div className="flex items-center gap-3 pt-1">
                                    <select
                                        value={payDay}
                                        onChange={e => setPayDay(e.target.value)}
                                        className="text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-white text-slate-800 w-44">
                                        <option value="">Not set</option>
                                        {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                                            <option key={d} value={d}>
                                                {d}{d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th'} of the month
                                            </option>
                                        ))}
                                    </select>
                                    {payDay && (
                                        <p className="text-xs text-slate-500">
                                            Budget prompt + editing window starts on the{' '}
                                            <span className="font-semibold text-emerald-600">
                                                {payDay}{Number(payDay) === 1 ? 'st' : Number(payDay) === 2 ? 'nd' : Number(payDay) === 3 ? 'rd' : 'th'}
                                            </span>
                                        </p>
                                    )}
                                </div>

                                {/* Grace period */}
                                <div className="space-y-1.5 pt-1">
                                    <Label className="text-sm text-slate-600">Grace period (days)</Label>
                                    <p className="text-xs text-slate-400">
                                        How many days after pay day the editing window stays open. Max 10 days.
                                    </p>
                                    <div className="flex items-center gap-3">
                                        <select
                                            value={gracePeriod}
                                            onChange={e => setGracePeriod(e.target.value)}
                                            className="text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-white text-slate-800 w-44">
                                            {Array.from({ length: 10 }, (_, i) => i + 1).map(d => (
                                                <option key={d} value={d}>
                                                    {d} {d === 1 ? 'day' : 'days'}
                                                </option>
                                            ))}
                                        </select>
                                        {payDay && gracePeriod && (
                                            <p className="text-xs text-slate-500">
                                                Window closes on the{' '}
                                                <span className="font-semibold text-emerald-600">
                                                    {(() => {
                                                        const end = Number(payDay) + Number(gracePeriod)
                                                        return `${end}${end === 1 ? 'st' : end === 2 ? 'nd' : end === 3 ? 'rd' : 'th'}`
                                                    })()}
                                                </span>
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <Button
                                onClick={saveCalendar}
                                disabled={savingCalendar}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl">
                                {savingCalendar ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                                Save Calendar Settings
                            </Button>
                        </div>
                    </div>
                    )}

                    {/* Currency & FX Rates */}
                    {budgetSubtab === 'currency' && (
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                        <div className="flex items-center gap-2 mb-1">
                            <RefreshCw className="h-4 w-4 text-sky-500" />
                            <h2 className="text-base font-semibold text-slate-800">Currency & FX Rates</h2>
                        </div>
                        <p className="text-xs text-slate-400 mb-5">
                            Set exchange rates to KES for foreign currency accounts. Used to compute net worth totals and show KES equivalents.
                        </p>
                        <div className="space-y-2 mb-4">
                            {localFxRates.length === 0 ? (
                                <p className="text-sm text-slate-400 py-2">No rates configured yet.</p>
                            ) : (
                                localFxRates.map((rate) => (
                                    <div key={rate.currency} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-100 dark:border-slate-600">
                                        <span className="text-sm font-bold text-slate-700 w-12 shrink-0">{rate.currency}</span>
                                        <span className="text-xs text-slate-400 shrink-0">=</span>
                                        <Input
                                            type="number"
                                            min="0"
                                            step="any"
                                            value={editRates[rate.currency] ?? ''}
                                            onChange={e => setEditRates(prev => ({ ...prev, [rate.currency]: e.target.value }))}
                                            onKeyDown={e => e.key === 'Enter' && saveRate(rate.currency)}
                                            className="h-8 rounded-lg border-slate-200 focus:border-sky-400 text-sm"
                                        />
                                        <span className="text-xs text-slate-400 shrink-0">KES</span>
                                        <button
                                            onClick={() => saveRate(rate.currency)}
                                            disabled={savingRate === rate.currency}
                                            className="text-sky-500 hover:text-sky-600 transition-colors disabled:opacity-50 shrink-0"
                                            title="Save"
                                        >
                                            {savingRate === rate.currency
                                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                                : <Save className="h-4 w-4" />}
                                        </button>
                                        <button
                                            onClick={() => deleteRate(rate.currency)}
                                            disabled={deletingRate === rate.currency}
                                            className="text-slate-300 hover:text-red-400 transition-colors disabled:opacity-50 shrink-0"
                                            title="Remove"
                                        >
                                            {deletingRate === rate.currency
                                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                                : <Trash2 className="h-4 w-4" />}
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                        <div className="flex gap-2">
                            <Input
                                value={newCurrency}
                                onChange={e => setNewCurrency(e.target.value.toUpperCase())}
                                placeholder="USD"
                                maxLength={10}
                                className="rounded-xl border-slate-200 focus:border-sky-400 w-24 shrink-0 uppercase"
                                list="common-currencies"
                            />
                            <datalist id="common-currencies">
                                {COMMON_CURRENCIES.filter(c => !localFxRates.some(r => r.currency === c)).map(c => (
                                    <option key={c} value={c} />
                                ))}
                            </datalist>
                            <Input
                                type="number"
                                min="0"
                                step="any"
                                value={newRate}
                                onChange={e => setNewRate(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && addRate()}
                                placeholder="Rate to KES (e.g. 129.5)"
                                className="rounded-xl border-slate-200 focus:border-sky-400"
                            />
                            <Button
                                onClick={addRate}
                                disabled={!!savingRate || !newCurrency.trim() || !newRate.trim()}
                                className="rounded-xl gap-1.5 shrink-0"
                                style={{ background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)' }}
                            >
                                {savingRate && newCurrency && savingRate === newCurrency.toUpperCase()
                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                    : <Plus className="h-4 w-4" />}
                                Add
                            </Button>
                        </div>
                    </div>
                    )}
                </div>
            )}

            {/* ── System Configs tab ── */}
            {activeTab === 'system' && (
                <div className="space-y-5">
                    {/* Subtab bar */}
                    <div className="flex gap-6 border-b border-slate-200 dark:border-slate-700">
                        {([
                            { id: 'view-mode', label: 'View Mode', icon: Eye },
                            ...(isOwner ? [{ id: 'danger-zone' as SystemSubtab, label: 'Danger Zone', icon: ShieldAlert }] : []),
                        ] as { id: SystemSubtab; label: string; icon: React.ElementType }[]).map(({ id, label, icon: Icon }) => (
                            <button
                                key={id}
                                onClick={() => setSystemSubtab(id)}
                                className={cn(
                                    'flex items-center gap-1.5 pb-3 text-sm font-medium border-b-2 -mb-px transition-colors',
                                    systemSubtab === id
                                        ? id === 'danger-zone' ? 'border-red-500 text-red-600' : 'border-sky-500 text-sky-600'
                                        : 'border-transparent text-slate-500 hover:text-slate-700'
                                )}
                            >
                                <Icon className="h-3.5 w-3.5" />
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* View Mode */}
                    {systemSubtab === 'view-mode' && (
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                        <div className="flex items-center gap-2 mb-1">
                            <Eye className="h-4 w-4 text-sky-500" />
                            <h2 className="text-base font-semibold text-slate-800">View Mode</h2>
                        </div>
                        <p className="text-xs text-slate-400 mb-5">
                            Switch between seeing all household data or just your personal view. Applies across all pages — accounts, expenses, budgets, and net worth.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setViewMode('household')}
                                className={`flex-1 flex flex-col items-center gap-2.5 p-5 rounded-2xl border-2 transition-all ${
                                    viewMode === 'household'
                                        ? 'border-sky-400 bg-sky-50'
                                        : 'border-slate-200 hover:border-slate-300 bg-white'
                                }`}>
                                <Building2 className={`h-6 w-6 ${viewMode === 'household' ? 'text-sky-500' : 'text-slate-400'}`} />
                                <div className="text-center">
                                    <p className={`text-sm font-bold ${viewMode === 'household' ? 'text-sky-700' : 'text-slate-600'}`}>Household</p>
                                    <p className="text-xs text-slate-400 mt-0.5">All data across the household</p>
                                </div>
                                {viewMode === 'household' && (
                                    <span className="text-xs font-bold text-sky-600 bg-sky-100 px-3 py-0.5 rounded-full">Active</span>
                                )}
                            </button>
                            <button
                                onClick={() => setViewMode('me')}
                                className={`flex-1 flex flex-col items-center gap-2.5 p-5 rounded-2xl border-2 transition-all ${
                                    viewMode === 'me'
                                        ? 'border-violet-400 bg-violet-50'
                                        : 'border-slate-200 hover:border-slate-300 bg-white'
                                }`}>
                                <User className={`h-6 w-6 ${viewMode === 'me' ? 'text-violet-500' : 'text-slate-400'}`} />
                                <div className="text-center">
                                    <p className={`text-sm font-bold ${viewMode === 'me' ? 'text-violet-700' : 'text-slate-600'}`}>Just Me</p>
                                    <p className="text-xs text-slate-400 mt-0.5">Your personal data only</p>
                                </div>
                                {viewMode === 'me' && (
                                    <span className="text-xs font-bold text-violet-600 bg-violet-100 px-3 py-0.5 rounded-full">Active</span>
                                )}
                            </button>
                        </div>
                    </div>
                    )}

                    {/* Danger Zone */}
                    {systemSubtab === 'danger-zone' && isOwner && (
                        <div className="bg-white rounded-3xl p-6 shadow-sm border border-red-100">
                            <div className="flex items-center gap-2 mb-1">
                                <ShieldAlert className="h-4 w-4 text-red-500" />
                                <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200">Danger Zone</h2>
                            </div>
                            <p className="text-xs text-slate-400 mb-5">
                                Permanently delete household data. These actions cannot be undone.
                                Only the household owner can perform these operations.
                            </p>
                            <button
                                onClick={openClearDialog}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 hover:border-red-300 transition-colors"
                            >
                                <Trash2 className="h-4 w-4" />
                                Clear Data
                            </button>
                        </div>
                    )}
                </div>
            )}

        </div>

        {/* Clear Data Dialog */}
        {showClearDialog && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeClearDialog} />
                <div className="relative bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                    <div className="flex items-center gap-3 p-6 border-b border-slate-100 dark:border-slate-700">
                        <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                            <AlertTriangle className="h-5 w-5 text-red-500" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-900 dark:text-white">Clear Household Data</h2>
                            <p className="text-xs text-slate-400">Choose what to clear. This cannot be undone.</p>
                        </div>
                    </div>

                    <div className="p-6 space-y-6">
                        {/* Level selector */}
                        <div className="space-y-2">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Clearance level</p>
                            {(Object.entries(clearLevelMeta) as [typeof clearLevel, typeof clearLevelMeta[typeof clearLevel]][]).map(([key, meta]) => {
                                const colorMap = {
                                    yellow: { border: 'border-yellow-300 bg-yellow-50', badge: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-400' },
                                    orange: { border: 'border-orange-300 bg-orange-50', badge: 'bg-orange-100 text-orange-700', dot: 'bg-orange-400' },
                                    red: { border: 'border-red-300 bg-red-50', badge: 'bg-red-100 text-red-700', dot: 'bg-red-400' },
                                    rose: { border: 'border-rose-400 bg-rose-50', badge: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' },
                                }
                                const c = colorMap[meta.color]
                                const isSelected = clearLevel === key
                                return (
                                    <button
                                        key={key}
                                        onClick={() => setClearLevel(key)}
                                        className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${isSelected ? c.border : 'border-slate-100 bg-white hover:border-slate-200'}`}
                                    >
                                        <div className="flex items-center gap-3 mb-1">
                                            <span className={`w-2 h-2 rounded-full shrink-0 ${isSelected ? c.dot : 'bg-slate-300'}`} />
                                            <span className="text-sm font-semibold text-slate-800">{meta.label}</span>
                                            {key === 'everything' && (
                                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.badge}`}>Most destructive</span>
                                            )}
                                        </div>
                                        <p className="text-xs text-slate-500 ml-5 leading-relaxed">{meta.description}</p>
                                    </button>
                                )
                            })}
                        </div>

                        {/* Impact list */}
                        <div className="rounded-2xl bg-slate-50 dark:bg-slate-700 border border-slate-100 dark:border-slate-600 p-4">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Will be deleted</p>
                            <ul className="space-y-1">
                                {clearLevelMeta[clearLevel].impact.map((item) => (
                                    <li key={item} className="flex items-center gap-2 text-xs text-slate-600">
                                        <Trash2 className="h-3 w-3 text-red-400 shrink-0" />
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Confirmation inputs */}
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <Label className="text-sm text-slate-600">Your password</Label>
                                <Input
                                    type="password"
                                    value={clearPassword}
                                    onChange={e => { setClearPassword(e.target.value); setClearPasswordError('') }}
                                    placeholder="Enter your account password"
                                    className="rounded-xl border-slate-200 focus:border-red-400 focus:ring-red-400"
                                    autoComplete="current-password"
                                />
                                {clearPasswordError && (
                                    <p className="text-xs text-red-500">{clearPasswordError}</p>
                                )}
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-sm text-slate-600">
                                    Type <span className="font-bold text-red-500">DELETE</span> to confirm
                                </Label>
                                <Input
                                    value={clearConfirm}
                                    onChange={e => setClearConfirm(e.target.value)}
                                    placeholder="DELETE"
                                    className="rounded-xl border-slate-200 focus:border-red-400 focus:ring-red-400 font-mono"
                                />
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3">
                            <button
                                onClick={closeClearDialog}
                                disabled={clearing}
                                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleClearData}
                                disabled={clearing || clearConfirm !== 'DELETE' || !clearPassword}
                                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {clearing ? (
                                    <><Loader2 className="h-4 w-4 animate-spin" /> Clearing…</>
                                ) : (
                                    <><Trash2 className="h-4 w-4" /> Clear {clearLevelMeta[clearLevel].label}</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
        </>
    )
}
