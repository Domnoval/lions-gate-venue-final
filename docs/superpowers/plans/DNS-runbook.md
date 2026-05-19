# DNS Cutover — lionsgatevenue.com → lionsgate-venue (Netlify)

Operator-run checklist. ~30 min in dashboards plus DNS propagation
(usually under an hour, occasionally up to 24h).

## Current state
- Domain: `lionsgatevenue.com` registered at **Hostinger**; operator has the
  Hostinger login.
- Site: Netlify project `lionsgate-venue`, git-linked to `main`, currently
  served at `https://lionsgate-venue.netlify.app`.
- No custom domain yet.

## Step 1 — Add the custom domains in Netlify
- Netlify → Sites → `lionsgate-venue` → **Domain management** →
  **Add a domain** → enter `lionsgatevenue.com` → confirm ownership.
- Then **Add domain alias** → `www.lionsgatevenue.com`.
- Set **Primary domain** to `lionsgatevenue.com` (apex). `www` will redirect
  to apex.

## Step 2 — Decide the DNS method (gate on Mark's email)
**In Hostinger DNS for `lionsgatevenue.com`, check for MX records.**

- **MX records exist** (Mark has email on this domain):
  Keep DNS at Hostinger. Do not change nameservers. Add two records:
  - `A` record, host `@`, value `75.2.60.5` (Netlify's load balancer)
  - `CNAME` record, host `www`, value `lionsgate-venue.netlify.app`
  Leave the existing `MX` records and any other records untouched.

- **No MX records** (no email on this domain):
  Easier — delegate to Netlify DNS. In Netlify's Add Domain flow, copy
  the Netlify nameservers (4 hostnames). In Hostinger → Domains →
  Nameservers, switch to "Use custom nameservers" and paste the 4 Netlify
  NS hostnames. Save.

## Step 3 — Force HTTPS + verify cert
- Netlify auto-provisions a Let's Encrypt certificate once DNS resolves to
  Netlify. This may take a few minutes after DNS propagates.
- In Domain management, enable **Force HTTPS** once the cert shows green.

## Step 4 — Verify
- `curl -sI https://lionsgatevenue.com` → expect HTTP 200 and a valid cert.
- `curl -sI https://www.lionsgatevenue.com` → expect 301/308 redirect to
  the apex (or whichever direction was chosen).
- Cache-busted browser fetch: `https://lionsgatevenue.com/?cb=1` shows the
  current site (no Formspree, favicon present), assets return 200.
- If photos seeded with origin-relative paths are used (the CMS seed),
  confirm they still resolve at the new domain — they should, since the
  same Netlify build serves both hostnames.

## Step 5 — Optional cleanup
- Once apex+www are serving, you can mark `lionsgate-venue.netlify.app` as
  hidden in Netlify (or just stop linking it). The two stale Netlify
  projects `lionsgate-intro` and `lionsgate-aperture` can be deleted at
  the operator's discretion.

## Rollback
- If something goes wrong: in Hostinger, restore the prior DNS records
  (Hostinger keeps a recent history). The Netlify project keeps running
  on its `.netlify.app` URL regardless.
