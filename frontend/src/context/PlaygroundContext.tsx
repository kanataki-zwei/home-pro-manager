'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { apiPost } from '@/lib/api'
import { setPlaygroundActive } from '@/lib/playground-data'

interface PlaygroundContextValue {
    isPlayground: boolean
    enablePlayground: () => Promise<void>
    disablePlayground: (reauth_token: string) => Promise<void>
}

const PlaygroundContext = createContext<PlaygroundContextValue>({
    isPlayground: false,
    enablePlayground: async () => {},
    disablePlayground: async () => {},
})

export function PlaygroundProvider({ children }: { children: ReactNode }) {
    // Synchronous init from localStorage so the interceptor is active before any
    // HouseholdContext effects fire (parent effects run before child effects).
    const [isPlayground, setIsPlayground] = useState(() => {
        if (typeof window === 'undefined') return false
        const active = localStorage.getItem('hpm_playground') === '1'
        if (active) setPlaygroundActive(true)
        return active
    })

    useEffect(() => {
        // Server-verify to keep localStorage in sync across sessions and devices.
        fetch('/api/users/me', { credentials: 'include' })
            .then(r => (r.ok ? r.json() : null))
            .then((user: { playground_mode?: boolean } | null) => {
                if (!user) return
                const serverMode = !!user.playground_mode
                const localMode = localStorage.getItem('hpm_playground') === '1'
                if (serverMode === localMode) return
                if (serverMode) {
                    localStorage.setItem('hpm_playground', '1')
                } else {
                    localStorage.removeItem('hpm_playground')
                }
                setPlaygroundActive(serverMode)
                setIsPlayground(serverMode)
                window.location.reload()
            })
            .catch(() => {})
    }, [])

    const enablePlayground = useCallback(async () => {
        await apiPost('/api/admin/playground/enable', {})
        localStorage.setItem('hpm_playground', '1')
        setPlaygroundActive(true)
        setIsPlayground(true)
        window.location.reload()
    }, [])

    const disablePlayground = useCallback(async (reauth_token: string) => {
        await apiPost('/api/admin/playground/disable', { reauth_token })
        localStorage.removeItem('hpm_playground')
        setPlaygroundActive(false)
        setIsPlayground(false)
        window.location.reload()
    }, [])

    return (
        <PlaygroundContext.Provider value={{ isPlayground, enablePlayground, disablePlayground }}>
            {children}
        </PlaygroundContext.Provider>
    )
}

export const usePlayground = () => useContext(PlaygroundContext)
