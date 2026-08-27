// capabilities/ledgerview.js — the LEDGER OF TRUTH (Pillar 3), promoted from a hidden sheet to a
// first-class, on-screen, filterable timeline with CSV export. Team-visible, credit-first.

export function mount(container, ctx) {
  const { util, ledger, projections, identity, bus, STREAM_BY_ID, STREAMS } = ctx;
  const { el, clear, fmtTime, fmtDate, todayKey } = util;
  const filter = { who: '', stream: '', window: 'today', verb: '' };

  const root = el('div.cap.ledgerview');
  container.append(root);

  function sinceFor() {
    if (filter.window === 'today') return new Date(todayKey()).getTime();
    if (filter.window === '7d') return Date.now() - 7 * 86400000;
    return 0;
  }

  function filtered() {
    let out = ledger.query({ since: sinceFor(), stream: filter.stream || undefined, actor: filter.who || undefined, limit: 1000 });
    if (filter.verb) out = out.filter((e) => String(e.verb).startsWith(filter.verb));
    return out;
  }

  function verbBadge(v) {
    const noun = String(v).split('.')[0];
    return el('span.verb-badge.v-' + noun, { text: v });
  }

  function streamChip(id) {
    const s = STREAM_BY_ID[id];
    return s ? el('span.chip.stream-chip', { style: { '--accent': s.color }, text: `${s.emoji} ${s.label}` }) : el('span.chip.ghost', { text: id });
  }

  function timeline(events) {
    if (!events.length) return el('div.empty', { text: 'No events for this filter.' });
    const list = el('div.timeline');
    let lastDay = '';
    for (const e of events) {
      const day = todayKey(e.ts);
      if (day !== lastDay) { list.append(el('div.timeline-day', { text: fmtDate(e.ts) })); lastDay = day; }
      const p = identity.get(e.actor);
      list.append(el('div.timeline-row', {}, [
        el('span.tl-time', { text: fmtTime(e.ts) }),
        el('span.avatar.sm', { text: p ? p.initials : '··' }),
        el('div.tl-body', {}, [
          el('div.tl-text', {}, [el('b', { text: (e.actorName || 'Someone').split(' ')[0] + ' ' }), projections.phrase(e)]),
          el('div.tl-meta', {}, [streamChip(e.stream), verbBadge(e.verb)]),
        ]),
      ]));
    }
    return list;
  }

  function toCsv(events) {
    const head = ['id', 'time', 'actor', 'stream', 'capability', 'verb', 'subject', 'qty', 'meta'];
    const esc = (s) => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
    const rows = events.map((e) => [e.id, new Date(e.ts).toISOString(), e.actorName, e.stream, e.capability, e.verb,
      e.subject ? e.subject.name : '', e.qty == null ? '' : e.qty, JSON.stringify(e.meta || {})].map(esc).join(','));
    return head.join(',') + '\n' + rows.join('\n');
  }

  function exportCsv() {
    const events = filtered();
    const blob = new Blob([toCsv(events)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: `ourbakery-ledger-${todayKey()}.csv` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    ctx.toast(`Exported ${events.length} events`);
  }

  function selectFilter(labelText, value, opts, onchange) {
    const sel = el('select.select.sm', { onchange: (e) => onchange(e.target.value) });
    for (const o of opts) sel.append(el('option', { value: o.value, ...(o.value === value ? { selected: true } : {}) }, [o.label]));
    return el('label.filter', {}, [el('span.filter-label', { text: labelText }), sel]);
  }

  function render() {
    clear(root);
    const events = filtered();
    root.append(el('div.statrow', {}, [
      stat(events.length, 'updates'),
      stat(new Set(events.map((e) => e.actor)).size, 'people'),
      stat(events.filter((e) => e.verb === 'praise.given').length, 'shout-outs'),
    ]));

    const bar = el('div.filterbar');
    bar.append(
      selectFilter('When', filter.window, [{ value: 'today', label: 'Today' }, { value: '7d', label: 'Last 7 days' }, { value: 'all', label: 'All' }], (v) => { filter.window = v; render(); }),
      selectFilter('Who', filter.who, [{ value: '', label: 'Everyone' }, ...identity.roster().map((p) => ({ value: p.personId, label: p.displayName }))], (v) => { filter.who = v; render(); }),
      selectFilter('Stream', filter.stream, [{ value: '', label: 'All streams' }, ...STREAMS.filter((s) => !s.external).map((s) => ({ value: s.id, label: s.label }))], (v) => { filter.stream = v; render(); }),
      selectFilter('Type', filter.verb, [{ value: '', label: 'All' }, { value: 'pull', label: 'Pull' }, { value: 'process', label: 'Process' }, { value: 'order', label: 'Orders' }, { value: 'production', label: 'Production' }, { value: 'praise', label: 'Praise' }, { value: 'standard', label: 'Standards' }], (v) => { filter.verb = v; render(); }),
    );
    root.append(bar);
    root.append(el('div.row.between', {}, [
      el('div.muted.sm', { text: 'Everything the team did, in order.' }),
      el('button.btn.sm.ghost', { onclick: exportCsv }, ['⬇ Export']),
    ]));
    root.append(timeline(events));
  }
  function stat(n, label) { return el('div.stat', {}, [el('div.stat-num', { text: String(n) }), el('div.stat-label', { text: label })]); }

  const off = bus.on('ledger', render);
  render();
  return { unmount() { off(); } };
}
