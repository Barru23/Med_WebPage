# XIVARRI — Ticketing and Activities Platform

Ticketing and activities site for **XIVARRI**, the 14th promotion of Medicine at the **Universitat de Girona (UdG)**.

This is a mobile-first, high-performance web application designed for students to easily purchase event tickets, merchandise, and trips, and for administrators to manage sales, check-ins, and collections with zero technical background.

---

## 🛠 Tech Stack

- **Framework:** Next.js (App Router) + TypeScript + Tailwind CSS
- **Hosting/Runtime:** Cloudflare Workers / Pages (free tier) via `@opennextjs/cloudflare`
- **Database:** Cloudflare D1 (SQLite)
- **File Storage:** Cloudflare R2
- **Authentication (Admin):** Cloudflare Access (Zero Trust) with email allowlist
- **Payments:** Stripe Checkout (supporting Cards, Google Pay/Apple Pay, and Bizum)
- **Email:** Resend (backup delivery channel)
- **Exports:** `exceljs` (server-side Excel generation)

---

## 📋 Key Features

- **Guest-First Checkout:** Buyers can purchase items in under 60 seconds without creating an account.
- **Unified Data Model:** Supports events, merchandise, and trips using a single entity structure.
- **Admin Dashboard (5 Screens):**
  - **Departments:** Manage categories (Activitats, Festes, Merchan) and reorder them.
  - **Activities:** Create and edit activities, variants (e.g., sizes, bus options), custom fields (e.g., DNI, allergies), and toggle publishing.
  - **Sales:** Event-specific dashboard tracking revenue, stock, and buyer details.
  - **Door Check-in:** Mobile-friendly QR code scanner to validate tickets and record check-ins.
  - **Pickup:** Track merchandise collections.
- **Trilingual Support:** Catalan (default), Spanish, and English (interface + fallback content).

---

## 🚀 Getting Started

### Prerequisites

- Node.js (v18+)
- npm / package manager
- Cloudflare Wrangler CLI (`npm i -g wrangler`)

### Local Setup

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Initialize Local Database & Migrations:**
   ```bash
   # Run migrations locally
   npm run db:migrate:local

   # Seed initial database records (departments and seed activities)
   npm run db:seed:local
   ```

3. **Run the Development Server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Build and Deployment

- **Preview wrangler build locally:**
   ```bash
   npm run preview
   ```
- **Deploy to Cloudflare:**
   ```bash
   npm run deploy
   ```

---

## 🗃 Data Model

```
Department (id, slug, position, name_ca, name_es, name_en, photo_url)
  └── Activity (id, slug, department_id, type ['event'|'merch'|'trip'], title, description, poster_url, starts_at, location, edition, published)
        ├── Variant (id, activity_id, name, price_cents, stock, sold, sale_start, sale_end)
        ├── Field (id, activity_id, position, label, type, options_json, required)
        └── Order (id, activity_id, edition, buyer_name, buyer_email, buyer_phone, total_cents, currency, status, payment_method, stripe_session_id, stripe_payment_intent, created_at, paid_at)
              └── OrderItem (id, order_id, variant_id, quantity, field_answers_json, ticket_code, checked_in_at)
```

---

## ⚖ License

This project is proprietary to the XIVARRI promotion of Medicine at UdG. All rights reserved.
