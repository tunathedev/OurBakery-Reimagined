// core/identity.js — PIN-as-NAMETAG identity. A nametag, not a lock (unhashed, POC-honest).
// The one structural upgrade over RTS: a stable person:<uuid> is minted once per profile, so
// ledger attribution and praise cross-references survive PIN/initials/name edits and roster churn.
// PIN / initials / displayName are DISPLAY ONLY.

import { uuid, initials as toInitials } from './util.js';

const SLICE = 'profiles.v1';   // { personId: profile }  (synced whole-doc)
const ME = 'me.v1';            // personId signed in on THIS device (local only, never synced)
export const MASTER_PIN = '0000'; // opens the roster picker

let deps = null;               // { store, sync, bus }
let profiles = {};             // in-memory roster
let meId = null;

export function init(d) {
  deps = d;
  profiles = deps.store.load(SLICE, {}) || {};
  meId = deps.store.load(ME, null);
  if (deps.sync) {
    deps.sync.registerDoc(SLICE, (data) => {
      profiles = data || {};
      deps.store.save(SLICE, profiles);
      deps.bus.emit('profiles', profiles);
    });
  }
}

export function roster() {
  return Object.values(profiles).filter((p) => p && p.active !== false)
    .sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)));
}
export function all() { return Object.values(profiles); }
export function get(personId) { return profiles[personId] || null; }
export function me() { return meId ? profiles[meId] || null : null; }
export function isSignedIn() { return !!me(); }

// Seed the roster on first run (from data/seed.js). Does nothing if a roster already exists.
export function seedIfEmpty(people) {
  if (Object.keys(profiles).length) return;
  for (const p of people) addPerson(p, /*silent*/ true);
  persist();
}

export function addPerson({ displayName, pin, role = 'partner', streams = [], personId }, silent) {
  const id = personId || `person:${uuid()}`;
  profiles[id] = {
    personId: id,
    displayName: displayName || 'Partner',
    initials: toInitials(displayName),
    pin: String(pin || '').slice(0, 8),
    role: role === 'manager' ? 'manager' : 'partner',
    streams: Array.isArray(streams) ? streams : [],
    active: true,
    createdAt: Date.now(),
    lastSeen: 0,
  };
  if (!silent) persist();
  return profiles[id];
}

export function updatePerson(personId, patch) {
  if (!profiles[personId]) return null;
  Object.assign(profiles[personId], patch);
  if (patch.displayName) profiles[personId].initials = toInitials(patch.displayName);
  persist();
  return profiles[personId];
}

// PIN is a nametag: find whoever wears it. Master PIN is handled by the caller (roster picker).
export function byPin(pin) {
  const p = String(pin || '');
  return roster().find((x) => x.pin && x.pin === p) || null;
}

export function signIn(personId) {
  if (!profiles[personId]) return null;
  meId = personId;
  profiles[personId].lastSeen = Date.now();
  deps.store.save(ME, meId);
  persist();
  deps.bus.emit('me', me());
  return me();
}

export function signOut() {
  meId = null;
  deps.store.save(ME, null);
  deps.bus.emit('me', null);
}

// Members of a stream (for gating which capabilities render). Managers see everything.
export function canSeeStream(person, streamId) {
  if (!person) return false;
  if (person.role === 'manager') return true;
  return !person.streams || !person.streams.length || person.streams.includes(streamId);
}

function persist() {
  deps.store.save(SLICE, profiles);
  if (deps.sync && !deps.sync.applying) deps.sync.pushDoc(SLICE, profiles);
  deps.bus.emit('profiles', profiles);
}
