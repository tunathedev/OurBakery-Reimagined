// capabilities/order.js — the custom-cake CROSS-STREAM handoff (the marquee demo).
// ONE capability, TWO views over ONE shared order collection:
//   Packager (orderRole 'place')  -> takes the order at the counter, mints order:<uuid>
//   Cake     (orderRole 'receive') -> sees it appear live and advances it to pickup.
// Every transition is an attributable ledger event. Customer PII is never put in the label/ledger.

const KEY = 'orders.v1';
const FLOW = ['placed', 'received', 'in_progress', 'ready', 'picked_up'];
const NEXT_LABEL = { placed: 'Receive', received: 'Start', in_progress: 'Mark ready', ready: 'Picked up' };
const STATUS_LABEL = { placed: 'Placed', received: 'Received', in_progress: 'In progress', ready: 'Ready 🛎️', picked_up: 'Picked up ✓' };

export function mount(container, ctx) {
  const { stream, catalog, util, commit, store, bus, identity, toast } = ctx;
  const { el, uuid, fmtDate, ago, clear } = util;
  const role = stream.orderRole || 'receive';
  let orders = store.load(KEY, {});
  let applyingLocal = false;

  const root = el('div.cap.order');
  container.append(root);

  const cakeItems = catalog.forStream('cake');

  function save(order, event) {
    applyingLocal = true;
    orders[order.orderId] = order;
    commit({ slice: KEY, value: orders, event: event ? { capability: 'order', stream: stream.id, subject: { key: order.cakeKey || null, name: order.label }, ...event } : null });
    applyingLocal = false;
  }

  function advance(order) {
    const i = FLOW.indexOf(order.status);
    if (i < 0 || i >= FLOW.length - 1) return;
    const next = FLOW[i + 1];
    order.status = next;
    order[next + 'At'] = Date.now();
    if (next === 'received') order.receivedBy = ctx.me.personId;
    if (next === 'ready' && order.curbside) toast('🛎️ Curbside notified — order is ready');
    save(order, { verb: 'order.' + next });
    render();
  }

  // ---- placing view (Packager) ----
  function placeForm() {
    const wrap = el('div.order-form');
    const label = el('input.input', { placeholder: 'Order label (e.g. "Birthday — 1/4 Sheet Chocolate")', maxlength: '60' });
    const cake = el('select.select');
    cake.append(el('option', { value: '' }, ['— cake type —']));
    for (const it of cakeItems) cake.append(el('option', { value: it._key }, [it.name]));
    const size = el('input.input', { placeholder: 'Size / servings (e.g. 1/4 sheet, serves 25)', maxlength: '40' });
    const forDate = el('input.input', { type: 'date' });
    const msg = el('input.input', { placeholder: 'Message on cake (optional)', maxlength: '60' });
    const deco = el('textarea.textarea', { placeholder: 'Decoration notes (colors, theme)…', rows: '2' });
    const curb = el('label.check-inline', {}, [(curbCb = el('input', { type: 'checkbox' })), ' Curbside pickup']);
    var curbCb;
    const submit = el('button.btn.block', { onclick: () => {
      if (!label.value.trim()) { toast('Add an order label'); return; }
      const it = cake.value ? catalog.get(cake.value) : null;
      const order = {
        orderId: 'order:' + uuid(), label: label.value.trim().slice(0, 60),
        cakeKey: it ? it._key : null, cakeName: it ? it.name : '',
        size: size.value.trim(), forDate: forDate.value || '', message: msg.value.trim(), deco: deco.value.trim(),
        curbside: curbCb.checked, status: 'placed', placedBy: ctx.me.personId, placedByName: ctx.me.displayName, placedAt: Date.now(),
      };
      save(order, { verb: 'order.placed', meta: { forDate: order.forDate || 'unset' } });
      toast('Order placed → sent to Cake'); render();
    } }, ['🎂 Place order']);
    wrap.append(
      el('div.sec-head', {}, [el('span', { text: 'Take a custom-cake order' })]),
      label, cake, size, el('div.row.g8', {}, [forDate]), msg, deco, curb, submit,
      el('div.muted.sm', { text: 'Customer name/phone stays on the paper slip — never typed here (no PII).' }),
    );
    return wrap;
  }

  function orderCard(order) {
    const placedBy = identity.get(order.placedBy);
    const card = el('div.card.order-card.s-' + order.status);
    const head = el('div.order-head', {}, [
      el('div.order-label', { text: order.label }),
      el('span.badge.s-' + order.status, { text: STATUS_LABEL[order.status] }),
    ]);
    const meta = el('div.order-meta', {}, [
      order.cakeName ? el('span.chip.ghost', { text: order.cakeName }) : null,
      order.size ? el('span.chip.ghost', { text: order.size }) : null,
      order.forDate ? el('span.chip', { text: 'for ' + fmtDate(new Date(order.forDate).getTime()) }) : null,
      order.curbside ? el('span.chip.curb', { text: '🚗 curbside' }) : null,
    ]);
    const detail = el('div.order-detail', {}, [
      order.message ? el('div.sm', {}, [el('b', { text: 'Msg: ' }), order.message]) : null,
      order.deco ? el('div.sm.muted', { text: order.deco }) : null,
      el('div.sm.muted', { text: `placed by ${placedBy ? placedBy.displayName.split(' ')[0] : order.placedByName || '—'} · ${ago(order.placedAt)}` }),
    ]);
    card.append(head, meta, detail);
    // receiving side gets the advance button
    if (role === 'receive' && order.status !== 'picked_up') {
      card.append(el('button.btn.block.advance', { onclick: () => advance(order) }, [NEXT_LABEL[order.status] || '—']));
    }
    if (order.status !== 'picked_up') {
      card.append(el('div.progress-track', {}, FLOW.slice(0, 4).map((st, i) =>
        el('span.pip' + (FLOW.indexOf(order.status) >= i + 1 || order.status === st ? '.on' : '')))));
    }
    return card;
  }

  function list(predicate, emptyMsg) {
    const arr = Object.values(orders).filter(predicate).sort((a, b) => {
      const d = (new Date(a.forDate || 0)) - (new Date(b.forDate || 0));
      return d || (a.placedAt - b.placedAt);
    });
    if (!arr.length) return el('div.empty', { text: emptyMsg });
    const box = el('div.order-list');
    for (const o of arr) box.append(orderCard(o));
    return box;
  }

  function render() {
    clear(root);
    if (role === 'place') {
      root.append(placeForm());
      root.append(el('div.sec-head.mt', {}, [el('span', { text: 'Orders you placed' })]));
      root.append(list((o) => o.placedBy === ctx.me.personId, 'No orders yet — take one above.'));
    } else {
      const active = (o) => o.status !== 'picked_up';
      const counts = Object.values(orders).filter(active).length;
      root.append(el('div.statrow', {}, [
        stat(counts, 'in queue'),
        stat(Object.values(orders).filter((o) => o.status === 'ready').length, 'ready'),
        stat(Object.values(orders).filter((o) => o.status === 'placed').length, 'new'),
      ]));
      root.append(el('div.sec-head', {}, [el('span', { text: '🎂 Custom-cake receiving queue' })]));
      root.append(list(active, 'Queue is clear. New orders from Packager appear here live.'));
      const done = Object.values(orders).filter((o) => o.status === 'picked_up');
      if (done.length) { root.append(el('div.sec-head.mt', {}, [el('span', { text: 'Picked up' })])); root.append(list((o) => o.status === 'picked_up', '')); }
    }
  }
  function stat(n, label) { return el('div.stat', {}, [el('div.stat-num', { text: String(n) }), el('div.stat-label', { text: label })]); }

  const off = bus.on('slice:' + KEY, (val) => { if (applyingLocal) return; orders = val || {}; render(); });
  render();
  return { unmount() { off(); } };
}
