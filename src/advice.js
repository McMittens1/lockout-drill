// Verified fixes: propose concrete changes the service actually supports, apply each to a copy of
// the setup, re-run the drill, and keep only the ones that help in this scenario.

import { compile, simulate, OK, LOCKED } from './engine.js';
import { TEMPLATE_BY_ID, AUTHAPP_PRESETS } from './templates.js';

export function uid(prefix = 'x') {
  const a = new Uint32Array(2);
  (globalThis.crypto || { getRandomValues: x => x.map(() => Math.random() * 2 ** 32) }).getRandomValues(a);
  return prefix + '_' + a[0].toString(36) + a[1].toString(36).slice(0, 3);
}

const clone = (x) => (typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x)));

// Places you could still reach in this scenario, best first (reachable now, then later).
function reachablePlaces(profile, sim) {
  return (profile.things || [])
    .filter(t => t.kind === 'place')
    .map(t => ({ t, s: sim.state.get(t.id) ?? LOCKED }))
    .filter(x => x.s > LOCKED)
    .sort((a, b) => b.s - a.s || (a.t.home ? 1 : 0) - (b.t.home ? 1 : 0))
    .map(x => x.t);
}

function findWay(account, type) {
  return (account.ways || []).find(w => (w.steps || []).some(s => (s.types || []).includes(type)));
}

// Switching on a route only helps if its *other* steps are satisfiable too. Fill them from what
// the account already uses in its other ways (e.g. the password it already has); if a step stays
// empty, the fix is not real and is dropped.
function completeWay(account, w, done) {
  for (const st of w.steps || []) {
    if (st === done || st.anyOf.length) continue;
    for (const ow of account.ways || []) {
      if (ow === w || ow.enabled === false) continue;
      for (const os of ow.steps || []) for (const alt of os.anyOf || []) {
        if ((st.types || []).includes(alt.via) && !st.anyOf.some(x => x.ref === alt.ref)) st.anyOf.push({ ...alt });
      }
    }
    if (!st.anyOf.length) return false;
  }
  return true;
}

function addToWay(account, type, ref) {
  const w = findWay(account, type);
  if (!w) return false;
  w.enabled = true;
  const s = w.steps.find(x => (x.types || []).includes(type));
  if (!s.anyOf.some(a => a.ref === ref)) s.anyOf.push({ ref, via: type });
  return completeWay(account, w, s);
}

const OFFSITE_NAME = 'Off-site (a relative or a bank box)';

function placeTargets(profile, sim, ctx) {
  const places = reachablePlaces(profile, sim);
  const out = places.map(p => ({ id: p.id, name: p.name, isNew: false }));
  const lostHome = (profile.things || []).some(t => t.kind === 'place' && t.home && ctx.lost?.has?.(t.id));
  if (!out.length || lostHome || ctx.perspective === 'heir') {
    if (!out.some(p => p.name === OFFSITE_NAME)) out.push({ id: null, name: OFFSITE_NAME, isNew: true });
  }
  return out.slice(0, 3);
}

function ensurePlace(p, target) {
  if (!target.isNew) return target.id;
  const id = uid('place');
  p.things.push({ id, kind: 'place', name: target.name, heirCan: true });
  return id;
}

// All things/accounts involved in why this account is stuck (walk its references).
function involved(profile, accountId) {
  const acc = new Map((profile.accounts || []).map(a => [a.id, a]));
  const thing = new Map((profile.things || []).map(t => [t.id, t]));
  const seen = new Set();
  const walk = (id) => {
    if (seen.has(id)) return;
    seen.add(id);
    const a = acc.get(id);
    if (a) for (const w of a.ways || []) if (w.enabled !== false) for (const s of w.steps || []) for (const x of s.anyOf || []) walk(x.ref);
    const t = thing.get(id);
    if (t) {
      if (t.unlock) walk(t.unlock);
      if (t.at && t.at !== 'carried') walk(t.at);
      if (t.inside) walk(t.inside);
      for (const d of t.devices || []) walk(d);
      if (t.backup) walk(t.backup);
      if (t.sim) walk(t.sim);
    }
  };
  walk(accountId);
  return { ids: seen, acc, thing };
}

export function candidateFixes(profile, accountId, ctxOpts) {
  const graph = compile(profile);
  const sim = simulate(graph, ctxOpts);
  const account = (profile.accounts || []).find(a => a.id === accountId);
  if (!account) return [];
  const template = TEMPLATE_BY_ID.get(account.template);
  const supports = new Set(template?.supports || []);
  const ctx = sim.ctx;
  const out = [];
  const name = account.name;

  // 1. Backup / recovery codes stored somewhere that survives.
  for (const type of ['backup_codes', 'recovery_key']) {
    if (!findWay(account, type)) continue;
    if (template && supports.size && !supports.has(type)) continue;
    for (const place of placeTargets(profile, sim, ctx)) {
      out.push({
        key: `${accountId}:${type}@${place.name}`,
        title: `Print ${name} ${type === 'backup_codes' ? 'backup codes' : 'recovery key'} and keep them at ${place.name}`,
        detail: type === 'backup_codes' ? 'Most services let you download a set of one-time codes. Store them like cash.' : 'Keep the printed recovery key away from the devices it protects.',
        apply: (p) => {
          const a = p.accounts.find(x => x.id === accountId);
          const at = ensurePlace(p, place);
          const id = uid('paper');
          p.things.push({ id, kind: 'paper', name: `${name} ${type === 'backup_codes' ? 'backup codes' : 'recovery key'}`, at });
          return addToWay(a, type, id);
        },
      });
    }
  }

  // 2. A spare security key kept elsewhere.
  if (findWay(account, 'security_key') && supports.has('security_key')) {
    for (const place of placeTargets(profile, sim, ctx)) {
      out.push({
        key: `${accountId}:seckey@${place.name}`,
        title: `Register a spare security key and keep it at ${place.name}`,
        detail: 'Two keys, two places. Register both on every account that uses one.',
        apply: (p) => {
          const a = p.accounts.find(x => x.id === accountId);
          const at = ensurePlace(p, place);
          const existing = p.things.find(t => t.kind === 'seckey' && t.at === at);
          const id = existing?.id || uid('key');
          if (!existing) p.things.push({ id, kind: 'seckey', name: 'Spare security key', at });
          return addToWay(a, 'security_key', id);
        },
      });
    }
  }

  // 3. A trusted person as recovery / legacy contact.
  if (findWay(account, 'recovery_contact')) {
    const people = (profile.things || []).filter(t => t.kind === 'person');
    const person = people[0];
    const label = person ? person.name : (profile.trusted || 'a trusted person');
    out.push({
      key: `${accountId}:contact`,
      title: `Add ${label} as ${ctx.perspective === 'heir' ? 'legacy / emergency' : 'recovery'} contact for ${name}`,
      detail: 'They can vouch for you or request access if something happens to you.',
      apply: (p) => {
        const a = p.accounts.find(x => x.id === accountId);
        let id = person?.id;
        if (!id) { id = uid('person'); p.things.push({ id, kind: 'person', name: profile.trusted || 'Trusted person' }); }
        let ok = false;
        for (const w of a.ways) {
          const s = (w.steps || []).find(x => (x.types || []).includes('recovery_contact'));
          if (!s) continue;
          if (ctx.perspective === 'heir' ? w.kind !== 'legacy' && w.who !== 'heir' : w.who === 'heir') continue;
          const before = JSON.stringify(w);
          w.enabled = true;
          if (!s.anyOf.some(x => x.ref === id)) s.anyOf.push({ ref: id, via: 'recovery_contact' });
          if (completeWay(a, w, s)) ok = true;
          else Object.assign(w, JSON.parse(before)); // leave routes we can't complete untouched
        }
        return ok;
      },
    });
  }

  const { ids, thing } = involved(profile, accountId);

  // 4. Authenticator apps without a backup.
  for (const id of ids) {
    const t = thing.get(id);
    if (!t || t.kind !== 'authapp' || t.backup) continue;
    const preset = AUTHAPP_PRESETS.find(x => t.name.toLowerCase().includes(x.name.toLowerCase()));
    const backupAcc = preset?.backupTemplate && (profile.accounts || []).find(a => a.template === preset.backupTemplate && a.id !== accountId);
    if (backupAcc) {
      out.push({
        key: `appbackup:${id}`,
        title: `Turn on ${t.name} backup to ${backupAcc.name}`,
        detail: preset.backupHint,
        apply: (p) => { const x = p.things.find(q => q.id === id); x.backup = backupAcc.id; return true; },
      });
    }
    // Only devices the app actually runs on (Aegis is Android-only; most apps have no desktop version).
    const kinds = preset?.devices || ['phone', 'tablet'];
    const osOk = (d) => preset?.os === 'android' ? !/iphone|ipad|mac/i.test(d.name)
      : preset?.os === 'apple' ? !/android|pixel|galaxy|windows|chromebook/i.test(d.name) : true;
    const others = (profile.things || []).filter(d => kinds.includes(d.kind) && osOk(d) && !(t.devices || []).includes(d.id));
    for (const d of others.slice(0, 2)) {
      out.push({
        key: `appdevice:${id}@${d.id}`,
        title: `Also set up ${t.name} on ${d.name}`,
        detail: 'Scan the same QR codes on a second device when you enroll, or transfer them.',
        apply: (p) => { const x = p.things.find(q => q.id === id); x.devices = [...(x.devices || []), d.id]; return true; },
      });
    }
  }

  // 5. Memorized secrets: write them down (memory loss, heirs) or share them (heirs).
  for (const id of ids) {
    const t = thing.get(id);
    if (!t || t.kind !== 'secret') continue;
    const reachable = sim.state.get(id) ?? LOCKED;
    if (reachable >= OK) continue;
    for (const place of placeTargets(profile, sim, ctx).slice(0, 2)) {
      out.push({
        key: `write:${id}@${place.name}`,
        title: `Write down ${t.name} in an emergency sheet kept at ${place.name}`,
        detail: 'A sealed envelope in a safe place. Password managers print one for you (Emergency Kit).',
        apply: (p) => {
          const at = ensurePlace(p, place);
          const pid = uid('paper');
          p.things.push({ id: pid, kind: 'paper', name: `Emergency sheet: ${t.name}`, at });
          const x = p.things.find(q => q.id === id);
          x.writtenOn = [...(x.writtenOn || []), pid];
          return true;
        },
      });
    }
    if (ctx.perspective === 'heir' && !t.shared) {
      out.push({
        key: `share:${id}`,
        title: `Tell ${profile.trusted || 'your trusted person'} ${t.name}`,
        detail: 'Only if you trust them with it today. Otherwise, use a sealed emergency sheet.',
        apply: (p) => { p.things.find(q => q.id === id).shared = true; return true; },
      });
    }
  }

  // 6. An account PIN you memorize (carriers, banks and messengers accept one by phone).
  for (const w of account.ways || []) {
    const si = (w.steps || []).findIndex(s => (s.types || []).includes('pin'));
    if (si < 0) continue;
    if (w.enabled !== false && w.steps[si].anyOf.length) continue;
    out.push({
      key: `${accountId}:pin:${w.id}`,
      title: `Set up a ${name} account PIN and memorize it`,
      detail: `Then "${w.label}" works even without your phone.`,
      apply: (p) => {
        const a = p.accounts.find(x => x.id === accountId);
        const way = a.ways.find(x => x.id === w.id);
        const id = uid('secret');
        p.things.push({ id, kind: 'secret', name: `${name} account PIN` });
        way.enabled = true;
        way.steps[si].anyOf.push({ ref: id, via: 'pin' });
        return completeWay(a, way, way.steps[si]);
      },
    });
  }

  // 7. Stay signed in on another device that survives.
  const sessionWay = findWay(account, 'session');
  if (sessionWay) {
    const devices = (profile.things || []).filter(d => ['phone', 'tablet', 'computer'].includes(d.kind));
    for (const d of devices) {
      if ((sim.state.get(d.id + '~use') ?? LOCKED) === LOCKED) continue;
      const s = sessionWay.steps.find(x => (x.types || []).includes('session'));
      if (sessionWay.enabled !== false && s.anyOf.some(x => x.ref === d.id)) continue;
      out.push({
        key: `${accountId}:session@${d.id}`,
        title: `Stay signed in to ${name} on ${d.name}`,
        detail: 'A signed-in device is often the fastest way back in.',
        apply: (p) => addToWay(p.accounts.find(x => x.id === accountId), 'session', d.id),
      });
    }
  }

  return out;
}

// Apply each candidate to a copy, re-run, keep the ones that improve this account.
export function verifiedFixes(profile, accountId, ctxOpts, limit = 4) {
  const before = simulate(compile(profile), ctxOpts).state.get(accountId) ?? LOCKED;
  if (before >= OK) return [];
  const results = [];
  for (const c of candidateFixes(profile, accountId, ctxOpts)) {
    const p = clone(profile);
    let applied = false;
    try { applied = c.apply(p); } catch { applied = false; }
    if (!applied) continue;
    const after = simulate(compile(p), ctxOpts).state.get(accountId) ?? LOCKED;
    if (after > before) results.push({ ...c, before, after });
  }
  results.sort((a, b) => b.after - a.after || a.title.length - b.title.length);
  const seen = new Set();
  return results.filter(r => {
    const k = r.key.split('@')[0];
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, limit);
}

// Rank fixes by how many fragile accounts they rescue. `fragile` is [{ accountId, lost: [...] }]:
// each account together with the smallest set of losses that locks it out. A fix "rescues" a
// pair when, after applying it, that loss no longer locks the account out.
export function bestFixes(profile, fragile, limit = 3) {
  const weightOf = new Map((profile.accounts || []).map(a => [a.id, (a.important ? 3 : 1) * Math.max(1, a.count || 1)]));
  const seen = new Map();
  for (const f of fragile) {
    for (const c of candidateFixes(profile, f.accountId, { lost: f.lost })) {
      if (!seen.has(c.title)) seen.set(c.title, c);
    }
  }
  const scored = [];
  for (const c of seen.values()) {
    const p = clone(profile);
    let ok = false;
    try { ok = c.apply(p); } catch { ok = false; }
    if (!ok) continue;
    const g = compile(p);
    const rescued = [];
    for (const f of fragile) {
      const st = simulate(g, { lost: f.lost }).state.get(f.accountId) ?? LOCKED;
      if (st > 1 /* better than appeal-only */) rescued.push(f.accountId);
    }
    const uniq = [...new Set(rescued)];
    if (uniq.length) scored.push({ ...c, rescued: uniq, score: uniq.reduce((n, id) => n + (weightOf.get(id) || 1), 0) });
  }
  scored.sort((a, b) => b.score - a.score || b.rescued.length - a.rescued.length || a.title.length - b.title.length);
  const families = new Set();
  return scored.filter(s => {
    const fam = s.key.split('@')[0];
    if (families.has(fam)) return false;
    families.add(fam);
    return true;
  }).slice(0, limit);
}

export function applyFix(profile, fix) {
  const p = clone(profile);
  fix.apply(p);
  return p;
}
