// core/analytics.js — passive, no-PII usage events via navigator.sendBeacon.
// No location, no IP, no PIN, no message content — event name, screen, initials, coarse device,
// timestamp only. No-op when ANALYTICS_URL is blank.

import { ANALYTICS_URL } from '../sync-config.js';

let personInitials = '';
export function setPerson(initials) { personInitials = initials || ''; }

function coarseDevice() {
  const w = window.innerWidth;
  const kind = w < 480 ? 'phone' : w < 900 ? 'tablet' : 'desktop';
  return { kind, w, standalone: !!(window.matchMedia && matchMedia('(display-mode: standalone)').matches) };
}

const queue = [];
let flushTimer = null;

export function track(event, screen, extra) {
  const payload = {
    event: String(event || '').slice(0, 60),
    screen: String(screen || '').slice(0, 40),
    who: personInitials,          // initials only, never PIN or full name
    device: coarseDevice(),
    ts: Date.now(),
    ...(extra && typeof extra === 'object' ? { meta: sanitize(extra) } : {}),
  };
  queue.push(payload);
  scheduleFlush();
}

// strip anything that could carry PII/message content — keep it to primitive counters/labels
function sanitize(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (['name', 'message', 'text', 'note', 'notes', 'pin', 'customer'].includes(k)) continue;
    if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string' && v.length <= 24) out[k] = v;
  }
  return out;
}

function scheduleFlush() {
  if (!ANALYTICS_URL) { queue.length = 0; return; } // disabled: drop silently
  if (flushTimer) return;
  flushTimer = setTimeout(flush, 1500);
}

function flush() {
  flushTimer = null;
  if (!ANALYTICS_URL || !queue.length) return;
  const batch = queue.splice(0, queue.length);
  try {
    const blob = new Blob([JSON.stringify({ events: batch })], { type: 'text/plain;charset=UTF-8' });
    if (navigator.sendBeacon) navigator.sendBeacon(ANALYTICS_URL, blob);
    else fetch(ANALYTICS_URL, { method: 'POST', body: blob, keepalive: true }).catch(() => {});
  } catch (e) { /* analytics must never break the app */ }
}

window.addEventListener('pagehide', flush);
window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
