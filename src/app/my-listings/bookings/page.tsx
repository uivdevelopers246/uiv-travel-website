import { Header } from "@/components/layout/header";
import { VendorBookingsClient } from "./VendorBookingsClient";
import { isValidUuid } from "../manage/_shared/server";

export default async function MyListingsBookingsPage({ searchParams }: {
  searchParams: Promise<{ accommodationId?: string | string[] }>;
}) {
  const { accommodationId } = await searchParams;
  const initialListingFilter = typeof accommodationId === "string" && isValidUuid(accommodationId)
    ? `accommodation:${accommodationId}`
    : "";
  return (
    <>
      <Header />
      <VendorBookingsClient key={initialListingFilter} initialListingFilter={initialListingFilter} />
    </>
  );
}
