import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import Sidebar from '@/components/layout/Sidebar'
import MobileHeader from '@/components/layout/MobileHeader'
import BottomNav from '@/components/layout/BottomNav'
import SwipeNavContainer from '@/components/layout/SwipeNavContainer'
import PageShell from '@/components/layout/PageShell'
import PlaygroundBanner from '@/components/PlaygroundBanner'
import QuickAddFAB from '@/components/layout/QuickAddFAB'
import { HouseholdProvider } from '@/context/HouseholdContext'
import { SidebarProvider } from '@/context/SidebarContext'
import { TourProvider } from '@/context/TourContext'
import { PlaygroundProvider } from '@/context/PlaygroundContext'
import { QuickAddProvider } from '@/context/QuickAddContext'
import AppTour from '@/components/AppTour'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
    const cookieStore = await cookies()
    if (!cookieStore.get('access_token')) redirect('/auth/login')

    return (
        <PlaygroundProvider>
            <HouseholdProvider>
                <SidebarProvider>
                    <TourProvider>
                        <QuickAddProvider>
                            <div className="flex h-[100dvh] bg-slate-50 dark:bg-slate-900">
                                <Sidebar />
                                <SwipeNavContainer>
                                    <MobileHeader />
                                    <PlaygroundBanner />
                                    <PageShell className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8">
                                        {children}
                                    </PageShell>
                                </SwipeNavContainer>
                            </div>
                            <AppTour />
                            <BottomNav />
                            <QuickAddFAB />
                        </QuickAddProvider>
                    </TourProvider>
                </SidebarProvider>
            </HouseholdProvider>
        </PlaygroundProvider>
    )
}
