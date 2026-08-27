// capabilities/production.js — Build-to-par planner (Pillar 1). make = max(0, par − onHand).
// Rows grouped by category with an onHand stepper; onHand tweaks save silently (debounced),
// a "Save plan" button records ONE attributable 'production.planned' event.

export function mount(container, ctx) {
  const { stream, catalog, util, commit, store, bus, toast } = ctx;
  const { el, debounce, todayKey, clear } = util;
  const KEY = `${stream.id}.production.v1`;
  let plan = store.load(KEY, {}); // { [key]: { onHand } }
  let applyingLocal = false;
  let makeStatNum = null;

  const items = catalog.forStream(stream.id);
  const cats = catalog.categoriesFor(stream.id); // Map<category, item[]>

  const root = el('div.cap.production');
  container.append(root);

  function stateOf(it) { return plan[it._key] || (plan[it._key] = { onHand: 0 }); }
  function makeOf(it) { return Math.max(0, (it.par || 0) - (stateOf(it).onHand || 0)); }
  function totalMake() { return items.reduce((n, it) => n + makeOf(it), 0); }
  function makeCount() { return items.filter((it) => makeOf(it) > 0).length; }

  // A qty tweak is a silent save (no ledger event) — persist the whole slice, debounced.
  function persist(event) {
    applyingLocal = true;
    commit({ slice: KEY, value: plan, event: event || null });
    applyingLocal = false;
  }
  const saveSilent = debounce(() => persist(null), 400);

  function paintMake(it, badge) {
    const m = makeOf(it);
    badge.textContent = 'make ' + m;
    badge.classList.toggle('on', m > 0);
    badge.classList.toggle('muted', m === 0);
  }
  function paintStats() { if (makeStatNum) makeStatNum.textContent = totalMake(); }

  function setOnHand(it, delta, valSpan, badge) {
    const st = stateOf(it);
    st.onHand = Math.max(0, (st.onHand || 0) + delta);
    valSpan.textContent = st.onHand;      // in-place hot-path update
    paintMake(it, badge);
    paintStats();
    saveSilent();
  }

  function savePlan() {
    persist({
      capability: 'production', stream: stream.id, verb: 'production.planned',
      subject: { key: stream.id, name: stream.label },
      meta: { items: makeCount(), totalMake: totalMake() },
    });
    toast(`Plan saved — ${makeCount()} to make`);
  }

  function itemRow(it) {
    const st = stateOf(it);
    const row = el('div.item', { dataset: { key: it._key } });
    const main = el('div.item-main', {}, [
      el('div.item-name', { text: it.name }),
      el('div.item-sub', {}, [
        el('span.chip.ghost', { text: `par ${it.par || 0}` }),
        el('span.chip.ghost', { text: it.category }),
      ]),
    ]);
    let valSpan; const badge = el('span.badge' + (makeOf(it) > 0 ? '.on' : '.muted'), { text: 'make ' + makeOf(it) });
    const stepper = el('div.qty', {}, [
      el('button.step', { onclick: () => setOnHand(it, -1, valSpan, badge) }, ['−']),
      (valSpan = el('span.qval', { text: st.onHand || 0 })),
      el('button.step', { onclick: () => setOnHand(it, +1, valSpan, badge) }, ['+']),
    ]);
    row.append(main, stepper, el('div.item-actions', {}, [badge]));
    return row;
  }

  function section(cat, list) {
    const sec = el('section.sec');
    sec.append(el('div.sec-head', {}, [el('span', { text: cat }), el('span.count', { text: `${list.length}` })]));
    const body = el('div.production-list');
    for (const it of list) body.append(itemRow(it));
    sec.append(body);
    return sec;
  }

  function render() {
    clear(root);
    const stats = el('div.statrow', {}, [
      el('div.stat', {}, [el('div.stat-num', { text: items.length }), el('div.stat-label', { text: 'items' })]),
      el('div.stat', {}, [(makeStatNum = el('div.stat-num', { text: totalMake() })), el('div.stat-label', { text: 'to make' })]),
    ]);
    const head = el('div.production-head', {}, [
      stats,
      el('div.muted.sm', { text: `${stream.emoji || ''} build to par · ${todayKey()}` }),
      stream.productionMode === 'pull'
        ? el('div.chip.production-note', { text: 'Pull-driven — make to the pull list, not to par' }) : null,
    ]);
    const body = el('div.production-body');
    for (const [cat, list] of cats) body.append(section(cat, list));
    root.append(head, body, el('div.pad', {}, [el('button.btn.block', { onclick: savePlan }, ['Save plan'])]));
  }

  const off = bus.on('slice:' + KEY, (val) => { if (applyingLocal) return; plan = val || {}; render(); });
  render();
  return { unmount() { off(); saveSilent.cancel(); persist(null); } };
}
