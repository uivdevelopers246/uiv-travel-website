export type AuthMode = 'login' | 'signup'

export interface AuthFormState {
  email: string
  password: string
  loading: boolean
  error: string | null
  message: string | null
}
