// core/ledger.js — the LEDGER OF TRUTH (Pillar 3) and the single commit() funnel.
//
// APPEND-ONLY. Events are never edited or deleted; a correction is a new compensating
// '*.corrected' event that references the original via refs.eventId. Last-write-wins is
// FORBIDDEN here (it would silently erase the audit trail) — every event is its own child.
//
// The commit(mutation, event) contract is the one invariant every capability obeys: it never
// mutates shared truth directly. commit() (a) persists the optimistic local slice and (b) appends
// one immutable ledger event. Module state is an operational cache; the ledger is the truth.

import { uuid, todayKey } from './util.js';

const SLICE = 'ledger.v1';
const CAP = 1500; // in-memory / local cap; older events live in the analytics cold-storage sink

let deps = null;          // { store, sync, bus, identity }
let events = [];          // chronological in-memory tail
const seen = new Set();   // dedupe ids across local + remote

export function init(d) {
  deps = d;
  events = (deps.store.load(SLICE, []) || []).filter(Boolean);
  for (const e of events) seen.add(e.id);
  // If sync is live, subscribe to today's per-stream ledger paths and replay any offline outbox.
  if (deps.sync && deps.sync.active) {
    // subscription is per stream/day; app.js calls subscribeStreams() once it knows the streams.
    drainOutbox();
  }
}

// ---- write path -------------------------------------------------------------

// record(partial) -> the stored event. Fills id/ts/actor/stream; appends everywhere.
export function record(partial) {
  const e = build(partial);
  append(e, /*fromRemote*/ false);
  return e;
}

// seed(): append an event WITHOUT enqueuing/pushing it (first-run demo data). Actor may be given.
export function seed(partial) {
  const e = build(partial);
  append(e, /*fromRemote*/ true);
  return e;
}

function build(partial) {
  const me = deps.identity.me();
  return {
    id: partial.id || uuid(),
    ts: partial.ts || Date.now(),
    actor: partial.actor || (me ? me.personId : 'person:anon'),
    actorName: partial.actorName || (me ? me.displayName : 'Someone'), // denormalized snapshot
    stream: partial.stream || 'core',
    capability: partial.capability || 'core',
    verb: partial.verb,                                // e.g. 'pull.labeled', 'order.received'
    subject: partial.subject || null,                  // { key (stable), name (snapshot) }
    qty: partial.qty != null ? partial.qty : null,
    meta: partial.meta || {},
    refs: partial.refs || {},
  };
}

// The dual-write funnel. Persist a slice AND/OR append a ledger event, atomically from the
// capability's point of view.
//   commit({ slice, value, event })
export function commit({ slice, value, event } = {}) {
  if (slice != null) {
    deps.store.save(slice, value);
    if (deps.sync && !deps.sync.applying) deps.sync.pushDoc(slice, value);
    deps.bus.emit('slice:' + slice, value);
  }
  let recorded = null;
  if (event && event.verb) recorded = record(event);
  return recorded;
}

// Immutable correction: append a compensating event, never mutate the original.
export function correct(originalId, partial) {
  return record({ ...partial, verb: (partial.verb || 'entry') + '.corrected', refs: { ...(partial.refs || {}), eventId: originalId } });
}

function append(e, fromRemote) {
  if (seen.has(e.id)) return;
  seen.add(e.id);
  events.push(e);
  if (events.length > CAP) { const drop = events.splice(0, events.length - CAP); for (const d of drop) seen.delete(d.id); }
  deps.store.save(SLICE, events);
  if (!fromRemote) {
    // durable outbox so the event replays if a push failed while offline
    deps.store.enqueue({ kind: 'ledger', path: `ledger/${e.stream}/${todayKey(e.ts)}`, value: e });
    if (deps.sync && deps.sync.active) pushOne(e);
  }
  deps.bus.emit('ledger', e);
}

function pushOne(e) {
  const key = deps.sync.pushChild(`ledger/${e.stream}/${todayKey(e.ts)}`, e);
  if (key) removeFromOutbox(e.id);
}

// ---- remote / offline reconciliation ---------------------------------------

// Called by app.js once the active stream ids are known.
export function subscribeStreams(streamIds) {
  if (!deps.sync || !deps.sync.active) return;
  const day = todayKey();
  for (const s of streamIds) {
    deps.sync.registerChildren(`ledger/${s}/${day}`, (_k, val) => { if (val && val.id) append(val, /*fromRemote*/ true); }, 300);
  }
}

export function drainOutbox() {
  if (!deps.sync || !deps.sync.active) return;
  const box = deps.store.peekOutbox();
  const remaining = [];
  for (const entry of box) {
    if (entry.kind === 'ledger' && entry.value) {
      const key = deps.sync.pushChild(entry.path, entry.value);
      if (!key) remaining.push(entry);
    } else remaining.push(entry);
  }
  deps.store.replaceOutbox(remaining);
}

function removeFromOutbox(eventId) {
  const box = deps.store.peekOutbox();
  const filtered = box.filter((x) => !(x.kind === 'ledger' && x.value && x.value.id === eventId));
  if (filtered.length !== box.length) deps.store.replaceOutbox(filtered);
}

// ---- read path --------------------------------------------------------------

export function all() { return events; }

export function query({ stream, actor, verb, verbPrefix, since, recipient, limit } = {}) {
  let out = events;
  if (stream) out = out.filter((e) => e.stream === stream);
  if (actor) out = out.filter((e) => e.actor === actor);
  if (verb) out = out.filter((e) => e.verb === verb);
  if (verbPrefix) out = out.filter((e) => String(e.verb).startsWith(verbPrefix));
  if (recipient) out = out.filter((e) => e.meta && e.meta.recipient === recipient);
  if (since) out = out.filter((e) => e.ts >= since);
  out = out.slice().sort((a, b) => b.ts - a.ts);
  if (limit) out = out.slice(0, limit);
  return out;
}
