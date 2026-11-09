import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from '@/context/ThemeContext'

const inter = Inter({ subsets: ['latin'] })

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    themeColor: [
        { media: '(prefers-color-scheme: dark)',  color: '#0f172a' },
        { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    ],
}

export const metadata: Metadata = {
    title: 'HomePro Manager',
    description: 'Household budgeting and finance manager',
    manifest: '/manifest.json',
    icons: {
        icon: '/icons/icon-192.png',
        apple: '/icons/icon-192.png',
    },
    appleWebApp: {
        capable: true,
        statusBarStyle: 'black-translucent',
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
