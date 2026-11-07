import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import Sidebar from '@/components/layout/Sidebar'
import { HouseholdProvider } from '@/context/HouseholdContext'
import { SidebarProvider } from '@/context/SidebarContext'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
    const cookieStore = await cookies()
    if (!cookieStore.get('access_token')) redirect('/auth/login')

    return (
        <HouseholdProvider>
            <SidebarProvider>
                <div className="flex h-screen bg-slate-50 dark:bg-slate-900">
                    <Sidebar />
                    <main className="flex-1 overflow-y-auto p-8">
                        {children}
                    </main>
                </div>
            </SidebarProvider>
        </HouseholdProvider>
    )
}
