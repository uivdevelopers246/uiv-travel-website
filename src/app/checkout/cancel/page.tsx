import { Header } from "@/components/layout/header";
import { CartClient } from "@/app/cart/CartClient";

export default function CheckoutCancelPage() {
  return (
    <>
      <Header />
      <CartClient
        initialMessage={{
          tone: "error",
          text: "Checkout was canceled before your payment method was saved. Your cart is unchanged, and you can retry whenever you're ready.",
        }}
      />
    </>
  );
}
