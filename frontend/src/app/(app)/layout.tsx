import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Sidebar from '@/components/layout/Sidebar'
import { HouseholdProvider } from '@/context/HouseholdContext'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
    const cookieStore = await cookies()

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() { return cookieStore.getAll() },
                setAll() {}
            }
        }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/auth/login')

    return (
        <HouseholdProvider>
            <div className="flex h-screen" style={{ background: '#f8fafc' }}>
                <Sidebar />
                <main className="flex-1 overflow-y-auto p-8">
                    {children}
                </main>
            </div>
        </HouseholdProvider>
    )
}