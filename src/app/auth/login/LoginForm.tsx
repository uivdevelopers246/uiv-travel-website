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

  // Optional: allow redirect param (?redirect=/something)
  // We will update this later after creating a landing page  or as we add protected routes
 const redirectTo = searchParams.get('redirect') ?? '/'

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
          required
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-semibold text-[#193059]" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={state.password}
          onChange={e => setState(prev => ({ ...prev, password: e.target.value }))}
          className="w-full rounded-lg border border-[#407FC2]/30 bg-white px-4 py-2.5 text-sm text-[#193059] placeholder:text-[#193059]/40 focus:outline-none focus:ring-2 focus:ring-[#407FC2]/50 focus:border-[#407FC2] transition-colors"
          placeholder="••••••••"
          required
        />
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
