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
    const next = '/'
    const emailRedirectTo = `${getBaseURL()}/auth/confirm?next=${encodeURIComponent(next)}`
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { 
          emailRedirectTo /*: `${window.location.origin}/auth/confirm?next=/`*/
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

    // If we auto-login on signup, we can redirect straight to /me or landing page
    // Will need to update the UI on the landing page when the user is signed in to display their profile?
    //   router.push('/me')
    alert('Signup successful!')
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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="block text-sm font-medium text-neutral-200" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={state.email}
          onChange={e => setState(prev => ({ ...prev, email: e.target.value }))}
          className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          required
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-neutral-200" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          value={state.password}
          onChange={e => setState(prev => ({ ...prev, password: e.target.value }))}
          className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          required
        />
      </div>

      {state.error && (
        <p className="text-sm text-red-400">
          {state.error}
        </p>
      )}

      {state.message && (
        <p className="text-sm text-emerald-400">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={state.loading}
        className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {state.loading ? 'Creating account…' : 'Sign up'}
      </button>

      <p className="text-xs text-neutral-400">
        Already have an account?{' '}
        <a href="/auth/login" className="text-indigo-400 hover:underline">
          Log in
        </a>
      </p>
    </form>
  )
}
