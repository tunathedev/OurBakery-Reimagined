// streams/manifests.js — the THIN declarative layer. Each stream is data, not code: it names
// which shared capabilities mount and how they behave. Adding a stream = adding a manifest, never
// copying a screen. This is what keeps line-count O(capability-types)+spine, not O(streams x modules).

export const STREAMS = [
  {
    id: 'managers', label: 'Managers', emoji: '📋', color: '#7c3aed', ready: true,
    role: 'manager',
    capabilities: ['standards', 'people', 'ledger'],
    catalogScope: null, freezerMode: false, productionMode: null, processId: null,
    blurb: 'Enforce standards. Communicate praise.',
  },
  {
    id: 'tortilla', label: 'Tortilla', emoji: '🌮', color: '#d97706', ready: true,
    capabilities: ['process', 'pull', 'forecast', 'production'],
    catalogScope: 'tortilla', freezerMode: false, productionMode: 'par', processId: 'tortilla',
    blurb: 'Process · pull list · forecast · production planning.',
  },
  {
    id: 'cake', label: 'Cake', emoji: '🎂', color: '#db2777', ready: true,
    capabilities: ['process', 'pull', 'production', 'order', 'inventory'],
    catalogScope: 'cake', freezerMode: true, productionMode: 'par', processId: 'cake',
    orderRole: 'receive',
    blurb: 'Freezer pull · production planner · custom-cake receiving · floor inventory.',
  },
  {
    id: 'doughnut', label: 'Doughnut', emoji: '🍩', color: '#0ea5e9', ready: true,
    capabilities: ['process', 'pull', 'forecast', 'production'],
    catalogScope: 'doughnut', freezerMode: false, productionMode: 'par', processId: 'doughnut',
    blurb: 'Process · pull list · forecast · production planning.',
  },
  {
    id: 'scratch-bread', label: 'Scratch Bread', emoji: '🍞', color: '#b45309', ready: true,
    capabilities: ['process', 'pull', 'forecast', 'production'],
    catalogScope: 'scratch-bread', freezerMode: false, productionMode: 'par', processId: 'scratch-bread',
    blurb: 'Process · pull list · forecast · production planning.',
  },
  {
    id: 'packager', label: 'Packager', emoji: '📦', color: '#059669', ready: true,
    capabilities: ['process', 'pull', 'forecast', 'production', 'order'],
    catalogScope: 'packager', freezerMode: false, productionMode: 'pull', processId: 'packager',
    orderRole: 'place',
    blurb: 'Opener · midday · closer. Process · pull · forecast · custom-cake placing.',
  },
  {
    id: 'breakout', label: 'Breakout', emoji: '🥐', color: '#ea580c', ready: true,
    capabilities: ['process', 'pull', 'forecast', 'production'],
    catalogScope: 'breakout', freezerMode: true, productionMode: 'par', processId: 'breakout',
    blurb: 'Process · pull list · forecast · production planning.',
  },
  {
    id: 'rts', label: 'RTS', emoji: '🧁', color: '#334155', ready: false, external: true,
    externalUrl: '', // the existing RTS app is a SEPARATE deployment — link it here, never embedded
    capabilities: [],
    catalogScope: null, freezerMode: false, productionMode: null, processId: null,
    blurb: 'Ready-To-Sell — the existing app. Lives on its own; linked here, not rebuilt.',
  },
];

export const STREAM_BY_ID = Object.fromEntries(STREAMS.map((s) => [s.id, s]));

// Human labels for capabilities (tab names).
export const CAP_LABEL = {
  process: 'Process',
  pull: 'Pull List',
  forecast: 'Forecast',
  production: 'Production',
  order: 'Orders',
  inventory: 'Inventory',
  standards: 'Standards',
  people: 'Hub',
  ledger: 'Ledger',
};
export const CAP_EMOJI = {
  process: '✅', pull: '🧊', forecast: '📈', production: '🧮', order: '🎂',
  inventory: '📊', standards: '📋', people: '💬', ledger: '📜',
};
