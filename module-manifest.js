// Single source of truth for the module graph.
// Consumed by: the service worker (precache list) and the capability registry.
// A smoke test asserts every registered capability appears in APP_FILES so the PWA never
// precaches a partial graph and ships stale/broken code to the floor.

export const APP_VERSION = 'ob-v1';

// Everything the app shell needs to run fully offline. Paths are relative to repo root
// (GitHub Pages serves main from root).
export const APP_FILES = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './manifest.webmanifest',
  './sync-config.js',
  './module-manifest.js',
  // core spine
  './core/util.js',
  './core/store.js',
  './core/analytics.js',
  './core/sync.js',
  './core/identity.js',
  './core/ledger.js',
  './core/projections.js',
  './core/catalog.js',
  './core/router.js',
  './core/registry.js',
  // capabilities
  './capabilities/process.js',
  './capabilities/pull.js',
  './capabilities/production.js',
  './capabilities/forecast.js',
  './capabilities/order.js',
  './capabilities/inventory.js',
  './capabilities/people.js',
  './capabilities/standards.js',
  './capabilities/ledgerview.js',
  // streams + data
  './streams/manifests.js',
  './data/products.json',
  './data/seed.js',
];

// capabilityId -> module path. The registry lazy-imports these on demand.
export const CAPABILITIES = {
  process: './capabilities/process.js',
  pull: './capabilities/pull.js',
  production: './capabilities/production.js',
  forecast: './capabilities/forecast.js',
  order: './capabilities/order.js',
  inventory: './capabilities/inventory.js',
  people: './capabilities/people.js',
  standards: './capabilities/standards.js',
  ledger: './capabilities/ledgerview.js',
};
