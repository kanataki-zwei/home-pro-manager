'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { apiGet, apiPost } from '@/lib/api'
import { getSession } from '@/lib/auth'

interface MemberType {
    id: string
    name: string
}

interface Member {
    id: string
    name: string
    date_of_birth: string | null
    is_active: boolean
    user_id: string | null
    member_type: MemberType
    contributes_income: boolean
    income_amount: number | null
    income_currency: string | null
    income_cadence: string | null
}

interface Account {
    id: string
    name: string
    account_type: string
    institution_type: string | null
    ownership: string
    current_balance: number
    currency: string
    is_active: boolean
    household_member_id: string | null
    contributes_to_net_worth: boolean
}

interface Household {
    id: string
    name: string
    member_types: MemberType[]
}

export interface FxRate {
    id: string
    currency: string
    rate_to_kes: string
    updated_at: string
}

interface HouseholdContextType {
    household: Household | null
    members: Member[]
    accounts: Account[]
    fxRates: FxRate[]
    loading: boolean
    currentUserId: string | null
    setHousehold: (h: Household) => void
    setMembers: (m: Member[]) => void
    setAccounts: (a: Account[]) => void
    setFxRates: (r: FxRate[]) => void
    refreshHousehold: () => Promise<void>
    refreshMembers: () => Promise<void>
    refreshAccounts: () => Promise<void>
    refreshFxRates: () => Promise<void>
}

const HouseholdContext = createContext<HouseholdContextType | null>(null)

export function HouseholdProvider({ children }: { children: ReactNode }) {
    const [household, setHousehold] = useState<Household | null>(null)
    const [members, setMembers] = useState<Member[]>([])
    const [accounts, setAccounts] = useState<Account[]>([])
    const [fxRates, setFxRates] = useState<FxRate[]>([])
    const [loading, setLoading] = useState(true)
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)

    useEffect(() => {
        loadFromAPI()
    }, [])

    const loadFromAPI = async () => {
        setLoading(true)
        try {
            const session = await getSession()
            setCurrentUserId(session?.user?.id ?? null)

            // Fetch household by current user identity — no localStorage needed
            const h = await apiGet<Household>('/api/households/mine')
            setHousehold(h)

            const [m, a, fx] = await Promise.all([
                apiGet<Member[]>(`/api/households/${h.id}/members`),
                apiGet<Account[]>(`/api/households/${h.id}/accounts`),
                apiGet<FxRate[]>(`/api/households/${h.id}/fx-rates`)
            ])
            setMembers(m)
            setAccounts(a)
            setFxRates(fx)
        } catch {
            // 404 means user has no household yet — that's fine
            setHousehold(null)
            setMembers([])
            setAccounts([])
        } finally {
            setLoading(false)
        }
    }

    const handleSetHousehold = (h: Household) => {
        setHousehold(h)
        // No longer storing in localStorage — source of truth is the API
    }

    const refreshHousehold = async () => {
        if (!household) return
        const h = await apiGet<Household>(`/api/households/${household.id}`)
        setHousehold(h)
    }

    const refreshMembers = async () => {
        if (!household) return
        const m = await apiGet<Member[]>(`/api/households/${household.id}/members`)
        setMembers(m)
    }

    const refreshAccounts = async () => {
        if (!household) return
        const a = await apiGet<Account[]>(`/api/households/${household.id}/accounts`)
        setAccounts(a)
    }

    const refreshFxRates = async () => {
        if (!household) return
        const fx = await apiGet<FxRate[]>(`/api/households/${household.id}/fx-rates`)
        setFxRates(fx)
    }

    return (
        <HouseholdContext.Provider value={{
            household, members, accounts, fxRates, loading, currentUserId,
            setHousehold: handleSetHousehold,
            setMembers, setAccounts, setFxRates,
            refreshHousehold, refreshMembers, refreshAccounts, refreshFxRates
        }}>
            {children}
        </HouseholdContext.Provider>
    )
}

export function useHousehold() {
    const ctx = useContext(HouseholdContext)
    if (!ctx) throw new Error('useHousehold must be used within HouseholdProvider')
    return ctx
}