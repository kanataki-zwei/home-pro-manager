'use client'

import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export default function PageShell({
    children,
    className,
}: {
    children: React.ReactNode
    className?: string
}) {
    const pathname = usePathname()
    return (
        <main key={pathname} className={cn('animate-page-enter', className)}>
            {children}
        </main>
    )
}
