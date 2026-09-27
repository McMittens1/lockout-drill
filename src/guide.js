// The handover guide: what your trusted person can reach after you're gone, and the order to do
// it in. Built from the heir drill, so every step is a route the engine proved works with only
// what that person can get to.

import { compile, simulate, derivation, rootCauses, LOCKED, OK, PHYSICAL_KINDS, DEVICE_KINDS } from './engine.js';
import { VIA, SPEEDS, LEGACY_BY_TEMPLATE, WISHES } from './templates.js';

export const STALE_DAYS = 180;
const GATHER_KINDS = new Set(['phone', 'computer', 'tablet', 'seckey', 'paper', 'photoid', 'secret', 'number', 'authapp']);
export const HANDOVER_ID = 'lockout-handover';

const phrase = (via, label) => (VIA[via]?.phrase || '{x}').replace('{x}', () => label);

export function placePath(things, id) {
  const parts = [];
  const seen = new Set();
  for (let cur = things.get(id); cur && !seen.has(cur.id); cur = things.get(cur.inside)) {
    seen.add(cur.id);
    parts.unshift(cur.name);
    if (!cur.inside) break;
  }
  return parts.join(' › ');
}

export function daysSince(iso, now = new Date()) {
  const t = Date.parse(iso || '');
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 86400000)) : null;
}

export function ago(days) {
  if (days === null || days === undefined) return 'never';
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 45) return `${days} days ago`;
  const months = Math.round(days / 30.4);
  if (months < 18) return months <= 1 ? 'a month ago' : `${months} months ago`;
  const years = Math.round(days / 365);
  return years <= 1 ? 'a year ago' : `${years} years ago`;
}

// A fingerprint of everything a handover file carries, to tell whether the last file is current.
// Key order doesn't matter; bookkeeping fields are left out.
const NOT_CONTENT = new Set(['updatedAt', 'sample', 'savedAt', 'savedHash']);
function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).filter(k => !NOT_CONTENT.has(k) && v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  }
  return JSON.stringify(v ?? null);
}
export function planFingerprint(profile) {
  const s = canon(profile);
  let a = 0x811c9dc5, b = 0x9747b28c;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995);
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
export function handoverFresh(profile) {
  const h = profile.handover;
  return !!h?.savedHash && h.savedHash === planFingerprint(profile);
}

// `preparedAt` dates the guide: the owner's preview and printout are as of now; a handover file
// is as of when it was made.
export function buildGuide(profile, now = new Date(), { preparedAt } = {}) {
  const graph = compile(profile);
  const sim = simulate(graph, { perspective: 'heir' });
  const things = new Map((profile.things || []).map(t => [t.id, t]));
  const accounts = profile.accounts || [];
  const byId = new Map(accounts.map(a => [a.id, a]));
  const st = (id) => sim.state.get(id) ?? LOCKED;
  const stamp = (id) => (st(id) > LOCKED ? sim.first.get(id)[st(id)] : Infinity);
  const isAccount = (id) => graph.nodes.get(id)?.type === 'account';
  const everyday = profile.owner ? `Kept with ${profile.owner}'s everyday things` : 'Kept with their everyday things';

  const reachable = accounts.filter(a => st(a.id) > LOCKED);
  const routes = new Map(reachable.map(a => [a.id, derivation(graph, sim, a.id, 8)]));

  // Which other accounts each route relies on (through things too, e.g. an authenticator app
  // restored from a Google backup). Derivations are well-founded, so this is acyclic.
  const needs = new Map();
  for (const a of reachable) {
    const set = new Set();
    const walk = (d) => {
      for (const p of d?.picks || []) {
        if (isAccount(p.ref)) set.add(p.ref);
        else walk(p.sub);
      }
    };
    walk(routes.get(a.id));
    needs.set(a.id, set);
  }

  // Order: dependencies first, then the order in which things became reachable.
  const order = [];
  const done = new Set();
  const visiting = new Set();
  // Among steps whose order doesn't matter: what works right away before what takes days.
  const byStamp = (x, y) => st(y) - st(x) || stamp(x) - stamp(y) || (byId.get(x)?.name || '').localeCompare(byId.get(y)?.name || '');
  const visit = (id) => {
    if (done.has(id) || visiting.has(id)) return;
    visiting.add(id);
    for (const dep of [...(needs.get(id) || [])].sort(byStamp)) visit(dep);
    visiting.delete(id);
    done.add(id);
    order.push(id);
  };
  for (const id of reachable.map(a => a.id).sort(byStamp)) visit(id);
  const stepOf = new Map(order.map((id, i) => [id, i + 1]));

  // Things to gather first: whatever the routes use, tagged with the first step that needs it.
  const used = new Map();
  for (const id of order) {
    const n = stepOf.get(id);
    const walk = (d) => {
      for (const p of d?.picks || []) {
        if (isAccount(p.ref)) continue;
        const node = graph.nodes.get(p.ref);
        const tid = node?.derived || p.ref;
        if (!used.has(tid)) used.set(tid, n);
        walk(p.sub);
      }
    };
    walk(routes.get(id));
  }

  // Where each thing is, worded by the route the drill actually used to reach it (restored from
  // a backup, a replacement eSIM, the one written copy within reach), or by how it was set up
  // when it can't be reached at all.
  const stepNote = (ref) => (isAccount(ref) && stepOf.has(ref) ? ` (step ${stepOf.get(ref)})` : '');
  const describe = (t) => {
    const d = st(t.id) > LOCKED ? derivation(graph, sim, t.id, 2) : null;
    const reach = !!d;
    if (PHYSICAL_KINDS.has(t.kind)) {
      const place = t.at && t.at !== 'carried' ? things.get(t.at) : null;
      const where = place ? placePath(things, place.id) : everyday;
      let how = null;
      if (DEVICE_KINDS.has(t.kind) && t.unlock && things.has(t.unlock)) how = `Unlock it with ${things.get(t.unlock).name}.`;
      return { where, how, placeNote: place?.note || '', reach };
    }
    if (t.kind === 'secret') {
      if (d?.base) return { where: 'You know it', how: null, reach };
      if (d?.way?.id === 'written' && d.picks?.[0]) return { where: `Written on ${d.picks[0].label}`, how: null, reach };
      const papers = (t.writtenOn || []).filter(p => things.has(p));
      return { where: papers.length ? `Written on ${papers.map(p => things.get(p).name).join(' or ')}` : 'Not written down or shared', how: null, reach };
    }
    if (t.kind === 'number') {
      const how = 'Keep this number active: codes are sent to it.';
      if ((d?.way?.id === 'esim' || d?.way?.id === 'store') && d.picks?.[0]) return { where: `${d.way.label}${stepNote(d.picks[0].ref)}. This takes days.`, how, reach };
      return { where: t.sim && things.has(t.sim) ? `The SIM is in ${things.get(t.sim).name}.` : '', how, reach };
    }
    if (t.kind === 'authapp') {
      if (d?.way?.id === 'restore' && d.picks?.[0]) {
        const [backup, secret] = d.picks;
        return { where: `Restore it on a new phone from its backup in ${backup.label}${stepNote(backup.ref)}${secret ? `, with ${secret.label}` : ''}.`, how: null, reach };
      }
      if (d?.way?.id?.startsWith('on:') && d.picks?.[0]) return { where: `On ${d.picks[0].label}`, how: null, reach };
      const on = (t.devices || []).filter(x => things.has(x)).map(x => things.get(x).name);
      return { where: on.length ? `On ${on.join(' and ')}` : 'Restored from its backup', how: null, reach };
    }
    return { where: '', how: null, reach };
  };

  const gather = [...used.entries()]
    .map(([id, step]) => ({ t: things.get(id), step }))
    .filter(x => x.t && GATHER_KINDS.has(x.t.kind))
    .sort((x, y) => x.step - y.step || x.t.name.localeCompare(y.t.name))
    .map(({ t, step }) => ({ id: t.id, kind: t.kind, name: t.name, step, note: t.note || '', ...describe(t) }));

  // Unlock chains the other way: which later steps each account opens.
  const opens = new Map();
  for (const [id, set] of needs) for (const dep of set) {
    if (!opens.has(dep)) opens.set(dep, []);
    opens.get(dep).push(id);
  }

  const wishOf = (a) => (a.wish && Object.hasOwn(WISHES, a.wish) ? { wish: a.wish, wishLabel: WISHES[a.wish] } : { wish: '', wishLabel: '' });
  const legacyOf = (a) => (a.template && Object.hasOwn(LEGACY_BY_TEMPLATE, a.template) ? LEGACY_BY_TEMPLATE[a.template] : '');

  const steps = order.map(id => {
    const a = byId.get(id);
    const d = routes.get(id);
    return {
      n: stepOf.get(id),
      id,
      name: a.name,
      count: Math.max(1, a.count || 1),
      important: !!a.important,
      state: st(id),
      speed: d?.way ? SPEEDS[d.way.speed]?.label || '' : '',
      way: d?.way?.label || '',
      wayKind: d?.way?.kind || '',
      dataOnly: !!d?.way?.dataOnly,
      picks: (d?.picks || []).map(p => ({ text: phrase(p.via, p.label), step: isAccount(p.ref) ? stepOf.get(p.ref) : null })),
      opens: (opens.get(id) || []).sort((x, y) => stepOf.get(x) - stepOf.get(y)).map(x => ({ name: byId.get(x).name, step: stepOf.get(x) })),
      note: a.note || '',
      legacy: legacyOf(a),
      ...wishOf(a),
    };
  });

  const blocked = accounts
    .filter(a => st(a.id) === LOCKED)
    .sort((x, y) => (y.important - x.important) || x.name.localeCompare(y.name))
    .map(a => {
      const rc = rootCauses(graph, sim, a.id, OK);
      return {
        id: a.id,
        name: a.name,
        count: Math.max(1, a.count || 1),
        important: !!a.important,
        reasons: rc.causes.map(c => ({ label: c.label, reason: c.reason })),
        note: a.note || '',
        legacy: legacyOf(a),
        ...wishOf(a),
      };
    });

  // The full map: every way into every account, as set up, for whoever wants the detail.
  const nameOf = (id) => things.get(id)?.name ?? byId.get(id)?.name ?? '?';
  const map = [...accounts]
    .sort((x, y) => (y.important - x.important) || x.name.localeCompare(y.name))
    .map(a => ({
      id: a.id,
      name: a.name,
      count: Math.max(1, a.count || 1),
      state: st(a.id),
      ways: a.ways.filter(w => w.enabled !== false).map(w => ({
        label: w.label,
        speed: w.speed !== 'instant' ? SPEEDS[w.speed]?.label || '' : '',
        who: w.who || 'both',
        steps: w.steps.map(s => ({ label: s.label, options: s.anyOf.map(o => phrase(o.via, nameOf(o.ref))) })),
      })),
    }));
  // Where everything is, including things no step above needed.
  const inventory = (profile.things || [])
    .filter(t => GATHER_KINDS.has(t.kind))
    .map(t => ({ id: t.id, kind: t.kind, name: t.name, note: t.note || '', ...describe(t) }));

  const tally = { now: 0, days: 0, appeal: 0, none: 0, total: 0 };
  for (const a of accounts) {
    const c = Math.max(1, a.count || 1);
    tally.total += c;
    const s = st(a.id);
    if (s === OK) tally.now += c; else if (s === 2) tally.days += c; else if (s === 1) tally.appeal += c; else tally.none += c;
  }

  const reviewedDays = daysSince(profile.reviewedAt, now);
  return {
    owner: profile.owner || '',
    trusted: profile.trusted || '',
    reviewedAt: profile.reviewedAt || null,
    reviewedDays,
    stale: reviewedDays === null || reviewedDays > STALE_DAYS,
    preparedAt: preparedAt !== undefined ? preparedAt : (profile.handover?.savedAt || null),
    letter: profile.handover?.note || '',
    contacts: profile.handover?.contacts || '',
    gather,
    steps,
    blocked,
    map,
    inventory,
    tally,
    states: sim.state,
  };
}

// A short checklist of what makes the handover work.
export function readiness(profile, guide = buildGuide(profile), now = new Date()) {
  const who = profile.trusted || 'your trusted person';
  const Who = profile.trusted || 'Your trusted person';
  const accounts = profile.accounts || [];
  const reach = (a) => (guide.states.get(a.id) ?? LOCKED) > LOCKED;
  const items = [];
  items.push({ key: 'trusted', ok: !!profile.trusted, text: profile.trusted ? `${profile.trusted} is the person you trust with this` : 'Name the person who would handle things', go: 'setup' });
  const pms = accounts.filter(a => a.category === 'password_manager');
  if (pms.length) {
    const missing = pms.filter(a => !reach(a));
    items.push({ key: 'pm', ok: !missing.length, text: missing.length ? `${Who} can't get into ${missing.map(a => a.name).join(' or ')}` : `${Who} can get into your password manager`, go: 'heir' });
  }
  const imp = accounts.filter(a => a.important);
  if (imp.length) {
    const r = imp.filter(reach).length;
    items.push({ key: 'reach', ok: r === imp.length, text: `${Who} can reach ${r} of ${imp.length} important ${imp.length === 1 ? 'account' : 'accounts'}`, go: 'heir' });
    const w = imp.filter(a => a.wish).length;
    items.push({ key: 'wishes', ok: w === imp.length, text: `You said what should happen to ${w} of ${imp.length} important ${imp.length === 1 ? 'account' : 'accounts'}`, go: 'handover' });
  }
  const note = (profile.handover?.note || '').trim();
  items.push({ key: 'letter', ok: !!note, text: note ? `You wrote a note for ${who}` : `Write a note for ${who}`, go: 'handover' });
  const days = daysSince(profile.reviewedAt, now);
  items.push({ key: 'reviewed', ok: days !== null && days <= STALE_DAYS, text: days === null ? 'Never marked as reviewed' : days <= STALE_DAYS ? `Reviewed ${ago(days)}` : `Last reviewed ${ago(days)}: time for a check`, go: 'review' });
  const saved = profile.handover?.savedAt;
  const fresh = handoverFresh(profile);
  items.push({ key: 'file', ok: fresh, text: !saved ? 'No handover file created yet' : fresh ? 'Your handover file is up to date' : 'Your plan changed after the last handover file', go: 'export' });
  return items;
}

// The handover file is the app itself with the encrypted plan embedded, so the person you trust
// only needs to double-click one file and enter the passphrase. The data goes right after <body>,
// ahead of the app's script, so it is already parsed when the app starts.
export function makeHandoverHtml(pristine, envelope) {
  const json = JSON.stringify({ ...envelope, purpose: 'handover' }).replace(/</g, '\\u003c');
  const tag = `<script type="application/json" id="${HANDOVER_ID}">${json}</script>\n`;
  const m = /<body[^>]*>\n?/i.exec(pristine);
  if (!m) throw new Error('Could not build the handover file.');
  const at = m.index + m[0].length;
  return pristine.slice(0, at) + tag + pristine.slice(at);
}

// Read the plan embedded in a handover file (the text of its data tag).
export function readHandover(text) {
  let data;
  try { data = JSON.parse(text); } catch { return null; }
  return data && typeof data === 'object' && data.purpose === 'handover' ? data : null;
}
