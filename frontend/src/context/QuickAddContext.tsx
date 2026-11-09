'use client'

import { createContext, useContext, useRef } from 'react'

type QuickAddCtx = {
    register: (fn: (() => void) | null) => void
    trigger: () => void
}

const Ctx = createContext<QuickAddCtx>({ register: () => {}, trigger: () => {} })

export function QuickAddProvider({ children }: { children: React.ReactNode }) {
    const actionRef = useRef<(() => void) | null>(null)
    return (
        <Ctx.Provider value={{
            register: fn => { actionRef.current = fn },
            trigger: () => actionRef.current?.(),
        }}>
            {children}
        </Ctx.Provider>
    )
}

export const useQuickAdd = () => useContext(Ctx)
