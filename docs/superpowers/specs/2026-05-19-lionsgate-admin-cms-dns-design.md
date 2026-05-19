# Lionsgate — Custom Domain + Mark-Editable Admin (Design Spec)

Date: 2026-05-19
Site: `lionsgate-venue` on Netlify (git-linked to `main`, auto-deploys)
Domain: `lionsgatevenue.com` (registered at Hostinger; Studio 137 has the logins)

## Goal

Two independent deliverables:

1. **DNS** — serve the site at `lionsgatevenue.com` (+ `www`) with HTTPS,
   instead of `lionsgate-venue.netlify.app`.
2. **Admin CMS** — give Mark a simple, safe place to change the words and
   swap/add photos on the parts of the site he actually touches, **without
   any ability to break the layout or structure**. "Hostinger-builder easy"
   for him; guard-railed so the worst he can do is type an odd sentence or
   upload an odd photo (both trivially reversible).

Chosen approach: **scope of "C" on the architecture of "A"** — the proven
Twin City pattern (Supabase single-row JSON + `admin.html` + hardcoded
fallback), but only the volatile content is wired. Follows the
`shipping-supabase-vercel-sites` playbook.

## Workstream 1 — DNS (small, known recipe)

- Add `lionsgatevenue.com` and `www.lionsgatevenue.com` as custom domains on
  the Netlify `lionsgate-venue` site.
- **Before changing nameservers, check Hostinger for existing MX (email)
  records on the domain.**
  - If Mark has email on the domain via Hostinger → keep Hostinger DNS, add
    only an `A` record (apex → Netlify load balancer `75.2.60.5`) and a
    `CNAME` (`www` → `lionsgate-venue.netlify.app`). Preserves email.
  - If no email → delegate nameservers at Hostinger to Netlify DNS (simpler,
    Netlify manages apex/www + auto-SSL).
- Netlify auto-provisions Let's Encrypt SSL. Set primary domain + force HTTPS.
- Verify: apex and `www` both resolve, HTTPS valid, redirects to the primary
  host, site serves the current build.
- No code change. No Mark dependency. ~30 min work + DNS propagation.

## Workstream 2 — Admin CMS

### Architecture

- New **Supabase** project (free tier; created by Studio 137).
- Table `site_content`: `id int primary key`, `content jsonb`,
  `updated_at timestamptz default now()`. Exactly one row, `id = 1`.
- Storage bucket `site-photos`: public read, authenticated write.
- `index.html` gains a small **CMS loader** as an **inline `<script>` block**
  at the end of `index.html` (consistent with the site's existing inline-JS,
  single-file, no-build nature; one fewer request; nothing to cache-bust):
  on `DOMContentLoaded` it fetches row `id=1` with the Supabase **anon /
  publishable key** (safe in client; RLS makes it read-only). For each wired
  field: if a non-empty value is present, write it into the DOM (`textContent`
  for copy, `src` for images); otherwise **leave the existing hardcoded
  markup untouched**.
- **Graceful degradation is the core invariant:** Supabase unreachable, slow,
  empty, or any individual field blank ⇒ the site renders exactly as it does
  today from hardcoded HTML. The DB is an *override layer*, never a
  dependency. No loading spinners, no layout shift on the critical content
  (defaults are already in the HTML; the loader swaps text/src in place).

### Wired content model (the only editable surface)

`content` JSON, all keys optional, unknown/missing ⇒ hardcoded default:

```
{
  "hero":        { "eyebrow", "headline", "body" },
  "spaces":      [ { "tag", "name", "desc", "img" } x6 ],
  "pricing":     [ { "name", "desc", "rate" } x3 ],
  "testimonials":[ { "quote", "attribution" } x2 ],
  "photos": {
     "essenceBg", "ledHero", "ledPortrait",
     "dayImg", "nightImg"
  }
}
```

- Copy fields are plain text (the site supplies all styling; no rich text,
  no HTML allowed — loader uses `textContent`, which also neutralizes
  injection).
- Image fields are URLs into the `site-photos` bucket; absent ⇒ the current
  `photos/…` path in the HTML stands.
- **Explicitly NOT wired in v1 (YAGNI / risk):** section structure, ordering,
  the LED bio prose blocks, navigation, any CSS, the descent-free flow.
  Architecture allows widening field-by-field later with zero rework.

### Admin UX (`admin.html` at `/admin`)

- Static `admin.html` in repo root → `lionsgatevenue.com/admin`. **Vanilla
  JS + the Supabase JS client via CDN** (`@supabase/supabase-js` script tag),
  no build step — matches the rest of the site (which is now vanilla after
  the descent strip).
- Supabase Auth email/password. **One account (Mark's)**, created by Studio
  137; Mark gets/resets the password. Anon = read only; only the
  authenticated session may UPDATE.
- Layout: **form left, live preview (iframe of the site) right.** Left is
  collapsible groups — *Hero*, *The Spaces*, *Pricing*, *Testimonials*,
  *Photos*. Each item is a labeled `input`/`textarea`; each photo a thumbnail
  + "Replace photo" (uploads to `site-photos`, stores returned public URL).
- Guard rails:
  - Mark never sees HTML/JSON.
  - Per-field **character counters** with soft limits tuned so copy can't
    overflow the layout.
  - Per-field **"Revert to original"** restores the hardcoded default
    (clears that key).
  - Cannot add/remove/reorder anything — fixed set of fields mirrors the
    structure; structure is not represented in data.
  - Client validates types/lengths before writing the structured object
    (never a raw blob the user typed).
- Save flow: edit → reflected in live preview → **Publish** → writes the one
  row. Live site reflects on next load (runtime data; no redeploy).

### Security

- Anon/publishable key embedded in `index.html`/`admin.html` is acceptable —
  RLS policy: `anon` may `SELECT` only; `authenticated` may `UPDATE` row
  `id=1` and `INSERT`/`UPDATE` into `site-photos`. Service-role key is **never**
  committed (repo is public).
- RLS enforced at the database, not the client — the read-only guarantee
  holds even though the key is public (same model as Twin City).

### Rollout (safe cutover)

1. Stand up Supabase (project, table, RLS, bucket, Mark's auth user).
2. **Seed row `id=1` with today's exact live content** → site is
   byte-identical; the CMS is armed but invisible until Mark edits.
3. Ship `cms-loader` + `admin.html` via `feature/admin-cms` → PR → merge →
   auto-deploy (git-linked).
4. DNS workstream (independent; can run before or after).

### Verification

- **Fallback proven:** load site with the Supabase host blocked
  (Playwright route-abort) → visually identical to today; no console errors;
  then `unroute` + hard reload before judging live state (playbook caveat).
- Seed parity: with seed data, live DOM == pre-CMS DOM.
- Round trip: log into `/admin`, change a headline + replace a photo,
  Publish, load the real site (no route) → change is live.
- Negative: blank a field → reverts to hardcoded default gracefully; odd
  input → no layout break.
- Auth: anon cannot write (RLS rejects); Mark can; bad password rejected.
- Mobile + desktop; no new console errors; assets 200.

## Out of scope (YAGNI)

Multi-user/roles, draft/scheduling/versioning, rich-text editor, editing
layout/sections/order, LED bio editing, analytics, i18n. The contact-form
notification email (Mark's real inbox) is a separate, already-known follow-up
and not part of this work.

## Human/Mark prerequisites

- Studio 137 creates the Supabase project and Mark's admin account.
- Decision needed at DNS time: does `lionsgatevenue.com` carry Mark's email
  at Hostinger? (Checked from the Hostinger DNS panel — gates the DNS method.)
- Mark receives the `/admin` URL + credentials after verification.

## Open question for spec review

None blocking. Field soft-limit character counts will be set during
implementation by measuring the live layout (empirical, not guessed).
