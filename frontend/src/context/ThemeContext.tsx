'use client'

import { createContext, useContext, useEffect, useState } from 'react'

interface ThemeContextType {
    theme: 'light' | 'dark'
    toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType>({ theme: 'light', toggleTheme: () => {} })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = useState<'light' | 'dark'>('light')

    useEffect(() => {
        const stored = localStorage.getItem('theme')
        const dark = stored === 'dark'
        if (dark) {
            setTheme('dark')
            document.documentElement.classList.add('dark')
        }
    }, [])

    const toggleTheme = () => {
        const next = theme === 'light' ? 'dark' : 'light'
        setTheme(next)
        document.documentElement.classList.toggle('dark', next === 'dark')
        localStorage.setItem('theme', next)
    }

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    )
}

export function useTheme() {
    return useContext(ThemeContext)
}
