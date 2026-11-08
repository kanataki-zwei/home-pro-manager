import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import Sidebar from '@/components/layout/Sidebar'
import MobileHeader from '@/components/layout/MobileHeader'
import { HouseholdProvider } from '@/context/HouseholdContext'
import { SidebarProvider } from '@/context/SidebarContext'
import { TourProvider } from '@/context/TourContext'
import AppTour from '@/components/AppTour'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
    const cookieStore = await cookies()
    if (!cookieStore.get('access_token')) redirect('/auth/login')

    return (
        <HouseholdProvider>
            <SidebarProvider>
                <TourProvider>
                    <div className="flex h-screen bg-slate-50 dark:bg-slate-900">
                        <Sidebar />
                        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                            <MobileHeader />
                            <main className="flex-1 overflow-y-auto p-4 md:p-8">
                                {children}
                            </main>
                        </div>
                    </div>
                    <AppTour />
                </TourProvider>
            </SidebarProvider>
        </HouseholdProvider>
    )
}
