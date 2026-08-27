// core/registry.js — capabilityId -> module, lazy-imported on demand and mounted into the shell.
// Only ONE capability is mounted at a time on a phone, so there is never an 8x render cost.
// Each capability module exports:  mount(container, ctx) -> optional { unmount() }

import { CAPABILITIES } from '../module-manifest.js';

const cache = new Map();
let activeMounted = null; // { id, instance }

export async function load(id) {
  if (cache.has(id)) return cache.get(id);
  const path = CAPABILITIES[id];
  if (!path) throw new Error('unknown capability: ' + id);
  // Resolve against the document base (repo root), NOT relative to this module in core/,
  // and stay correct under a GitHub Pages subpath.
  const url = new URL(path, document.baseURI).href;
  const mod = await import(url);
  cache.set(id, mod);
  return mod;
}

export async function mount(id, container, ctx) {
  await unmountActive();
  const mod = await load(id);
  container.innerHTML = '';
  let instance = null;
  try { instance = mod.mount(container, ctx) || null; }
  catch (e) {
    console.error('[registry] mount failed', id, e);
    container.innerHTML = `<div class="pad muted">Could not load "${id}".</div>`;
  }
  activeMounted = { id, instance };
  return instance;
}

async function unmountActive() {
  if (activeMounted && activeMounted.instance && typeof activeMounted.instance.unmount === 'function') {
    try { activeMounted.instance.unmount(); } catch (e) { /* ignore */ }
  }
  activeMounted = null;
}

export function has(id) { return !!CAPABILITIES[id]; }

// Explicitly tear down the active capability (e.g. when navigating to a non-capability view).
export async function unmount() { await unmountActive(); }
