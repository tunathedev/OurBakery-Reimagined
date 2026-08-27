// core/sync.js — optional live sync over Firebase Realtime Database.
// The RTS wrapper, faithfully: two granularities, two loop-guards, debounced pushes.
//   (A) whole-doc {data,ts} last-write-wins for low-churn slices  -> registerDoc / pushDoc
//   (B) per-child push() live paths for high-churn collaborative data -> registerChildren / pushChild
// When sync-config has no databaseURL the whole module is a graceful NO-OP and the app runs
// offline on localStorage. The Firebase modular SDK is loaded via dynamic import() from gstatic
// (no bundler), exactly like RTS.

import { SYNC_CONFIG, SYNC_ROOT } from '../sync-config.js';
import { debounce } from './util.js';

const FB = '12.3.0'; // Firebase modular SDK version on gstatic

const state = {
  active: false,
  mod: null,        // { ref, onValue, set, push, child, query, limitToLast, onChildAdded, serverTimestamp }
  db: null,
  applying: false,  // guard: do not push while applying a remote update
  last: {},         // echo-skip: last-seen serialized value per path
  pushers: {},      // debounced pushers per path
};

export const sync = {
  get active() { return state.active; },
  get applying() { return state.applying; },
  init,
  registerDoc,
  pushDoc,
  registerChildren,
  pushChild,
  serverTs,
  root: SYNC_ROOT,
};

async function init() {
  if (!SYNC_CONFIG || !SYNC_CONFIG.databaseURL) {
    console.info('[sync] offline-only (no databaseURL configured) — running on localStorage.');
    return false;
  }
  try {
    const appMod = await import(`https://www.gstatic.com/firebasejs/${FB}/firebase-app.js`);
    const dbMod = await import(`https://www.gstatic.com/firebasejs/${FB}/firebase-database.js`);
    const authMod = await import(`https://www.gstatic.com/firebasejs/${FB}/firebase-auth.js`);
    const app = appMod.initializeApp(SYNC_CONFIG);
    const auth = authMod.getAuth(app);
    await authMod.signInAnonymously(auth).catch((e) => console.warn('[sync] anon auth failed', e));
    state.db = dbMod.getDatabase(app);
    state.mod = {
      ref: dbMod.ref, onValue: dbMod.onValue, set: dbMod.set, push: dbMod.push,
      child: dbMod.child, query: dbMod.query, limitToLast: dbMod.limitToLast,
      onChildAdded: dbMod.onChildAdded, serverTimestamp: dbMod.serverTimestamp,
    };
    state.active = true;
    console.info('[sync] live — Firebase RTDB connected.');
    return true;
  } catch (e) {
    console.warn('[sync] init failed; staying offline-only.', e);
    state.active = false;
    return false;
  }
}

function fullPath(path) { return `${SYNC_ROOT}/${path}`; }

// (A) whole-doc last-write-wins. onRemote(data) is called when a *different* value arrives.
function registerDoc(path, onRemote) {
  if (!state.active) return;
  const { ref, onValue } = state.mod;
  onValue(ref(state.db, fullPath(path)), (snap) => {
    const wrapper = snap.val();
    if (!wrapper || wrapper.data === undefined) return;
    const incoming = JSON.stringify(wrapper.data);
    if (incoming === state.last[path]) return; // our own echo / no-op
    state.applying = true;
    try { onRemote(wrapper.data, wrapper.ts); }
    finally { state.applying = false; state.last[path] = incoming; }
  });
}

// Debounced (300ms) push of the whole doc. Coalesces bursts into one write.
function pushDoc(path, value) {
  if (!state.active) return;
  if (state.applying) return; // never push while applying a remote update
  state.last[path] = JSON.stringify(value);
  if (!state.pushers[path]) {
    state.pushers[path] = debounce((val) => {
      const { ref, set, serverTimestamp } = state.mod;
      set(ref(state.db, fullPath(path)), { data: val, ts: serverTimestamp() }).catch((e) => console.warn('[sync] pushDoc', path, e));
    }, 300);
  }
  state.pushers[path](value);
}

// (B) per-child live path. onChild(key, value) fires for existing + new children.
function registerChildren(path, onChild, tailN) {
  if (!state.active) return;
  const { ref, query, limitToLast, onChildAdded } = state.mod;
  let q = ref(state.db, fullPath(path));
  if (tailN) q = query(q, limitToLast(tailN));
  onChildAdded(q, (snap) => { try { onChild(snap.key, snap.val()); } catch (e) { console.error(e); } });
}

// push a new child; returns the generated key (or a local id when offline).
function pushChild(path, value) {
  if (!state.active) return null;
  try {
    const { ref, push, set, serverTimestamp } = state.mod;
    const r = push(ref(state.db, fullPath(path)));
    set(r, value).catch((e) => console.warn('[sync] pushChild', path, e));
    return r.key;
  } catch (e) { console.warn('[sync] pushChild failed', e); return null; }
}

function serverTs() { return state.active && state.mod ? state.mod.serverTimestamp() : Date.now(); }
