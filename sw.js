// sw.js — module service worker. Precaches the whole ES-module graph on install so many small
// module fetches don't stall on bad in-store wifi, then serves stale-while-revalidate for the shell
// and network-first for the catalog + sync config. BUMP APP_VERSION every deploy (it names the cache).

import { APP_FILES, APP_VERSION } from './module-manifest.js';

const CACHE = `ourbakery-${APP_VERSION}`;
const NETWORK_FIRST = ['/data/products.json', '/sync-config.js'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Precache best-effort: one bad URL must not abort the whole install.
    await Promise.allSettled(APP_FILES.map((u) => cache.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('ourbakery-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return; // let cross-origin (gstatic firebase) pass through

  if (NETWORK_FIRST.some((p) => url.pathname.endsWith(p))) {
    e.respondWith(networkFirst(request));
  } else {
    e.respondWith(staleWhileRevalidate(request));
  }
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (e) {
    const cached = await cache.match(request);
    return cached || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const fetching = fetch(request).then((res) => {
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => null);
  return cached || (await fetching) || cache.match('./index.html');
}
