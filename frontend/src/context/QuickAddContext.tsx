'use client'

import { createContext, useCallback, useContext, useMemo, useRef } from 'react'

type QuickAddCtx = {
    register: (fn: (() => void) | null) => void
    trigger: () => void
}

const Ctx = createContext<QuickAddCtx>({ register: () => {}, trigger: () => {} })

export function QuickAddProvider({ children }: { children: React.ReactNode }) {
    const actionRef = useRef<(() => void) | null>(null)
    const register = useCallback((fn: (() => void) | null) => { actionRef.current = fn }, [])
    const trigger = useCallback(() => actionRef.current?.(), [])
    const value = useMemo(() => ({ register, trigger }), [register, trigger])
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useQuickAdd = () => useContext(Ctx)
