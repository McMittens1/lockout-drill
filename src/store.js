// App state, undo history, persistence (browser storage, optionally encrypted) and cached
// computations.

import { compile, runScenario, scenarioPresets, analyze } from './engine.js';
import { THING_KINDS, ACCOUNT_CATEGORIES, SPEEDS, WAY_KINDS, VIA } from './templates.js';
import { encryptWith, isEncrypted } from './crypto.js';
import { verifiedFixes } from './advice.js';

export const STORE_KEY = 'lockout-drill:v1';
export const PREF_KEY = 'lockout-drill:prefs';

export const S = {
  profile: null,
  version: 0,
  view: 'drill',
  scenario: 'phone',
  custom: { lost: [], abroad: false, heir: false },
  open: new Set(),
  openDetails: new Set(),
  keyring: null,
  screen: 'boot', // boot | welcome | quickstart | lock | app
  pendingEnvelope: null,
  menu: false,
  dialog: null,
  toast: null,
  history: [],
  saveState: 'saved',
  storageOk: true,
};

let renderFn = () => {};
let chromeFn = () => {};
export function onRender(fn, chrome) { renderFn = fn; if (chrome) chromeFn = chrome; }
export function rerender() { renderFn(); }
// Toasts and the save indicator update without rebuilding the views.
export function refreshChrome() { chromeFn(); }

// ---------------------------------------------------------------------------------------------
// Mutations & undo
// ---------------------------------------------------------------------------------------------

export function commit(mutate, { undoLabel = null, silent = false } = {}) {
  const before = JSON.stringify(S.profile);
  mutate(S.profile);
  S.history.push(before);
  if (S.history.length > 60) S.history.shift();
  S.version++;
  cache.clear();
  schedulePersist();
  if (undoLabel) toast(undoLabel, { undo: true });
  if (!silent) rerender();
}

export function undo() {
  const prev = S.history.pop();
  if (!prev) return false;
  S.profile = JSON.parse(prev);
  S.version++;
  cache.clear();
  schedulePersist();
  toast('Undone');
  rerender();
  return true;
}

export function replaceProfile(p, { keepHistory = true } = {}) {
  if (keepHistory && S.profile) S.history.push(JSON.stringify(S.profile));
  S.profile = p;
  S.version++;
  S.open.clear();
  cache.clear();
  schedulePersist();
}

let toastTimer = null;
export function toast(text, { undo = false, ms = undo ? 9000 : 5000 } = {}) {
  S.toast = { text, undo, depth: S.history.length };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { S.toast = null; refreshChrome(); }, ms);
  refreshChrome();
}

// ---------------------------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------------------------

let persistTimer = null;
export function schedulePersist() {
  S.saveState = 'saving';
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 350);
  refreshChrome();
}

// Returns true when the setup was written. Under file://, every local HTML file shares one
// storage area, so an unencrypted setup is only stored there after the person agrees to it.
export async function persistNow() {
  clearTimeout(persistTimer);
  if (!S.profile) return false;
  if (!S.keyring && needsPlainConsent()) {
    S.saveState = 'unsaved';
    refreshChrome();
    return false;
  }
  let ok = false;
  try {
    const payload = S.keyring ? await encryptWith(S.keyring, S.profile) : { app: 'lockout-drill', encrypted: false, v: 1, profile: S.profile };
    localStorage.setItem(STORE_KEY, JSON.stringify(payload));
    S.saveState = 'saved';
    S.storageOk = true;
    ok = true;
  } catch {
    S.saveState = 'error';
    S.storageOk = false;
    // Never leave an older unencrypted copy behind once a passphrase is set.
    if (S.keyring) {
      try {
        const old = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
        if (old && !isEncrypted(old)) localStorage.removeItem(STORE_KEY);
      } catch { /* storage unavailable */ }
    }
  }
  refreshChrome();
  return ok;
}

export const onFileUrl = () => typeof location !== 'undefined' && location.protocol === 'file:';
export function needsPlainConsent() {
  return onFileUrl() && !readPrefs().plainOk && !(S.profile && S.profile.sample);
}

export function readStored() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    S.storageOk = false;
    return null;
  }
}

export function clearStored() {
  try { localStorage.removeItem(STORE_KEY); } catch { /* storage unavailable */ }
}

export function readPrefs() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch { return {}; }
}
export function writePrefs(p) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify({ ...readPrefs(), ...p })); } catch { /* ignore */ }
}

// Accept a parsed file or stored payload; return { profile } or { envelope } or throw.
export function unwrap(data) {
  if (isEncrypted(data)) return { envelope: data };
  if (data && data.app === 'lockout-drill' && data.profile) return { profile: normalize(data.profile) };
  if (data && (Array.isArray(data.things) || Array.isArray(data.accounts))) return { profile: normalize(data) };
  throw new Error("This isn't a Lockout Drill file.");
}

// ---------------------------------------------------------------------------------------------
// Validation: loaded files may be old, hand-edited or malformed. Keep what makes sense.
// ---------------------------------------------------------------------------------------------

const has = (o, k) => typeof k === 'string' && Object.hasOwn(o, k);
const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : v == null ? '' : String(v).slice(0, max));
const idOk = v => typeof v === 'string' && v.length > 0 && v.length <= 80;

export function normalize(input) {
  const p = input && typeof input === 'object' ? input : {};
  const out = {
    app: 'lockout-drill',
    schema: 1,
    owner: str(p.owner, 60),
    trusted: str(p.trusted, 60),
    things: [],
    accounts: [],
  };
  if (p.sample) out.sample = true;
  const seen = new Set();
  for (const t of Array.isArray(p.things) ? p.things.slice(0, 500) : []) {
    if (!t || !idOk(t.id) || seen.has(t.id) || !has(THING_KINDS, t.kind)) continue;
    seen.add(t.id);
    const x = { id: t.id, kind: t.kind, name: str(t.name) || THING_KINDS[t.kind].label };
    for (const k of ['at', 'unlock', 'inside', 'sim', 'carrier', 'backup', 'backupSecret']) if (idOk(t[k]) || t[k] === 'carried') x[k] = t[k];
    for (const k of ['home', 'fireproof', 'shared']) if (t[k] === true) x[k] = true;
    if (t.heirCan === false) x.heirCan = false;
    if (Array.isArray(t.devices)) x.devices = t.devices.filter(idOk).slice(0, 20);
    if (Array.isArray(t.writtenOn)) x.writtenOn = t.writtenOn.filter(idOk).slice(0, 20);
    if (t.note) x.note = str(t.note, 500);
    out.things.push(x);
  }
  for (const a of Array.isArray(p.accounts) ? p.accounts.slice(0, 1000) : []) {
    if (!a || !idOk(a.id) || seen.has(a.id)) continue;
    seen.add(a.id);
    const x = {
      id: a.id,
      name: str(a.name) || 'Account',
      template: idOk(a.template) ? a.template : null,
      category: has(ACCOUNT_CATEGORIES, a.category) ? a.category : 'other',
      important: !!a.important,
      ways: [],
    };
    if (Number.isFinite(a.count) && a.count > 1) x.count = Math.min(100000, Math.round(a.count));
    if (a.note) x.note = str(a.note, 500);
    const wseen = new Set();
    for (const w of Array.isArray(a.ways) ? a.ways.slice(0, 40) : []) {
      if (!w || typeof w !== 'object') continue;
      let wid = idOk(w.id) ? w.id : 'w' + wseen.size;
      while (wseen.has(wid)) wid += '_';
      wseen.add(wid);
      x.ways.push({
        id: wid,
        key: idOk(w.key) ? w.key : undefined,
        label: str(w.label) || 'Way in',
        kind: has(WAY_KINDS, w.kind) ? w.kind : 'signin',
        speed: has(SPEEDS, w.speed) ? w.speed : 'instant',
        inPerson: !!w.inPerson,
        who: ['me', 'heir', 'both'].includes(w.who) ? w.who : 'both',
        note: str(w.note, 300),
        enabled: w.enabled !== false,
        ...(w.custom === true ? { custom: true } : {}),
        ...(Array.isArray(w.unlessWay) ? { unlessWay: w.unlessWay.filter(idOk).slice(0, 10) } : {}),
        ...(Array.isArray(w.unlessVia) ? { unlessVia: w.unlessVia.filter(v => has(VIA, v)).slice(0, 10) } : {}),
        steps: (Array.isArray(w.steps) ? w.steps.slice(0, 8) : []).map(s => ({
          label: str(s?.label, 80) || 'Step',
          types: (Array.isArray(s?.types) ? s.types : []).filter(t => has(VIA, t)).slice(0, 20),
          anyOf: (Array.isArray(s?.anyOf) ? s.anyOf : []).filter(o => o && idOk(o.ref)).slice(0, 30).map(o => ({ ref: o.ref, via: has(VIA, o.via) ? o.via : 'any' })),
        })),
      });
    }
    out.accounts.push(x);
  }
  // Drop references to things or accounts that no longer exist.
  const ids = new Set([...out.things.map(t => t.id), ...out.accounts.map(a => a.id)]);
  for (const t of out.things) {
    for (const k of ['at', 'unlock', 'inside', 'sim', 'carrier', 'backup', 'backupSecret']) if (t[k] && !(k === 'at' && t[k] === 'carried') && !ids.has(t[k])) delete t[k];
    if (t.devices) t.devices = t.devices.filter(d => ids.has(d));
    if (t.writtenOn) t.writtenOn = t.writtenOn.filter(d => ids.has(d));
    if (t.inside === t.id) delete t.inside;
  }
  breakPlaceCycles(out.things);
  for (const a of out.accounts) for (const w of a.ways) for (const s of w.steps) s.anyOf = s.anyOf.filter(o => ids.has(o.ref) && o.ref !== a.id);
  return out;
}

function breakPlaceCycles(things) {
  const byId = new Map(things.map(t => [t.id, t]));
  for (const t of things) {
    const seen = new Set([t.id]);
    let cur = t;
    while (cur.inside) {
      if (seen.has(cur.inside)) { delete cur.inside; break; }
      seen.add(cur.inside);
      cur = byId.get(cur.inside);
      if (!cur) break;
    }
  }
}

// Remove a thing or account and every reference to it.
export function removeItem(p, id) {
  p.things = p.things.filter(t => t.id !== id);
  p.accounts = p.accounts.filter(a => a.id !== id);
  for (const t of p.things) {
    for (const k of ['at', 'unlock', 'inside', 'sim', 'carrier', 'backup', 'backupSecret']) if (t[k] === id) delete t[k];
    if (t.at === undefined && ['phone', 'computer', 'tablet', 'seckey', 'paper', 'photoid'].includes(t.kind)) t.at = 'carried';
    if (t.devices) t.devices = t.devices.filter(d => d !== id);
    if (t.writtenOn) t.writtenOn = t.writtenOn.filter(d => d !== id);
  }
  for (const a of p.accounts) for (const w of a.ways) for (const s of w.steps) s.anyOf = s.anyOf.filter(o => o.ref !== id);
}

// Where an item is referenced, for the delete confirmation.
export function usages(p, id) {
  const out = [];
  for (const t of p.things) {
    if (['at', 'unlock', 'inside', 'sim', 'carrier', 'backup', 'backupSecret'].some(k => t[k] === id) || (t.devices || []).includes(id) || (t.writtenOn || []).includes(id)) out.push(t.name);
  }
  for (const a of p.accounts) if (a.ways.some(w => w.steps.some(s => s.anyOf.some(o => o.ref === id)))) out.push(a.name);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Cached computations (cleared on every change)
// ---------------------------------------------------------------------------------------------

const cache = new Map();
export function clearCache() { cache.clear(); }
export function memo(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

export const graph = () => memo('graph', () => compile(S.profile));
export const presets = () => memo('presets', () => scenarioPresets(S.profile));
export const scenarioResult = (id, ctx) => memo('run:' + id + ':' + JSON.stringify(ctx), () => runScenario(S.profile, ctx, graph()));
export const analysis = () => memo('analysis', () => analyze(S.profile));
// Verified fixes re-simulate the whole setup per candidate: compute once per change, not per render.
export const fixesFor = (accountId, ctx, limit = 4) => memo(`fix:${accountId}:${limit}:${JSON.stringify(ctx)}`, () => verifiedFixes(S.profile, accountId, ctx, limit));

export function customCtx() {
  return { lost: S.custom.lost.filter(id => S.profile.things.some(t => t.id === id) || S.profile.accounts.some(a => a.id === id)), abroad: S.custom.abroad, perspective: S.custom.heir ? 'heir' : 'me' };
}

export function currentScenario() {
  const list = presets();
  if (S.scenario === 'custom') {
    return { id: 'custom', icon: 'custom', title: 'Your own drill', blurb: 'Pick what goes missing.', ctx: customCtx() };
  }
  return list.find(s => s.id === S.scenario) || list.find(s => s.id === 'phone') || list[0];
}
