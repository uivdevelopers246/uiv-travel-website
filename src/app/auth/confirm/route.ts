import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getSafeRedirectPath } from '@/lib/auth/redirect'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const code = searchParams.get('code')
  const next = getSafeRedirectPath(searchParams.get('next'), type === 'recovery' ? '/auth/reset-password' : '/')
  const recovery = type === 'recovery' || next === '/auth/reset-password'

  if (code || (token_hash && type)) {
    const supabase = await createClient()

    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ type: type!, token_hash: token_hash! })
    if (!error) {
      // redirect user to specified redirect URL or root of app
      redirect(next)
    }
  }

  const url = new URL(recovery ? '/auth/forgot-password' : '/auth/login', request.url)
  url.searchParams.set('error', recovery ? 'invalid_recovery_link' : 'invalid_confirmation_link')
  redirect(url.toString())
}
