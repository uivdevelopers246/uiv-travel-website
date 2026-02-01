import { Suspense } from 'react'
import { LoginForm } from './LoginForm'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const resolvedSearchParams = await searchParams
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-8 shadow-lg">
        <h1 className="text-2xl font-semibold mb-2 text-white">Welcome back</h1>
        <p className="text-sm text-neutral-400 mb-6">
          Log in with your email and password.
        </p>
        {resolvedSearchParams?.error === 'invalid_confirmation_link' && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded text-red-400 text-sm">
            Invalid or expired confirmation link. Please try signing up again.
          </div>
        )}
        <Suspense fallback={<div className="text-white">Loading...</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  )
}
