'use client'

import { FormEvent, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { AuthFormState } from '../types'

const passwordRequirements = [
  { id: 'length', label: 'At least 8 characters', test: (pw: string) => pw.length >= 8 },
  { id: 'uppercase', label: 'One uppercase letter', test: (pw: string) => /[A-Z]/.test(pw) },
  { id: 'lowercase', label: 'One lowercase letter', test: (pw: string) => /[a-z]/.test(pw) },
  { id: 'number', label: 'One number', test: (pw: string) => /[0-9]/.test(pw) },
  { id: 'special', label: 'One special character (!@#$%^&*)', test: (pw: string) => /[!@#$%^&*(),.?":{}|<>]/.test(pw) },
]

export function SignupForm() {
  const router = useRouter()
  const supabase = createClient()

  const [state, setState] = useState<AuthFormState>({
    email: '',
    password: '',
    loading: false,
    error: null,
    message: null,
  })
  const [showPassword, setShowPassword] = useState(false)
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const passwordValidation = useMemo(() => {
    return passwordRequirements.map(req => ({
      ...req,
      met: req.test(state.password),
    }))
  }, [state.password])

  const isPasswordValid = passwordValidation.every(req => req.met)
  const passwordsMatch = state.password === confirmPassword && confirmPassword.length > 0

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (!isPasswordValid) {
      setState(prev => ({
        ...prev,
        error: 'Please meet all password requirements.',
      }))
      return
    }

    if (!passwordsMatch) {
      setState(prev => ({
        ...prev,
        error: 'Passwords do not match.',
      }))
      return
    }

    setState(prev => ({
      ...prev,
      loading: true,
      error: null,
      message: null,
    }))

    const getBaseURL = () => {
      const url =
        process.env.NEXT_PUBLIC_SITE_URL ??      // production only
        process.env.NEXT_PUBLIC_VERCEL_URL ??    // set by Vercel (no protocol)
        'http://localhost:3000'
    
      return url.startsWith('http') ? url : `https://${url}`
    }

    const email = state.email.trim()
    const password = state.password
    const emailRedirectTo = getBaseURL()

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { 
          emailRedirectTo
        }
      })

      if (error) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: error.message,
        }))
        return
      }

      // If email confirmation is ON, Supabase won't log them in immediately.
      // In that case you can show a "check your email" message instead of redirecting.
      if (!data.session) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: null,
          message: 'Check your email to confirm your account before signing in.',
        }))
        return
      }

      // If we auto-login on signup, redirect to home page
      setState(prev => ({
        ...prev,
        loading: false,
        error: null,
        message: 'Signup successful! Redirecting...',
      }))
      router.push('/')
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      setState(prev => ({
        ...prev,
        loading: false,
        error: message,
      }))
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" style={{ fontFamily: 'var(--font-source-sans)' }}>
      <div className="space-y-1.5">
        <label className="block text-sm font-semibold text-[#193059]" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={state.email}
          onChange={e => setState(prev => ({ ...prev, email: e.target.value }))}
          className="w-full rounded-lg border border-[#407FC2]/30 bg-white px-4 py-2.5 text-sm text-[#193059] placeholder:text-[#193059]/40 focus:outline-none focus:ring-2 focus:ring-[#407FC2]/50 focus:border-[#407FC2] transition-colors"
          placeholder="you@example.com"
          maxLength={254}
          required
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-semibold text-[#193059]" htmlFor="password">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            value={state.password}
            onChange={e => setState(prev => ({ ...prev, password: e.target.value }))}
            className="w-full rounded-lg border border-[#407FC2]/30 bg-white px-4 py-2.5 pr-10 text-sm text-[#193059] placeholder:text-[#193059]/40 focus:outline-none focus:ring-2 focus:ring-[#407FC2]/50 focus:border-[#407FC2] transition-colors"
            placeholder="••••••••"
            maxLength={128}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#193059]/50 hover:text-[#193059] transition-colors"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        </div>
        
        {/* Password Requirements */}
        {state.password.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {passwordValidation.map(req => (
              <div key={req.id} className="flex items-center gap-2 text-xs">
                {req.met ? (
                  <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
                <span className={req.met ? 'text-emerald-600' : 'text-[#193059]/60'}>
                  {req.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirm Password */}
      <div className="space-y-1.5">
        <label className="block text-sm font-semibold text-[#193059]" htmlFor="confirmPassword">
          Confirm Password
        </label>
        <div className="relative">
          <input
            id="confirmPassword"
            type={showConfirmPassword ? "text" : "password"}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            className={`w-full rounded-lg border bg-white px-4 py-2.5 pr-10 text-sm text-[#193059] placeholder:text-[#193059]/40 focus:outline-none focus:ring-2 focus:ring-[#407FC2]/50 transition-colors ${
              confirmPassword.length > 0
                ? passwordsMatch
                  ? 'border-emerald-500 focus:border-emerald-500'
                  : 'border-red-400 focus:border-red-400'
                : 'border-[#407FC2]/30 focus:border-[#407FC2]'
            }`}
            placeholder="••••••••"
            maxLength={128}
            required
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#193059]/50 hover:text-[#193059] transition-colors"
            aria-label={showConfirmPassword ? "Hide password" : "Show password"}
          >
            {showConfirmPassword ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        </div>
        {confirmPassword.length > 0 && (
          <div className="flex items-center gap-2 text-xs mt-2">
            {passwordsMatch ? (
              <>
                <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-emerald-600">Passwords match</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-red-500">Passwords do not match</span>
              </>
            )}
          </div>
        )}
      </div>

      {state.error && (
        <p className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      {state.message && (
        <p className="text-sm text-emerald-600">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={state.loading || !isPasswordValid || !passwordsMatch}
        className="w-full rounded-lg bg-[#FBCA1A] px-4 py-2.5 text-sm font-bold text-[#193059] shadow-md hover:bg-[#f5c000] hover:shadow-lg active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200"
      >
        {state.loading ? 'Creating account…' : 'Create Account'}
      </button>

      <div className="relative my-2">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[#407FC2]/15" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-white/80 px-3 text-[#193059]/50">or</span>
        </div>
      </div>

      <p className="text-sm text-center text-[#193059]/70">
        Already have an account?{' '}
        <a href="/auth/login" className="font-semibold text-[#407FC2] hover:text-[#193059] hover:underline transition-colors">
          Log in
        </a>
      </p>
    </form>
  )
}
