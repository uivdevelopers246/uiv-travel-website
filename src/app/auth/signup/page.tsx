import Link from 'next/link'
import { SignupForm } from './SignupForm'

export default function SignupPage() {
  return (
    <div className="min-h-screen flex">
      {/* Left Panel – decorative beach image (hidden on mobile) */}
      <div className="hidden lg:block lg:w-1/2 relative">
        <img
          src="/images/hero/BeachSunset.jpg"
          alt="Barbados beach sunset"
          className="absolute inset-0 w-full h-full object-cover object-top brightness-105 contrast-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#193059]/70 via-[#193059]/30 to-transparent" />
        <div className="relative z-10 flex flex-col justify-end h-full p-12 pb-16">
          <h2
            className="text-5xl font-bold text-[#FBCA1A] leading-tight mb-4"
            style={{ fontFamily: 'var(--font-playfair)' }}
          >
            Start Your&nbsp;Adventure
          </h2>
          <p className="text-white/90 text-lg max-w-md" style={{ fontFamily: 'var(--font-source-sans)' }}>
            Create an account to unlock personalised travel recommendations, exclusive deals, and more.
          </p>
        </div>
      </div>

      {/* Right Panel – form */}
      <div className="flex flex-1 flex-col items-center justify-center bg-gradient-to-br from-white via-[#f0f6fc] to-[#dce9f5] px-6 py-12 lg:w-1/2">
        {/* Logo */}
        <Link href="/" className="mb-8">
          <img
            src="/images/logos/LocalPinLongLogoCutOut.png"
            alt="LocalPin Logo"
            className="h-14 w-auto"
          />
        </Link>

        <div className="w-full max-w-md rounded-2xl bg-white/80 backdrop-blur-md border border-[#407FC2]/15 p-8 shadow-xl">
          <h1
            className="text-3xl font-bold text-[#193059] mb-1"
            style={{ fontFamily: 'var(--font-playfair)' }}
          >
            Create Your Account
          </h1>
          <p className="text-sm text-[#193059]/60 mb-6" style={{ fontFamily: 'var(--font-source-sans)' }}>
            Sign up with your email and a password to get started.
          </p>
          <SignupForm />
        </div>

        <p className="mt-6 text-xs text-[#193059]/50" style={{ fontFamily: 'var(--font-source-sans)' }}>
          &copy; {new Date().getFullYear()} UnitedIV &middot; All rights reserved
        </p>
      </div>
    </div>
  )
}
