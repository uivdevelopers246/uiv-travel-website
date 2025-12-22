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
          error: error.message,
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
          autoComplete="current-password"
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
        {state.loading ? 'Signing in…' : 'Log in'}
      </button>


      <p className="text-xs text-neutral-400">
        Don&apos;t have an account?{' '}
        <a href="/auth/signup" className="text-indigo-400 hover:underline">
          Sign up
        </a>
      </p>
    </form>
  )
}
