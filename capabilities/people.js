// capabilities/people.js — the PEOPLE HUB (Pillar 2). All of it is projections + verbs on the one
// ledger stream: the feed is the ledger tail, praise is a ledger verb, tasks/log are ledger verbs.

const TASKS = 'tasks.v1';

export function mount(container, ctx) {
  const { util, commit, record, store, bus, identity, projections, toast, STREAM_BY_ID } = ctx;
  const { el, clear, ago, uuid, todayKey } = util;
  let tab = 'feed';
  let tasks = store.load(TASKS, {});

  const root = el('div.cap.people');
  container.append(root);

  function streamChip(id) {
    const s = STREAM_BY_ID[id];
    return s ? el('span.chip.stream-chip', { style: { '--accent': s.color }, text: `${s.emoji} ${s.label}` }) : el('span.chip.ghost', { text: id });
  }

  // ---- composer ----
  function composer() {
    const box = el('div.composer');
    const input = el('input.input', { placeholder: 'Leave a note for the team…', maxlength: '140' });
    const post = el('button.btn', { onclick: () => {
      const t = input.value.trim(); if (!t) return;
      record({ capability: 'people', stream: 'core', verb: 'log.posted', meta: { note: t.slice(0, 140) } });
      input.value = ''; toast('Posted'); draw();
    } }, ['Post']);
    const praise = el('button.btn.ghost', { onclick: openPraise }, ['👏 Praise']);
    box.append(input, post, praise);
    return box;
  }

  function openPraise(prefillId) {
    const overlay = el('div.overlay.sheet', { onclick: (e) => { if (e.target === overlay) overlay.remove(); } });
    let toId = prefillId || '';
    const who = el('div.roster');
    for (const p of identity.roster()) {
      if (p.personId === ctx.me.personId) continue;
      const chip = el('button.roster-chip' + (toId === p.personId ? '.on' : ''), { onclick: () => { toId = p.personId; who.querySelectorAll('.roster-chip').forEach((n) => n.classList.remove('on')); chip.classList.add('on'); } },
        [el('span.avatar.sm', { text: p.initials }), el('span', { text: p.displayName.split(' ')[0] })]);
      who.append(chip);
    }
    const msg = el('input.input', { placeholder: 'Say why (optional)…', maxlength: '120' });
    const card = el('div.sheet-card', {}, [
      el('div.sheet-head', {}, [el('span', { text: '👏 Give praise' })]),
      who, msg,
      el('button.btn.block', { onclick: () => {
        if (!toId) { toast('Pick a teammate'); return; }
        record({ capability: 'people', stream: 'core', verb: 'praise.given', meta: { recipient: toId, text: msg.value.trim().slice(0, 120) } });
        overlay.remove(); toast('Praise sent 👏'); draw();
      } }, ['Send praise']),
    ]);
    overlay.append(card); document.body.append(overlay);
  }

  // ---- views ----
  function feedView() {
    const list = el('div.feed');
    const items = projections.feed({ limit: 80 });
    if (!items.length) return el('div.empty', { text: 'Nothing yet today — get the shift going!' });
    for (const f of items) {
      const p = identity.get(f.actor);
      const row = el('div.feed-item', {}, [
        el('span.avatar.sm', { text: p ? p.initials : '··' }),
        el('div.feed-body', {}, [
          el('div.feed-text', {}, [el('b', { text: (f.actorName || 'Someone').split(' ')[0] + ' ' }), f.text]),
          el('div.feed-meta', {}, [streamChip(f.stream), el('span.muted.sm', { text: ago(f.ts) })]),
        ]),
        f.verb !== 'praise.given' ? el('button.tinybtn.praise-quick', { title: 'praise', onclick: () => openPraise(f.actor) }, ['👏']) : null,
      ]);
      list.append(row);
    }
    return list;
  }

  function praiseView() {
    const wall = projections.praiseWall({ limit: 60 });
    if (!wall.length) return el('div.empty', { text: 'No praise yet — be the first 👏' });
    const list = el('div.praise-wall');
    for (const pr of wall) {
      list.append(el('div.praise-card', {}, [
        el('div.praise-line', {}, [el('b', { text: pr.from.split(' ')[0] }), ' 👏 ', el('b', { text: pr.to.split(' ')[0] })]),
        pr.text ? el('div.praise-text', { text: '“' + pr.text + '”' }) : null,
        el('div.muted.sm', { text: ago(pr.ts) }),
      ]));
    }
    return list;
  }

  function tasksView() {
    const wrap = el('div.tasks');
    const add = el('div.composer', {}, [(ti = el('input.input', { placeholder: 'Add a task anyone can grab…', maxlength: '100' })),
      el('button.btn', { onclick: () => { const t = ti.value.trim(); if (!t) return; const id = 'task:' + uuid(); tasks[id] = { id, text: t, claimedBy: null, done: false, ts: Date.now() }; persistTasks(); ti.value = ''; draw(); } }, ['Add'])]);
    var ti;
    wrap.append(add);
    const arr = Object.values(tasks).sort((a, b) => (a.done - b.done) || (b.ts - a.ts));
    if (!arr.length) wrap.append(el('div.empty', { text: 'No open tasks.' }));
    for (const t of arr) {
      const claimer = t.claimedBy && identity.get(t.claimedBy);
      wrap.append(el('div.task' + (t.done ? '.done' : ''), {}, [
        el('button.checkbox', { onclick: () => { t.done = !t.done; if (t.done) record({ capability: 'people', stream: 'core', verb: 'task.done', subject: { name: t.text } }); persistTasks(); draw(); } }),
        el('div.task-body', {}, [el('div', { text: t.text }), claimer ? el('div.muted.sm', { text: 'claimed by ' + claimer.displayName.split(' ')[0] }) : null]),
        !t.claimedBy && !t.done ? el('button.tinybtn', { onclick: () => { t.claimedBy = ctx.me.personId; record({ capability: 'people', stream: 'core', verb: 'task.claimed', subject: { name: t.text } }); persistTasks(); draw(); } }, ['claim']) : null,
      ]));
    }
    return wrap;
  }

  function persistTasks() { store.save(TASKS, tasks); }

  function draw() {
    clear(root);
    const now = Date.now(), since = new Date(todayKey()).getTime();
    const roll = projections.accountability({ since });
    const mine = roll.find((r) => r.personId === ctx.me.personId);
    root.append(el('div.statrow', {}, [
      stat(projections.feed({ limit: 999 }).filter((f) => f.ts >= since).length, 'done today'),
      stat(projections.praiseWall({ limit: 999 }).filter((p) => p.ts >= since).length, 'shout-outs'),
      stat(mine ? mine.actions : 0, 'yours'),
    ]));
    root.append(composer());
    const seg = el('div.seg.full');
    for (const [id, label] of [['feed', 'Feed'], ['praise', 'Praise'], ['tasks', 'Tasks']]) {
      seg.append(el('button.seg-opt' + (tab === id ? '.on' : ''), { onclick: () => { tab = id; draw(); } }, [label]));
    }
    root.append(seg);
    root.append(tab === 'feed' ? feedView() : tab === 'praise' ? praiseView() : tasksView());
  }
  function stat(n, label) { return el('div.stat', {}, [el('div.stat-num', { text: String(n) }), el('div.stat-label', { text: label })]); }

  const off = bus.on('ledger', () => { if (tab === 'feed' || tab === 'praise') draw(); });
  draw();
  return { unmount() { off(); } };
}
