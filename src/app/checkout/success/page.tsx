import { Header } from "@/components/layout/header";
import { CheckoutSuccessClient } from "./CheckoutSuccessClient";

type CheckoutSuccessPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getSingleParam(
  value: string | string[] | undefined,
): string | null {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : null;
  }

  return typeof value === "string" ? value : null;
}

export default async function CheckoutSuccessPage({
  searchParams,
}: CheckoutSuccessPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const orderId = getSingleParam(resolvedSearchParams.order_id);

  return (
    <>
      <Header />
      <CheckoutSuccessClient orderId={orderId} />
    </>
  );
}
