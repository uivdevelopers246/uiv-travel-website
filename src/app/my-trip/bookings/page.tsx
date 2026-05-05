import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { getBuyerFlowMessageFromSearchParams } from "@/lib/orders/buyer-flow";
import { createClient } from "@/lib/supabase/server";
import { MyBookingsClient } from "./MyBookingsClient";

type MyBookingsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MyBookingsPage({
  searchParams,
}: MyBookingsPageProps) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const resolvedSearchParams = (await searchParams) ?? {};

  if (!userData.user) {
    redirect("/auth/login?redirect=/my-trip/bookings");
  }

  return (
    <>
      <Header />
      <MyBookingsClient
        initialReturnMessage={getBuyerFlowMessageFromSearchParams(
          resolvedSearchParams,
        )}
      />
    </>
  );
}
