// capabilities/forecast.js — sales forecast + production planning (Pillar 1).
// Three dayparts (Open/Midday/Close), each a Low/Med/High segmented control, plus a notes box.
// Every segment tap records a 'forecast.set' ledger event; notes save debounced and record on blur.
// Derives a plain-language "suggested emphasis" line from the picked demand levels.

export function mount(container, ctx) {
  const { stream, util, commit, store, bus } = ctx;
  const { el, debounce } = util;
  const KEY = `${stream.id}.forecast.v1`;
  const DAYPARTS = [['open', 'Open'], ['midday', 'Midday'], ['close', 'Close']];
  const LEVELS = [['low', 'Low'], ['med', 'Med'], ['high', 'High']];
  const newState = () => ({ dayparts: { open: 'med', midday: 'med', close: 'low' }, notes: '' });

  let s = store.load(KEY, newState());
  if (!s.dayparts) s.dayparts = newState().dayparts;
  if (typeof s.notes !== 'string') s.notes = '';
  let applyingLocal = false;
  let notesDirty = false;

  const root = el('div.cap.forecast');
  container.append(root);

  // The single persist+record funnel. Pass event to append a ledger event, null for a silent save.
  function save(record) {
    applyingLocal = true;
    commit({ slice: KEY, value: s, event: record ? { capability: 'forecast', stream: stream.id, verb: 'forecast.set', meta: { dayparts: { ...s.dayparts } } } : null });
    applyingLocal = false;
  }
  const saveNotes = debounce(() => save(false), 500); // silent; the recorded event lands on blur

  function emphasis() {
    const d = s.dayparts;
    const highs = DAYPARTS.filter(([k]) => d[k] === 'high').map(([, l]) => l);
    if (highs.length) return `Bake ahead for the ${highs.join(' & ')} window${highs.length > 1 ? 's' : ''}.`;
    if (DAYPARTS.every(([k]) => d[k] === 'low')) return 'Light day — trim par, pull less.';
    return 'Steady day — bake to par.';
  }

  let empLine;
  function updateEmphasis() { if (empLine) empLine.textContent = '⚑ ' + emphasis(); }

  function segControl(key) {
    const seg = el('div.seg', { dataset: { key } });
    for (const [val, label] of LEVELS) {
      const opt = el('button.seg-opt' + (s.dayparts[key] === val ? '.on' : ''), {
        dataset: { val }, text: label,
        onclick: () => {
          if (s.dayparts[key] === val) return;
          s.dayparts[key] = val;
          seg.querySelectorAll('.seg-opt').forEach((b) => b.classList.toggle('on', b.dataset.val === val));
          save(true);
          updateEmphasis();
        },
      });
      seg.append(opt);
    }
    return seg;
  }

  function render() {
    util.clear(root);
    root.append(el('div.sec-head', {}, [el('span', { text: `${stream.emoji} How busy today?` }), el('span.count', { text: 'today' })]));

    const sec = el('section.sec');
    for (const [key, label] of DAYPARTS) {
      sec.append(el('div.forecast-row.row', {}, [el('div.label', { text: label }), segControl(key)]));
    }
    root.append(sec);

    empLine = el('div.forecast-emphasis.chip', { text: '⚑ ' + emphasis() });
    root.append(el('div.center.pad', {}, [empLine]));

    const notes = el('textarea.textarea', { placeholder: 'Notes — events, weather, promos affecting demand…', rows: '3' });
    notes.value = s.notes;
    notes.addEventListener('input', () => { s.notes = notes.value; notesDirty = true; saveNotes(); });
    notes.addEventListener('blur', () => {
      s.notes = notes.value;
      saveNotes.cancel();
      if (notesDirty) { notesDirty = false; save(true); }
    });
    root.append(el('div.field', {}, [el('div.label', { text: 'Notes' }), notes]));
  }

  const off = bus.on('slice:' + KEY, (val) => {
    if (applyingLocal) return;
    s = val || newState();
    if (!s.dayparts) s.dayparts = newState().dayparts;
    if (typeof s.notes !== 'string') s.notes = '';
    render();
  });

  render();
  return { unmount() { saveNotes.cancel(); off(); } };
}
