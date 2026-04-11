import Stripe from "stripe";

let stripeSingleton: Stripe | null = null;

/**
 * Server-only Stripe SDK instance (Checkout, refunds). Never import from client components.
 */
export function getStripe (): Stripe {
    if (!stripeSingleton) {
        const key = process.env.STRIPE_SECRET_KEY;
        if (!key) {
            throw new Error("STRIPE_SECRET_KEY environment variable is not set");
        }
        stripeSingleton = new Stripe(key);
    }
    return stripeSingleton;
}

/**
 * Signing secret for `stripe.webhooks.constructEvent` on POST `/api/webhooks/stripe`.
 */
export function getStripeWebhookSecret (): string {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
        throw new Error("STRIPE_WEBHOOK_SECRET environment variable is not set");
    }
    return secret;
}

/**
 * Absolute site origin for Stripe Checkout `success_url` / `cancel_url` and similar redirects.
 * Mirrors signup: `NEXT_PUBLIC_SITE_URL`, else `NEXT_PUBLIC_VERCEL_URL` (https-prefixed if host-only), else local dev.
 */
export function getPublicSiteUrl (): string {
    const url =
        process.env.NEXT_PUBLIC_SITE_URL ??
        process.env.NEXT_PUBLIC_VERCEL_URL ??
        "http://localhost:3000";

    return url.startsWith("http") ? url : `https://${url}`;
}
