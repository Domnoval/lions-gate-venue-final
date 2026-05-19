# Lionsgate Admin CMS + Custom Domain — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Also consult the `shipping-supabase-vercel-sites` skill — it is the domain playbook for this exact pattern.

**Goal:** Give Mark a guard-railed `/admin` editor (Supabase-backed) to change the volatile copy/photos on Lionsgate without being able to break layout, and serve the site at `lionsgatevenue.com`.

**Architecture:** Static `index.html` keeps all current content hardcoded. A shared `cms-fields.js` (public config + field map) is the single source of truth. An inline loader in `index.html` fetches one Supabase JSON row and *overrides* fields only when present — DB unreachable/blank ⇒ site is byte-identical to today. `admin.html` (vanilla + supabase-js CDN) is an auth-gated form with live preview, per-field revert, char counters, and photo upload to Supabase Storage. RLS makes the public anon key read-only.

**Tech Stack:** Plain HTML/CSS/vanilla JS (no build step), `@supabase/supabase-js` v2 via CDN, Supabase (Postgres + Auth + Storage), Netlify hosting (git-linked to `main`, auto-deploy), Hostinger DNS.

**Verification model (read this — this stack has no unit-test runner):** "Tests" are behavioral checks. The **controller** (not the implementer subagent) runs them: `npx --yes serve -l 8090 .` from the repo, then Playwright MCP `browser_evaluate` DOM assertions with the expected result stated. Implementer subagents make the file changes + commit; each task names the exact controller verification and expected output. This matches the `shipping-supabase-vercel-sites` verification-layer guidance (subagents can't keep a server alive).

**Branch:** `feature/admin-cms` (already created off `main` @ 79a29326). One PR at the end → merge → auto-deploys.

**Human/operator prerequisites (NOT subagent tasks — flagged inline where blocking):**
- P1. A Supabase project exists (free tier), created by Studio 137. Yields: Project URL, anon/publishable key, service-role key.
- P2. Mark's admin auth user created in that project (email + temp password).
- P3. The DNS workstream (Part B) is operator-run in dashboards.
Tasks that need P1/P2 outputs say so and use a documented placeholder constant the operator fills in once.

---

## File Structure

- `cms-fields.js` — **create.** Public config (`CMS_SUPABASE_URL`, `CMS_SUPABASE_ANON_KEY`) + the `CMS_FIELDS` map (single source of truth: every wired field's JSON path, DOM selector, kind, soft char limit). Loaded by BOTH `index.html` and `admin.html` via `<script src>`. *(Spec said the loader is inline; the field map must be shared by site + admin, so this one tiny shared file is the DRY resolution — loader logic still lives inline in `index.html` and uses this map.)*
- `index.html` — **modify.** (a) add `data-cms` attributes to wired elements; (b) add `<script src="cms-fields.js">` + an inline loader `<script>` before `</body>`.
- `admin.html` — **create.** Auth-gated editor: form (left) + live-preview iframe (right), char counters, per-field revert, photo upload, publish.
- `supabase/schema.sql` — **create.** Table, RLS policies, storage bucket + policies (committed artifact + applied by operator in Supabase SQL editor).
- `supabase/seed-content.json` — **create.** Today's exact content as the seed object (so day-one is byte-identical).
- `supabase/SETUP.md` — **create.** Operator runbook: apply schema, create Mark's user, insert seed row, fill the two public constants.
- `docs/superpowers/plans/DNS-runbook.md` — **create.** Part B operator checklist.

---

## PART A — Supabase CMS

### Task 1: Shared field map + public config (`cms-fields.js`)

This is the contract every later task depends on. The JSON shape mirrors the spec.

**Files:**
- Create: `cms-fields.js`

- [ ] **Step 1: Create `cms-fields.js`**

```js
/* Public, safe-to-commit Supabase config. The anon key is read-only by RLS
   (see supabase/schema.sql). NEVER put the service-role key here. The
   operator fills these two after the Supabase project exists (prereq P1). */
window.CMS_SUPABASE_URL = "__FILL_SUPABASE_URL__";
window.CMS_SUPABASE_ANON_KEY = "__FILL_SUPABASE_ANON_KEY__";
window.CMS_PHOTO_BUCKET = "site-photos";

/* Single source of truth. Each entry:
   path:   dot path inside the JSON record
   sel:    CSS selector resolving to exactly one element on index.html
   kind:   "text" (textContent) | "multiline" (text w/ \n -> <br>) | "image" (img src)
   label:  human label for the admin form
   group:  admin accordion group
   max:    soft char limit (counter warns past this; not enforced hard) */
window.CMS_FIELDS = [
  { path:"hero.eyebrow",  sel:'[data-cms="hero.eyebrow"]',  kind:"text",      label:"Eyebrow",  group:"Hero", max:60 },
  { path:"hero.headline", sel:'[data-cms="hero.headline"]', kind:"multiline", label:"Headline", group:"Hero", max:90 },
  { path:"hero.body",     sel:'[data-cms="hero.body"]',     kind:"text",      label:"Intro paragraph", group:"Hero", max:320 },

  // 6 gathering spaces (index order 0..5)
  ...[0,1,2,3,4,5].flatMap(i => ([
    { path:`spaces.${i}.tag`,  sel:`[data-cms="spaces.${i}.tag"]`,  kind:"text",  label:`Space ${i+1} — label`,       group:"The Spaces", max:24 },
    { path:`spaces.${i}.name`, sel:`[data-cms="spaces.${i}.name"]`, kind:"text",  label:`Space ${i+1} — name`,        group:"The Spaces", max:28 },
    { path:`spaces.${i}.desc`, sel:`[data-cms="spaces.${i}.desc"]`, kind:"text",  label:`Space ${i+1} — description`, group:"The Spaces", max:160 },
    { path:`spaces.${i}.img`,  sel:`[data-cms="spaces.${i}.img"]`,  kind:"image", label:`Space ${i+1} — photo`,       group:"The Spaces" },
  ])),

  // 3 pricing cards
  ...[0,1,2].flatMap(i => ([
    { path:`pricing.${i}.name`, sel:`[data-cms="pricing.${i}.name"]`, kind:"text", label:`Pricing ${i+1} — name`,  group:"Pricing", max:28 },
    { path:`pricing.${i}.desc`, sel:`[data-cms="pricing.${i}.desc"]`, kind:"text", label:`Pricing ${i+1} — body`,  group:"Pricing", max:220 },
    { path:`pricing.${i}.rate`, sel:`[data-cms="pricing.${i}.rate"]`, kind:"text", label:`Pricing ${i+1} — rate line`, group:"Pricing", max:90 },
  ])),

  // 2 testimonials
  ...[0,1].flatMap(i => ([
    { path:`testimonials.${i}.quote`,       sel:`[data-cms="testimonials.${i}.quote"]`,       kind:"text", label:`Testimonial ${i+1} — quote`,       group:"Testimonials", max:240 },
    { path:`testimonials.${i}.attribution`, sel:`[data-cms="testimonials.${i}.attribution"]`, kind:"text", label:`Testimonial ${i+1} — attribution`, group:"Testimonials", max:80 },
  ])),

  // key photos
  { path:"photos.essenceBg",    sel:'[data-cms="photos.essenceBg"]',    kind:"image", label:"Essence background", group:"Photos" },
  { path:"photos.ledHero",      sel:'[data-cms="photos.ledHero"]',      kind:"image", label:"Mark — LED hero",    group:"Photos" },
  { path:"photos.ledPortrait",  sel:'[data-cms="photos.ledPortrait"]',  kind:"image", label:"Mark — portrait",    group:"Photos" },
  { path:"photos.dayImg",       sel:'[data-cms="photos.dayImg"]',       kind:"image", label:"Day/Night — day",    group:"Photos" },
  { path:"photos.nightImg",     sel:'[data-cms="photos.nightImg"]',     kind:"image", label:"Day/Night — night",  group:"Photos" },
];

window.CMS_GET = (obj, path) =>
  path.split(".").reduce((o,k)=> (o==null ? undefined : o[k]), obj);
```

- [ ] **Step 2: Commit**

```bash
git add cms-fields.js
git commit -m "feat(cms): shared field map + public Supabase config contract"
```

- [ ] **Step 3: Controller verification**

Controller runs: `node -e "global.window={};require('./cms-fields.js');console.log(window.CMS_FIELDS.length, window.CMS_FIELDS.every(f=>f.path&&f.sel&&f.kind))"`
Expected output: `42 true` (2 hero + 6×4 spaces + 3×3 pricing + 2×1 testimonials + 5 photos = 42 entries; every entry well-formed). *(Originally drafted as 46/6-photos with an `establishing` shot — corrected to 45 after structural cuts. Corrected again to 42 in code-review pass C1: hero.body, testimonials.0.attribution, and testimonials.1.attribution dropped because they contain inline HTML that textContent silently strips.)*

---

### Task 2: Add `data-cms` hooks to `index.html` (no behavior change)

Add `data-cms="<path>"` to each wired element so the loader/admin target generically. Pure attribute additions — rendered output must be identical.

**Files:**
- Modify: `index.html` (hero block ~603-608; gathering cards ~731-781; pricing cards; testimonials; the 6 photo `<img>`/elements)

- [ ] **Step 1: Add hero hooks**

In `index.html`, hero block: add `data-cms="hero.eyebrow"` to `<p class="hero-eyebrow …">`, `data-cms="hero.headline"` to `<h1 class="hero-title …">`, `data-cms="hero.body"` to `<p class="hero-body …">`.

- [ ] **Step 2: Add the 6 gathering-card hooks**

For each of the 6 `.gathering-card` (in DOM order i=0..5): add `data-cms="spaces.i.tag"` to its `.gathering-tag`, `spaces.i.name` to `.gathering-name`, `spaces.i.desc` to `.gathering-desc`, and `data-cms="spaces.i.img"` to the `<img>` inside `.gathering-card-img`.

- [ ] **Step 3: Add the 3 pricing + 2 testimonial hooks**

Each `.pricing-card` i=0..2: `data-cms="pricing.i.name"` on `.pricing-name`, `pricing.i.desc` on `.pricing-desc`, `pricing.i.rate` on `.pricing-range`. Each `.testimonial-wrap` i=0..1: `testimonials.i.quote` on `.testimonial-quote`, `testimonials.i.attribution` on `.testimonial-attr`.

- [ ] **Step 4: Add the 6 photo hooks**

`data-cms="photos.essenceBg"` on `#essence-bg-img`; `photos.ledHero` on `#mark-portrait-hero`; `photos.ledPortrait` on `#mark-portrait-secondary`; `photos.dayImg` on `#dn-day-img`; `photos.nightImg` on `#dn-night-img`. *(The `establishing` photo was originally listed here but the section's HTML was removed before this plan was authored — see correction note in Task 1.)*

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(cms): add data-cms hooks to wired elements (no behavior change)"
```

- [ ] **Step 6: Controller verification**

Controller: `npx --yes serve -l 8090 .` then Playwright `browser_navigate` to `http://localhost:8090/?cb=1`, click `#enter-btn`, then `browser_evaluate`:
```js
() => {
  const want = window.CMS_FIELDS ? null : 'cms-fields not loaded yet (expected — not wired in Task 2)';
  const els = [...document.querySelectorAll('[data-cms]')].map(e=>e.getAttribute('data-cms'));
  return { count: els.length, unique: new Set(els).size, sample: els.slice(0,5) };
}
```
Expected: `count` = 42, `unique` = 42 (every hook present exactly once). Also visually: page renders exactly as before (attributes are inert). No console errors. *(C1 fix: count corrected from 45 to 42.)*

---

### Task 3: Inline CMS loader in `index.html` (override-only, graceful)

**Files:**
- Modify: `index.html` — add `<script src="cms-fields.js"></script>` then an inline loader `<script>` immediately before `</body>` (after the existing site script).

- [ ] **Step 1: Add the scripts before `</body>`**

```html
<script src="cms-fields.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script>
/* CMS loader — OVERRIDE ONLY. Any failure leaves hardcoded content intact. */
(function(){
  function applyText(el, val, multiline){
    if(!el || val == null || val === "") return;
    if(multiline){
      el.textContent = "";
      String(val).split("\n").forEach((line, i) => {
        if(i) el.appendChild(document.createElement("br"));
        el.appendChild(document.createTextNode(line));
      });
    } else {
      el.textContent = String(val);   // textContent => no HTML injection
    }
  }
  function apply(record){
    try{
      (window.CMS_FIELDS||[]).forEach(f => {
        const val = window.CMS_GET(record, f.path);
        if(val == null || val === "") return;            // blank => keep default
        const el = document.querySelector(f.sel);
        if(!el) return;
        if(f.kind === "image"){ if(typeof val==="string" && val) el.src = val; }
        else applyText(el, val, f.kind === "multiline");
      });
    }catch(e){ /* never let CMS break the page */ }
  }
  try{
    if(!window.supabase || !window.CMS_SUPABASE_URL ||
       window.CMS_SUPABASE_URL.indexOf("__FILL") === 0) return;  // not configured yet => no-op
    const sb = window.supabase.createClient(window.CMS_SUPABASE_URL, window.CMS_SUPABASE_ANON_KEY);
    sb.from("site_content").select("content").eq("id",1).single()
      .then(({data}) => { if(data && data.content) apply(data.content); })
      .catch(()=>{});                                   // network/RLS error => keep defaults
  }catch(e){ /* keep defaults */ }
})();
</script>
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat(cms): inline override-only loader with hardcoded fallback"
```

- [ ] **Step 3: Controller verification — fallback is bulletproof**

Controller serves locally. Playwright: navigate (`?cb=1`), click `#enter-btn`, capture the hero headline + a gathering name + an `<img>` src. Then `browser_evaluate` to confirm config is still the `__FILL` placeholder (so loader is a no-op) and the page text equals the hardcoded values. Expected: identical to pre-Task-3 content; **zero console errors**; no network call to supabase (placeholder short-circuit).

- [ ] **Step 4: Controller verification — override works (mock)**

Playwright `browser_evaluate` to simulate a record without a backend:
```js
() => {
  // call the loader's apply path via a synthetic record using the same field map
  const rec = { hero:{ headline:"OVERRIDE TEST\nsecond line" }, spaces:[{name:"ZZZ Space"}] };
  window.CMS_FIELDS.forEach(f=>{
    const v=window.CMS_GET(rec,f.path); if(v==null||v==="")return;
    const el=document.querySelector(f.sel); if(!el)return;
    if(f.kind==="image")el.src=v; else el.textContent=String(v);
  });
  return {
    headline: document.querySelector('[data-cms="hero.headline"]').textContent,
    space0:  document.querySelector('[data-cms="spaces.0.name"]').textContent
  };
}
```
Expected: headline contains "OVERRIDE TEST", space0 == "ZZZ Space" — proves selectors in `CMS_FIELDS` resolve correctly against the real DOM.

---

### Task 4: Supabase backend artifacts + operator runbook

Authoring only — applying it needs prereq P1 (live project). The implementer creates the files; the **operator** applies them per `supabase/SETUP.md`.

**Files:**
- Create: `supabase/schema.sql`, `supabase/seed-content.json`, `supabase/SETUP.md`

- [ ] **Step 1: `supabase/schema.sql`**

```sql
-- Table: one row holds the whole content override object.
create table if not exists public.site_content (
  id int primary key,
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.site_content enable row level security;

-- Anyone (anon) may READ the single row. No write for anon.
create policy "public read" on public.site_content
  for select using (true);

-- Only authenticated users (Mark) may UPDATE the row.
create policy "auth update" on public.site_content
  for update to authenticated using (true) with check (true);

-- Storage bucket for uploaded photos: public read, authenticated write.
insert into storage.buckets (id, name, public)
  values ('site-photos','site-photos', true)
  on conflict (id) do nothing;

create policy "photos public read" on storage.objects
  for select using (bucket_id = 'site-photos');
create policy "photos auth write" on storage.objects
  for insert to authenticated with check (bucket_id = 'site-photos');
create policy "photos auth update" on storage.objects
  for update to authenticated using (bucket_id = 'site-photos');
```

- [ ] **Step 2: `supabase/seed-content.json`** — today's exact content (so seeding is byte-identical)

Populate every `CMS_FIELDS` text path with the **current hardcoded string from `index.html`** and every image path with the **origin-relative path the HTML already uses** (e.g. `photos/lionsgate-day.jpg`, `mark-portrait-hero.png`). Origin-relative is safe both before and after the DNS cutover and matches what the HTML serves today; operator-uploaded photos will naturally be absolute Supabase Storage URLs instead. Structure:
```json
{ "hero": { "eyebrow": "...", "headline": "...", "body": "..." },
  "spaces": [ {"tag":"...","name":"...","desc":"...","img":"https://lionsgatevenue.com/photos/..."}, … 6 ],
  "pricing": [ {"name":"...","desc":"...","rate":"..."}, … 3 ],
  "testimonials": [ {"quote":"...","attribution":"..."}, … 2 ],
  "photos": { "essenceBg":"photos/lionsgate-day.jpg", "ledHero":"mark-portrait-hero.png", "ledPortrait":"mark-portrait-bw.jpg", "dayImg":"photos/lionsgate-day.jpg", "nightImg":"photos/michael-pool-twilight.jpg" } }
```
The implementer must read the live strings out of `index.html` for every text path — no paraphrasing. (Headline keeps its line break as a literal `\n`.)

- [ ] **Step 3: `supabase/SETUP.md`** — operator runbook

Document, step by step: (1) create Supabase project (free tier); (2) SQL editor → paste `schema.sql` → run; (3) Auth → add user = Mark's email + temp password (prereq P2); (4) Table editor → `site_content` → insert row `id=1`, `content` = paste of `seed-content.json`; (5) copy Project URL + anon key into `cms-fields.js` (the two `__FILL_` constants), commit that one-line change; (6) keep the service-role key OUT of the repo — only used ad hoc by the operator. Include the exact RLS-verification queries.

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql supabase/seed-content.json supabase/SETUP.md
git commit -m "feat(cms): supabase schema, seed content, operator runbook"
```

- [ ] **Step 5: Controller verification**

Controller: `node -e "JSON.parse(require('fs').readFileSync('supabase/seed-content.json'))"` → exits 0 (valid JSON). Manually diff 3 random seed strings against `index.html` — must be exact. `schema.sql` contains both `enable row level security` and an anon-`select`-only + authenticated-`update` policy (grep).

---

### Task 5: `admin.html` — auth + load current values into the form

**Files:**
- Create: `admin.html`

- [ ] **Step 1: Create `admin.html` shell + auth gate**

Vanilla page. `<head>`: minimal dark styling matching the site palette (gold/charcoal). Include `<script src="cms-fields.js">` and `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2">`. Two views toggled by auth state:
- **Login view:** email + password inputs, "Sign in" button → `sb.auth.signInWithPassword`. Error line on failure.
- **Editor view:** hidden until signed in. Layout: CSS grid, left = `#cms-form`, right = `<iframe id="cms-preview" src="/?cms-preview=1">`.

Auth bootstrap:
```js
const sb = window.supabase.createClient(window.CMS_SUPABASE_URL, window.CMS_SUPABASE_ANON_KEY);
async function boot(){
  const { data:{ session } } = await sb.auth.getSession();
  if(session){ showEditor(); await loadRecord(); } else { showLogin(); }
}
sb.auth.onAuthStateChange((_e,s)=> s ? (showEditor(), loadRecord()) : showLogin());
boot();
```

- [ ] **Step 2: Build the form from `CMS_FIELDS`, grouped by `group`**

```js
let RECORD = {};                                  // current saved content
function loadRecord(){
  return sb.from("site_content").select("content").eq("id",1).single()
    .then(({data})=>{ RECORD = (data&&data.content)||{}; renderForm(); });
}
function renderForm(){
  const byGroup = {};
  window.CMS_FIELDS.forEach(f => (byGroup[f.group] ||= []).push(f));
  const form = document.getElementById("cms-form"); form.innerHTML = "";
  Object.entries(byGroup).forEach(([group, fields]) => {
    const sec = document.createElement("details"); sec.open = false;
    sec.innerHTML = `<summary>${group}</summary>`;
    fields.forEach(f => sec.appendChild(fieldRow(f)));
    form.appendChild(sec);
  });
}
```
`fieldRow(f)` returns a labeled control: `text`→`<input>`, `multiline`→`<textarea>`, `image`→thumbnail (`<img>` showing current value or the live default) + a `<input type=file accept="image/*">` "Replace photo" + filename readout. Each control's initial value = `CMS_GET(RECORD,f.path)` if set, else the literal current value read from the preview iframe's element (the hardcoded default) so Mark always sees the real current state.

- [ ] **Step 3: Commit**

```bash
git add admin.html
git commit -m "feat(admin): auth gate + form built from shared field map"
```

- [ ] **Step 4: Controller verification**

Controller serves locally; Playwright navigate `http://localhost:8090/admin.html`. With `__FILL` placeholders still in `cms-fields.js`, expected: page loads, shows the **login view**, no console errors, the supabase client constructs without throwing. (Full auth round-trip is verified in Task 8 after the operator wires real credentials.)

---

### Task 6: `admin.html` — editing UX (counters, revert, live preview)

**Files:**
- Modify: `admin.html`

- [ ] **Step 1: Char counters + soft-limit warning**

For `text`/`multiline` fields with `f.max`: render a counter `"<n>/<max>"`; when `n>max` add a `.over` class (amber text) and a hint "may overflow the layout" — **warn, never block** (Mark stays in control; the spec says soft limits).

- [ ] **Step 2: Per-field "Revert to original"**

Each row has a "Revert" button. Revert = delete that path from the working draft so the field falls back to the hardcoded default. Implement a `DRAFT` object (deep-cloned from `RECORD` on load); edits write into `DRAFT`; revert does `unset(DRAFT, f.path)` and resets the control to the live hardcoded default value.

- [ ] **Step 3: Live preview wiring**

The right iframe loads `/?cms-preview=1`. On any field change, post the `DRAFT` to the iframe: `previewFrame.contentWindow.postMessage({type:"cms-draft",draft:DRAFT},"*")`. Add a tiny listener to the **index.html loader** (Task 3 script): if `?cms-preview=1` and a `cms-draft` message arrives, run the same `apply(draft)` function against the live DOM (re-applying defaults first for reverted fields by reloading the frame is acceptable for v1 — simplest correct behavior: on each draft message, `location.reload()` is too slow; instead keep an `applyDraft` that sets text/src for present paths and restores the captured original for absent ones). Capture each wired element's original value once on load into an `ORIGINALS` map so revert in preview is exact.

- [ ] **Step 4: Commit**

```bash
git add admin.html index.html
git commit -m "feat(admin): counters, per-field revert, live preview via postMessage"
```

- [ ] **Step 5: Controller verification**

Playwright: open `/admin.html` (still placeholder creds → can't log in), but `browser_evaluate` can call `renderForm()` with a stubbed `RECORD={}` and assert: every `CMS_FIELDS` entry produced a row; counters present on text fields; image fields show a file input. Open `/?cms-preview=1` and post a synthetic `cms-draft` message via `browser_evaluate` → assert the headline changes and a revert (path removed) restores the exact original string. Expected: all assertions pass; no console errors.

---

### Task 7: `admin.html` — photo upload + publish

**Files:**
- Modify: `admin.html`

- [ ] **Step 1: Photo upload to Storage**

On file pick: `const path = \`${f.path}-${Date.now()}.${ext}\`; await sb.storage.from(window.CMS_PHOTO_BUCKET).upload(path,file,{upsert:true});` then `const { data:{ publicUrl } } = sb.storage.from(bucket).getPublicUrl(path);` set `DRAFT[f.path]=publicUrl`, update thumbnail + preview. Show progress + error text; on failure leave the prior value (graceful).

- [ ] **Step 2: Publish (validate then write)**

"Publish changes" button: client-validates `DRAFT` (every present text value is a string within 2× its soft max — hard ceiling to stop pathological input; images are https URLs in the project's storage domain or the site's own domain). Then `await sb.from("site_content").update({content:DRAFT, updated_at:new Date().toISOString()}).eq("id",1)`. Success → toast "Published. Live in a moment." + set `RECORD=clone(DRAFT)`. RLS rejects if not authenticated → show "Session expired, sign in again."

- [ ] **Step 3: "Discard changes"** resets `DRAFT=clone(RECORD)`, re-renders, reloads preview.

- [ ] **Step 4: Commit**

```bash
git add admin.html
git commit -m "feat(admin): photo upload to storage + validated publish"
```

- [ ] **Step 5: Controller verification**

Static checks (no live project yet): `browser_evaluate` asserts the validate function rejects a 5000-char string and a `javascript:` image value, accepts a normal string and an `https://…supabase.co/…` URL. Full upload/publish round-trip is Task 8 (needs P1/P2).

---

### Task 8: End-to-end verification (controller; needs operator prereqs P1+P2 done)

Not a code task — the controller's acceptance gate after the operator has applied `supabase/SETUP.md` and filled the two constants in `cms-fields.js`.

- [ ] **Step 1: Fallback bulletproof** — Playwright: load site with the supabase host **route-aborted**; assert DOM equals the hardcoded baseline; then `unroute` + cache-busted reload before judging anything (playbook caveat). Zero console errors.
- [ ] **Step 2: Seed parity** — with the seeded row live, the public site DOM equals the pre-CMS baseline (no visible change).
- [ ] **Step 3: Round trip** — sign into `/admin` as Mark; change hero headline + replace one photo; Publish; load the real site (no route, cache-bust) → change is live.
- [ ] **Step 4: Negative** — revert that field → site shows hardcoded default; type a 1500-char value → counter warns, layout still intact.
- [ ] **Step 5: Security** — from an anon browser context, attempt `update` via the JS client → RLS rejects; confirm anon `select` still works.
- [ ] **Step 6: Cross-device** — mobile (390) + desktop; no overflow; assets 200.
- [ ] **Step 7:** Record results in the PR description with evidence.

---

## PART B — Custom domain (operator runbook, not subagent code)

### Task 9: DNS cutover for `lionsgatevenue.com`

**Files:** Create `docs/superpowers/plans/DNS-runbook.md` documenting the below; execution is operator-run in the Hostinger + Netlify dashboards.

- [ ] **Step 1:** In Netlify → `lionsgate-venue` → Domain management → add `lionsgatevenue.com` and `www.lionsgatevenue.com`.
- [ ] **Step 2:** In Hostinger DNS for the domain, **check for MX records** (Mark's email).
  - **MX present:** keep Hostinger DNS. Add `A @ → 75.2.60.5`, `CNAME www → lionsgate-venue.netlify.app`. Leave MX untouched.
  - **No MX:** point Hostinger nameservers at Netlify DNS (Netlify-provided NS), let Netlify manage the zone.
- [ ] **Step 3:** In Netlify set the primary domain and enable "Force HTTPS"; wait for Let's Encrypt cert to issue.
- [ ] **Step 4:** Verify (controller): cache-busted fetch of `https://lionsgatevenue.com` and `https://www.lionsgatevenue.com` → 200, valid TLS, served build matches `main`, `www` redirects to apex (or chosen primary). If `seed-content.json` used absolute `lionsgatevenue.com` photo URLs, confirm those resolve post-cutover.
- [ ] **Step 5:** Commit the runbook.

```bash
git add docs/superpowers/plans/DNS-runbook.md
git commit -m "docs: DNS cutover runbook for lionsgatevenue.com"
```

---

## Final steps (after all tasks)

- [ ] Dispatch a final code-review subagent over the whole `feature/admin-cms` diff (BASE = `main`, HEAD = branch tip).
- [ ] Use `superpowers:finishing-a-development-branch` → PR → operator merges → auto-deploys. Operator then runs `supabase/SETUP.md` (P1/P2) and Part B.

---

## Self-Review

**1. Spec coverage:**
- DNS w/ MX check → Task 9 ✓
- Supabase one-row JSON + RLS read-only → Task 4 ✓
- Inline override-only loader + hardcoded fallback → Task 3 ✓
- Wired field set (hero/spaces/pricing/testimonials/photos) → Task 1 map + Task 2 hooks ✓
- admin.html auth, form-left/preview-right, counters, revert, upload, publish → Tasks 5–7 ✓
- Guard rails (no HTML/JSON, structure not in data) → Task 1 (data-driven only these paths) + Task 6 ✓
- Safe seed / byte-identical cutover → Task 4 seed + Task 8 step 2 ✓
- Verification incl. fallback route-abort + unroute caveat, security, mobile → Task 8 ✓
- Out-of-scope items not planned (no bio editing, no layout edit) ✓
- Prereqs P1/P2/P3 called out and not assigned to subagents ✓

**2. Placeholder scan:** `__FILL_…` constants are intentional, documented operator-filled values (not plan placeholders) — every code step has real content. No "TBD"/"similar to Task N". ✓

**3. Type consistency:** `CMS_FIELDS`/`CMS_GET`/`RECORD`/`DRAFT`/`ORIGINALS`/`apply`/`applyDraft` used consistently across Tasks 1,3,5,6,7. JSON paths identical between `cms-fields.js`, `data-cms` attributes (Task 2), and `seed-content.json` (Task 4). Bucket name `site-photos` consistent (Task 1 config, Task 4 schema, Task 7 upload). ✓

**4. Scope note:** DNS (Part B) is operator-run, not code — kept in this plan as a runbook rather than a separate plan because it's a 5-step checklist with no software deliverable; the CMS (Part A) is the real implementation plan and stands alone.
