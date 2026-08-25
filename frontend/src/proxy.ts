import { NextResponse, type NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
    const token = request.cookies.get('access_token')
    const { pathname } = request.nextUrl

    const isAuthRoute = pathname.startsWith('/auth')
    const isPublicRoute = pathname === '/'
    const isApiRoute = pathname.startsWith('/api')

    if (!token && !isAuthRoute && !isPublicRoute && !isApiRoute) {
        return NextResponse.redirect(new URL('/auth/login', request.url))
    }

    if (token && isAuthRoute) {
        return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    return NextResponse.next()
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
