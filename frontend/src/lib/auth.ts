const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8002'

export async function signIn(
    email: string,
    password: string,
): Promise<{ error: { message: string } | null }> {
    try {
        const res = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        })
        if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            return { error: { message: data.detail || 'Invalid credentials' } }
        }
        return { error: null }
    } catch {
        return { error: { message: 'Connection failed' } }
    }
}

export async function signOut(): Promise<void> {
    await fetch(`${BASE_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
    }).catch(() => {})
}
