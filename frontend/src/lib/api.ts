import { createClient } from '@/lib/supabase'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8002'

async function getAuthHeaders() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return {
        'Content-Type': 'application/json',
        ...(session?.access_token && {
            Authorization: `Bearer ${session.access_token}`
        })
    }
}

export async function apiGet<T>(path: string): Promise<T> {
    const headers = await getAuthHeaders()
    const res = await fetch(`${BASE_URL}${path}`, { headers })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
    const headers = await getAuthHeaders()
    const res = await fetch(`${BASE_URL}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
    const headers = await getAuthHeaders()
    const res = await fetch(`${BASE_URL}${path}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body)
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
}

export async function apiDelete(path: string): Promise<void> {
    const headers = await getAuthHeaders()
    const res = await fetch(`${BASE_URL}${path}`, { method: 'DELETE', headers })
    if (!res.ok) throw new Error(await res.text())
}