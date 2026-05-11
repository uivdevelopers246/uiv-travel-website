export function buildLoginRedirectHref(redirectPath: string): string {
  return `/auth/login?redirect=${encodeURIComponent(redirectPath)}`;
}

export function redirectToLogin(redirectPath: string): void {
  window.location.assign(buildLoginRedirectHref(redirectPath));
}
