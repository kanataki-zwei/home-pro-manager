const store = new Map<string, unknown>()

export function getCached<T>(key: string): T | undefined {
    const entry = store.get(key)
    return entry !== undefined ? (entry as T) : undefined
}

export function setCached<T>(key: string, data: T): void {
    store.set(key, data)
}

export function clearCache(): void {
    store.clear()
}
