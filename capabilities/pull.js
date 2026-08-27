// capabilities/pull.js — the pull list + glove-friendly Freezer Mode.
// Holes (empty floor spots) float to a "Fill first" section. Every check/label/hole flows through
// commit() so it becomes an attributable ledger event. In-place DOM updates on the hot path.

export function mount(container, ctx) {
  const { stream, catalog, util, commit, store, bus } = ctx;
  const { el, reconcile, fmtTime, todayKey } = util;
  const KEY = `${stream.id}.pull.v1`;
  let pull = store.load(KEY, {});
  let applyingLocal = false;
  let freezer = false;

  const items = catalog.forStream(stream.id);
  const cats = catalog.categoriesFor(stream.id); // Map<category, item[]>

  const root = el('div.cap.pull');
  container.append(root);

  function stateOf(it) { return pull[it._key] || (pull[it._key] = { qty: it.par || 0, done: false, labeled: false, hole: false, addedTs: 0 }); }

  function sellByLabel(it) {
    if (it.pkgDate) return 'pkg date';
    return `sell +${it.days}d`;
  }

  function mutate(it, change, event) {
    applyingLocal = true;
    const st = stateOf(it);
    change(st);
    commit({ slice: KEY, value: pull, event: event ? { capability: 'pull', stream: stream.id, subject: { key: it._key, name: it.name }, ...event } : null });
    applyingLocal = false;
  }

  function toggleDone(it, node) {
    mutate(it, (st) => { st.done = !st.done; }, stateOf(it).done ? null : { verb: 'pull.checked', qty: stateOf(it).qty });
    if (node) node.classList.toggle('done', stateOf(it).done); // freezer mode calls without a node; it redraws itself
  }
  function toggleLabel(it, node) {
    const willLabel = !stateOf(it).labeled;
    mutate(it, (st) => { st.labeled = willLabel; }, willLabel ? { verb: 'pull.labeled', qty: stateOf(it).qty } : null);
    node.classList.toggle('labeled', willLabel);
  }
  function setQty(it, delta, span) {
    mutate(it, (st) => { st.qty = Math.max(0, (st.qty || 0) + delta); }, null);
    span.textContent = stateOf(it).qty;
  }
  function flagHole(it) {
    mutate(it, (st) => { st.hole = true; st.addedTs = Date.now(); st.done = false; }, { verb: 'pull.hole' });
    render();
  }
  function clearHole(it) { mutate(it, (st) => { st.hole = false; st.addedTs = 0; }, null); render(); }

  function itemCard(it) {
    const st = stateOf(it);
    const card = el('div.item' + (st.done ? '.done' : '') + (st.labeled ? '.labeled' : ''), { dataset: { key: it._key } });
    const main = el('div.item-main', {}, [
      el('div.item-name', { text: it.name }),
      el('div.item-sub', {}, [el('span.chip', { text: sellByLabel(it) }), el('span.chip.ghost', { text: it.category })]),
    ]);
    const qty = el('div.qty', {}, [
      el('button.step', { onclick: (e) => { e.stopPropagation(); setQty(it, -1, qspan); } }, ['−']),
      (qspan = el('span.qval', { text: st.qty })),
      el('button.step', { onclick: (e) => { e.stopPropagation(); setQty(it, +1, qspan); } }, ['+']),
    ]);
    var qspan;
    const actions = el('div.item-actions', {}, [
      el('button.tinybtn' + (st.labeled ? '.on' : ''), { onclick: (e) => { e.stopPropagation(); toggleLabel(it, card); } }, ['🏷️']),
      st.hole ? el('button.tinybtn.warn', { onclick: (e) => { e.stopPropagation(); clearHole(it); } }, ['filled']) : el('button.tinybtn', { onclick: (e) => { e.stopPropagation(); flagHole(it); } }, ['hole']),
    ]);
    const check = el('button.checkbox', { onclick: () => toggleDone(it, card) });
    card.append(check, main, qty, actions);
    return card;
  }

  function section(title, list, extraClass) {
    const sec = el('section.pull-sec' + (extraClass ? '.' + extraClass : ''));
    sec.append(el('div.pull-sec-head', {}, [el('span', { text: title }), el('span.count', { text: `${list.filter((i) => !stateOf(i).done).length} left` })]));
    const body = el('div.pull-list');
    for (const it of list) body.append(itemCard(it));
    sec.append(body);
    return sec;
  }

  function render() {
    root.querySelectorAll('.pull-body, .pull-toolbar').forEach((n) => n.remove());
    const toolbar = el('div.pull-toolbar', {}, [
      el('div.muted.sm', { text: `${items.length} items · ${todayKey()}` }),
      stream.freezerMode ? el('button.btn.freezer-btn', { onclick: openFreezer }, ['🧊 Freezer Mode']) : null,
    ]);
    const body = el('div.pull-body');
    const holes = items.filter((it) => stateOf(it).hole);
    if (holes.length) {
      holes.sort((a, b) => (stateOf(a).addedTs) - (stateOf(b).addedTs));
      const sec = el('section.pull-sec.fill-first');
      sec.append(el('div.pull-sec-head', {}, [el('span', { text: '🕳️ Fill first' }), el('span.count', { text: `${holes.length}` })]));
      const list = el('div.pull-list');
      for (const it of holes) {
        const c = itemCard(it);
        c.append(el('span.added', { text: 'flagged ' + fmtTime(stateOf(it).addedTs) }));
        list.append(c);
      }
      sec.append(list); body.append(sec);
    }
    for (const [cat, list] of cats) body.append(section(cat, list));
    root.append(toolbar, body);
  }

  // ---- Freezer Mode: full-screen, giant targets ----
  function openFreezer() {
    freezer = true;
    const ov = el('div.freezer');
    const head = el('div.freezer-head', {}, [
      el('div', {}, [el('div.freezer-title', { text: `${stream.emoji} ${stream.label} — Freezer` }), el('div.muted.sm', { text: 'Tap a name to check it off' })]),
      el('button.btn.ghost', { onclick: () => { ov.remove(); freezer = false; render(); } }, ['Done']),
    ]);
    const list = el('div.freezer-list');
    const draw = () => {
      reconcile(list, items.filter((it) => !stateOf(it).done || stateOf(it).hole), (it) => it._key,
        (it) => {
          const row = el('button.freezer-row' + (stateOf(it).hole ? '.hole' : ''), { onclick: () => { toggleDone(it); draw(); } }, [
            el('span.freezer-name', { text: it.name }),
            el('span.freezer-qty', { text: '×' + stateOf(it).qty }),
          ]);
          return row;
        }, () => {});
    };
    ov.append(head, list); document.body.append(ov); draw();
  }

  const off = bus.on('slice:' + KEY, (val) => { if (applyingLocal) return; pull = val || {}; render(); });
  render();
  return { unmount() { off(); } };
}
