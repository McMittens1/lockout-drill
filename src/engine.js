// Lockout Drill — reachability engine.
//
// Everything you own or know (phones, places, papers, memorized secrets, phone numbers,
// authenticator apps, trusted people) and every account is a node. A node is reachable
// through "ways": each way is an AND of steps, each step an OR of alternatives. Ways carry a
// speed (instant / slow / appeal), so the result for every node is one of four states.
//
// A scenario (phone stolen, house fire, ...) removes things. We then compute the least fixed
// point of reachability, so circular dependencies never justify themselves: if Gmail's
// password lives in Bitwarden and Bitwarden needs a code from Gmail, losing the outside way in
// correctly locks both.
//
// The model follows the "account access graph" formalism from Hammann et al. (CCS 2019),
// extended with recovery speeds, physical locations, heirs and named scenarios.

export const LOCKED = 0;
export const APPEAL = 1;
export const SLOW = 2;
export const OK = 3;

export const STATE_NAMES = ['locked', 'appeal', 'slow', 'ok'];
export const SPEED_CAP = { instant: OK, slow: SLOW, appeal: APPEAL };

export const PHYSICAL_KINDS = new Set(['phone', 'computer', 'tablet', 'seckey', 'paper', 'photoid']);
export const DEVICE_KINDS = new Set(['phone', 'computer', 'tablet']);

// Step types whose alternatives need a *usable* (unlocked) device rather than just the hardware.
const DEVICE_USE_VIAS = new Set(['push', 'session', 'trusted_device', 'passkey', 'totp', 'any']);

const USE = '~use';

// ---------------------------------------------------------------------------------------------
// Compile a profile into a graph of nodes.
// ---------------------------------------------------------------------------------------------

export function compile(profile) {
  const things = new Map((profile.things || []).map(t => [t.id, t]));
  const accounts = new Map((profile.accounts || []).map(a => [a.id, a]));
  const nodes = new Map();

  const exists = id => things.has(id) || accounts.has(id);
  const isDevice = id => things.has(id) && DEVICE_KINDS.has(things.get(id).kind);

  // Resolve a profile reference into a graph node id. Devices used for prompts, sessions or
  // apps need to be unlocked; a SIM only needs the hardware.
  const resolve = (ref, via) => {
    if (!exists(ref)) return null;
    if (isDevice(ref) && via !== 'sim' && DEVICE_USE_VIAS.has(via || 'any')) return ref + USE;
    return ref;
  };

  const step = (label, refs, via) => ({
    label,
    anyOf: refs.map(r => ({ ref: resolve(r, via), via, src: r })).filter(x => x.ref),
  });

  for (const t of things.values()) {
    const node = { id: t.id, type: 'thing', kind: t.kind, label: t.name || t.kind, ways: [], base: null, src: t };

    if (PHYSICAL_KINDS.has(t.kind)) {
      if (!t.at || t.at === 'carried' || !things.has(t.at)) {
        node.base = ctx => (ctx.perspective === 'heir' ? (t.heirCan === false ? LOCKED : OK) : OK);
        node.where = 'carried';
      } else {
        node.ways.push({ id: 'at', label: `Kept at ${things.get(t.at).name}`, speed: 'instant', direct: true, steps: [step('Location', [t.at], 'place')] });
        node.where = t.at;
      }
      if (DEVICE_KINDS.has(t.kind)) {
        const use = { id: t.id + USE, type: 'thing', kind: t.kind, label: t.name, derived: t.id, ways: [], base: null, src: t };
        const steps = [step('The device', [t.id], 'sim')];
        if (t.unlock && things.has(t.unlock)) steps.push(step('Unlock it', [t.unlock], 'unlock'));
        use.ways.push({ id: 'use', label: 'Unlock and use it', speed: 'instant', direct: false, steps });
        nodes.set(use.id, use);
      }
    } else if (t.kind === 'place') {
      const parent = t.inside && things.has(t.inside) ? t.inside : null;
      if (parent) {
        // Every enclosing place, innermost first (guarded against cycles in hand-edited files).
        const anc = [];
        const seen = new Set([t.id]);
        for (let cur = parent; cur && things.has(cur) && !seen.has(cur); cur = things.get(cur).inside) { anc.push(cur); seen.add(cur); }
        node.ancestors = anc;
        const heirBlocked = t.heirCan === false;
        node.ways.push({ id: 'in', label: `Inside ${things.get(parent).name}`, speed: 'instant', direct: true, who: heirBlocked ? 'me' : 'both', steps: [step('Location', [parent], 'place')] });
        // A fireproof safe survives the destruction of any place around it, but digging it out
        // takes a while.
        node.base = ctx => {
          if (ctx.perspective === 'heir' && heirBlocked) return LOCKED;
          return t.fireproof && anc.some(a => ctx.lost.has(a)) ? SLOW : LOCKED;
        };
      } else {
        node.base = ctx => {
          if (ctx.perspective === 'heir' && t.heirCan === false) return LOCKED;
          return ctx.away ? SLOW : OK;
        };
      }
    } else if (t.kind === 'secret') {
      node.base = ctx => (ctx.perspective === 'heir' ? (t.shared ? OK : LOCKED) : OK);
      const papers = (t.writtenOn || []).filter(p => things.has(p));
      if (papers.length) node.ways.push({ id: 'written', label: 'Written down', speed: 'instant', direct: false, steps: [step('Paper copy', papers, 'paper')] });
    } else if (t.kind === 'number') {
      if (t.sim && things.has(t.sim)) {
        node.ways.push({ id: 'sim', label: `SIM in ${things.get(t.sim).name}`, speed: 'instant', direct: true, steps: [step('Phone with the SIM', [t.sim], 'sim')] });
      }
      const ids = [...things.values()].filter(x => x.kind === 'photoid').map(x => x.id);
      node.ways.push({
        id: 'store', label: 'Replacement SIM at a carrier store', speed: 'slow', direct: false, inPerson: true, who: 'me',
        steps: ids.length ? [step('Photo ID', ids, 'photo_id')] : [],
      });
      if (t.carrier && accounts.has(t.carrier)) {
        node.ways.push({ id: 'esim', label: 'Move the number to a new eSIM via your carrier account', speed: 'slow', direct: false, steps: [step('Carrier account', [t.carrier], 'account')] });
      }
    } else if (t.kind === 'person') {
      node.base = () => OK;
    } else if (t.kind === 'authapp') {
      for (const d of (t.devices || []).filter(d => things.has(d))) {
        node.ways.push({ id: 'on:' + d, label: `Installed on ${things.get(d).name}`, speed: 'instant', direct: true, steps: [step('Device', [d], 'totp')] });
      }
      if (t.backup && exists(t.backup)) {
        const steps = [step('Backup', [t.backup], 'backup')];
        if (t.backupSecret && things.has(t.backupSecret)) steps.push(step('Backup password', [t.backupSecret], 'password'));
        node.ways.push({ id: 'restore', label: 'Restore from backup on a new phone', speed: 'instant', direct: false, steps });
      }
    }
    nodes.set(node.id, node);
  }

  for (const a of accounts.values()) {
    const node = { id: a.id, type: 'account', kind: 'account', label: a.name || 'Account', ways: [], base: null, src: a };
    const on = (a.ways || []).filter(w => w.enabled !== false);
    const filled = w => (w.steps || []).length > 0 && w.steps.every(s => (s.anyOf || []).length);
    for (const w of on) {
      // Some providers switch a route off when another is set up: Apple's Account Recovery
      // disappears once a recovery key or security keys are set; Microsoft's recovery form can't
      // help once two-step verification is on.
      if ((w.unlessWay || []).some(k => on.some(o => o !== w && o.key === k && filled(o)))) continue;
      if ((w.unlessVia || []).some(v => on.some(o => o !== w && (o.steps || []).some(s => (s.anyOf || []).some(x => x.via === v))))) continue;
      node.ways.push({
        id: w.id,
        label: w.label,
        wayKind: w.kind || 'signin',
        speed: Object.hasOwn(SPEED_CAP, w.speed) ? w.speed : 'instant',
        direct: false,
        inPerson: !!w.inPerson,
        who: w.who || 'both',
        steps: (w.steps || []).map(s => ({
          label: s.label,
          types: s.types,
          anyOf: (s.anyOf || []).map(x => ({ ref: resolve(x.ref, x.via), via: x.via, src: x.ref })).filter(x => x.ref),
        })),
      });
    }
    nodes.set(node.id, node);
  }

  return { nodes, profile, things, accounts };
}

// ---------------------------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------------------------

export function makeContext(opts = {}) {
  return {
    lost: new Set(opts.lost || []),
    away: !!(opts.away || opts.abroad),
    abroad: !!opts.abroad,
    perspective: opts.perspective === 'heir' ? 'heir' : 'me',
  };
}

function wayApplies(node, way, ctx) {
  if (ctx.lost.has(node.id)) {
    // Losing a thing kills its direct ways (the SIM, the app on the device) but keeps its
    // recovery ways (carrier replacement, cloud backup). A lost account (hijacked) keeps only
    // support appeals.
    if (node.type === 'account' ? way.speed !== 'appeal' : way.direct) return false;
  }
  if (way.inPerson && ctx.abroad) return false;
  if (way.who === 'me' && ctx.perspective === 'heir') return false;
  if (way.who === 'heir' && ctx.perspective !== 'heir') return false;
  return true;
}

function wayValue(way, get) {
  let v = SPEED_CAP[way.speed];
  for (const s of way.steps) {
    let best = LOCKED;
    for (const alt of s.anyOf) {
      const x = get(alt.ref);
      if (x > best) best = x;
    }
    if (best < v) v = best;
    if (v === LOCKED) break;
  }
  return v;
}

// Index the graph once for fast repeated simulation (the analysis runs thousands of them).
function prepare(graph) {
  if (graph._fast) return graph._fast;
  const ids = [...graph.nodes.keys()];
  const index = new Map(ids.map((id, i) => [id, i]));
  const nodes = ids.map(id => graph.nodes.get(id));
  const ways = nodes.map(n => n.ways.map(w => ({
    w,
    cap: SPEED_CAP[w.speed],
    steps: w.steps.map(s => Int32Array.from(s.anyOf.map(a => index.get(a.ref)).filter(i => i !== undefined))),
  })));
  const deps = ids.map(() => new Set());
  ways.forEach((ws, i) => { for (const w of ws) for (const s of w.steps) for (const j of s) deps[j].add(i); });
  graph._fast = { ids, index, nodes, ways, dependents: deps.map(d => Int32Array.from(d)) };
  return graph._fast;
}

// Worklist propagation from all-locked upward (least fixed point). Every time a node rises we
// stamp it with a strictly increasing clock; a node's value is always computed from values that
// were stamped earlier, so explanations that only follow earlier stamps are well-founded.
function run(fast, ctx) {
  const n = fast.ids.length;
  const st = new Uint8Array(n);
  const first = new Float64Array(n * 4).fill(Infinity);
  for (let i = 0; i < n; i++) first[i * 4] = 0;
  const queue = new Int32Array(n * 4 + 16);
  let qh = 0, qt = 0, size = 0;
  const inQ = new Uint8Array(n);
  const push = (i) => { inQ[i] = 1; queue[qt] = i; qt = (qt + 1) % queue.length; size++; };
  for (let i = 0; i < n; i++) push(i);
  let clock = 0;
  const get = j => st[j];
  while (size) {
    const i = queue[qh]; qh = (qh + 1) % queue.length; size--; inQ[i] = 0;
    const node = fast.nodes[i];
    let v = LOCKED;
    if (node.base && !ctx.lost.has(node.id) && !(node.derived && ctx.lost.has(node.derived))) v = node.base(ctx);
    const ws = fast.ways[i];
    for (let k = 0; k < ws.length && v < OK; k++) {
      const w = ws[k];
      if (!wayApplies(node, w.w, ctx)) continue;
      let x = w.cap;
      for (let s = 0; s < w.steps.length && x > v; s++) {
        let best = LOCKED;
        const alts = w.steps[s];
        for (let a = 0; a < alts.length; a++) { const y = get(alts[a]); if (y > best) best = y; }
        if (best < x) x = best;
      }
      if (x > v) v = x;
    }
    if (v > st[i]) {
      clock++;
      for (let l = st[i] + 1; l <= v; l++) first[i * 4 + l] = clock;
      st[i] = v;
      const d = fast.dependents[i];
      for (let k = 0; k < d.length; k++) if (!inQ[d[k]]) push(d[k]);
    }
  }
  return { st, first };
}

export function simulate(graph, ctxOrOpts) {
  const ctx = ctxOrOpts && ctxOrOpts.lost instanceof Set ? ctxOrOpts : makeContext(ctxOrOpts);
  const fast = prepare(graph);
  const { st, first } = run(fast, ctx);
  const state = new Map();
  const firstMap = new Map();
  fast.ids.forEach((id, i) => {
    state.set(id, st[i]);
    firstMap.set(id, [first[i * 4], first[i * 4 + 1], first[i * 4 + 2], first[i * 4 + 3]]);
  });
  return { ctx, state, first: firstMap };
}

// Array-level simulation for the analysis loops (no Map conversion).
function simulateRaw(graph, lost) {
  return run(prepare(graph), makeContext({ lost })).st;
}

// ---------------------------------------------------------------------------------------------
// Explanations
// ---------------------------------------------------------------------------------------------

const refLabel = (graph, ref) => graph.nodes.get(ref)?.label ?? ref;

// How a node is reached at its current state: the chosen way and the alternative used for
// each step, recursively (well-founded, so this never loops).
export function derivation(graph, sim, id, depth = 6) {
  const node = graph.nodes.get(id);
  const level = sim.state.get(id);
  if (!node || level === LOCKED) return null;
  const at = sim.first.get(id)[level];
  const out = { id, label: node.label, state: level };
  if (node.base && !sim.ctx.lost.has(id) && !(node.derived && sim.ctx.lost.has(node.derived)) && node.base(sim.ctx) >= level) {
    out.base = true;
    return out;
  }
  for (const w of node.ways) {
    if (!wayApplies(node, w, sim.ctx) || SPEED_CAP[w.speed] < level) continue;
    const picks = [];
    let ok = true;
    for (const s of w.steps) {
      let pick = null;
      for (const alt of s.anyOf) {
        if (sim.state.get(alt.ref) >= level && sim.first.get(alt.ref)[level] < at) {
          if (!pick || sim.first.get(alt.ref)[level] < sim.first.get(pick.ref)[level]) pick = alt;
        }
      }
      if (!pick) { ok = false; break; }
      picks.push({ step: s.label, via: pick.via, ref: pick.ref, label: refLabel(graph, pick.ref), sub: depth > 0 ? derivation(graph, sim, pick.ref, depth - 1) : null });
    }
    if (ok) {
      out.way = { id: w.id, label: w.label, speed: w.speed, kind: w.wayKind };
      out.picks = picks;
      return out;
    }
  }
  return out;
}

// Why a node isn't better than it is: every applicable way with its failing steps, recursing
// into derived nodes. Revisiting a node on the current path is reported as a cycle.
export function blockers(graph, sim, id, opts = {}) {
  const depth = opts.depth ?? 5;
  const target = opts.target ?? OK;
  const path = opts.path ?? [];
  const node = graph.nodes.get(id);
  const state = sim.state.get(id);
  const out = { id, label: node?.label ?? id, state, lost: sim.ctx.lost.has(id) || (!!node?.derived && sim.ctx.lost.has(node.derived)), ways: [], cycle: null };
  if (!node || state >= target) return out;
  if (path.includes(id)) {
    out.cycle = [...path.slice(path.indexOf(id)), id];
    return out;
  }
  if (depth <= 0) { out.truncated = true; return out; }
  const nextPath = [...path, id];
  for (const w of node.ways) {
    const applies = wayApplies(node, w, sim.ctx);
    const value = applies ? wayValue(w, r => sim.state.get(r) ?? LOCKED) : LOCKED;
    const wayOut = { id: w.id, label: w.label, speed: w.speed, kind: w.wayKind, value, disabled: applies ? null : disabledReason(node, w, sim.ctx), failing: [] };
    if (applies) {
      const need = Math.min(target, SPEED_CAP[w.speed]);
      for (const s of w.steps) {
        const best = Math.max(LOCKED, ...s.anyOf.map(a => sim.state.get(a.ref) ?? LOCKED));
        if (best >= need) continue;
        wayOut.failing.push({
          step: s.label,
          empty: s.anyOf.length === 0,
          options: s.anyOf.map(a => ({
            ref: a.ref, via: a.via, label: refLabel(graph, a.ref), state: sim.state.get(a.ref) ?? LOCKED,
            why: blockers(graph, sim, a.ref, { depth: depth - 1, target: need, path: nextPath }),
          })),
        });
      }
    }
    out.ways.push(wayOut);
  }
  return out;
}

function disabledReason(node, way, ctx) {
  if (ctx.lost.has(node.id)) return node.type === 'account' ? 'hijacked' : 'lost';
  if (way.inPerson && ctx.abroad) return 'abroad';
  if (way.who === 'me' && ctx.perspective === 'heir') return 'only-you';
  if (way.who === 'heir' && ctx.perspective !== 'heir') return 'only-heir';
  return null;
}

// The things whose loss (in this scenario) is ultimately responsible for a node being below
// `target`: walk failing requirements down to scenario-affected base things.
export function rootCauses(graph, sim, id, target = OK) {
  const causes = new Map();
  const cycles = [];
  const seen = new Set();
  const walk = (b) => {
    if (b.cycle) { cycles.push(b.cycle); return; }
    const key = b.id + ':' + b.state;
    if (seen.has(key)) return;
    seen.add(key);
    const node = graph.nodes.get(b.id);
    if (b.lost || affectedBase(node, sim.ctx)) causes.set(node.derived || b.id, reasonFor(graph, node, sim.ctx));
    for (const w of b.ways) for (const f of w.failing) for (const o of f.options) walk(o.why);
  };
  walk(blockers(graph, sim, id, { target, depth: 8 }));
  return { causes: [...causes].map(([id, reason]) => ({ id, label: refLabel(graph, id), reason })), cycles };
}

function affectedBase(node, ctx) {
  if (!node || !node.base) return false;
  const k = node.kind;
  const nested = !!node.ancestors;
  if (ctx.perspective === 'heir') {
    // A nested place is only itself the cause when the heir was kept out of it specifically.
    if (k === 'place' && nested) return node.src.heirCan === false;
    return (k === 'secret' || k === 'place' || PHYSICAL_KINDS.has(k)) && node.base(ctx) < OK;
  }
  if (k === 'place') {
    // Top-level places are "far away" when you're away; the rooms inside them aren't separate causes.
    if (nested) return !!node.src.fireproof && node.ancestors.some(a => ctx.lost.has(a));
    return ctx.away;
  }
  return false;
}

export function reasonFor(graph, node, ctx) {
  if (!node) return '';
  const id = node.derived || node.id;
  if (ctx.lost.has(id)) {
    const k = graph.things.get(id)?.kind;
    if (k === 'place') return 'destroyed';
    if (k === 'secret') return 'forgotten';
    if (k === 'number') return 'number taken over';
    if (k === 'authapp') return 'app data wiped';
    if (k === 'person') return 'unavailable';
    if (node.type === 'account') return 'hijacked';
    return 'lost';
  }
  if (ctx.perspective === 'heir') return node.kind === 'secret' ? 'never shared' : 'out of reach';
  if (node.kind === 'place') return (node.ancestors || []).some(a => ctx.lost.has(a)) ? 'survived, slow to retrieve' : 'far away';
  return 'unavailable';
}

// ---------------------------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------------------------

export function scenarioPresets(profile) {
  const things = profile.things || [];
  const byKind = k => things.filter(t => t.kind === k);
  const carried = things.filter(t => PHYSICAL_KINDS.has(t.kind) && (!t.at || t.at === 'carried'));
  const phones = byKind('phone');
  const dailyPhones = phones.filter(t => !t.at || t.at === 'carried');
  const homes = byKind('place').filter(t => t.home && !t.inside);
  const numbers = byKind('number');
  const secrets = byKind('secret');
  const trusted = profile.trusted || 'your trusted person';
  const out = [];
  out.push({ id: 'today', icon: 'today', title: 'A normal day', blurb: 'Nothing lost. Anything red here is already broken.', ctx: {} });
  if (phones.length) {
    const lose = (dailyPhones.length ? dailyPhones : phones.slice(0, 1)).map(t => t.id);
    out.push({ id: 'phone', icon: 'phone', title: 'Your phone is stolen', blurb: `You lose ${names(things, lose)}, and the SIM inside.`, ctx: { lost: lose } });
  }
  if (carried.length) {
    out.push({ id: 'travel', icon: 'travel', title: 'Robbed while traveling abroad', blurb: 'Everything you carry is gone, home is far away, and no carrier store can help.', ctx: { lost: carried.map(t => t.id), abroad: true } });
  }
  if (homes.length) {
    out.push({ id: 'fire', icon: 'fire', title: 'Your home burns down', blurb: `${names(things, homes.map(h => h.id))} and everything in it is destroyed. Fireproof safes survive.`, ctx: { lost: homes.map(t => t.id) } });
  }
  if (numbers.length) {
    out.push({ id: 'simswap', icon: 'sim', title: 'Your number is hijacked', blurb: 'A SIM-swap scammer takes over your phone number. Codes by text go to them.', ctx: { lost: numbers.map(t => t.id) } });
  }
  if (secrets.length) {
    out.push({ id: 'memory', icon: 'memory', title: "You can't remember passwords", blurb: 'After an accident or illness, nothing you memorized is available.', ctx: { lost: secrets.map(t => t.id) } });
  }
  const emails = (profile.accounts || []).filter(a => a.category === 'email' || a.category === 'platform');
  if (emails.length) {
    const g = compile(profile);
    const main = mostDependedOn(g, emails.map(a => a.id));
    if (main) out.push({ id: 'hijack', icon: 'mail', title: `${g.nodes.get(main).label} is hacked`, blurb: 'Someone takes over the account and changes its recovery options.', ctx: { lost: [main] } });
  }
  out.push({ id: 'heir', icon: 'heir', title: `You're gone — what can ${trusted} reach?`, blurb: `Only what ${trusted} can physically get to, plus secrets you shared.`, ctx: { perspective: 'heir' } });
  return out;
}

function names(things, ids) {
  const m = new Map(things.map(t => [t.id, t.name]));
  const list = ids.map(i => m.get(i) || i);
  return list.length <= 2 ? list.join(' and ') : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
}

function mostDependedOn(graph, ids) {
  let best = null;
  let bestCount = 0;
  for (const id of ids) {
    let count = 0;
    for (const n of graph.nodes.values()) {
      if (n.id === id) continue;
      if (n.ways.some(w => w.steps.some(s => s.anyOf.some(a => a.ref === id)))) count++;
    }
    if (count > bestCount) { best = id; bestCount = count; }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// Whole-profile analysis: blast radius, minimal lockout sets, cycles, warnings.
// ---------------------------------------------------------------------------------------------

// Things whose loss we try in combination: everything you own, know or rely on.
export function lossCandidates(profile) {
  return (profile.things || []).map(t => t.id);
}

// Smallest combinations of lost things (up to maxSize) that push every target to `threshold`
// or below. Used to say when a circular dependency actually bites.
export function minimalLockouts(graph, candidates, targets, { maxSize = 3, threshold = APPEAL, limit = 3, budget = 5000 } = {}) {
  const found = [];
  const fast = prepare(graph);
  const idx = targets.map(t => fast.index.get(t)).filter(i => i !== undefined);
  const hits = (lost) => {
    const st = simulateRaw(graph, lost);
    return idx.every(i => st[i] <= threshold);
  };
  if (hits([])) return [[]];
  let evaluated = 0;
  const combos = function* (k, start, acc) {
    if (acc.length === k) { yield acc; return; }
    for (let i = start; i < candidates.length; i++) yield* combos(k, i + 1, [...acc, candidates[i]]);
  };
  for (let k = 1; k <= maxSize && !found.length; k++) {
    for (const c of combos(k, 0, [])) {
      if (evaluated++ > budget) return found;
      if (hits(c)) { found.push(c); if (found.length >= limit) return found; }
    }
  }
  return found;
}

// For a strongly connected component, the short loops through it (shortest cycle through each
// member, deduplicated by rotation).
function shortLoops(graph, comp, edges) {
  const inComp = new Set(comp);
  const loops = new Map();
  for (const start of comp) {
    const prev = new Map([[start, null]]);
    const queue = [start];
    let closing = null;
    while (queue.length && !closing) {
      const v = queue.shift();
      for (const w of edges.get(v) || []) {
        if (!inComp.has(w)) continue;
        if (w === start) { closing = v; break; }
        if (!prev.has(w)) { prev.set(w, v); queue.push(w); }
      }
    }
    if (!closing) continue;
    const path = [];
    for (let v = closing; v !== null; v = prev.get(v)) path.unshift(v);
    const minIdx = path.indexOf([...path].sort()[0]);
    const key = [...path.slice(minIdx), ...path.slice(0, minIdx)].join('>');
    if (!loops.has(key)) loops.set(key, path);
  }
  return [...loops.values()].sort((a, b) => a.length - b.length);
}

function linkBetween(graph, from, to) {
  const n = graph.nodes.get(from);
  for (const w of n?.ways || []) for (const s of w.steps) for (const a of s.anyOf) {
    if (a.ref === to) return { way: w.label, step: s.label, via: a.via };
  }
  return null;
}

export function analyze(profile, opts = {}) {
  const graph = compile(profile);
  const accounts = (profile.accounts || []).map(a => a.id);
  const baseline = simulate(graph, {});
  const candidates = opts.candidates || lossCandidates(profile);
  const maxSize = opts.maxSize ?? (candidates.length > 40 ? 2 : 3);
  const threshold = opts.threshold ?? APPEAL; // "locked out" = only a support appeal, or nothing

  const fast = prepare(graph);
  const accIdx = accounts.map(a => fast.index.get(a));
  const baseSt = accIdx.map(i => baseline.state.get(fast.ids[i]));
  const alive = accounts.map((a, k) => baseSt[k] > threshold); // already-broken accounts are reported elsewhere

  // Blast radius: lose each thing alone.
  const single = new Map();
  const blast = [];
  for (const c of candidates) {
    const st = simulateRaw(graph, [c]);
    single.set(c, st);
    const locked = [];
    const slowed = [];
    accounts.forEach((a, k) => {
      const after = st[accIdx[k]];
      if (after >= baseSt[k]) return;
      if (after <= threshold) locked.push(a); else slowed.push(a);
    });
    blast.push({ id: c, label: graph.nodes.get(c).label, locked, slowed });
  }
  const byId = new Map((profile.accounts || []).map(a => [a.id, a]));
  blast.sort((x, y) => weight(byId, y.locked) - weight(byId, x.locked) || weight(byId, y.slowed) - weight(byId, x.slowed));

  // Loops, and the smallest losses after which their members can only reach each other. Found in
  // the same enumeration as the lockout sets, so they share one budget.
  const loopMax = Math.min(maxSize, candidates.length > 25 ? 2 : 3);
  const baseRaw = simulateRaw(graph, []);
  const loops = findCycles(graph).map(c => ({ c, idx: c.members.filter(id => !id.endsWith(USE)).map(id => fast.index.get(id)).filter(i => i !== undefined), trig: [] }));
  for (const L of loops) if (L.idx.every(i => baseRaw[i] <= threshold)) L.trig = [[]];
  const loopWants = combo => combo.length <= loopMax && loops.some(L => L.trig.length < 2 && (!L.trig.length || L.trig[0].length === combo.length));

  // Minimal lockout sets (up to maxSize things lost together).
  const found = accounts.map(() => []);
  const isSuperset = (combo, list) => list.some(f => f.every(x => combo.includes(x)));
  const consider = (combo, st) => {
    for (let k = 0; k < accounts.length; k++) {
      if (!alive[k] || st[accIdx[k]] > threshold) continue;
      if (!isSuperset(combo, found[k])) found[k].push(combo);
    }
    if (combo.length > loopMax) return;
    for (const L of loops) {
      if (L.trig.length >= 2 || (L.trig.length && L.trig[0].length !== combo.length)) continue;
      if (L.idx.every(i => st[i] <= threshold)) L.trig.push(combo);
    }
  };
  const worthIt = combo => accounts.some((a, k) => alive[k] && !isSuperset(combo, found[k])) || loopWants(combo);
  for (const c of candidates) consider([c], single.get(c));
  let evaluated = candidates.length;
  const budget = opts.budget ?? 20000;
  if (maxSize >= 2) {
    for (let i = 0; i < candidates.length && evaluated < budget; i++) {
      for (let j = i + 1; j < candidates.length && evaluated < budget; j++) {
        const combo = [candidates[i], candidates[j]];
        if (!worthIt(combo)) continue;
        consider(combo, simulateRaw(graph, combo));
        evaluated++;
      }
    }
  }
  if (maxSize >= 3) {
    for (let i = 0; i < candidates.length && evaluated < budget; i++) {
      for (let j = i + 1; j < candidates.length && evaluated < budget; j++) {
        for (let k = j + 1; k < candidates.length && evaluated < budget; k++) {
          const combo = [candidates[i], candidates[j], candidates[k]];
          if (!worthIt(combo)) continue;
          consider(combo, simulateRaw(graph, combo));
          evaluated++;
        }
      }
    }
  }
  const sets = new Map(accounts.map((a, k) => [a, found[k]]));
  const resilience = new Map();
  for (const a of accounts) {
    if (baseline.state.get(a) <= threshold) { resilience.set(a, 0); continue; }
    const s = sets.get(a);
    resilience.set(a, s.length ? Math.min(...s.map(x => x.length)) : maxSize + 1);
    s.sort((x, y) => x.length - y.length);
  }

  return {
    graph, baseline, blast, sets, resilience, maxSize, evaluated,
    truncated: evaluated >= budget,
    cycles: loops.map(L => ({ ...L.c, triggers: L.trig })),
    warnings: warnings(profile, graph, baseline),
  };
}

const weight = (byId, ids) => ids.reduce((n, id) => {
  const a = byId.get(id);
  return n + (a?.important ? 3 : 1) * Math.max(1, a?.count || 1);
}, 0);

// Tarjan SCC over account-level dependencies (through things like authenticator apps and
// numbers). Reports groups of accounts that depend on each other.
export function findCycles(graph) {
  const edges = new Map();
  for (const n of graph.nodes.values()) {
    const out = new Set();
    for (const w of n.ways) for (const s of w.steps) for (const a of s.anyOf) out.add(a.ref);
    edges.set(n.id, out);
  }
  let index = 0;
  const idx = new Map(), low = new Map(), onStack = new Set(), stack = [], comps = [];
  const strong = (v) => {
    idx.set(v, index); low.set(v, index); index++;
    stack.push(v); onStack.add(v);
    for (const w of edges.get(v) || []) {
      if (!idx.has(w)) { strong(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
    }
    if (low.get(v) === idx.get(v)) {
      const comp = [];
      let w;
      do { w = stack.pop(); onStack.delete(w); comp.push(w); } while (w !== v);
      comps.push(comp);
    }
  };
  for (const v of graph.nodes.keys()) if (!idx.has(v)) strong(v);
  const result = [];
  for (const comp of comps) {
    if (comp.length < 2 || !comp.some(id => graph.nodes.get(id).type === 'account')) continue;
    for (const loop of shortLoops(graph, comp, edges)) {
      if (!loop.some(id => graph.nodes.get(id).type === 'account')) continue;
      const links = loop.map((id, i) => {
        const to = loop[(i + 1) % loop.length];
        return { from: id, to, fromLabel: refLabel(graph, id), toLabel: refLabel(graph, to), ...linkBetween(graph, id, to) };
      });
      result.push({ members: loop, labels: loop.map(id => refLabel(graph, id)), links });
    }
  }
  return result;
}

// For each loop, the smallest losses after which its members can only reach each other.
export function cycleTriggers(graph, cycles, candidates, opts = {}) {
  return cycles.map(c => ({ ...c, triggers: minimalLockouts(graph, candidates, c.members.filter(id => !id.endsWith(USE)), { maxSize: 3, limit: 2, ...opts }) }));
}

function warnings(profile, graph, baseline) {
  const out = [];
  const things = profile.things || [];
  const thingById = new Map(things.map(t => [t.id, t]));
  for (const a of profile.accounts || []) {
    const ways = (a.ways || []).filter(w => w.enabled !== false);
    if (!ways.length) {
      out.push({ level: 'high', kind: 'no-ways', account: a.id, text: `${a.name}: no way in is set up yet.` });
      continue;
    }
    if (baseline.state.get(a.id) === LOCKED) {
      out.push({ level: 'high', kind: 'broken', account: a.id, text: `${a.name}: even on a normal day, none of its ways in work. Check the setup.` });
    }
    const empty = ways.filter(w => (w.steps || []).some(s => !(s.anyOf || []).length));
    for (const w of empty) out.push({ level: 'low', kind: 'incomplete', account: a.id, text: `${a.name}: "${w.label}" is switched on but not filled in, so it's ignored.` });
    const recovery = ways.filter(w => w.kind === 'recovery' && w.speed !== 'appeal');
    if (!recovery.length && a.important) out.push({ level: 'medium', kind: 'no-recovery', account: a.id, text: `${a.name}: no recovery option besides a support appeal.` });
  }
  const papers = things.filter(t => t.kind === 'paper' || t.kind === 'seckey');
  const spots = new Map();
  for (const p of papers) {
    const where = topPlace(thingById, p.at);
    spots.set(where, (spots.get(where) || 0) + 1);
  }
  if (papers.length >= 2 && spots.size === 1) {
    const where = [...spots.keys()][0];
    const label = where === 'carried' ? 'on you' : (thingById.get(where)?.name || where);
    out.push({ level: 'medium', kind: 'one-place', text: `All your backup codes and security keys are in one place (${label}). One fire or theft takes all of them.` });
  }
  for (const app of things.filter(t => t.kind === 'authapp')) {
    if (!app.backup && (app.devices || []).length <= 1) out.push({ level: 'medium', kind: 'authapp', thing: app.id, text: `${app.name} lives on a single device with no backup.` });
  }
  const secrets = things.filter(t => t.kind === 'secret');
  if (secrets.length && !secrets.some(s => s.shared || (s.writtenOn || []).length)) {
    out.push({ level: 'low', kind: 'secrets', text: 'None of your memorized secrets are written down or shared, so nobody else could get in if you were gone.' });
  }
  return out;
}

function topPlace(byId, at) {
  let cur = at;
  let guard = 0;
  while (cur && cur !== 'carried' && byId.get(cur)?.inside && guard++ < 20) cur = byId.get(cur).inside;
  return cur && cur !== 'carried' && byId.has(cur) ? cur : 'carried';
}

// ---------------------------------------------------------------------------------------------
// Results for a scenario, ready for display.
// ---------------------------------------------------------------------------------------------

// The shortest loop of *failing* requirements that leads from this node back to itself in this
// scenario: the clearest way to say "these can only unlock each other right now".
// Only steps that actually hold a node below the level it needs are followed, and that level is
// carried down each edge (capped by the way's speed).
export function stuckLoop(graph, sim, id, target = OK) {
  const st = (r) => sim.state.get(r) ?? LOCKED;
  const next = (nid, t) => {
    const n = graph.nodes.get(nid);
    const out = [];
    for (const w of n?.ways || []) {
      if (!wayApplies(n, w, sim.ctx)) continue;
      const need = Math.min(t, SPEED_CAP[w.speed]);
      if (need <= st(nid)) continue; // this way couldn't lift the node above where it already is
      const bests = w.steps.map(s => s.anyOf.reduce((m, a) => Math.max(m, st(a.ref)), LOCKED));
      const wayVal = bests.reduce((m, b) => Math.min(m, b), SPEED_CAP[w.speed]);
      w.steps.forEach((s, i) => {
        // Only the binding steps hold the way down: improving any other step changes nothing.
        if (bests[i] > wayVal || bests[i] >= need) return;
        for (const a of s.anyOf) if (st(a.ref) < need) out.push([a.ref, need]);
      });
    }
    return out;
  };
  const key = (n, t) => n + '@' + t;
  const start = key(id, target);
  const prev = new Map([[start, null]]);
  const queue = [[id, target]];
  while (queue.length) {
    const [v, t] = queue.shift();
    for (const [w, need] of next(v, t)) {
      if (w === id) {
        const path = [];
        for (let k = key(v, t); k !== null; k = prev.get(k)) path.unshift(k.slice(0, k.lastIndexOf('@')));
        return [...path, id];
      }
      const k = key(w, need);
      if (!prev.has(k)) { prev.set(k, key(v, t)); queue.push([w, need]); }
    }
  }
  return null;
}

export function runScenario(profile, scenarioCtx, graph = compile(profile)) {
  const baseline = simulate(graph, {});
  const sim = simulate(graph, scenarioCtx);
  const rows = (profile.accounts || []).map(a => {
    const s = sim.state.get(a.id);
    const b = baseline.state.get(a.id);
    const stuck = s < b || s < OK;
    const rc = stuck ? rootCauses(graph, sim, a.id, Math.min(OK, b)) : { causes: [], cycles: [] };
    // Only this account's own loop (others show on their own rows), the shortest one.
    const loop = stuck ? stuckLoop(graph, sim, a.id, Math.min(OK, b)) : null;
    return { id: a.id, name: a.name, important: !!a.important, count: Math.max(1, a.count || 1), state: s, baseline: b, causes: rc.causes, cycles: loop ? [loop] : [] };
  });
  const tally = [0, 0, 0, 0];
  for (const r of rows) tally[r.state] += r.count;
  return { sim, baseline, rows, tally, graph };
}
