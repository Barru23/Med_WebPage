# XIVARRI — Project Spec

Ticketing and activities site for XIVARRI, the 14th promotion of Medicine at
Universitat de Girona (UdG).

This file is the source of truth for Claude Code. Read it before making changes.
If a decision here conflicts with an instruction in chat, ask before overriding.

---

## 1. Who this is for

**Buyers.** UdG medicine students, 18–25, arriving from an Instagram story link,
on a phone, at night, half-distracted. They must be able to buy in under 60
seconds without creating an account. Mobile is the primary target — desktop is
the afterthought, not the reverse.

**Admins.** 2–3 medicine students with zero technical background. They will not
read documentation. They will not use a terminal. Every admin task must be
doable from a form with labelled fields, on a phone if necessary. If a task
needs explanation, the design is wrong.

---

## 2. Hard constraints

| Constraint | Value |
|---|---|
| Budget | €0/month recurring, apart from the domain and Stripe transaction fees |
| Scale | Most activities under 100 people; peak 100–300 |
| Languages | Catalan (default), Spanish, English |
| Deadline | First small activity live within one month |
| Legal entity | Configured outside the repo (see §9). Do not hardcode a name. |

---

## 3. Stack

- **Framework:** Next.js (App Router) + TypeScript + Tailwind
- **Hosting:** Cloudflare Workers/Pages (free tier permits commercial use;
  Vercel's Hobby tier does not — do not deploy there)
- **Database:** Cloudflare D1 (SQLite)
- **File storage:** Cloudflare R2 (posters, merch photos)
- **Admin auth:** one **shared password**, held as the Cloudflare secret
  `ADMIN_PASSWORD` and never in the database or in Git. The session cookie is
  an HMAC signed with a separate secret, `ADMIN_SESSION_SECRET` (32+ random
  characters), never with the password, so a leaked signing key does not
  reveal the password. Rotating `ADMIN_SESSION_SECRET` logs everyone out at
  once; rotate both the day someone leaves the team. Checked in
  `src/proxy.ts` before any admin route runs, and again in the admin layout,
  the export route handler and every admin server action.
  A Cloudflare Access application over `/admin*` is an optional and recommended
  second layer, but it is no longer the only lock.
- **Payments:** Stripe Checkout (hosted). Cards + Apple/Google Pay + **Bizum**.
  Bizum is not optional — it is the majority payment method for this audience.
- **Email + live sheet:** a single **Google Apps Script** web app, owned by the
  shared `xivarri@…` account. The Stripe webhook posts a paid order to it once;
  the script appends the row to the sheet *and* emails the buyer their code.
  `MailApp` on a consumer Google account allows ~100 recipients/day, so email
  stays a *backup* delivery channel, never the primary one (see §6). Mail sent
  from a plain Gmail address lands in spam more often than mail from a verified
  domain — the on-screen code after payment is the channel that must work.
- **Excel:** `exceljs`, generated server-side on demand.

Buyers never create accounts. Guest checkout only, email address as identity.

---

## 4. Data model

One model covers tickets, merch, and trips. Do not create separate entities for
them — the difference is configuration, not structure.

```
Department
  id, slug, position
  name_ca, name_es, name_en
  photo_url            -- required; typographic fallback if missing

Activity
  id, slug, department_id, type: 'event' | 'merch' | 'trip'
  title_ca, title_es, title_en
  description_ca, description_es, description_en
  poster_url, starts_at, location, edition, published: bool
  max_per_order        -- units one buyer may take; NULL = no limit
  created_at

Variant                      -- belongs to Activity
  id, activity_id
  name_ca, name_es, name_en  -- "General", "Talla M", "Bus + entrada"
  price_cents, stock, sold
  sale_start, sale_end

Field                        -- belongs to Activity; extra checkout questions
  id, activity_id, position
  label_ca, label_es, label_en
  type: 'text' | 'number' | 'select' | 'checkbox'
  options_json, required: bool

Order
  id, activity_id, edition
  buyer_name, buyer_email, buyer_phone
  total_cents, currency
  status: 'pending' | 'paid' | 'cancelled' | 'refunded'
  payment_method: 'stripe' | 'manual'
  stripe_session_id, stripe_payment_intent
  created_at, paid_at

OrderItem
  id, order_id, variant_id, quantity
  field_answers_json
  ticket_code        -- short, unguessable, e.g. K7M2X9
  checked_in_at
```

**How each product type maps:**

- Party → Activity(`event`) + 2 Variants + 0 Fields
- Merch → Activity(`merch`) + one Variant per size + 0 Fields
- PortAventura → Activity(`trip`) + Variants (`amb bus` / `sense bus`) +
  Fields (DNI, allergies, emergency contact, bus stop)

Stock is decremented on **confirmed payment**, not on checkout start. Hold
inventory for 30 minutes during an open Stripe session, then release. Thirty,
not fifteen: Stripe refuses to create a Checkout Session that expires sooner,
and the hold has to outlast the session the buyer can still pay through.

---

## 4b. Departments and seed content

Three departments. Each Activity belongs to exactly one.

| Department | Seed activities |
|---|---|
| Activitats | Medifutbol · Medipadel · Mediportaventura · XIVARRI x Mirona Run Club |
| Festes | Medigala · Inici de curs |
| Merchan | Products as activities of `type: merch`, one Variant per size |

**Recurring activities reuse one record.** Medifutbol and Medipadel are edited
and re-opened rather than duplicated. To stop two seasons of buyers collapsing
into one list, Activity carries an `edition` label the admin sets when
re-opening ("Tardor 2026"), and every Order records the edition it was bought
under. The Sales dashboard and the Excel export default to the current edition,
with a dropdown for past ones. Without this, October's team sheet contains
March's players.

**Every seed activity is paid.** €0 variants stay valid in the model — a Variant
priced at zero skips Stripe, marks the order paid and confirms immediately — but
nothing at launch uses that path, so it is not a milestone to verify.

## 5. Internationalisation

Do NOT force admins to write three descriptions for every activity.

- **Interface strings** (buttons, labels, errors, emails) are translated once by
  developers and live in `messages/{ca,es,en}.json`. Admins never touch these.
- **Activity content** requires Catalan only. Spanish and English fields are
  optional and **fall back to Catalan** when empty.
- Language is chosen by a switcher in the header and persisted in a cookie.
  Default to Catalan. Route as `/[locale]/...`.

---

## 6. Payment and ticket flow

```
Buyer picks variants + fills fields
  → server creates Order(status=pending), holds stock 15 min
  → Stripe Checkout Session (cards, Bizum, wallets)
  → buyer pays
  → Stripe webhook → Order.status=paid, generate ticket_code per OrderItem
  → buyer redirected to /t/{ticket_code}
  → Apps Script relay: sheet row + email carrying the code
```

**The ticket lives at a URL, not in an attachment.** `/t/{ticket_code}` shows
the short code large enough to screenshot immediately, with the QR alongside it
for anyone who prefers to be scanned. **The code, not the QR, is what the door
runs on** — it is short, readable off a cracked screen, and works when the
email arrives but the link does not. Keeping delivery to a URL plus one email
is what survives 250 people buying in a single evening.

Never trust the redirect to confirm payment. The webhook is the only authority.
Verify the Stripe signature. Make the handler idempotent — Stripe retries.

Refunds are issued by admins in the Stripe dashboard, then reflected in the
site by marking the order refunded. No self-service refunds in v1.

---

## 7. Admin panel — exactly five screens

Everything lives under `/admin`, behind the shared password of §3. The check
runs in `src/proxy.ts`, *before* the route renders — a layout that declines to
render its children still lets those children query the database and ship the
answer inside the response payload.

**Departments.** The most boring screen in the panel: name in three languages,
photo, drag to reorder. Nothing else.

**Activities.** List with an "Arxivades" filter, plus a create/edit form:
department, title, poster upload, date, location, description, repeatable
variant rows (name / price / stock / sale window), optional custom question
rows, and a single **Publish** switch.

**Sales.** No dashboard is ever "created". One route, `/admin/sales/{slug}`,
renders for whichever activity is passed to it — so a dashboard exists the
moment an activity does and is gone when it is. Shows sold, revenue, remaining,
and the buyer list.

Two exports, and they are not equivalent:

- **Download Excel** — generated fresh from the database on every press. Columns
  adapt automatically to that activity's custom Fields. This is the source of
  truth. Coach manifest for a trip, size counts for merch.
- **Live Google Sheet** — a mirror, updated on each new paid order by the Apps
  Script relay of §3, idempotent on `order_id` so a Stripe retry cannot double
  a row. Convenient for sharing with non-admins and for several people reading
  at once. It is a copy and can go stale if the sync breaks, so never treat it
  as authoritative. Owned by the shared `xivarri@…` Google account, never a
  personal one.

**Door.** A phone page. Type the buyer's code — or scan their QR if they have
one — and get a large green or red result. Writes `checked_in_at` so a
screenshotted code cannot be reused. Typing must always work on its own: the
camera is the convenience, not the requirement.

The same screen searches buyers by name or email. Someone turning up without
their code is the most common incident there is, and the door is where that
conversation happens — so the fix belongs there, not on a sixth screen.

**Pickup.** For merch: search a name, tick collected.

**Deletion is blocked once an order exists.** An activity with paid orders
cannot be deleted — the delete button explains why and points at the Publish
switch instead. Deleting would destroy the record of real payments and
invalidate codes people are holding on their phones. Activities with zero
orders delete normally. Departments containing activities cannot be deleted
either.

Anything not on these five screens is deliberately a developer request. The
failure mode for student projects is an admin panel flexible enough for someone
to break the site with it.

---

## 8. Design direction

The brief pins this down: the site should look like the XIVARRI poster came
alive. Follow it exactly.

**Three templates, mapped to depth.** The site gets quieter and more precise as
the user commits. Same five colours and three typefaces throughout — only the
structure changes.

| Level | Page | Direction |
|---|---|---|
| 1 | Home — grid of departments | **C · Full de contactes.** Contact sheet of department photos, red grease-pencil rings, mono frame captions. |
| 2 | Department — its activities | **A · Cartell.** Bodoni bleeding off the edge, seam grid, torn poster tiles, marker annotations. |
| 3 | Activity — description, form, payment | **B · Història clínica.** Dotted leader fields, checkbox modalities, ruled boxes, red stamps. |

A department with no open activities keeps its tile, dims the photo, and reads
"cap activitat oberta". Never hide it — a vanishing tile makes the site look
broken.

Each Activity belongs to exactly one Department. Do not allow two.

**Instagram links bypass the homepage.** Stories link straight to
`/a/{activity-slug}` — level 3, form open. The contact-sheet homepage is for
browsing, not for someone who already knows what they want. Also put a thin
mono strip under the department grid listing what is on sale right now, so
nobody lands on the homepage and finds nothing to buy.

Deferred to v2, not v1: tapping a contact-sheet frame expands it into the
poster header of the department page. Sells the concept, fiddly to build.

**Colour** — five values, nothing else. Restraint is the identity.

```css
--bone:    #F2E7D8;  /* page ground */
--signal:  #E1281C;  /* the red; used for one thing per screen */
--ink:     #141414;  /* type */
--deep:    #B81E14;  /* pressed/hover state of signal */
--sand:    #DCCDB8;  /* hairlines, seams, disabled */
```

**Type** — three roles, all free on Google Fonts.

- Display: **Bodoni Moda** — the high-contrast Didone of the "XIVARRI" lockup.
  Huge, tight, and allowed to bleed off the edge of the viewport.
- Accent: **Permanent Marker** — the "FAREM MOLT" hand. Used sparingly, as
  annotation only.
- UI + body: **Archivo**. Ticket codes and admin tables: **JetBrains Mono**.

**Signature element — the seam grid.** The poster's defining move is a single
enormous word sliced across three Instagram tiles with visible seams. Carry that
into the web: section headings break across vertical hairline seams in `--sand`,
and panels offset by a few pixels on scroll so the seam reads as a deliberate
cut rather than a border. Ticket cards are torn poster tiles. This device, not
the cream-and-serif palette, is what should make the site recognisable.

**Second device — margin annotations.** Medicine students annotate notes by
hand. Important microcopy (a sold-out flag, "últimes places", a deadline) is set
in Permanent Marker with a hand-drawn circle or arrow, as if scrawled in a
margin. Never more than one per screen.

**Quality floor, not announced:** responsive to 360px, visible keyboard focus,
`prefers-reduced-motion` respected, contrast checked against `--bone`.

**Copy rules.** Active voice. A button says what happens: "Compra l'entrada",
not "Enviar". The same word survives the whole flow — if the button says
Publish, the confirmation says Published. Errors state what broke and what to do
next, without apologising. Empty states invite an action.

---

## 9. Legal and privacy constraints on the code

- **The merchant identity lives outside the repository.** The Stripe account,
  its holder and the legal identity shown on the site are configured in the
  Stripe dashboard and in Cloudflare variables (`LEGAL_CONTROLLER_NAME`,
  `LEGAL_CONTACT_EMAIL`). Never hardcode a person's name, ID or contact details
  in code, seed data, tests or documentation.
- Checkout stays closed outside localhost until those legal variables are set
  (`src/lib/legalConfig.ts`), and the legal pages read them at runtime.
- Terms of sale, including refund policy, are versioned (`TERMS_VERSION`) and
  their acceptance is recorded on every order.
- Cookie handling. Keep cookies to the strict minimum (locale + session) so the
  banner stays simple or unnecessary. No analytics in v1.
- Trips collect DNI and sometimes health-adjacent data (allergies). Store the
  minimum, delete after the activity, never log field answers.

---

## 10. Non-goals for v1

No buyer accounts. No shipping (merch is collected in person). No seat maps.
No discount codes. No waiting lists. No analytics. No native app.
No self-service refunds. No multi-promotion support — this site is XIVARRI's.

---

## 11. Build order

Work through these in order. Finish and verify each before starting the next.
Do not skip ahead to payments.

**1 — Scaffold.** Next.js + TypeScript + Tailwind. Cloudflare Workers target
(OpenNext). D1 bound and migrating. R2 bound for uploads. Fonts loaded. Design
tokens from §8 defined once, in one file, and used everywhere after.

**2 — Data layer.** Migrations for Department, Activity, Variant, Field, Order,
OrderItem. Seed script with the four departments and the activities in §4b.

**3 — Public pages, no payments.** The three templates: contact-sheet home,
Cartell department page, Història clínica activity page. Real data from D1.
Trilingual routing with Catalan fallback. This is the milestone to look at
together before going further.

**4 — Admin panel.** Shared-password gate on `/admin` per §3. Five screens per
§7. Departments, Activities with Duplicate, Sales, Door, Pickup. Deletion
blocked per the rule in §7.

**5 — Orders without Stripe.** Registration flow, `payment_method: 'manual'`,
admin marks paid, €0 variants skip payment entirely. Ticket at `/t/{code}`.
Excel download. This version is shippable for a first activity.

**6 — Stripe.** Test mode first. Checkout with cards and Bizum, webhook,
idempotent handler, stock held 15 minutes. Live keys only after the legal variables of §9 are set.

**7 — Extras.** The Apps Script relay of §3 — sheet row and buyer email in one
call from the webhook. Legal pages and the terms checkbox at checkout. Then
launch.



## Appendix — brief for Claude Design

> Design a mobile-first ticketing site for XIVARRI, the 14th medicine promotion
> at Universitat de Girona. Audience: Spanish medicine students aged 18–25
> arriving from an Instagram story, on a phone, at night.
>
> Palette, exactly: bone #F2E7D8 ground, signal red #E1281C, ink #141414,
> deep red #B81E14, sand #DCCDB8. Type: Bodoni Moda for display set very large
> and allowed to bleed off the edge; Permanent Marker for handwritten
> annotations only; Archivo for UI and body.
>
> The signature device is a seam grid: the identity comes from a single
> enormous word sliced across three panels with visible hairline seams, as on
> the promotion's Instagram grid. Headings break across seams. Ticket cards look
> like torn poster tiles. One margin annotation per screen in Permanent Marker,
> never more.
>
> Screens: (1) home with upcoming activities, (2) activity detail with ticket
> types, (3) checkout with buyer details and custom questions, (4) the ticket
> page showing a large, screenshot-friendly code, (5) admin activity editor,
> (6) admin sales dashboard with an Excel download.
>
> Keep it to three colours per screen. Spend the boldness on the seam grid and
> keep everything else quiet.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
