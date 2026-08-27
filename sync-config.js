// sync-config.js — PUBLIC BY DESIGN. This file only NAMES a Firebase project; it grants no data
// access. Real protection is the Realtime Database rules (firebase.rules.json), not this file.
//
// The app runs FULLY OFFLINE (localStorage-first) when this is left blank — no backend required to
// demo the prototype. To enable live multi-device sync, create your OWN fresh Firebase project
// (do NOT reuse the RTS project) and paste its Realtime Database config below.
//
// Get these values: Firebase console -> Project settings -> your web app -> "SDK setup".

export const SYNC_CONFIG = {
  // Leave databaseURL empty to stay offline-only. When set, core/sync.js activates live sync.
  apiKey: '',
  authDomain: '',
  databaseURL: '',        // e.g. 'https://ourbakery-xxxx-default-rtdb.firebaseio.com'
  projectId: '',
  appId: '',
};

// Passive, no-PII usage analytics sink (a Google Apps Script web-app URL that appends to a private
// Sheet). Leave blank to disable. See tools/analytics-appscript.md.
export const ANALYTICS_URL = '';

// Root path under which all OurBakery data lives in the Realtime Database.
export const SYNC_ROOT = 'ob';
