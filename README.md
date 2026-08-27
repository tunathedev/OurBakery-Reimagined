# OurBakery Reimagine

The H-E-B Bakery is beloved — the partner grabbing a doughnut on break, the parent placing a cake
order, the office worker picking up a cookie platter before work. But meeting demand and growing
store contributions means reimagining how partners interact with process, so product hits the shelf
fresh and fast and partners stop inventing inconsistent, ad-hoc workflows.

**OurBakery Reimagined is a proof-of-concept for that: a testing ground for a _social workplace that
cares for process_.** One uniform app across every bakery work stream, a people hub to communicate
and give praise, and a ledger of truth that makes every action attributable and auditable.

It's built as a native-ES-module evolution of the proven **RTS** (Ready-To-Sell) bakery tool — same
hard-won shape (offline-first PWA, live sync, stable IDs, glove-friendly floor UI), restructured so
one codebase serves many streams.

> This is a prototype on placeholder data. See **[PLAN.md](PLAN.md)** for the full architecture and
> the design rationale, and **[docs/RUNBOOK.md](docs/RUNBOOK.md)** to deploy it.

## What's in it

- **Stream picker** — every bakery work stream (Managers, Tortilla, Cake, Doughnut, Scratch Bread,
  Packager, Breakout) plus the existing **RTS** app as a linked tile (RTS stays its own app — it is
  **not** rebuilt or touched here).
- **Per-stream capabilities**, written once and shared: **Process** (SOP checklist), **Pull List**
  (+ glove-friendly **Freezer Mode**, holes float to "fill first"), **Forecast**, **Production**
  (build-to-par), and for Cake **custom-cake receiving** + **floor inventory**.
- **The custom-cake handoff** — Packager places an order, Cake sees it appear live and advances it
  through `placed → received → in progress → ready → picked up` (the curbside hook).
- **People Hub** — a live feed, claimable tasks, a floor log, and first-class **praise**.
- **Ledger of Truth** — an on-screen, filterable, CSV-exportable, append-only timeline of every
  action. The feed and accountability views are just projections of this one event stream.

## Architecture in one breath

A small **spine** (`core/`: identity · store · ledger · sync · catalog · router) + **capabilities**
(`capabilities/`, generic and data-driven) + **thin per-stream manifests** (`streams/manifests.js`).
Every action flows through one `commit(mutation, event)` funnel, so a pull checkbox becomes an
attributable, immutable ledger event. **No build step** — native ES modules, no bundler, no
framework; deploy is a `git push`.

## Run it

It's a static PWA — no server, no build:

```bash
# any static server works; e.g.
python3 -m http.server 8000
# then open http://localhost:8000
```

Sign in with a demo PIN (master PIN `0000` opens the roster picker):

| PIN | Who | Role |
|----|-----|------|
| 1234 | Maria Solis | partner |
| 3456 | Ana Reyes | partner |
| 5678 | Priya Nair | **manager** |

It runs **fully offline** on `localStorage`. Live multi-device sync is optional — add your own
Firebase config in `sync-config.js` (see the runbook).

## Test

```bash
node --check app.js          # syntax gate (run across all JS before deploy)
node tools/smoke.mjs         # headless Chromium smoke: boots, drives every stream/capability,
                             # exercises the order handoff + praise/ledger, screenshots at 390px
```

## Repo layout

```
index.html · app.js · styles.css · sw.js · manifest.webmanifest · sync-config.js
core/         spine: util, store, sync, identity, ledger, projections, catalog, router, registry, analytics
capabilities/ process, pull, production, forecast, order, inventory, people, standards, ledgerview
streams/      manifests.js — the thin declarative per-stream config
data/         products.json (placeholder catalog) + seed.js (roster, SOPs, demo ledger)
tools/        smoke.mjs, analytics-appscript.md
PLAN.md · docs/RUNBOOK.md · firebase.rules.json
```
