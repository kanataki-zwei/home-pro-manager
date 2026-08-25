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

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(path, {
        ...init,
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(init.headers as Record<string, string> || {}) },
    });

    if (res.status === 401) {
        const refreshed = await refreshToken();
        if (refreshed) {
            const retry = await fetch(path, {
                ...init,
                credentials: "include",
                headers: { "Content-Type": "application/json", ...(init.headers as Record<string, string> || {}) },
            });
            if (!retry.ok) throw new Error(await retry.text());
            return retry;
        }
        if (typeof window !== "undefined") window.location.href = "/auth/login";
        throw new Error("Session expired");
    }

    if (!res.ok) throw new Error(await res.text());
    return res;
}

export async function apiGet<T>(path: string): Promise<T> {
    return (await apiFetch(path)).json();
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
    return (await apiFetch(path, { method: "POST", body: JSON.stringify(body) })).json();
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
    return (await apiFetch(path, { method: "PATCH", body: JSON.stringify(body) })).json();
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
    return (await apiFetch(path, { method: "PUT", body: JSON.stringify(body) })).json();
}

export async function apiDelete(path: string): Promise<void> {
    await apiFetch(path, { method: "DELETE" });
}
