# Runbook — deploy & operate OurBakery Reimagined

A static PWA with an optional Firebase Realtime Database for live sync. No build step.

## Deploy to GitHub Pages

GitHub Pages serves `main` from the repo root, so **deploy = push**.

1. Repo **Settings → Pages** → Source: **Deploy from a branch** → Branch: `main` / `/ (root)`.
2. Merge to `main`. The site is live at `https://<owner>.github.io/<repo>/` within a minute.
3. **Bump the service-worker cache every deploy.** Edit `APP_VERSION` in `module-manifest.js`
   (e.g. `ob-v1` → `ob-v2`) in the same commit, or the floor stays on old code.

`.nojekyll` is present so Pages serves files as-is (no Jekyll processing).

## Enable live sync (optional)

The app is fully functional offline. To sync across devices, stand up **your own fresh** Firebase
project (do **not** reuse the RTS project — keep pilot data isolated):

1. [console.firebase.google.com](https://console.firebase.google.com) → new project → add a **Web app**.
2. **Build → Realtime Database** → create (locked mode is fine).
3. **Build → Authentication** → enable **Anonymous**.
4. Copy the web config into `sync-config.js` (`apiKey`, `authDomain`, `databaseURL`, `projectId`,
   `appId`). The web API key is **public by design** — it only names the project; real protection is
   the database rules.
5. Publish the rules from `firebase.rules.json` (Realtime Database → **Rules**). They require auth and
   make the ledger **append-only** (`ledger/$stream/$day/$eventId` is writable only if it doesn't
   already exist) — this enforces the immutable audit trail server-side.

Reload; the console logs `[sync] live — Firebase RTDB connected.` and edits sync across devices.

## Analytics (optional)

Passive, no-PII usage events → a private Google Sheet. Off until `ANALYTICS_URL` is set. See
[`tools/analytics-appscript.md`](../tools/analytics-appscript.md).

## Swapping in real catalog data

`data/products.json` is a **placeholder** (the live HEB category page is behind Incapsula bot
protection and couldn't be scraped). Replace it with real per-stream data in the same shape
(`name`, `days`, `pkgDate`, `category`, `workstream`, `upc`, `plu`, `par`). Because everything is
keyed by a **stable id** (`workstream:u:<upc>`), renaming a product later never breaks recipes,
pull lists, or ledger history.

## Security posture (honest, POC)

- The PIN is a **nametag, not a lock** (unhashed, deliberately). It attributes actions; it is not
  access control.
- The public repo + public Firebase web key are fine **by design**; the database rules are the real
  protection — keep them on.
- **No PII** is logged: no location, no IP, no PIN, no message content. Customer names/phones for
  custom cakes stay on the paper slip and are never typed into the app.
- The accountability ledger is **team-visible and credit-first**, not a manager-only surveillance tool.

## Pre-deploy checklist

- [ ] `node --check` passes on every JS file
- [ ] `node tools/smoke.mjs` prints **SMOKE PASSED**
- [ ] `APP_VERSION` bumped in `module-manifest.js`
