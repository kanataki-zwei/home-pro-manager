export async function signIn(
    email: string,
    password: string,
): Promise<{ error: { message: string } | null }> {
    try {
        const res = await fetch("/api/auth/login", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            return { error: { message: data.detail || "Invalid credentials" } };
        }
        return { error: null };
    } catch {
        return { error: { message: "Connection failed" } };
    }
}

export async function signOut(): Promise<void> {
    await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
    }).catch(() => {});
}
