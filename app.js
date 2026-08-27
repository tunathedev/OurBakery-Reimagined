// app.js — bootstrap + shell. Wires the spine, seeds first-run data, handles PIN login, and
// mounts one capability at a time per the active stream manifest and the hash route.

import * as util from './core/util.js';
import { store } from './core/store.js';
import { sync } from './core/sync.js';
import * as identity from './core/identity.js';
import * as ledger from './core/ledger.js';
import * as projections from './core/projections.js';
import * as catalog from './core/catalog.js';
import * as router from './core/router.js';
import * as registry from './core/registry.js';
import * as analytics from './core/analytics.js';
import { STREAMS, STREAM_BY_ID, CAP_LABEL, CAP_EMOJI } from './streams/manifests.js';
import { ROSTER, PROCESSES, STANDARDS, demoLedger } from './data/seed.js';

const { el, $, clear } = util;
const bus = util.makeBus();

// ---------- toast ----------
function toast(msg, kind = '') {
  const box = $('#toasts') || document.body.appendChild(el('div#toasts'));
  const t = el('div.toast' + (kind ? '.' + kind : ''), { text: msg });
  box.appendChild(t);
  setTimeout(() => { t.classList.add('show'); }, 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
}

// ---------- ctx handed to every capability ----------
function makeCtx(stream) {
  return {
    stream, me: identity.me(),
    store, catalog, ledger, projections, identity, sync, analytics,
    commit: ledger.commit, record: ledger.record,
    bus, util, router, toast,
    STREAMS, STREAM_BY_ID, PROCESSES, STANDARDS,
  };
}

// ---------- first-run seeding ----------
function seedFirstRun() {
  identity.seedIfEmpty(ROSTER);
  if (ledger.all().length === 0) {
    const byName = new Map(identity.all().map((p) => [p.displayName, p]));
    const now = Date.now();
    for (const ev of demoLedger(byName)) {
      if (!ev.actor) continue;
      const meta = { ...(ev.meta || {}) };
      if (meta.recipientName) { const r = byName.get(meta.recipientName); if (r) meta.recipient = r.personId; delete meta.recipientName; }
      ledger.seed({
        actor: ev.actor.personId, actorName: ev.actor.displayName,
        stream: ev.stream, capability: ev.capability, verb: ev.verb,
        subject: ev.subject || null, qty: ev.qty != null ? ev.qty : null, meta,
        ts: now - (ev.minutesAgo || 0) * 60000,
      });
    }
  }
}

// ---------- shell ----------
const shell = {
  header: null, tabs: null, view: null, bottomnav: null,
};

function renderShell() {
  const root = $('#app');
  clear(root);
  shell.header = el('header#appbar');
  shell.tabs = el('nav#tabs');
  shell.view = el('main#view');
  shell.bottomnav = el('nav#bottomnav');
  root.append(shell.header, shell.tabs, shell.view, shell.bottomnav);
  renderBottomNav();
}

function renderHeader(route) {
  const h = shell.header; clear(h);
  const me = identity.me();
  const left = el('button.iconbtn', { onclick: () => router.toHome(), title: 'Home' }, ['🧁']);
  const title = el('div.appbar-title');
  if (route.view === 'stream' && STREAM_BY_ID[route.streamId]) {
    const s = STREAM_BY_ID[route.streamId];
    title.append(el('span.stream-emoji', { text: s.emoji }), el('span', { text: s.label }));
    title.style.color = s.color;
  } else if (route.view === 'hub') title.textContent = '💬 People Hub';
  else if (route.view === 'ledger') title.textContent = '📜 Ledger of Truth';
  else title.append(el('span', { text: 'OurBakery' }), el('span.tag', { text: 'reimagined' }));

  const meChip = me
    ? el('button.mechip', { onclick: openMeMenu, title: me.displayName }, [el('span.avatar', { text: me.initials }), el('span.mechip-name', { text: me.displayName.split(' ')[0] })])
    : el('button.mechip', { onclick: showLogin }, ['Sign in']);
  h.append(left, title, meChip);
}

function renderTabs(route) {
  const t = shell.tabs; clear(t);
  if (route.view !== 'stream') { t.style.display = 'none'; return; }
  const s = STREAM_BY_ID[route.streamId];
  if (!s || !s.capabilities.length) { t.style.display = 'none'; return; }
  t.style.display = '';
  for (const cap of s.capabilities) {
    const active = route.capabilityId === cap;
    t.append(el('button.tab' + (active ? '.active' : ''), {
      onclick: () => router.toStream(s.id, cap),
    }, [el('span.tab-emoji', { text: CAP_EMOJI[cap] || '•' }), el('span', { text: CAP_LABEL[cap] || cap })]));
  }
}

function renderBottomNav() {
  const b = shell.bottomnav; clear(b);
  const item = (label, emoji, onclick) => el('button.navitem', { onclick }, [el('span.nav-emoji', { text: emoji }), el('span', { text: label })]);
  b.append(
    item('Home', '🏠', () => router.toHome()),
    item('Hub', '💬', () => router.toHub()),
    item('Ledger', '📜', () => router.toLedger()),
  );
}

// ---------- views ----------
function viewHome() {
  registry.unmount();
  const v = shell.view; clear(v);
  const me = identity.me();
  v.append(el('div.home-hero', {}, [
    el('h1', { text: 'OurBakery' }),
    el('p.muted', { text: 'A social workplace that cares for process.' }),
  ]));
  const grid = el('div.stream-grid');
  for (const s of STREAMS) {
    const visible = identity.canSeeStream(me, s.id);
    const card = el('button.stream-card' + (s.ready ? '' : '.soon'), {
      style: { '--accent': s.color },
      onclick: () => onStreamClick(s),
    }, [
      el('div.stream-card-emoji', { text: s.emoji }),
      el('div.stream-card-body', {}, [
        el('div.stream-card-title', { text: s.label }),
        el('div.stream-card-blurb', { text: s.blurb }),
      ]),
      s.external ? el('span.pill', { text: 'existing app' })
        : s.ready ? (visible ? null : el('span.pill.muted', { text: 'not your stream' }))
          : el('span.pill.muted', { text: 'soon' }),
    ]);
    grid.append(card);
  }
  v.append(grid);
  analytics.track('view', 'home');
}

function onStreamClick(s) {
  if (s.external) {
    if (s.externalUrl) window.open(s.externalUrl, '_blank');
    else toast('RTS is the existing app — link it in its manifest. It is not rebuilt here.');
    return;
  }
  if (!s.ready) { toast(`${s.label} — coming soon`); return; }
  router.toStream(s.id, s.capabilities[0]);
}

async function viewStream(route) {
  const s = STREAM_BY_ID[route.streamId];
  if (!s) { router.toHome(); return; }
  const cap = route.capabilityId && s.capabilities.includes(route.capabilityId) ? route.capabilityId : s.capabilities[0];
  if (cap !== route.capabilityId) { router.toStream(s.id, cap); return; }
  await registry.mount(cap, shell.view, makeCtx(s));
  analytics.track('view', `${s.id}/${cap}`);
}

async function viewHub() {
  await registry.mount('people', shell.view, makeCtx(null));
  analytics.track('view', 'hub');
}
async function viewLedger() {
  await registry.mount('ledger', shell.view, makeCtx(null));
  analytics.track('view', 'ledger');
}

// ---------- login (PIN nametag) ----------
function showLogin() {
  if ($('#login')) return;
  let entry = '';
  const overlay = el('div#login.overlay');
  const card = el('div.login-card');
  const title = el('h2', { text: 'Who’s on the floor?' });
  const sub = el('p.muted', { text: 'Enter your PIN — it’s a nametag, not a lock.' });
  const dots = el('div.pin-dots');
  const roster = el('div.roster');
  const refreshRoster = () => {
    clear(roster);
    for (const p of identity.roster()) {
      roster.append(el('button.roster-chip', { onclick: () => { identity.signIn(p.personId); done(); } }, [
        el('span.avatar.sm', { text: p.initials }), el('span', { text: p.displayName.split(' ')[0] }),
        p.role === 'manager' ? el('span.pill.mgr', { text: 'mgr' }) : null,
      ]));
    }
  };
  const renderDots = () => { clear(dots); for (let i = 0; i < 4; i++) dots.append(el('span.dot' + (i < entry.length ? '.on' : ''))); };
  const press = (d) => {
    entry = (entry + d).slice(0, 8); renderDots();
    if (entry === identity.MASTER_PIN) { toast('Master PIN — pick your name'); roster.classList.add('show'); entry = ''; renderDots(); return; }
    if (entry.length >= 4) {
      const p = identity.byPin(entry);
      if (p) { identity.signIn(p.personId); done(); }
      else if (entry.length >= 6) { toast('No match — try again'); entry = ''; renderDots(); }
    }
  };
  const pad = el('div.pinpad');
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'].forEach((k) => {
    pad.append(el('button.key', { onclick: () => {
      if (k === '⌫') { entry = entry.slice(0, -1); renderDots(); }
      else if (k === '✓') { const p = identity.byPin(entry); if (p) { identity.signIn(p.personId); done(); } else { toast('No match'); entry = ''; renderDots(); } }
      else press(k);
    } }, [k]));
  });
  const rosterToggle = el('button.linkbtn', { onclick: () => roster.classList.toggle('show') }, ['or pick from the roster']);
  card.append(title, sub, dots, pad, rosterToggle, roster);
  overlay.append(card);
  document.body.append(overlay);
  renderDots(); refreshRoster();
  function done() { overlay.remove(); analytics.setPerson(identity.me() && identity.me().initials); route(); toast(`Welcome, ${identity.me().displayName.split(' ')[0]}`); }
}

function openMeMenu() {
  const me = identity.me(); if (!me) return showLogin();
  const overlay = el('div.overlay.sheet', { onclick: (e) => { if (e.target === overlay) overlay.remove(); } });
  const card = el('div.sheet-card', {}, [
    el('div.sheet-head', {}, [el('span.avatar', { text: me.initials }), el('div', {}, [el('div', { text: me.displayName }), el('div.muted.sm', { text: me.role === 'manager' ? 'Manager' : 'Partner' })])]),
    el('button.btn.block', { onclick: () => { overlay.remove(); router.toLedger(); } }, ['📜 My activity']),
    el('button.btn.block.ghost', { onclick: () => { identity.signOut(); overlay.remove(); showLogin(); } }, ['Sign out']),
    sync.active ? el('div.muted.sm.center', { text: 'Live sync on' }) : el('div.muted.sm.center', { text: 'Offline mode — data on this device' }),
  ]);
  overlay.append(card); document.body.append(overlay);
}

// ---------- routing ----------
function route(r) {
  const cur = r || router.current();
  if (!identity.me()) { renderHeader(cur); showLogin(); return; }
  renderHeader(cur);
  renderTabs(cur);
  if (cur.view === 'home') viewHome();
  else if (cur.view === 'stream') viewStream(cur);
  else if (cur.view === 'hub') viewHub();
  else if (cur.view === 'ledger') viewLedger();
  else viewHome();
}

// re-render header/feed live as the ledger grows
bus.on('me', () => route());

// ---------- boot ----------
async function boot() {
  renderShell();
  await sync.init();
  identity.init({ store, sync, bus });
  ledger.init({ store, sync, bus, identity });
  projections.init({ bus, ledger, identity });
  await catalog.init({ store, sync, bus });
  seedFirstRun();
  if (sync.active) ledger.subscribeStreams(STREAMS.map((s) => s.id));
  registerSW();
  router.start(route);
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js', { type: 'module' }).then((reg) => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) nw.postMessage('skipWaiting'); });
    });
  }).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloaded) return; reloaded = true; location.reload(); });
}

boot();
