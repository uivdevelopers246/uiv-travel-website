'use client'

import { FormEvent, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { AuthFormState } from '../types'

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [state, setState] = useState<AuthFormState>({
    email: '',
    password: '',
    loading: false,
    error: null,
    message: null,
  })
  const [showPassword, setShowPassword] = useState(false)

  // Optional: allow redirect param (?redirect=/something)
  // Validate redirect is a safe relative path to prevent open redirect attacks
  const redirectParam = searchParams.get('redirect') ?? '/'
  const redirectTo = redirectParam.startsWith('/') && !redirectParam.startsWith('//') 
    ? redirectParam 
    : '/'

  const toMessage = (value: unknown, fallback: string) => {
    if (typeof value === 'string' && value.trim().length > 0) return value
    if (value && typeof value === 'object') {
      const maybeMessage = (value as { message?: unknown }).message
      if (typeof maybeMessage === 'string' && maybeMessage.trim().length > 0) {
        return maybeMessage
      }
    }
    return fallback
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    setState(prev => ({
      ...prev,
      loading: true,
      error: null,
      message: null,
    }))

    const email = state.email.trim()
    const password = state.password

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: toMessage(error, 'Unable to sign in. Please try again.'),
        }))
        return
      }

      if (!data.session) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: 'No session returned. Please try again.',
        }))
        return
      }

    // Will need to update the UI on the landing page when the user is signed in to display their profile?
      router.push(redirectTo)
    } catch (err: unknown) {
      const message = toMessage(err, 'Something went wrong. Please try again.')
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
            autoComplete="current-password"
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
        disabled={state.loading}
        className="w-full rounded-lg bg-[#FBCA1A] px-4 py-2.5 text-sm font-bold text-[#193059] shadow-md hover:bg-[#f5c000] hover:shadow-lg active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200"
      >
        {state.loading ? 'Signing in…' : 'Log In'}
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
        Don&apos;t have an account?{' '}
        <a href="/auth/signup" className="font-semibold text-[#407FC2] hover:text-[#193059] hover:underline transition-colors">
          Sign up
        </a>
      </p>
    </form>
  )
}
