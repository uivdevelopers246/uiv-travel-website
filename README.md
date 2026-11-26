# LocalPin

Barbados-focused travel site for discovering locally hosted activities and accommodations, submitting booking requests, and managing trips and listings.

## Getting Started

Install dependencies, configure `.env.local` using the [environment and deployment documentation](docs/architecture.md), then start the development server:

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Application routes live in `src/app/`.

## Checks

```bash
npm run lint
npx --no-install tsc --noEmit
npm run test:run
npm run build
```

## Project documentation

- [Architecture, environment variables, Stripe webhooks, and deployment](docs/architecture.md)
- [Database setup and migrations](docs/database.md). Local seed files are configured under `[db.seed]` in `supabase/config.toml` and run during a local database reset.
- [Notifications: setup, testing, retries, and rollback](docs/notifications.md)
- [Booking availability](docs/adrs/ADR-M4-A-booking-availability.md)
- [Cart and checkout](docs/adrs/ADR-M4-B-shopping-cart-and-checkout.md)
- [Vendor approval and payment](docs/adrs/ADR-M4-C-pending-approval-checkout-and-payment.md)
- [Accommodation bookings](docs/adrs/ADR-M4-D-accommodation-bookings.md)
