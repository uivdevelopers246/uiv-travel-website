import { SignupForm } from './SignupForm'

export default function SignupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-8 shadow-lg">
        <h1 className="text-2xl font-semibold mb-2 text-white">Create your account</h1>
        <p className="text-sm text-neutral-400 mb-6">
          Sign up with your email and a password to get started.
        </p>
        <SignupForm />
      </div>
    </div>
  )
}
