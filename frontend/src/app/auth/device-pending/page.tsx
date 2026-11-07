'use client'

import { useState } from 'react'
import { ShieldCheck, Clock, Smartphone, Check } from 'lucide-react'

export default function DevicePendingPage() {
    const [nickname, setNickname] = useState('')
    const [saved, setSaved] = useState(false)
    const [saving, setSaving] = useState(false)

    const saveNickname = async () => {
        const name = nickname.trim()
        if (!name || saving) return
        setSaving(true)
        try {
            await fetch('/api/auth/device/nickname', {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nickname: name }),
            })
            setSaved(true)
        } catch {
            // silent — not critical
        } finally {
            setSaving(false)
        }
    }

    return (
        <div
            className="min-h-screen flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #0f172a 0%, #0c2a4a 60%, #0f172a 100%)' }}
        >
            <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-10 pointer-events-none"
                style={{ background: 'radial-gradient(circle, #38bdf8, transparent)', transform: 'translate(30%, -30%)' }} />
            <div className="absolute bottom-0 left-0 w-72 h-72 rounded-full opacity-5 pointer-events-none"
                style={{ background: 'radial-gradient(circle, #0ea5e9, transparent)', transform: 'translate(-30%, 30%)' }} />

            <div className="w-full max-w-md px-4 relative">
                <div className="flex items-center justify-center gap-2 mb-8">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)' }}>
                        <ShieldCheck className="h-5 w-5 text-white" />
                    </div>
                    <span className="text-white font-bold text-xl" style={{ fontFamily: 'Plus Jakarta Sans' }}>
                        HomePro
                    </span>
                </div>

                <div
                    className="rounded-2xl p-8 space-y-6"
                    style={{ boxShadow: '0 25px 50px rgba(0,0,0,0.4)', background: 'rgba(255,255,255,0.98)' }}
                >
                    <div className="flex justify-center">
                        <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center">
                            <Smartphone className="h-8 w-8 text-amber-500" />
                        </div>
                    </div>

                    <div className="space-y-2 text-center">
                        <h1 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'Plus Jakarta Sans' }}>
                            New Device Detected
                        </h1>
                        <p className="text-sm text-slate-500 leading-relaxed">
                            Your login was successful, but this device hasn't been approved yet.
                            The household admin has been notified and will approve your access.
                        </p>
                    </div>

                    {/* Nickname input */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                            Name this device <span className="text-slate-400 font-normal normal-case">(optional)</span>
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={nickname}
                                onChange={e => { setNickname(e.target.value); setSaved(false) }}
                                onKeyDown={e => e.key === 'Enter' && saveNickname()}
                                placeholder="e.g. Kanataki's Dragonfly"
                                maxLength={100}
                                disabled={saved}
                                className="flex-1 h-10 px-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-400 disabled:bg-slate-50 disabled:text-slate-400"
                            />
                            <button
                                onClick={saveNickname}
                                disabled={!nickname.trim() || saving || saved}
                                className="h-10 px-4 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-colors shrink-0 flex items-center gap-1.5"
                                style={{ background: saved ? '#10b981' : 'linear-gradient(135deg, #0ea5e9, #38bdf8)' }}
                            >
                                {saved ? <><Check className="h-3.5 w-3.5" /> Saved</> : saving ? 'Saving…' : 'Save'}
                            </button>
                        </div>
                        <p className="text-xs text-slate-400">
                            Helps the admin identify which device this is when approving.
                        </p>
                    </div>

                    <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 space-y-2">
                        <div className="flex items-center gap-2 text-amber-700">
                            <Clock className="h-4 w-4 shrink-0" />
                            <span className="text-sm font-semibold">Waiting for approval</span>
                        </div>
                        <p className="text-xs text-amber-600 leading-relaxed">
                            Once approved, return here and sign in again — you'll have full access immediately.
                        </p>
                    </div>

                    <a
                        href="/auth/login"
                        className="block w-full py-3 rounded-xl text-sm font-semibold text-white text-center"
                        style={{ background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)' }}
                    >
                        Back to Sign In
                    </a>
                </div>
            </div>
        </div>
    )
}
