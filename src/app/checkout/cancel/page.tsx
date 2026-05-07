import { Header } from "@/components/layout/header";
import { CartClient } from "@/app/cart/CartClient";

export default function CheckoutCancelPage() {
  return (
    <>
      <Header />
      <CartClient
        initialMessage={{
          tone: "warning",
          text: "Checkout was canceled before your payment method was saved. Your cart is unchanged, and no charge was created. You can try again whenever you're ready.",
        }}
      />
    </>
  );
}
