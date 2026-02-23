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
        const id = localStorage.getItem('household_id')
        if (id) loadAll(id)
        else setLoading(false)
    }, [])

    const loadAll = async (id: string) => {
        try {
            const [h, m, a] = await Promise.all([
                apiGet<Household>(`/api/households/${id}`),
                apiGet<Member[]>(`/api/households/${id}/members`),
                apiGet<Account[]>(`/api/households/${id}/accounts`)
            ])
            setHousehold(h)
            setMembers(m)
            setAccounts(a)
        } catch (e) {
            console.error('Failed to load household', e)
        } finally {
            setLoading(false)
        }
    }

    const refreshHousehold = async () => {
        const id = localStorage.getItem('household_id')
        if (!id) return
        const h = await apiGet<Household>(`/api/households/${id}`)
        setHousehold(h)
    }

    const refreshMembers = async () => {
        const id = localStorage.getItem('household_id')
        if (!id) return
        const m = await apiGet<Member[]>(`/api/households/${id}/members`)
        setMembers(m)
    }

    const refreshAccounts = async () => {
        const id = localStorage.getItem('household_id')
        if (!id) return
        const a = await apiGet<Account[]>(`/api/households/${id}/accounts`)
        setAccounts(a)
    }

    return (
        <HouseholdContext.Provider value={{
            household, members, accounts, loading,
            setHousehold, setMembers, setAccounts,
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