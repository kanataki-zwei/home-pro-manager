'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { apiGet, apiPost } from '@/lib/api'

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
    ownership: string
    current_balance: number
    currency: string
    is_active: boolean
    household_member_id: string | null
}

interface Household {
    id: string
    name: string
    member_types: MemberType[]
}

interface HouseholdContextType {
    household: Household | null
    members: Member[]
    accounts: Account[]
    loading: boolean
    setHousehold: (h: Household) => void
    setMembers: (m: Member[]) => void
    setAccounts: (a: Account[]) => void
    refreshHousehold: () => Promise<void>
    refreshMembers: () => Promise<void>
    refreshAccounts: () => Promise<void>
}

const HouseholdContext = createContext<HouseholdContextType | null>(null)

export function HouseholdProvider({ children }: { children: ReactNode }) {
    const [household, setHousehold] = useState<Household | null>(null)
    const [members, setMembers] = useState<Member[]>([])
    const [accounts, setAccounts] = useState<Account[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        loadFromAPI()
    }, [])

    const loadFromAPI = async () => {
        setLoading(true)
        try {
            // Fetch household by current user identity — no localStorage needed
            const h = await apiGet<Household>('/api/households/mine')
            setHousehold(h)

            const [m, a] = await Promise.all([
                apiGet<Member[]>(`/api/households/${h.id}/members`),
                apiGet<Account[]>(`/api/households/${h.id}/accounts`)
            ])
            setMembers(m)
            setAccounts(a)
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

    return (
        <HouseholdContext.Provider value={{
            household, members, accounts, loading,
            setHousehold: handleSetHousehold,
            setMembers, setAccounts,
            refreshHousehold, refreshMembers, refreshAccounts
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