// capabilities/process.js — the SOP checklist runner (Pillar 1). Reads the stream's process SOP,
// groups steps by section, and lets you big-tap each step done. Every check flows through commit()
// as an attributable ledger event; completing the whole list records a 'process.completed' once.
// New shift = new day: stored state auto-resets to a fresh, untouched checklist.

export function mount(container, ctx) {
  const { stream, util, commit, store, bus, identity, PROCESSES } = ctx;
  const { el, todayKey } = util;
  const KEY = `${stream.id}.process.v1`;
  const def = PROCESSES[stream.processId] || null;

  let s = store.load(KEY, { day: todayKey(), done: {} });
  if (s.day !== todayKey()) s = { day: todayKey(), done: {} };
  let applyingLocal = false;

  const root = el('div.cap.process');
  container.append(root);

  // Empty state — no SOP defined for this stream.
  if (!def) {
    root.append(el('div.sec', {}, [
      el('div.center.muted', {}, [
        el('div', { text: '📋', style: { fontSize: '2rem' } }),
        el('div', { text: 'No opening process for this stream yet.' }),
        el('div.sm', { text: 'Check back when your SOP is published.' }),
      ]),
    ]));
    return { unmount() {} };
  }

  // Preserve step order while grouping by section.
  const sections = [];
  const byName = new Map();
  for (const step of def.steps) {
    let g = byName.get(step.section);
    if (!g) { g = { name: step.section, steps: [] }; byName.set(step.section, g); sections.push(g); }
    g.steps.push(step);
  }
  const total = def.steps.length;
  const doneCount = () => Object.keys(s.done).length;
  const allDone = () => doneCount() >= total;

  function mutate(change, event) {
    applyingLocal = true;
    change();
    commit({ slice: KEY, value: s, event: event ? { capability: 'process', stream: stream.id, ...event } : null });
    applyingLocal = false;
  }

  function toggleStep(step, row) {
    const isDone = !!s.done[step.id];
    if (isDone) {
      mutate(() => { delete s.done[step.id]; }, null); // silent un-check
      row.classList.remove('done');
      updateProgress();
      return;
    }
    const wasComplete = allDone();
    mutate(() => { s.done[step.id] = { by: ctx.me?.personId || null, ts: Date.now() }; },
      { verb: 'process.step', meta: { process: def.title, step: step.text } });
    row.classList.add('done');
    setAvatar(step, row);
    updateProgress();
    // First time the whole list closes out — record the completion once.
    if (!wasComplete && allDone()) {
      commit({ slice: KEY, value: s, event: { capability: 'process', stream: stream.id, verb: 'process.completed', meta: { process: def.title } } });
      ctx.toast?.(`${def.title} — all done ✓`);
    }
  }

  function setAvatar(step, row) {
    const slot = row.querySelector('.process-by');
    if (!slot) return;
    util.clear(slot);
    const rec = s.done[step.id];
    if (rec) slot.append(el('span.badge', { text: identity.get(rec.by)?.initials || '··' }));
  }

  let bar, tally;
  function updateProgress() {
    const n = doneCount();
    if (tally) tally.textContent = `${n}/${total} done`;
    if (bar) bar.style.width = total ? `${Math.round((n / total) * 100)}%` : '0%';
    root.classList.toggle('process-complete', allDone());
  }

  function stepRow(step) {
    const isDone = !!s.done[step.id];
    const row = el('button.item.process-step' + (isDone ? '.done' : ''), { dataset: { key: step.id } });
    const check = el('span.checkbox');
    const main = el('div.item-main', {}, [el('div.item-name', { text: step.text })]);
    const by = el('div.process-by');
    row.addEventListener('click', () => toggleStep(step, row));
    row.append(check, main, by);
    if (isDone) setAvatar(step, row);
    return row;
  }

  function render() {
    util.clear(root);
    root.classList.toggle('process-complete', allDone());
    const head = el('div.sec-head', {}, [
      el('div', {}, [el('span', { text: `${stream.emoji} ${def.title}` })]),
      (tally = el('span.count', { text: `${doneCount()}/${total} done` })),
    ]);
    const track = el('div.process-track', {}, [(bar = el('div.process-fill'))]);
    root.append(head, track);
    for (const g of sections) {
      const sec = el('section.sec');
      sec.append(el('div.sec-head', {}, [el('span.label', { text: g.name }), el('span.count', { text: `${g.steps.filter((st) => s.done[st.id]).length}/${g.steps.length}` })]));
      const body = el('div.col');
      for (const step of g.steps) body.append(stepRow(step));
      sec.append(body);
      root.append(sec);
    }
    updateProgress();
  }

  const off = bus.on('slice:' + KEY, (val) => {
    if (applyingLocal) return;
    s = val || { day: todayKey(), done: {} };
    if (s.day !== todayKey()) s = { day: todayKey(), done: {} };
    render();
  });

  render();
  return { unmount() { off(); } };
}
