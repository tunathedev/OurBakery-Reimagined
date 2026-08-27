// core/router.js — tiny hash router over {streamId, capabilityId}.
//   #/s/<streamId>/<capabilityId>     e.g. #/s/cake/pull
//   #/home                            the stream picker
//   #/hub                             the People Hub (cross-stream)

let onChange = null;

export function start(cb) {
  onChange = cb;
  window.addEventListener('hashchange', fire);
  fire();
}

export function current() {
  const h = (location.hash || '').replace(/^#\/?/, '');
  const parts = h.split('/').filter(Boolean);
  if (parts[0] === 's' && parts[1]) return { view: 'stream', streamId: parts[1], capabilityId: parts[2] || null };
  if (parts[0] === 'hub') return { view: 'hub' };
  if (parts[0] === 'ledger') return { view: 'ledger' };
  return { view: 'home' };
}

function fire() { if (onChange) onChange(current()); }

export function nav(hash) {
  const next = hash.startsWith('#') ? hash : '#' + hash;
  if (location.hash === next) fire(); else location.hash = next;
}
export function toStream(streamId, capabilityId) { nav(`#/s/${streamId}/${capabilityId || ''}`); }
export function toHome() { nav('#/home'); }
export function toHub() { nav('#/hub'); }
export function toLedger() { nav('#/ledger'); }
