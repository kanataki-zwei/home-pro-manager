import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8002'

export async function GET(request: NextRequest) {
    const cookie = request.headers.get('cookie') ?? ''
    const res = await fetch(`${BACKEND}/api/users/`, {
        headers: { cookie },
        cache: 'no-store',
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
}

export async function POST(request: NextRequest) {
    const cookie = request.headers.get('cookie') ?? ''
    const body = await request.text()
    const res = await fetch(`${BACKEND}/api/users/`, {
        method: 'POST',
        headers: { cookie, 'Content-Type': 'application/json' },
        body,
    })
    const data = await res.json()
    const response = NextResponse.json(data, { status: res.status })
    const setCookie = res.headers.get('set-cookie')
    if (setCookie) response.headers.set('set-cookie', setCookie)
    return response
}
