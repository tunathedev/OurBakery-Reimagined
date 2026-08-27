# OurBakery Reimagined — Architecture & Build Plan

A proof-of-concept / testing ground for a **social workplace that cares for process** at an
HEB bakery. Built as a native-ES-module evolution of the proven RTS bakery-ops app.

This plan is the output of a 4-lens design panel (RTS-Faithful · Modular-Scale · Social-Spine ·
Demo-Velocity), independently judged and synthesized.

> **Scope note:** The existing **RTS** tool is a separate, already-deployed app. It is **not**
> touched, embedded, or reimplemented here — in OurBakery it appears only as an "existing app"
> tile. OurBakery is built fresh in this repo, borrowing RTS's *patterns and lessons* only.

---

## The three pillars

1. **Standardized process** — one uniform app across every bakery work stream.
2. **People hub** — communicate, collaborate, give praise, get on the same page.
3. **Ledger of truth & accountability** — an auditable, immutable record of what got done, by whom.

**The load-bearing bet:** pillars 2 and 3 are the *same event stream* viewed two ways. Every
meaningful action flows through one `commit(mutation, event)` path, so a pull checkbox becomes an
attributable, immutable ledger event. The feed and the accountability view are **projections** of
that one stream — not separately-built features.

---

## The build-step decision: NO build step

Keep vanilla JS, **native ES modules**, import map, **no bundler, no framework, no transpile**.

The RTS author's caveat ("I'd reconsider for many screens/teams") was about the *single
3,300-line file*, not the no-build stance — which he calls a genuine strength. Those are
separable. The scope explosion is a **file-topology** problem, and native ES modules solve it
while preserving the three properties that made RTS ship:

- deploy is a `git push`,
- the code you read is the code that runs (no compile artifact),
- zero toolchain between a partner and a fix.

The real anti-explosion move is **architectural, not tooling**: write the four-part backbone
**once** as generic capability modules configured by thin per-stream manifests, so line count
scales with module **types** (~5–6) + spine, **not** streams × modules.

Escape hatch (documented, not used yet): optional `esbuild` concat that does **not** change source
layout, pulled only if a cold-load waterfall actually bites on a real floor device.

---

## Topology: spine + capabilities + thin manifests

```
core/         the load-bearing spine, imported by everything
  util.js       dom helpers, stable-id (baseKeyOf), keyed-list reconciler, formatting
  store.js      in-memory state (per-stream slices), localStorage-first, versioned keys,
                durable outbound queue for offline dual-write
  sync.js       Firebase RTDB wrapper (whole-doc LWW + per-child); no-op without config
  identity.js   PIN roster, minted person:<uuid>, role (manager|partner), stream membership
  ledger.js     append-only record() + commit(mutation,event) dual-write; corrections compensate
  projections.js folds the ledger tail into feed + per-person/per-shift accountability rollups
  catalog.js    base products.json + cust overlay {patches,added,deleted}, never edited in place
  router.js     hash router over {streamId, capabilityId}
  registry.js   capabilityId -> module
  analytics.js  sendBeacon queue (no-op without url)

capabilities/  the backbone, written ONCE, data-driven; each exports mount(container, ctx)
  process.js     SOP checklist runner (Pillar 1)
  pull.js        qty + labeled marks + holes-float-to-fill-first + full-screen freezer mode
  production.js  build-to-par (make = max(0, par-onHand)), recipes, case-pack rollup
  forecast.js    sales forecast + production planning inputs
  order.js       custom-cake two-ended flow (placing @ Packager, receiving @ Cake)
  inventory.js   floor inventory + par levels
  people.js      People Hub: feed (projection) + praise-as-verb + claimable tasks + photo log
  standards.js   manager: publish/acknowledge/flag/met versioned standards
  ledgerview.js  on-screen ledger timeline, filterable by person/stream/shift/verb + CSV export

streams/manifests.js   the 8 thin declarative stream manifests
data/products.json     the catalog (base)  +  data/seed.js (SOPs, recipes, roster, demo ledger)
module-manifest.js     single array feeding import map + registry + SW precache
index.html · styles.css · app.js · sw.js · manifest.webmanifest · sync-config.js · firebase.rules.json
```

**The contract every capability obeys:** it never mutates shared truth directly — it calls
`core.commit(localMutation, ledgerEvent)`, a single path that (a) applies the optimistic in-place
DOM + localStorage mutation on the hot path (RTS verbatim) and (b) appends one immutable ledger
event. Module state is an operational cache; **the ledger is the truth.**

**Discipline against self-inflicting a framework:** build the first stream concretely, extract a
capability only when the *second* stream needs it (rule of two). Bespoke modules capped at
custom-cake. A per-stream override hook is the escape valve.

---

## Data model — stable IDs from commit one

- **Catalog:** base `products.json` + overlay `{patches, added, deleted}`, never edited in place.
  Stable key `baseKeyOf = upc ? '<streamId>:u:'+normUpc : '<streamId>:n:'+slug`. A rename is a
  patch keyed by the stable `_key`. **Key everything by stable ID, never display name.**
- **Identity:** `profiles/{personId}` where `personId = person:<uuid>` minted once; PIN/initials/name
  are display only, so attribution survives PIN edits.
- **Ledger event (append-only, per-child):** `{ id, ts, actor:personId, stream, capability, verb
  (e.g. pull.labeled / order.received / praise.given), subject:{key, name (denormalized snapshot)},
  qty?, meta, refs:{orderId?, eventId?} }`. **Immutable** — corrections are new `*.corrected`
  events referencing `refs.eventId`. LWW is **forbidden** on the ledger.
- **Custom-cake order:** first-class `order:<uuid>` (never keyed by customer name), status
  `placed → received → in_progress → ready(curbside hook) → picked_up`.
- **Praise** is not a table — it's a ledger verb `praise.given { meta.recipient:personId }`.

---

## Sync granularity (per collection, deliberately)

- **(A) whole-doc `{data,ts}` LWW**, debounced 300ms, `sync.applying` + echo-skip guards — for
  low-churn slices (per-stream pull, process def, par, forecast) namespaced `ob/<streamId>/<slice>`.
- **(B) per-child `push()` live paths** — for high-churn collaborative collections (feed, tasks,
  orders).
- **(C) per-child append-only** — the ledger. `limitToLast(N)` tail + local cache.

The app is **localStorage-first and fully functional offline**; sync is an overlay that activates
only when a real Firebase config is supplied in `sync-config.js`.

---

## POC phases (each a shippable slice)

- **Phase 0 — Skeleton:** spine on RTS's bones; deploys, syncs (optional), knows who you are.
- **Phase 1 — First vertical + ledger primitive:** one stream's pull/freezer, `commit()` emits
  ledger events, live feed shows "Maria labeled 12 Conchas" across devices.
- **Phase 2 — Reuse proof (thesis gate):** a second stream lit up from a manifest with **zero new
  capability code**. Go/no-go for the data-driven bet.
- **Phase 3 — Custom-cake cross-stream handoff (marquee):** Packager places `order:<uuid>`, Cake
  receives it live and advances to `ready`.
- **Phase 4 — Social pillar:** praise-as-verb + praise wall, threaded comments, manager standards.
- **Phase 5 — Accountability surface + polish:** on-screen ledger timeline + CSV export; seeded
  roster + demo ledger so it feels alive; smoke tests; cache-bump discipline.

---

## Top risks & mitigations

| Risk | Mitigation |
|---|---|
| **Abstraction leak** — streams diverge beyond what a manifest expresses; per-stream special-cases return. | Build first stream concretely; extract on rule-of-two; cap bespoke at custom-cake; per-stream override hook; Phase-2 is a hard gate. |
| **No TypeScript** over a config-driven surface — a stray display-name ref silently breaks across streams. | Stable-ID keying is non-negotiable; denormalized names live only in immutable ledger events; per-capability smoke tests. |
| **Offline dual-write drift** — local mutation applies but ledger push fails offline. | Single `commit()` writes to a durable localStorage outbound queue with idempotent event ids; flush-on-reconnect. |
| **Cold-load waterfall** on an un-bundled graph over bad wifi. | SW precaches the whole module graph on install; keep graph in the dozens; esbuild-concat escape hatch. |
| **Surveillance perception** of a "ledger of accountability." | Credit/praise-first framing; no PII; message content never recorded; ledger is team-visible, not manager-only; PIN is a nametag, not a lock. |

---

## POC defaults (change any)

1. Deep-first streams: **Cake + Doughnut + thin Packager** (all 8 declared; others "coming soon").
2. Demo leads with the **custom-cake cross-stream handoff** ("feel it").
3. Curbside = **faked `order.ready` hook**.
4. Ledger visibility = **team-wide, credit-first**.
5. Catalog = the **114-item placeholder** in `data/products.json`.
6. **RTS = separate app, untouched** — an "existing app" tile only.
7. Firebase = **none by default**; app runs offline on localStorage, `sync-config.js` is a
   placeholder for a *fresh* project.
8. Manager standards = **publish + acknowledge + praise + light flag**.
