// data/seed.js — first-run seed content: roster, per-stream process SOPs, manager standards, and a
// small demo ledger so the People Hub and accountability views feel alive on first open.
// All managed-in-code but copied into synced, user-editable state on first run (never re-stomped).

export const ROSTER = [
  { displayName: 'Maria Solis', pin: '1234', role: 'partner', streams: ['tortilla', 'doughnut', 'cake'] },
  { displayName: 'James Carter', pin: '2345', role: 'partner', streams: ['scratch-bread', 'breakout'] },
  { displayName: 'Ana Reyes', pin: '3456', role: 'partner', streams: ['cake', 'packager'] },
  { displayName: 'Deshawn Brooks', pin: '4567', role: 'partner', streams: ['doughnut', 'packager'] },
  { displayName: 'Priya Nair', pin: '5678', role: 'manager', streams: [] },
];

// Process SOPs. steps: { id, text, section }. Sections group steps in the checklist runner.
export const PROCESSES = {
  cake: {
    id: 'cake', title: 'Cake Opening Process', steps: [
      { id: 'c1', section: 'Freezer', text: 'Pull the freezer list — sheet cakes & rounds to thaw' },
      { id: 'c2', section: 'Freezer', text: 'Date-label every thawed cake with sell-by' },
      { id: 'c3', section: 'Floor', text: 'Fill holes in the cake case first' },
      { id: 'c4', section: 'Floor', text: 'Bring floor inventory to par' },
      { id: 'c5', section: 'Orders', text: 'Check custom-cake receiving queue for today' },
      { id: 'c6', section: 'Close', text: 'Wipe case glass; face all products label-out' },
    ],
  },
  tortilla: {
    id: 'tortilla', title: 'Tortilla Line Process', steps: [
      { id: 't1', section: 'Setup', text: 'Verify press temp and flour hopper level' },
      { id: 't2', section: 'Run', text: 'Run fajita + burrito counts to forecast' },
      { id: 't3', section: 'Pack', text: 'Bag, date, and label per pull list' },
      { id: 't4', section: 'Floor', text: 'Rotate FIFO; fill holes first' },
      { id: 't5', section: 'Close', text: 'Sanitize press and log yields' },
    ],
  },
  doughnut: {
    id: 'doughnut', title: 'Doughnut Opening Process', steps: [
      { id: 'd1', section: 'Fry', text: 'Proof and fry cake + yeast rings to forecast' },
      { id: 'd2', section: 'Finish', text: 'Glaze, ice, and fill; stage kolaches' },
      { id: 'd3', section: 'Floor', text: 'Fill the doughnut case — holes first' },
      { id: 'd4', section: 'Floor', text: 'Label singles and dozens with sell-by' },
      { id: 'd5', section: 'Close', text: 'Break down fryer; log waste' },
    ],
  },
  'scratch-bread': {
    id: 'scratch-bread', title: 'Scratch Bread Process', steps: [
      { id: 's1', section: 'Mix', text: 'Mix and bench doughs per production plan' },
      { id: 's2', section: 'Bake', text: 'Bake bolillo, French, sourdough to schedule' },
      { id: 's3', section: 'Floor', text: 'Cool, bag, date; fill holes first' },
      { id: 's4', section: 'Close', text: 'Scale tomorrow’s pre-ferment' },
    ],
  },
  packager: {
    id: 'packager', title: 'Packager Shift Process', steps: [
      { id: 'p1', section: 'Open', text: 'Package overnight bake; date and label' },
      { id: 'p2', section: 'Midday', text: 'Refill grab-and-go; fill holes first' },
      { id: 'p3', section: 'Orders', text: 'Place any new custom-cake orders taken at the counter' },
      { id: 'p4', section: 'Close', text: 'Pull expired; complete waste log' },
    ],
  },
  breakout: {
    id: 'breakout', title: 'Breakout / Wrapped Process', steps: [
      { id: 'b1', section: 'Thaw', text: 'Pull cookies, muffins, danish from freezer to par' },
      { id: 'b2', section: 'Finish', text: 'Ice and package; date every clamshell' },
      { id: 'b3', section: 'Floor', text: 'Fill the wrapped set — holes first' },
      { id: 'b4', section: 'Close', text: 'Rotate FIFO; log shrink' },
    ],
  },
};

export const STANDARDS = [
  { id: 'std-labels', stream: 'all', title: 'Every product date-labeled', version: 1,
    checklist: ['Sell-by date on every item', 'Label faces the customer', 'No unlabeled product on the floor'] },
  { id: 'std-holes', stream: 'all', title: 'Holes filled before walking away', version: 1,
    checklist: ['No empty floor spots at open', 'Fill-first list cleared', 'Case faced label-out'] },
  { id: 'std-freezer', stream: 'cake', title: 'Freezer pulled to plan', version: 1,
    checklist: ['Pull list matches forecast', 'Thawed product dated', 'FIFO respected'] },
];

// Demo ledger: builds attributable events from the seeded persons so the feed feels alive.
// personsByName: Map(displayName -> profile). minutesAgo spaces them out.
export function demoLedger(personsByName) {
  const P = (name) => personsByName.get(name);
  const mk = (name, over) => ({ actor: P(name), minutesAgo: over.minutesAgo, ...over });
  return [
    mk('Maria Solis',   { stream: 'doughnut', capability: 'pull', verb: 'pull.labeled', subject: { name: 'Glazed Donuts 12ct' }, qty: 12, minutesAgo: 118 }),
    mk('Maria Solis',   { stream: 'doughnut', capability: 'pull', verb: 'pull.hole', subject: { name: 'Chocolate Iced Donut' }, minutesAgo: 112 }),
    mk('Deshawn Brooks',{ stream: 'doughnut', capability: 'process', verb: 'process.step', meta: { process: 'Doughnut Opening Process', step: 'Glaze, ice, and fill; stage kolaches' }, minutesAgo: 96 }),
    mk('James Carter',  { stream: 'scratch-bread', capability: 'pull', verb: 'pull.checked', subject: { name: 'Bolillo' }, qty: 40, minutesAgo: 84 }),
    mk('Ana Reyes',     { stream: 'cake', capability: 'order', verb: 'order.received', subject: { name: 'Birthday — 1/4 Sheet Chocolate' }, minutesAgo: 63, meta: { forDate: 'today' } }),
    mk('Ana Reyes',     { stream: 'cake', capability: 'pull', verb: 'pull.labeled', subject: { name: '8" Round Cake White' }, qty: 6, minutesAgo: 55 }),
    mk('Priya Nair',    { stream: 'managers', capability: 'standards', verb: 'standard.published', meta: { title: 'Every product date-labeled' }, minutesAgo: 47 }),
    mk('Maria Solis',   { stream: 'managers', capability: 'standards', verb: 'standard.acknowledged', meta: { title: 'Every product date-labeled' }, minutesAgo: 41 }),
    mk('Priya Nair',    { stream: 'doughnut', capability: 'people', verb: 'praise.given', meta: { recipientName: 'Maria Solis', text: 'Case looked perfect at open — holes filled first!' }, minutesAgo: 33 }),
    mk('Deshawn Brooks',{ stream: 'packager', capability: 'order', verb: 'order.placed', subject: { name: 'Graduation — 1/2 Sheet White' }, minutesAgo: 22, meta: { forDate: 'Sat' } }),
    mk('James Carter',  { stream: 'breakout', capability: 'production', verb: 'production.planned', subject: { name: 'Chocolate Chip Cookies 12ct' }, minutesAgo: 12 }),
  ];
}
