'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { AuthFormState } from '../types'

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

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

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
          autoComplete="new-password"
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
