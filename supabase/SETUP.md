# Lionsgate — Supabase Operator Setup Runbook

Follow these steps in order. Each step depends on the previous.

---

## Step 1: Create the Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in (or create a free account).
2. Click **New project**. Choose the free tier. Pick a region geographically close to you (e.g. US East).
3. Give the project a name (e.g. `lionsgate`) and set a strong database password. Save that password somewhere secure — you will not need it for the site, but you may need it for direct database access later.
4. Wait for provisioning (roughly 1–2 minutes).
5. Once the project is ready, navigate to **Settings → API**. Copy and save three values:
   - **Project URL** (looks like `https://xxxxxxxxxxxx.supabase.co`) — goes in the repo.
   - **anon / public key** — goes in the repo. This key is read-only by RLS; it is safe to commit.
   - **service-role key** — do NOT put this in the repo or share it. It bypasses RLS. Keep it only in your local notes or a password manager.

---

## Step 2: Apply the Schema

1. In the Supabase dashboard, go to **SQL Editor** → **New query**.
2. Paste the entire contents of `supabase/schema.sql` from this repo.
3. Click **Run**.
4. Verify the table and policies were created. Run this verification query in a new SQL Editor tab:

   ```sql
   select tablename, policyname
   from pg_policies
   where schemaname = 'public' and tablename = 'site_content';
   ```

   You should see exactly two rows:
   - `site_content` / `public read`
   - `site_content` / `auth update`

   If you see fewer, re-run the schema SQL and check for errors in the output panel.

---

## Step 3: Create Mark's Admin User

1. In the Supabase dashboard, go to **Authentication → Users**.
2. Click **Add user** (or **Invite user**).
3. Enter Mark's email address and a temporary password.
4. Send Mark those credentials via a secure channel (Signal, 1Password share link, or similar). Tell him to log in to `admin.html` and change his password on first use.

---

## Step 4: Insert the Seed Row

This populates `site_content` with the day-one content extracted verbatim from `index.html`. With this row in place, the live site renders identically to the hardcoded HTML.

1. In the Supabase dashboard, go to **Table Editor** → select the `site_content` table.
2. Click **Insert row**.
3. Set the fields:
   - `id` → `1`
   - `content` → paste the entire contents of `supabase/seed-content.json` from this repo
   - `updated_at` → leave as the default (current timestamp)
4. Save / confirm the insert.
5. Verify: click the row in the Table Editor and confirm the `content` column shows the JSON you just inserted.

---

## Step 5: Wire the Public Keys into the Site

The CMS loader in `index.html` is a no-op until the Supabase URL and anon key are filled in. Until this commit lands on `main`, the live site uses only the hardcoded HTML — by design.

1. Open `cms-fields.js` in the repo.
2. Replace the two placeholder strings at the top of the file:
   - Replace `__FILL_SUPABASE_URL__` with your **Project URL** (from Step 1).
   - Replace `__FILL_SUPABASE_ANON_KEY__` with your **anon / public key** (from Step 1).
3. Commit and push to `main`:

   ```bash
   git add cms-fields.js
   git commit -m "config: wire Supabase project URL and anon key"
   git push origin main
   ```

4. Netlify will auto-deploy from `main`. Watch the deploy log in the Netlify dashboard. Once it shows **Published**, the CMS loader is live.

---

## Step 6: Verify RLS (Read-Only Sanity Check)

Open a browser on the live site, open the browser console (F12), and run these two checks:

```js
// Should succeed and return the content object:
await window.supabase.from('site_content').select('content').eq('id', 1).single()

// Should fail with an RLS policy error (no data returned, error present):
await window.supabase.from('site_content').update({ content: {} }).eq('id', 1)
```

The first call should return `{ data: { content: { ... } }, error: null }`.
The second call should return an error from RLS (anon users cannot write). If the second call succeeds without error, stop and re-check that RLS is enabled on the `site_content` table in the Supabase dashboard (Authentication → Policies).

---

## Step 7: Never Commit the Service-Role Key

The service-role key bypasses every RLS policy. It is only for ad-hoc data fixes you run directly in the Supabase SQL Editor (logged in as yourself). It must never appear in:

- `cms-fields.js`
- `index.html`
- `admin.html`
- Any committed file in this repo

If you need to repair or bulk-update `site_content` data, use the Supabase dashboard's SQL Editor while signed in. You do not need the service-role key for that.

---

## Storage Bucket Sanity

After running the schema SQL, confirm in the Supabase dashboard that the storage bucket was created:

1. Go to **Storage** in the left sidebar.
2. Verify a bucket named `site-photos` appears in the list.
3. Click the bucket and confirm its visibility is set to **Public** (public read is required for uploaded photos to be served to site visitors without authentication).

If the bucket is missing, re-run only the `insert into storage.buckets` portion of `schema.sql` in the SQL Editor.
