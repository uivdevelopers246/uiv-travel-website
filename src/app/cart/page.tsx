import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { createClient } from "@/lib/supabase/server";
import { CartClient } from "./CartClient";

export default async function CartPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect("/auth/login?redirect=/cart");
  }

  return (
    <>
      <Header />
      <CartClient />
    </>
  );
}
