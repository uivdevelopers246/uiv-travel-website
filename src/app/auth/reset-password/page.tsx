import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RecoveryPanel } from "../RecoveryPanel";
import { ResetPasswordForm } from "./ResetPasswordForm";

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/auth/forgot-password?error=invalid_recovery_link");
  return <RecoveryPanel title="Choose a new password" description="Use at least 8 characters, including uppercase and lowercase letters, a number, and a symbol."><ResetPasswordForm /></RecoveryPanel>;
}
