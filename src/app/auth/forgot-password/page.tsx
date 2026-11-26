import { RecoveryPanel } from "../RecoveryPanel";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <RecoveryPanel title="Reset your password" description="Enter your account email to request a password reset link.">
      {error === "invalid_recovery_link" && <p role="alert" className="mb-4 text-sm text-red-600">This reset link is invalid or has expired. Request a new link below.</p>}
      <ForgotPasswordForm />
    </RecoveryPanel>
  );
}
