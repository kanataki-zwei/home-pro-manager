'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

interface TourContextValue {
    isTourRunning: boolean
    startTour: () => void
    stopTour: () => void
}

const TourContext = createContext<TourContextValue>({
    isTourRunning: false,
    startTour: () => {},
    stopTour: () => {},
})

export function TourProvider({ children }: { children: React.ReactNode }) {
    const [isTourRunning, setIsTourRunning] = useState(false)

    // Auto-start for first-time users, after the page has settled
    useEffect(() => {
        if (typeof window !== 'undefined' && !localStorage.getItem('hpm_tour_seen')) {
            const t = setTimeout(() => setIsTourRunning(true), 1000)
            return () => clearTimeout(t)
        }
    }, [])

    const startTour = useCallback(() => {
        setIsTourRunning(true)
    }, [])

    const stopTour = useCallback(() => {
        setIsTourRunning(false)
        localStorage.setItem('hpm_tour_seen', '1')
    }, [])

    return (
        <TourContext.Provider value={{ isTourRunning, startTour, stopTour }}>
            {children}
        </TourContext.Provider>
    )
}

export const useTour = () => useContext(TourContext)
