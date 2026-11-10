import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import Sidebar from '@/components/layout/Sidebar'
import MobileHeader from '@/components/layout/MobileHeader'
import BottomNav from '@/components/layout/BottomNav'
import TabCarousel from '@/components/layout/TabCarousel'
import PlaygroundBanner from '@/components/PlaygroundBanner'
import QuickAddFAB from '@/components/layout/QuickAddFAB'
import { HouseholdProvider } from '@/context/HouseholdContext'
import { SidebarProvider } from '@/context/SidebarContext'
import { TourProvider } from '@/context/TourContext'
import { PlaygroundProvider } from '@/context/PlaygroundContext'
import { QuickAddProvider } from '@/context/QuickAddContext'
import AppTour from '@/components/AppTour'

export default async function AppLayout({ children: _ }: { children: React.ReactNode }) {
    const cookieStore = await cookies()
    if (!cookieStore.get('access_token')) redirect('/auth/login')

    return (
        <PlaygroundProvider>
            <HouseholdProvider>
                <SidebarProvider>
                    <TourProvider>
                        <QuickAddProvider>
                            <div className="flex h-[100dvh] overflow-hidden bg-slate-50 dark:bg-slate-900">
                                <Sidebar />
                                <div className="flex-1 flex flex-col min-w-0 min-h-0">
                                    <MobileHeader />
                                    <PlaygroundBanner />
                                    <TabCarousel />
                                </div>
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
