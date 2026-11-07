'use client'

import { createContext, useContext, useEffect, useState } from 'react'

interface SidebarContextType {
    isCollapsed: boolean
    toggleSidebar: () => void
    isMobileOpen: boolean
    setMobileOpen: (open: boolean) => void
}

const SidebarContext = createContext<SidebarContextType>({
    isCollapsed: false,
    toggleSidebar: () => {},
    isMobileOpen: false,
    setMobileOpen: () => {},
})

export function SidebarProvider({ children }: { children: React.ReactNode }) {
    const [isCollapsed, setIsCollapsed] = useState(false)
    const [isMobileOpen, setMobileOpen] = useState(false)

    useEffect(() => {
        const stored = localStorage.getItem('sidebar-collapsed')
        if (stored === 'true') setIsCollapsed(true)
    }, [])

    const toggleSidebar = () => {
        setIsCollapsed(prev => {
            localStorage.setItem('sidebar-collapsed', String(!prev))
            return !prev
        })
    }

    return (
        <SidebarContext.Provider value={{ isCollapsed, toggleSidebar, isMobileOpen, setMobileOpen }}>
            {children}
        </SidebarContext.Provider>
    )
}

export function useSidebar() {
    return useContext(SidebarContext)
}
