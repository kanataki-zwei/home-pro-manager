export type SignInResult =
    | { error: { message: string }; deviceStatus?: never }
    | { error: null; deviceStatus?: never }
    | { error: null; deviceStatus: 'pending' | 'rejected' }

export async function signIn(
    email: string,
    password: string,
): Promise<SignInResult> {
    try {
        const res = await fetch("/api/auth/login", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            if (data.detail === "device_pending") return { error: null, deviceStatus: 'pending' }
            if (data.detail === "device_rejected") return { error: null, deviceStatus: 'rejected' }
            return { error: { message: data.detail || "Invalid credentials" } }
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
