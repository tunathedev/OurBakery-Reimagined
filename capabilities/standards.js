// capabilities/standards.js — MANAGER STANDARDS board (Pillar 1 enforcement). Managers publish a
// standard (global slice + 'standard.published'), flag a miss, or mark it met; partners acknowledge.
// Published state is a global slice; flags/mets/acks are attributable ledger verbs. Ack counts and
// the "you've acknowledged" check derive live from the ledger.

export function mount(container, ctx) {
  const { stream, me, util, commit, record, store, bus, ledger, toast, STREAM_BY_ID, STANDARDS } = ctx;
  const { el, clear } = util;
  const KEY = 'standards.published.v1';
  const isMgr = me.role === 'manager';
  let pub = store.load(KEY, {}); // { [standardId]: { publishedBy, ts, version } }
  let applyingLocal = false;

  const root = el('div.cap.standards');
  container.append(root);

  // Distinct actors who acknowledged a standard (matched by title snapshot in meta).
  function ackers(title) {
    const set = new Set();
    for (const e of ledger.query({ verb: 'standard.acknowledged' })) if (e.meta && e.meta.title === title) set.add(e.actor);
    return set;
  }

  function publish(std) {
    applyingLocal = true;
    if (pub[std.id]) {
      delete pub[std.id];
      commit({ slice: KEY, value: pub, event: null }); // silent unpublish
    } else {
      pub[std.id] = { publishedBy: me.personId, ts: Date.now(), version: std.version };
      commit({ slice: KEY, value: pub, event: { capability: 'standards', stream: stream.id, verb: 'standard.published', meta: { title: std.title } } });
    }
    applyingLocal = false;
    render();
  }
  function flag(std) { record({ capability: 'standards', stream: stream.id, verb: 'standard.flagged', meta: { title: std.title } }); toast('Flagged a miss'); }
  function met(std) { record({ capability: 'standards', stream: stream.id, verb: 'standard.met', meta: { title: std.title } }); toast('Marked met ✓'); }
  function ack(std) { record({ capability: 'standards', stream: stream.id, verb: 'standard.acknowledged', meta: { title: std.title } }); toast('Got it 👍'); }

  function streamChip(id) {
    if (id === 'all') return el('span.chip.ghost', { text: 'all streams' });
    const s = STREAM_BY_ID[id];
    return s ? el('span.chip', { style: { '--accent': s.color }, text: `${s.emoji} ${s.label}` }) : el('span.chip.ghost', { text: id });
  }

  function card(std) {
    const isPub = !!pub[std.id];
    const acks = ackers(std.title);
    const mine = acks.has(me.personId);
    const c = el('div.card.standards-card' + (isPub ? '.published' : ''), { dataset: { key: std.id } });

    c.append(el('div.sec-head', {}, [
      el('div.col', {}, [
        el('span.item-name', { text: std.title }),
        el('div.item-sub', {}, [streamChip(std.stream), el('span.chip.ghost', { text: 'v' + std.version })]),
      ]),
      el('span.pill' + (isPub ? '.mgr' : '.muted'), { text: isPub ? 'Published' : 'Unpublished' }),
    ]));

    const bullets = el('ul.standards-checklist');
    for (const line of std.checklist) bullets.append(el('li', { text: line }));
    c.append(bullets);

    const actions = el('div.item-actions.standards-actions');
    if (isMgr) {
      actions.append(
        el('button.tinybtn' + (isPub ? '.on' : ''), { onclick: () => publish(std) }, [isPub ? '✓ Published' : 'Publish']),
        el('button.tinybtn.warn', { onclick: () => flag(std) }, ['⚑ Flag miss']),
        el('button.tinybtn', { onclick: () => met(std) }, ['✓ Met']),
      );
    } else {
      actions.append(mine
        ? el('span.chip', { text: '✓ Got it' })
        : el('button.btn.sm', { onclick: () => ack(std) }, ['Got it']));
    }
    c.append(el('div.row.standards-foot', {}, [
      el('span.badge', { text: `${acks.size} said “got it”` }),
      actions,
    ]));
    return c;
  }

  function render() {
    clear(root);
    root.append(el('div.sec-head', {}, [
      el('span', { text: '📏 Standards' }),
      el('span.pill' + (isMgr ? '.mgr' : ''), { text: isMgr ? 'Manager' : 'Partner' }),
    ]));
    // Managers see everything (to publish); partners only see what's live.
    const list = isMgr ? STANDARDS : STANDARDS.filter((s) => pub[s.id]);
    if (!list.length) {
      root.append(el('div.sec', {}, [el('div.center.muted', {}, [
        el('div', { text: '📏', style: { fontSize: '2rem' } }),
        el('div', { text: 'No standards published yet.' }),
        el('div.sm', { text: 'Your managers will post the bar to hit right here.' }),
      ])]));
      return;
    }
    for (const std of list) root.append(card(std));
  }

  const offSlice = bus.on('slice:' + KEY, (val) => { if (applyingLocal) return; pub = val || {}; render(); });
  const offLedger = bus.on('ledger', () => render()); // acks/flags/mets from anyone keep counts live
  render();
  return { unmount() { offSlice(); offLedger(); } };
}
