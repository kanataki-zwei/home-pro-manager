'use client'

import { useEffect, useState } from 'react'
import { useHousehold } from '@/context/HouseholdContext'
import { apiGet, apiPatch, apiPost, apiPut, apiDelete } from '@/lib/api'
import { toast } from 'sonner'
import { Settings, User, Building2, Tags, Plus, Trash2, Save, Loader2, RefreshCw, Eye, CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface UserProfile {
    id: string
    email: string
    name: string | null
    created_at: string
}

interface MemberType {
    id: string
    name: string
}

interface FxRate {
    id: string
    currency: string
    rate_to_kes: string
    updated_at: string
}

const COMMON_CURRENCIES = ['USD', 'EUR', 'GBP', 'TZS', 'UGX', 'ZAR', 'INR', 'AED', 'CAD', 'AUD']

export default function SettingsPage() {
    const { household, fxRates, setFxRates, refreshHousehold, viewMode, setViewMode } = useHousehold()

    // Profile state
    const [profile, setProfile] = useState<UserProfile | null>(null)
    const [profileName, setProfileName] = useState('')
    const [savingProfile, setSavingProfile] = useState(false)

    // Household state
    const [householdName, setHouseholdName] = useState('')
    const [savingHousehold, setSavingHousehold] = useState(false)

    // Budget calendar state
    const [startMonth, setStartMonth] = useState('')   // "YYYY-MM" for input[type=month]
    const [payDay, setPayDay] = useState('')
    const [savingCalendar, setSavingCalendar] = useState(false)

    // Member types state
    const [memberTypes, setMemberTypes] = useState<MemberType[]>([])
    const [newTypeName, setNewTypeName] = useState('')
    const [addingType, setAddingType] = useState(false)
    const [deletingTypeId, setDeletingTypeId] = useState<string | null>(null)

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

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            {/* Page header */}
            <div className="flex items-center gap-3 mb-2">
                <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)' }}
                >
                    <Settings className="h-5 w-5 text-white" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
                    <p className="text-sm text-slate-500">Manage your profile and household preferences</p>
                </div>
            </div>

            {/* View Mode */}
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

            {/* Budget Calendar */}
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

                        {/* Explanation box */}
                        <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 space-y-2">
                            <p className="text-xs font-semibold text-emerald-700">How forward-looking budgeting works</p>
                            <p className="text-xs text-emerald-700 leading-relaxed">
                                This app treats each month's salary as the funding for <span className="font-semibold">next month's</span> budget.
                                For example, the salary you receive in July is what you use to plan August.
                            </p>
                            <p className="text-xs text-emerald-700 leading-relaxed">
                                Once your pay day arrives, you'll see a prompt to start planning next month's budget.
                                You have a <span className="font-semibold">5-day window</span> from your pay day to finalise it —
                                during this window the current month's session also stays editable for any last-minute adjustments.
                            </p>
                            <p className="text-xs text-emerald-600 leading-relaxed border-t border-emerald-100 pt-2 mt-1">
                                <span className="font-semibold">For households:</span> if different people get paid on different dates (e.g. the 20th and the 25th),
                                enter the <span className="font-semibold">latest date</span> — the day the last salary lands.
                                That's when the full household income is available to plan with.
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
                                    Budget prompt + 5-day editing window starts on the{' '}
                                    <span className="font-semibold text-emerald-600">
                                        {payDay}{Number(payDay) === 1 ? 'st' : Number(payDay) === 2 ? 'nd' : Number(payDay) === 3 ? 'rd' : 'th'}
                                    </span>
                                </p>
                            )}
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

            {/* Profile */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                <div className="flex items-center gap-2 mb-5">
                    <User className="h-4 w-4 text-sky-500" />
                    <h2 className="text-base font-semibold text-slate-800">Profile</h2>
                </div>

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
                            {savingProfile ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Save className="h-4 w-4" />
                            )}
                            Save
                        </Button>
                    </div>
                </div>
            </div>

            {/* Household */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                <div className="flex items-center gap-2 mb-5">
                    <Building2 className="h-4 w-4 text-sky-500" />
                    <h2 className="text-base font-semibold text-slate-800">Household</h2>
                </div>

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
                            {savingHousehold ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Save className="h-4 w-4" />
                            )}
                            Save
                        </Button>
                    </div>
                </div>
            </div>

            {/* FX Rates */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                <div className="flex items-center gap-2 mb-1">
                    <RefreshCw className="h-4 w-4 text-sky-500" />
                    <h2 className="text-base font-semibold text-slate-800">Currency & FX Rates</h2>
                </div>
                <p className="text-xs text-slate-400 mb-5">
                    Set exchange rates to KES for foreign currency accounts. Used to compute net worth totals and show KES equivalents.
                </p>

                {/* Existing rates */}
                <div className="space-y-2 mb-4">
                    {localFxRates.length === 0 ? (
                        <p className="text-sm text-slate-400 py-2">No rates configured yet.</p>
                    ) : (
                        localFxRates.map((rate) => (
                            <div key={rate.currency} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-100">
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

                {/* Add new rate */}
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

            {/* Member Types */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                <div className="flex items-center gap-2 mb-1">
                    <Tags className="h-4 w-4 text-sky-500" />
                    <h2 className="text-base font-semibold text-slate-800">Member Types</h2>
                </div>
                <p className="text-xs text-slate-400 mb-5">
                    Member types define roles in your household (e.g. Husband, Wife, Child).
                </p>

                {/* Existing types */}
                <div className="space-y-2 mb-4">
                    {memberTypes.length === 0 ? (
                        <p className="text-sm text-slate-400 py-2">No member types yet.</p>
                    ) : (
                        memberTypes.map((type) => (
                            <div
                                key={type.id}
                                className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-100"
                            >
                                <span className="text-sm font-medium text-slate-700">{type.name}</span>
                                <button
                                    onClick={() => deleteMemberType(type.id, type.name)}
                                    disabled={deletingTypeId === type.id}
                                    className="text-slate-300 hover:text-red-400 transition-colors disabled:opacity-50"
                                >
                                    {deletingTypeId === type.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Trash2 className="h-4 w-4" />
                                    )}
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {/* Add new type */}
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
                        {addingType ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Plus className="h-4 w-4" />
                        )}
                        Add
                    </Button>
                </div>
            </div>
        </div>
    )
}
