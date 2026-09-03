# XIVARRI shop launch roadmap

This project is already a good foundation: Next.js runs on Cloudflare through OpenNext, D1 stores the catalogue and orders, R2 stores media, and Stripe Checkout handles payment. The recommended production architecture is:

```text
Buyer -> Cloudflare Worker / Next.js -> D1
                              |
                              +-> Stripe Checkout
                              |
                              +-> Stripe webhook -> paid order -> Google Sheets mirror
                              |
                              +-> R2 media / optional email provider
Admin -> Cloudflare Access -> /admin
```

D1 is the source of truth. Google Sheets is an operational export/report, not the database used to decide stock, payment, tickets, or refunds.

## Phase 0 — Decide the business and data rules

- [ ] Confirm who is the Stripe account owner and who legally receives the money.
- [ ] Confirm whether the shop sells tickets, merchandise, trips, or all three.
- [ ] Decide whether quantities represent one ticket per attendee or one order line containing several attendees. For trips, keep one participant's answers per ticket.
- [ ] Decide the refund policy and publish it before enabling live payments.
- [ ] Decide which personal data is genuinely required. DNI, allergies, phone numbers, and trip answers need a clear purpose, retention period, privacy notice, and access policy.
- [ ] Define who can access `/admin` and who can access the Google Sheet.
- [ ] Confirm the domain name and the production sender email.

## Phase 1 — Finish the local commerce workflow

The current code contains the main flow, but it should be exercised end-to-end before deployment.

- [ ] Apply both D1 migrations locally and seed sample activities.

  ```powershell
  npm run db:migrate:local
  npm run db:seed:local
  npm run dev
  ```

- [ ] Test a free item: order creation, ticket URL, and admin check-in.
- [ ] Test a paid item with Stripe test mode.
- [ ] Test invalid email, missing required fields, invalid variant IDs, sold-out variants, and client price tampering.
- [ ] Test two checkouts competing for the last unit. Only one may reserve it.
- [ ] Test Stripe session creation failure. The pending order must be cancelled and stock must become available again.
- [ ] Test repeated webhook delivery. The order must be paid and stock counted once only.
- [ ] Test expired/failed payment, refund, cancelled ticket, duplicate door scan, and duplicate merchandise collection.
- [ ] Add automated tests for the reservation and webhook functions before launch. These are the two most important correctness boundaries.

## Phase 2 — Create the Cloudflare production resources

Install and authenticate Wrangler with the Cloudflare account that will own the shop.

```powershell
npx wrangler login
npx wrangler d1 create xivarri
npx wrangler r2 bucket create xivarri-media
```

- [ ] Copy the returned D1 `database_id` into `wrangler.jsonc` in place of `REPLACE_WITH_D1_DATABASE_ID`.
- [ ] Keep the existing binding names: `DB`, `MEDIA`, and `ASSETS`.
- [ ] Apply migrations to the remote database:

  ```powershell
  npm run db:migrate
  ```

- [ ] Seed only intentional production catalogue data. Do not blindly use development seed data if it contains test activities.
- [ ] Upload production posters and merchandise images to R2, or use the admin media flow if that is the chosen process.
- [ ] Attach a custom domain to the Worker after the first successful preview deployment.
- [ ] Configure caching so checkout, tickets, admin pages, and webhooks remain dynamic and are never cached as public content.

## Phase 3 — Configure Stripe test mode

Use Stripe Checkout. Do not collect card details in this application.

- [ ] Create or verify the Stripe account and complete its business, identity, and payout requirements.
- [ ] Confirm that the account supports the desired payment methods in the target country. The current checkout requests `card` and `bizum`; wallets such as Apple Pay and Google Pay are normally enabled through Stripe’s Checkout/payment-method configuration and account eligibility.
- [ ] Create test API keys in Stripe Dashboard.
- [ ] Set local test secrets in the gitignored `.dev.vars` file:

  ```text
  STRIPE_SECRET_KEY=sk_test_...
  STRIPE_WEBHOOK_SECRET=whsec_...
  ```

- [ ] For local webhook testing, run Stripe CLI and use the webhook signing secret it provides:

  ```powershell
  stripe login
  stripe listen --forward-to localhost:3000/api/webhooks/stripe
  ```

- [ ] Use Stripe test cards and test asynchronous-payment scenarios.
- [ ] Verify the Checkout Session contains the internal `orderId` metadata and that the webhook validates order ID, amount, currency, and session ID.

## Phase 4 — Add Google Sheets registration/reporting

Use a one-way, idempotent mirror from paid D1 orders to a private Google Sheet. Never let the browser send rows directly to Google Sheets, and never use the sheet to calculate availability.

### Recommended implementation: Google Apps Script relay

This is usually the simplest fit for Cloudflare Workers:

1. Create a Google Sheet named `XIVARRI Orders` with a fixed header row.
2. Create a Google Apps Script attached to the sheet.
3. Add a `doPost(e)` endpoint that checks a long random shared secret, obtains a script lock, checks whether `order_id` already exists, and appends the row only when it does not.
4. Deploy it as a Web App. Restrict the sheet itself to the organisers; the endpoint should expose no sheet data.
5. Add the endpoint URL and secret to Cloudflare Worker secrets.
6. Call the relay only after the Stripe webhook has successfully marked an order paid. Include the order ID so retries are safe.

Suggested columns:

```text
order_id, paid_at, buyer_name, buyer_email, buyer_phone,
activity, edition, item, quantity, unit_price_eur, total_eur,
payment_method, ticket_code, participant_answers_json,
collection_status, check_in_status
```

The sheet should contain one row per purchased order item. If participant data is collected per attendee, use one row per attendee/ticket instead.

### More controlled alternative: Google Sheets API

Use this when the organisers need a formal Google Cloud service account and stronger API-level control. A Cloudflare Worker must obtain a short-lived Google OAuth access token using a service-account JWT, then call the Sheets API. Store the service-account credentials only as Cloudflare secrets. Do not commit a JSON key file. This option has more setup and key-rotation work than Apps Script.

### Reliability requirements

- [ ] D1 remains authoritative if Google is unavailable.
- [ ] Store a sync status or sync-attempt log in D1, or provide an admin “resync order” action.
- [ ] Make the relay idempotent by `order_id`.
- [ ] Do not put sensitive data in the sheet unless it is required.
- [ ] Restrict Sheet sharing and remove access when organisers change.

## Phase 5 — Configure production secrets

Set secrets with Wrangler from a secure terminal. Do not put live values in `wrangler.jsonc`, `.dev.vars`, Git, or screenshots.

```powershell
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put SHEETS_RELAY_URL
npx wrangler secret put SHEETS_RELAY_SECRET
```

If email delivery is added later, add the Resend API key in the same way. Keep separate Stripe test and live values; use test values in Preview and live values only in Production.

## Phase 6 — Deploy and connect Stripe webhooks

```powershell
npm run deploy
```

- [ ] In Stripe Dashboard, add `https://YOUR_DOMAIN/api/webhooks/stripe` as a live webhook endpoint.
- [ ] Subscribe to checkout completion, asynchronous payment success/failure, checkout expiration, refund, and dispute events used by the application.
- [ ] Put the live signing secret into `STRIPE_WEBHOOK_SECRET`.
- [ ] Make one low-value live payment and verify: D1 order, Stripe payment, ticket URL, Google Sheet row, admin sales, and refund behaviour.
- [ ] Check Stripe webhook delivery logs and confirm successful responses.

## Phase 7 — Protect administration and operate the shop

- [ ] Create a Cloudflare Access application covering `/admin*` on the production domain.
- [ ] Add an email allowlist for organisers only.
- [ ] Verify the Access identity header is present at the deployed Worker.
- [ ] Do not expose D1, R2, Stripe secrets, or the Google Sheet publicly.
- [ ] Create an admin runbook for publishing activities, changing stock, checking in tickets, collecting merchandise, issuing refunds, and exporting sales.
- [ ] Assign one person to monitor Stripe webhook failures and Google Sheet sync failures during sales.
- [ ] Back up/export paid orders before changing catalogue data or ending an edition.

## Launch checklist

- [ ] Production domain works over HTTPS.
- [ ] Catalogue, prices, stock, sale windows, translations, and images are correct.
- [ ] Privacy notice, purchase terms, refund policy, and contact email are visible.
- [ ] Stripe live payments and webhook signatures have been tested.
- [ ] Google Sheet receives exactly one row per paid order item.
- [ ] A cancelled/refunded order cannot enter an event.
- [ ] A ticket cannot be checked in twice.
- [ ] Merchandise cannot be marked collected twice accidentally.
- [ ] Admin Access works on a phone and desktop.
- [ ] A rollback/contact plan exists for a failed deployment or payment incident.

## Definition of “ready to sell”

The shop is ready when a real test payment can be traced end-to-end:

```text
Checkout -> reserved stock -> Stripe payment -> signed webhook
-> paid D1 order -> one-time stock confirmation -> ticket/pickup record
-> one Google Sheets row -> admin-visible sale
```

The redirect page is only informational. Stripe’s signed webhook, validated against the D1 order, is the payment authority.
