// core/store.js — localStorage-FIRST persistence. Sync is an overlay on top of this (core/sync.js).
// Versioned keys make schema changes explicit (ob.<name>.vN). Everything the app shows is read
// from here first, so the UI is instant and works fully offline.

const PREFIX = 'ob.';

function read(key, def) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return def;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('store.read failed for', key, e);
    return def;
  }
}

function write(key, val) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(val));
    return true;
  } catch (e) {
    // Quota / private-mode: keep running from in-memory state rather than crashing the floor.
    console.warn('store.write failed for', key, e);
    return false;
  }
}

function remove(key) {
  try { localStorage.removeItem(PREFIX + key); } catch (e) { /* ignore */ }
}

// Durable outbound queue: ledger events + slice pushes that must survive a reload while offline.
// Client-generated idempotent ids let the receiver dedupe on replay.
const OUTBOX = 'outbox.v1';
function enqueue(entry) {
  const box = read(OUTBOX, []);
  box.push(entry);
  // cap so a very long offline stretch can't blow the quota
  while (box.length > 2000) box.shift();
  write(OUTBOX, box);
}
function peekOutbox() { return read(OUTBOX, []); }
function replaceOutbox(entries) { write(OUTBOX, entries || []); }

export const store = {
  PREFIX,
  read,
  write,
  remove,
  // slice helpers (a "slice" is just a versioned key holding one collection/object)
  load: (key, def) => read(key, def),
  save: (key, val) => write(key, val),
  // outbox
  enqueue,
  peekOutbox,
  replaceOutbox,
};
