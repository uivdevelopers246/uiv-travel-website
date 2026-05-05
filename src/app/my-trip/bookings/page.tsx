import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { createClient } from "@/lib/supabase/server";
import { MyBookingsClient } from "./MyBookingsClient";

export default async function MyBookingsPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect("/auth/login?redirect=/my-trip/bookings");
  }

  return (
    <>
      <Header />
      <MyBookingsClient />
    </>
  );
}
