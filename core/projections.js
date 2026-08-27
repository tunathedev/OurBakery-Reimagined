// core/projections.js — the PEOPLE HUB feed and the ACCOUNTABILITY rollups are pure folds of the
// ledger tail. No separately-synced tables: read the one event stream, present it two ways.

let deps = null; // { bus, ledger, identity }

export function init(d) { deps = d; }

// Human phrasing for a ledger event. Central so the feed reads consistently everywhere.
export function phrase(e) {
  const who = e.actorName || 'Someone';
  const n = e.subject && e.subject.name;
  const q = e.qty != null ? `${e.qty} ` : '';
  switch (e.verb) {
    case 'pull.labeled': return `labeled ${q}${n || 'an item'}`;
    case 'pull.checked': return `pulled ${q}${n || 'an item'}`;
    case 'pull.hole': return `flagged an empty spot to fill — ${n || 'a spot'}`;
    case 'process.step': return `checked off “${(e.meta && e.meta.step) || 'a step'}”`;
    case 'process.completed': return `finished all the ${e.meta && e.meta.process || 'steps'}`;
    case 'production.planned': return `set what to make for ${labelFor(e)}`;
    case 'forecast.set': return `set how busy ${labelFor(e)} will be`;
    case 'inventory.counted': return `counted the floor for ${labelFor(e)}`;
    case 'order.placed': return `started a new cake order${n ? ` — ${n}` : ''}`;
    case 'order.received': return `took in a cake order${n ? ` — ${n}` : ''}`;
    case 'order.in_progress': return `started making a cake${n ? ` — ${n}` : ''}`;
    case 'order.ready': return `marked a cake ready for pickup${n ? ` — ${n}` : ''}`;
    case 'order.picked_up': return `gave a cake to the customer${n ? ` — ${n}` : ''}`;
    case 'praise.given': return `gave a shout-out to ${praiseRecipientName(e)}${e.meta && e.meta.text ? ` — "${e.meta.text}"` : ''}`;
    case 'task.claimed': return `grabbed a task${n ? ` — ${n}` : ''}`;
    case 'task.done': return `finished a task${n ? ` — ${n}` : ''}`;
    case 'log.posted': return `left a note${e.meta && e.meta.note ? ` — "${e.meta.note}"` : ''}`;
    case 'standard.published': return `set a new standard — "${e.meta && e.meta.title || 'standard'}"`;
    case 'standard.acknowledged': return `said “got it” to "${e.meta && e.meta.title || 'a standard'}"`;
    case 'standard.flagged': return `flagged a miss on "${e.meta && e.meta.title || ''}"`;
    case 'standard.met': return `marked "${e.meta && e.meta.title || ''}" as met`;
    default: return `${e.verb}${n ? ` — ${n}` : ''}`;
  }
}

function praiseRecipientName(e) {
  const id = e.meta && e.meta.recipient;
  const p = id && deps.identity.get(id);
  return p ? p.displayName : 'a teammate';
}

// A friendly label for an area: prefer the event's subject name, else tidy up the stream id.
function labelFor(e) { return (e.subject && e.subject.name) || cap(e.stream); }
function cap(s) { s = String(s || '').replace(/-/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1); }

// The feed = the ledger tail, newest first, as readable items.
export function feed({ stream, limit = 60 } = {}) {
  const events = deps.ledger.query({ stream, limit });
  return events.map((e) => ({
    id: e.id, ts: e.ts, verb: e.verb, stream: e.stream,
    actor: e.actor, actorName: e.actorName,
    text: phrase(e), refs: e.refs, meta: e.meta, subject: e.subject,
  }));
}

// Per-person accountability rollup over a window. Team-visible, credit-first.
export function accountability({ since = 0, stream } = {}) {
  const events = deps.ledger.query({ stream, since });
  const by = new Map();
  for (const e of events) {
    if (!by.has(e.actor)) by.set(e.actor, { personId: e.actor, name: e.actorName, actions: 0, praiseGiven: 0, praiseReceived: 0, byVerb: {} });
    const r = by.get(e.actor);
    r.actions += 1;
    r.byVerb[e.verb] = (r.byVerb[e.verb] || 0) + 1;
    if (e.verb === 'praise.given') r.praiseGiven += 1;
  }
  // count praise received against the recipient
  for (const e of events) {
    if (e.verb === 'praise.given' && e.meta && e.meta.recipient) {
      if (!by.has(e.meta.recipient)) {
        const p = deps.identity.get(e.meta.recipient);
        by.set(e.meta.recipient, { personId: e.meta.recipient, name: p ? p.displayName : 'Teammate', actions: 0, praiseGiven: 0, praiseReceived: 0, byVerb: {} });
      }
      by.get(e.meta.recipient).praiseReceived += 1;
    }
  }
  return Array.from(by.values()).sort((a, b) => b.actions - a.actions);
}

export function praiseWall({ limit = 40 } = {}) {
  return deps.ledger.query({ verb: 'praise.given', limit }).map((e) => ({
    id: e.id, ts: e.ts, from: e.actorName, fromId: e.actor,
    to: praiseRecipientName(e), toId: e.meta && e.meta.recipient,
    text: e.meta && e.meta.text || '', refs: e.refs,
  }));
}
