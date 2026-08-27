// capabilities/inventory.js — Floor inventory vs. par. need = max(0, par − onFloor).
// Under-par items float to a top "Below par" section; the rest group by category.
// onFloor tweaks save silently (debounced); "Log count" records ONE 'inventory.counted' event.

export function mount(container, ctx) {
  const { stream, catalog, util, commit, store, bus, toast } = ctx;
  const { el, debounce, todayKey, clear } = util;
  const KEY = `${stream.id}.inventory.v1`;
  let inv = store.load(KEY, {}); // { [key]: { onFloor } }
  let applyingLocal = false;
  let belowStatNum = null;

  const items = catalog.forStream(stream.id);
  const cats = catalog.categoriesFor(stream.id); // Map<category, item[]>

  const root = el('div.cap.inventory');
  container.append(root);

  function stateOf(it) { return inv[it._key] || (inv[it._key] = { onFloor: 0 }); }
  function needOf(it) { return Math.max(0, (it.par || 0) - (stateOf(it).onFloor || 0)); }
  function underPar(it) { return needOf(it) > 0; }
  function belowCount() { return items.filter(underPar).length; }

  // A qty tweak is a silent save (no ledger event) — persist the whole slice, debounced.
  function persist(event) {
    applyingLocal = true;
    commit({ slice: KEY, value: inv, event: event || null });
    applyingLocal = false;
  }
  const saveSilent = debounce(() => persist(null), 400);

  function paintStatus(it, span) {
    const need = needOf(it);
    if (need > 0) { span.className = 'chip warn'; span.textContent = `under par (need ${need})`; }
    else { span.className = 'chip'; span.textContent = 'at par'; }
  }
  function paintStats() { if (belowStatNum) belowStatNum.textContent = belowCount(); }

  function setOnFloor(it, delta, valSpan, status) {
    const st = stateOf(it);
    st.onFloor = Math.max(0, (st.onFloor || 0) + delta);
    valSpan.textContent = st.onFloor;   // in-place hot-path update
    paintStatus(it, status);
    paintStats();
    saveSilent();
  }

  function logCount() {
    persist({
      capability: 'inventory', stream: stream.id, verb: 'inventory.counted',
      subject: { key: stream.id, name: stream.label },
      meta: { below: belowCount() },
    });
    toast(`Count logged — ${belowCount()} below par`);
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
    let valSpan; const status = el('span.chip');
    paintStatus(it, status);
    const stepper = el('div.qty', {}, [
      el('button.step', { onclick: () => setOnFloor(it, -1, valSpan, status) }, ['−']),
      (valSpan = el('span.qval', { text: st.onFloor || 0 })),
      el('button.step', { onclick: () => setOnFloor(it, +1, valSpan, status) }, ['+']),
    ]);
    row.append(main, stepper, el('div.item-actions', {}, [status]));
    return row;
  }

  function section(title, list, extraClass) {
    const sec = el('section.sec' + (extraClass ? '.' + extraClass : ''));
    sec.append(el('div.sec-head', {}, [el('span', { text: title }), el('span.count', { text: `${list.length}` })]));
    const body = el('div.inventory-list');
    for (const it of list) body.append(itemRow(it));
    sec.append(body);
    return sec;
  }

  function render() {
    clear(root);
    const stats = el('div.statrow', {}, [
      el('div.stat', {}, [(belowStatNum = el('div.stat-num', { text: belowCount() })), el('div.stat-label', { text: 'below par' })]),
      el('div.stat', {}, [el('div.stat-num', { text: items.length }), el('div.stat-label', { text: 'items' })]),
    ]);
    const head = el('div.inventory-head', {}, [
      stats,
      el('div.muted.sm', { text: `${stream.emoji || ''} floor vs. par · ${todayKey()}` }),
    ]);
    const body = el('div.inventory-body');
    const below = items.filter(underPar);
    if (below.length) body.append(section('Below par', below, 'warn'));
    for (const [cat, list] of cats) {
      const rest = list.filter((it) => !underPar(it));
      if (rest.length) body.append(section(cat, rest));
    }
    root.append(head, body, el('div.pad', {}, [el('button.btn.block', { onclick: logCount }, ['Log count'])]));
  }

  const off = bus.on('slice:' + KEY, (val) => { if (applyingLocal) return; inv = val || {}; render(); });
  render();
  return { unmount() { off(); saveSilent.cancel(); persist(null); } };
}
