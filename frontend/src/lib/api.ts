import { isPlaygroundActive, getMockResponse, isPlaygroundPassthrough } from './playground-data'

async function refreshToken(): Promise<boolean> {
    try {
        const res = await fetch("/api/auth/refresh", {
            method: "POST",
            credentials: "include",
        });
        return res.ok;
    } catch {
        return false;
    }
}

function redirectToLogin() {
    if (typeof window !== "undefined") window.location.href = "/auth/login";
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(path, {
        ...init,
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(init.headers as Record<string, string> || {}) },
    });

    // Device not approved — kick back to login to re-authenticate with the right device
    if (res.status === 403) {
        const body = await res.clone().json().catch(() => ({}));
        if (body.detail === "device_not_approved") {
            redirectToLogin();
            throw new Error("Device not approved");
        }
    }

    if (res.status === 401) {
        const refreshed = await refreshToken();
        if (refreshed) {
            const retry = await fetch(path, {
                ...init,
                credentials: "include",
                headers: { "Content-Type": "application/json", ...(init.headers as Record<string, string> || {}) },
            });
            // If retry also fails (e.g. device cookie missing), force re-login
            if (!retry.ok) {
                redirectToLogin();
                throw new Error("Session expired");
            }
            return retry;
        }
        redirectToLogin();
        throw new Error("Session expired");
    }

    if (!res.ok) throw new Error(await res.text());
    return res;
}

export async function apiGet<T>(path: string): Promise<T> {
    if (isPlaygroundActive() && !isPlaygroundPassthrough(path)) {
        return getMockResponse(path) as T
    }
    return (await apiFetch(path)).json();
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
    if (isPlaygroundActive() && !isPlaygroundPassthrough(path)) {
        return { success: true } as unknown as T
    }
    return (await apiFetch(path, { method: "POST", body: JSON.stringify(body) })).json();
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
    if (isPlaygroundActive() && !isPlaygroundPassthrough(path)) {
        return { success: true } as unknown as T
    }
    return (await apiFetch(path, { method: "PATCH", body: JSON.stringify(body) })).json();
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
    if (isPlaygroundActive() && !isPlaygroundPassthrough(path)) {
        return { success: true } as unknown as T
    }
    return (await apiFetch(path, { method: "PUT", body: JSON.stringify(body) })).json();
}

export async function apiDelete(path: string): Promise<void> {
    if (isPlaygroundActive() && !isPlaygroundPassthrough(path)) return
    await apiFetch(path, { method: "DELETE" });
}
