'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Joyride, ACTIONS, EVENTS, STATUS, type EventData, type Step } from 'react-joyride'
import { useTour } from '@/context/TourContext'

const STEP_PAGES: (string | undefined)[] = [
    undefined,          // 0 — welcome (centered)
    undefined,          // 1 — sidebar nav
    undefined,          // 2 — view mode toggle
    '/home',            // 3 — dashboard
    '/household',       // 4 — household
    '/networth',        // 5 — net worth
    '/budget',          // 6 — budget
    '/admin',           // 7 — admin
    undefined,          // 8 — done (centered)
]

const STEPS: Step[] = [
    {
        target: 'body',
        placement: 'center',
        skipBeacon: true,
        title: 'Welcome to HomePro',
        content: "Your household's financial hub. Let's take a 60-second tour so you know where everything is.",
    },
    {
        target: '[data-tour="sidebar-nav"]',
        skipBeacon: true,
        title: 'Navigation',
        content: 'All sections of the app live here. Click any item to jump straight to it.',
    },
    {
        target: '[data-tour="view-mode"]',
        skipBeacon: true,
        title: 'View Mode',
        content: 'HH shows the whole household. Me filters everything down to your personal data only.',
    },
    {
        target: 'main',
        skipBeacon: true,
        title: 'Dashboard',
        content: 'Your financial snapshot — total balance, monthly income, expense breakdown, and all accounts at a glance.',
    },
    {
        target: 'main',
        skipBeacon: true,
        title: 'Household',
        content: 'Manage members, track income history, and view all financial accounts. Each account shows live balance and transaction history.',
    },
    {
        target: 'main',
        skipBeacon: true,
        title: 'Net Worth',
        content: "Track your household's net worth over time, review every transaction, and see your wealth trajectory on a chart.",
    },
    {
        target: 'main',
        skipBeacon: true,
        title: 'Budget',
        content: 'Set up your recurring expenses in the library, then run a monthly session to track what you planned vs what was actually paid.',
    },
    {
        target: 'main',
        skipBeacon: true,
        title: 'Admin',
        content: 'Profile, household settings, member accounts, trusted devices, biometric login, FX rates — all your configuration lives here.',
    },
    {
        target: 'body',
        placement: 'center',
        skipBeacon: true,
        title: "You're all set!",
        content: 'This tour is available any time from the sidebar. Happy budgeting!',
    },
]

export default function AppTour() {
    const { isTourRunning, stopTour } = useTour()
    const router = useRouter()
    const pathname = usePathname()
    const [run, setRun] = useState(false)
    const [stepIndex, setStepIndex] = useState(0)
    const pendingStep = useRef<number | null>(null)

    useEffect(() => {
        if (isTourRunning) {
            setStepIndex(0)
            setRun(true)
        } else {
            setRun(false)
        }
    }, [isTourRunning])

    // Resume tour after cross-page navigation
    useEffect(() => {
        if (pendingStep.current === null) return
        const targetPage = STEP_PAGES[pendingStep.current]
        if (targetPage && pathname === targetPage) {
            const idx = pendingStep.current
            pendingStep.current = null
            setTimeout(() => {
                setStepIndex(idx)
                setRun(true)
            }, 400)
        }
    }, [pathname])

    const handleEvent = (data: EventData) => {
        const { type, index, action, status } = data

        if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
            stopTour()
            setStepIndex(0)
            return
        }

        if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
            const delta = action === ACTIONS.PREV ? -1 : 1
            const next = index + delta

            if (next < 0 || next >= STEPS.length) return

            const targetPage = STEP_PAGES[next]
            if (targetPage && pathname !== targetPage) {
                setRun(false)
                pendingStep.current = next
                router.push(targetPage)
            } else {
                setStepIndex(next)
            }
        }
    }

    return (
        <Joyride
            steps={STEPS}
            run={run}
            stepIndex={stepIndex}
            continuous
            scrollToFirstStep
            onEvent={handleEvent}
            locale={{
                back: 'Back',
                close: 'Close',
                last: 'Done',
                next: 'Next',
                skip: 'Skip tour',
            }}
            options={{
                primaryColor: '#0ea5e9',
                backgroundColor: '#1e293b',
                textColor: '#e2e8f0',
                overlayColor: 'rgba(0,0,0,0.6)',
                zIndex: 10000,
                width: 340,
                showProgress: true,
                skipBeacon: true,
                buttons: ['back', 'primary', 'skip'],
                spotlightRadius: 12,
            }}
            styles={{
                tooltip: {
                    borderRadius: '16px',
                    padding: '20px 20px 16px',
                },
                tooltipTitle: {
                    fontSize: '15px',
                    fontWeight: '700',
                    color: '#f1f5f9',
                    marginBottom: '6px',
                    padding: '0',
                },
                tooltipContent: {
                    fontSize: '13px',
                    lineHeight: '1.65',
                    color: '#94a3b8',
                    padding: '0',
                },
                tooltipFooter: {
                    marginTop: '16px',
                    padding: '0',
                },
                buttonPrimary: {
                    backgroundColor: '#0ea5e9',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: '600',
                    padding: '8px 16px',
                },
                buttonBack: {
                    color: '#64748b',
                    fontSize: '13px',
                    marginRight: '8px',
                },
                buttonSkip: {
                    color: '#64748b',
                    fontSize: '13px',
                },
            }}
        />
    )
}
