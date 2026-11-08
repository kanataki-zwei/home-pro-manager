import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from '@/context/ThemeContext'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
    title: 'HomePro Manager',
    description: 'Household budgeting and finance manager',
    manifest: '/manifest.json',
    themeColor: '#0ea5e9',
    icons: {
        icon: '/icons/icon-192.png',
        apple: '/icons/icon-192.png',
    },
    appleWebApp: {
        capable: true,
        statusBarStyle: 'default',
        title: 'HomePro',
    },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem('theme')!=='light')document.documentElement.classList.add('dark')}catch{}` }} />
            </head>
            <body className={inter.className} suppressHydrationWarning>
                <ThemeProvider>
                    {children}
                    <Toaster />
                </ThemeProvider>
            </body>
        </html>
    )
}