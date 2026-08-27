// core/util.js — DOM helpers, stable-ID keying, a tiny keyed-list reconciler, formatting.
// No dependencies. Kept deliberately small so partners read imperative DOM, not a framework.

// ---------- DOM ----------
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// el('button.big#go', {onclick}, ['label']) -> HTMLElement
export function el(tagspec, props = {}, children = []) {
  const m = String(tagspec).match(/^([a-z0-9]+)?(#[\w-]+)?((?:\.[\w-]+)*)$/i);
  const tag = (m && m[1]) || 'div';
  const node = document.createElement(tag);
  if (m && m[2]) node.id = m[2].slice(1);
  if (m && m[3]) node.className = m[3].split('.').filter(Boolean).join(' ');
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = node.className ? node.className + ' ' + v : v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  appendChildren(node, children);
  return node;
}

function appendChildren(node, children) {
  const arr = Array.isArray(children) ? children : [children];
  for (const c of arr) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

// Keyed-list reconciler: update a container in place from a data array without a full rebuild,
// preserving scroll position and DOM identity on hot paths (the RTS "no green-flash" lesson).
//   reconcile(container, items, keyFn, createFn, updateFn)
// createFn(item) -> HTMLElement (must set data-key). updateFn(node, item) patches in place.
export function reconcile(container, items, keyFn, createFn, updateFn) {
  const existing = new Map();
  for (const child of Array.from(container.children)) {
    const k = child.getAttribute('data-key');
    if (k != null) existing.set(k, child);
  }
  let prev = null;
  for (const item of items) {
    const key = String(keyFn(item));
    let node = existing.get(key);
    if (node) {
      existing.delete(key);
      if (updateFn) updateFn(node, item);
    } else {
      node = createFn(item);
      node.setAttribute('data-key', key);
    }
    // place in order after prev
    const ref = prev ? prev.nextSibling : container.firstChild;
    if (node !== ref) container.insertBefore(node, ref);
    prev = node;
  }
  for (const stale of existing.values()) container.removeChild(stale);
  return container;
}

// ---------- IDs / keys ----------
export function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // Fallback: not cryptographically strong, fine for a POC nametag world.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.floor(performance.now() * 1000) + seedBump()) % 16;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
let _seed = 0;
function seedBump() { _seed = (_seed + 7919) % 100000; return _seed; }

export const normUpc = (u) => String(u || '').replace(/\D/g, '');
export const slug = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// Stable catalog key, namespaced per stream. UPC-based survives renames; name-based is the fallback.
export function baseKeyOf(streamId, item) {
  const upc = normUpc(item.upc);
  return upc ? `${streamId}:u:${upc}` : `${streamId}:n:${slug(item.name)}`;
}

// ---------- formatting ----------
export function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  let h = d.getHours(); const m = d.getMinutes();
  const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
}
export function fmtDate(ts) {
  const d = ts ? new Date(ts) : new Date();
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
export function fmtDateTime(ts) { return `${fmtDate(ts)} ${fmtTime(ts)}`; }
export function todayKey(ts) {
  const d = ts ? new Date(ts) : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function ago(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return fmtDate(ts);
}

export const escapeHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- misc ----------
export function debounce(fn, ms = 300) {
  let t;
  const wrapped = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

export function initials(name) {
  return String(name || '').trim().split(/\s+/).map((w) => w[0] || '').slice(0, 2).join('').toUpperCase();
}

// A tiny event bus. on(evt, cb) -> off fn; emit(evt, payload).
export function makeBus() {
  const map = new Map();
  return {
    on(evt, cb) {
      if (!map.has(evt)) map.set(evt, new Set());
      map.get(evt).add(cb);
      return () => map.get(evt) && map.get(evt).delete(cb);
    },
    emit(evt, payload) {
      const set = map.get(evt);
      if (set) for (const cb of Array.from(set)) { try { cb(payload); } catch (e) { console.error(e); } }
    },
  };
}
