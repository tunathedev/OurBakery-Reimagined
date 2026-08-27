// core/catalog.js — the catalog is BASE (data/products.json) + a CUSTOMIZATION OVERLAY, never
// edited in place. Stable keys survive renames (the #1 RTS lesson). Scoped per work stream.

import { baseKeyOf, normUpc, slug } from './util.js';

const CUST = 'catalog.cust.v1'; // { patches: {key:{name?,days?,par?,...}}, added: [item], deleted: [key] }

let deps = null;                // { store, sync, bus }
let base = [];                  // raw products.json entries
let cust = { patches: {}, added: [], deleted: [] };
let items = [];                 // effective, keyed
let byKey = new Map();
let byName = new Map();
let byUpc = new Map();

export async function init(d) {
  deps = d;
  cust = deps.store.load(CUST, { patches: {}, added: [], deleted: [] });
  cust.patches = cust.patches || {}; cust.added = cust.added || []; cust.deleted = cust.deleted || [];
  try {
    const res = await fetch('./data/products.json', { cache: 'no-cache' });
    const json = await res.json();
    base = Array.isArray(json) ? json : (json.products || []);
  } catch (e) {
    console.warn('[catalog] could not load products.json', e);
    base = [];
  }
  rebuild();
  if (deps.sync) {
    deps.sync.registerDoc(CUST, (data) => {
      cust = data || { patches: {}, added: [], deleted: [] };
      deps.store.save(CUST, cust);
      rebuild();
      deps.bus.emit('catalog', items);
    });
  }
}

// The item's HOME work stream namespaces its stable key, so the key is identical everywhere.
function keyOf(item) { return baseKeyOf(item.workstream || 'core', item); }

function effective(item, patch) { return patch ? { ...item, ...patch } : item; }

function rebuild() {
  const deleted = new Set(cust.deleted || []);
  const out = [];
  for (const raw of base) {
    const key = keyOf(raw);
    if (deleted.has(key)) continue;
    const it = { ...effective(raw, cust.patches[key]), _key: key };
    out.push(it);
  }
  for (const add of cust.added || []) {
    const key = add._key || keyOf(add);
    if (deleted.has(key)) continue;
    out.push({ ...add, _key: key, _added: true });
  }
  items = out;
  byKey = new Map(); byName = new Map(); byUpc = new Map();
  for (const it of items) {
    byKey.set(it._key, it);
    byName.set(it.name, it);
    const u = normUpc(it.upc);
    if (u) byUpc.set(u, it);
  }
}

// resolve a recipe/pull row that references a stable key first, name only as a fallback
export function resolve(ref) {
  return (ref && ref.key && byKey.get(ref.key)) || (ref && ref.n && byName.get(ref.n)) || (ref && ref.name && byName.get(ref.name)) || null;
}

export function get(key) { return byKey.get(key) || null; }
export function allItems() { return items; }
export function indexes() { return { byKey, byName, byUpc }; }

// Items for a stream (by home work stream). Sorted by category then name (catalog already sorted).
export function forStream(streamId) {
  return items.filter((it) => (it.workstream || 'core') === streamId);
}
export function categoriesFor(streamId) {
  const set = new Map();
  for (const it of forStream(streamId)) {
    if (!set.has(it.category)) set.set(it.category, []);
    set.get(it.category).push(it);
  }
  return set; // Map<category, item[]>
}

// A rename is a PATCH keyed by the stable _key — the key never changes.
export function patch(key, changes) {
  cust.patches[key] = { ...(cust.patches[key] || {}), ...changes };
  persist();
}
export function addItem(item) {
  const withKey = { ...item, _key: item._key || baseKeyOf(item.workstream || 'core', item) };
  cust.added.push(withKey);
  persist();
  return withKey;
}
export function deleteItem(key) {
  if (!cust.deleted.includes(key)) cust.deleted.push(key);
  persist();
}

function persist() {
  rebuild();
  deps.store.save(CUST, cust);
  if (deps.sync && !deps.sync.applying) deps.sync.pushDoc(CUST, cust);
  deps.bus.emit('catalog', items);
}

// ---- domain math (RTS verbatim) ---------------------------------------------

// Sell-by = pull date + shelf-life days. pkgDate items follow the printed package date instead.
export function sellBy(item, pullDateMs) {
  if (item.pkgDate) return { pkgDate: true };
  const d = new Date(pullDateMs);
  d.setDate(d.getDate() + (item.days || 0));
  return { pkgDate: false, date: d.getTime() };
}
// good / sell-soon / expired bucket relative to now.
export function freshness(sellByMs, now = Date.now()) {
  if (sellByMs == null) return 'pkg';
  const days = (sellByMs - now) / 86400000;
  if (days < 0) return 'expired';
  if (days <= 1) return 'soon';
  return 'good';
}
