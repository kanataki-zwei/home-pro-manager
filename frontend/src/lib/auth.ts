import { createClient } from '@/lib/supabase'

export async function signIn(email: string, password: string) {
    const supabase = createClient()
    return supabase.auth.signInWithPassword({ email, password })
}

export async function signUp(email: string, password: string) {
    const supabase = createClient()
    return supabase.auth.signUp({ email, password })
}

export async function signOut() {
    const supabase = createClient()
    return supabase.auth.signOut()
}

export async function getSession() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return session
}