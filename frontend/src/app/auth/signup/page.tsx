'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { signUp } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Sparkles } from 'lucide-react'

const schema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string()
}).refine(data => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword']
})

type FormData = z.infer<typeof schema>

export default function SignupPage() {
    const router = useRouter()
    const [loading, setLoading] = useState(false)

    const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(schema)
    })

    const onSubmit = async (data: FormData) => {
        setLoading(true)
        const { error } = await signUp(data.email, data.password)
        setLoading(false)

        if (error) {
            toast.error(error.message)
            return
        }

        toast.success('Account created! Please sign in.')
        router.push('/auth/login')
    }

    return (
        <div className="min-h-screen flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #0f172a 0%, #0c2a4a 60%, #0f172a 100%)' }}>

            {/* Background decoration */}
            <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-10 pointer-events-none"
                style={{ background: 'radial-gradient(circle, #38bdf8, transparent)', transform: 'translate(30%, -30%)' }} />
            <div className="absolute bottom-0 left-0 w-72 h-72 rounded-full opacity-5 pointer-events-none"
                style={{ background: 'radial-gradient(circle, #0ea5e9, transparent)', transform: 'translate(-30%, 30%)' }} />

            <div className="w-full max-w-md px-4 relative">
                {/* Logo */}
                <div className="flex items-center justify-center gap-2 mb-8">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)' }}>
                        <Sparkles className="h-5 w-5 text-white" />
                    </div>
                    <span className="text-white font-bold text-xl" style={{ fontFamily: 'Plus Jakarta Sans' }}>
                        HomePro
                    </span>
                </div>

                <Card className="border-0 rounded-2xl"
                    style={{ boxShadow: '0 25px 50px rgba(0,0,0,0.4)', background: 'rgba(255,255,255,0.98)' }}>
                    <CardHeader className="space-y-1 pb-4">
                        <CardTitle className="text-2xl font-bold text-slate-900"
                            style={{ fontFamily: 'Plus Jakarta Sans' }}>
                            Create account
                        </CardTitle>
                        <CardDescription className="text-slate-500">
                            Set up your Home Pro Manager
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="email" className="text-sm font-semibold text-slate-700">Email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="you@example.com"
                                    className="h-11 rounded-xl border-slate-200 focus:border-sky-400 focus:ring-sky-400"
                                    {...register('email')}
                                />
                                {errors.email && <p className="text-sm text-red-500">{errors.email.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="password" className="text-sm font-semibold text-slate-700">Password</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder="••••••••"
                                    className="h-11 rounded-xl border-slate-200 focus:border-sky-400 focus:ring-sky-400"
                                    {...register('password')}
                                />
                                {errors.password && <p className="text-sm text-red-500">{errors.password.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="confirmPassword" className="text-sm font-semibold text-slate-700">Confirm Password</Label>
                                <Input
                                    id="confirmPassword"
                                    type="password"
                                    placeholder="••••••••"
                                    className="h-11 rounded-xl border-slate-200 focus:border-sky-400 focus:ring-sky-400"
                                    {...register('confirmPassword')}
                                />
                                {errors.confirmPassword && <p className="text-sm text-red-500">{errors.confirmPassword.message}</p>}
                            </div>
                            <Button
                                type="submit"
                                className="w-full h-11 rounded-xl font-semibold text-white border-0 mt-2"
                                style={{ background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)' }}
                                disabled={loading}
                            >
                                {loading ? (
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                                        Creating account...
                                    </div>
                                ) : 'Create account'}
                            </Button>
                        </form>
                    </CardContent>
                    <CardFooter className="justify-center pt-0">
                        <p className="text-sm text-slate-500">
                            Already have an account?{' '}
                            <Link href="/auth/login" className="font-semibold text-sky-500 hover:text-sky-600">
                                Sign in
                            </Link>
                        </p>
                    </CardFooter>
                </Card>
            </div>
        </div>
    )
}