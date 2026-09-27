// Setup: the things you own or know, and the ways into each account.

import { h, icon, stateChip, plural, readFile } from './ui.js';
import { S, commit, rerender, removeItem, usages, graph, scenarioResult, toast } from './store.js';
import { THING_KINDS, THING_GROUPS, ACCOUNT_CATEGORIES, VIA, SPEEDS, WAY_KINDS, TEMPLATES, TEMPLATE_BY_ID, AUTHAPP_PRESETS, WISHES, LEGACY_BY_TEMPLATE, accountFromTemplate, accepts, templateForDomain } from './templates.js';
import { sitesFromExport } from './csv.js';
import { uid } from './advice.js';

const things = () => S.profile.things;
const byKind = (...k) => things().filter(t => k.includes(t.kind));
const findThing = id => things().find(t => t.id === id);
const findAccount = id => S.profile.accounts.find(a => a.id === id);
const nameOf = id => findThing(id)?.name ?? findAccount(id)?.name ?? '?';
const trusted = () => S.profile.trusted || 'your trusted person';
const homePlace = () => things().find(t => t.kind === 'place' && t.home && !t.inside) || things().find(t => t.kind === 'place');

function select(key, value, options, onchange, label) {
  return h('select', { dataset: { k: key }, 'aria-label': label, onchange: e => onchange(e.target.value) },
    options.map(([v, text, disabled]) => h('option', { value: v, selected: v === (value ?? ''), disabled: !!disabled }, text)));
}

function patchThing(id, patch, opts) {
  commit(p => {
    const t = p.things.find(x => x.id === id);
    if (!t) return;
    for (const [k, v] of Object.entries(patch)) {
      // '' or null clears a field back to its default; false is kept (e.g. heirCan: false).
      if (v === '' || v == null) delete t[k];
      else t[k] = v;
    }
  }, opts);
}

function placeOptions(exceptId) {
  // A place can't sit inside itself or its own descendants.
  const bad = new Set();
  if (exceptId) {
    bad.add(exceptId);
    let grew = true;
    while (grew) {
      grew = false;
      for (const t of byKind('place')) if (t.inside && bad.has(t.inside) && !bad.has(t.id)) { bad.add(t.id); grew = true; }
    }
  }
  return byKind('place').filter(p => !bad.has(p.id)).map(p => [p.id, p.name]);
}

// ------------------------------------------------------------------------------------------

export function setupView(openEditor, openDialog) {
  return h('div', null,
    h('div', { class: 'card', style: 'margin-bottom:22px' },
      h('div', { class: 'fieldrow' },
        h('label', { class: 'field' }, 'Your name (optional)',
          h('input', { type: 'text', value: S.profile.owner || '', placeholder: 'You', dataset: { k: 'p:owner' }, onchange: e => commit(p => { p.owner = e.target.value.trim().slice(0, 60); }) })),
        h('label', { class: 'field' }, 'Who would handle things if something happened to you?',
          h('input', { type: 'text', value: S.profile.trusted || '', placeholder: 'Partner, sibling, executor…', dataset: { k: 'p:trusted' }, onchange: e => commit(p => { p.trusted = e.target.value.trim().slice(0, 60); }) })),
      ),
    ),
    h('div', { class: 'setup' },
      h('section', { 'aria-label': 'Your things' },
        h('div', { class: 'col-h' }, h('h2', null, 'What you have'), h('p', null, 'Devices, numbers, papers, places and what you remember.')),
        THING_GROUPS.map(g => thingGroup(g)),
      ),
      h('section', { 'aria-label': 'Your accounts' },
        h('div', { class: 'col-h' }, h('h2', null, 'Your accounts'),
          h('div', { class: 'fieldrow' },
            h('button', { class: 'btn small', onclick: () => openDialog({ type: 'import' }) }, icon('import'), 'Import list'),
            h('button', { class: 'btn small primary', onclick: () => openDialog({ type: 'templates' }), dataset: { k: 'add-account' } }, icon('plus'), 'Add account'))),
        accountList(openEditor),
      ),
    ),
  );
}

// ------------------------------------------------------------------------------------------
// Things

function thingGroup(g) {
  const items = things().filter(t => THING_KINDS[t.kind].group === g.id);
  const add = (kind, preset) => {
    const t = newThing(kind, preset);
    commit(p => { p.things.push(t); });
    S.focusAfter = 't:' + t.id + ':name';
    rerender();
  };
  const addButtons = g.id === 'apps'
    ? select('add:apps', '', [['', '+ Add an app…'], ...AUTHAPP_PRESETS.map(a => [a.name, a.name]), ['Other', 'Other authenticator']], v => { if (v) add('authapp', v); }, 'Add an authenticator app')
    : g.add.map(k => h('button', { class: 'btn small ghost', onclick: () => add(k), dataset: { k: 'add:' + k } }, icon('plus'), THING_KINDS[k].label));
  return h('div', { class: 'card' },
    h('div', { class: 'card-h' },
      h('h3', null, icon(g.add[0]), g.label, h('span', { class: 'hint' }, items.length ? '' : ' — ' + g.hint)),
      h('div', { class: 'fieldrow', style: 'gap:4px' }, addButtons),
    ),
    items.length ? items.map(t => thingRow(t)) : null,
  );
}

function newThing(kind, preset) {
  const home = homePlace();
  const phones = byKind('phone');
  const base = { id: uid(kind), kind, name: THING_KINDS[kind].label };
  switch (kind) {
    case 'phone': return { ...base, name: phones.length ? 'Second phone' : 'Phone', at: 'carried' };
    case 'computer': return { ...base, name: 'Laptop', at: home ? home.id : 'carried' };
    case 'tablet': return { ...base, name: 'Tablet', at: home ? home.id : 'carried' };
    case 'seckey': return { ...base, name: 'Security key', at: 'carried' };
    case 'paper': return { ...base, name: 'Printed backup codes', at: home ? home.id : 'carried' };
    case 'photoid': return { ...base, name: 'Photo ID', at: 'carried' };
    case 'number': return { ...base, name: 'Phone number', ...(phones[0] ? { sim: phones[0].id } : {}) };
    case 'place': return { ...base, name: byKind('place').length ? 'Another place' : 'Home', ...(byKind('place').length ? {} : { home: true }) };
    case 'secret': return { ...base, name: 'Password or passcode' };
    case 'person': return { ...base, name: S.profile.trusted || 'Trusted person' };
    case 'authapp': {
      const p = AUTHAPP_PRESETS.find(x => x.name === preset);
      const backupAcc = p?.backupTemplate && S.profile.accounts.find(a => a.template === p.backupTemplate);
      return { ...base, name: p ? p.name : 'Authenticator app', devices: phones[0] ? [phones[0].id] : [], ...(backupAcc ? { backup: backupAcc.id } : {}) };
    }
    default: return base;
  }
}

function thingRow(t) {
  const k = 't:' + t.id;
  const del = () => {
    const used = usages(S.profile, t.id);
    commit(p => removeItem(p, t.id), { undoLabel: `Removed ${t.name}${used.length ? ` (was used by ${used.slice(0, 3).join(', ')}${used.length > 3 ? '…' : ''})` : ''}` });
  };
  return h('div', { class: 'thing' },
    h('span', { class: 'k' }, icon(t.kind)),
    h('input', { class: 'name', type: 'text', value: t.name, 'aria-label': THING_KINDS[t.kind].label + ' name', dataset: { k: k + ':name' }, onchange: e => patchThing(t.id, { name: e.target.value.trim() || THING_KINDS[t.kind].label }) }),
    h('button', { class: 'icon-btn', title: 'Remove', 'aria-label': 'Remove ' + t.name, onclick: del, dataset: { k: k + ':del' } }, icon('trash')),
    h('div', { class: 'attrs' }, attrs(t, k)),
  );
}

function attrs(t, k) {
  const out = [];
  const where = () => h('label', { class: 'f' }, 'Kept',
    select(k + ':at', t.at || 'carried', [['carried', 'With me every day'], ...placeOptions().map(([v, n]) => [v, 'At ' + n])], v => patchThing(t.id, { at: v }), 'Where it is kept'));
  // A short note for the handover guide (which drawer, where the key to the safe is).
  const noteField = () => (t.note || S.noteOpen.has(t.id))
    ? h('label', { class: 'f tnote' }, 'Note', h('input', { type: 'text', value: t.note || '', maxlength: '500', placeholder: `For ${trusted()}: which drawer, where the key is… never codes`, dataset: { k: k + ':note' }, onchange: e => { S.noteOpen.delete(t.id); patchThing(t.id, { note: e.target.value.trim().slice(0, 500) }); } }))
    : h('button', { class: 'btn small ghost addnote', onclick: () => { S.noteOpen.add(t.id); S.focusAfter = k + ':note'; rerender(); }, dataset: { k: k + ':addnote' } }, icon('plus'), 'Note');
  const heirToggle = () => (!t.at || t.at === 'carried')
    ? h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: t.heirCan !== false, dataset: { k: k + ':heir' }, onchange: e => patchThing(t.id, { heirCan: e.target.checked ? '' : false }) }), `${trusted()} would get it back`)
    : null;
  switch (t.kind) {
    case 'phone': case 'computer': case 'tablet':
      out.push(where());
      out.push(h('label', { class: 'f' }, 'Unlocked with',
        select(k + ':unlock', t.unlock || '', [['', 'No passcode'], ...byKind('secret').map(s => [s.id, s.name]), ['__new', '+ New passcode…']], v => {
          if (v === '__new') {
            const s = { id: uid('secret'), kind: 'secret', name: `${t.name} passcode` };
            commit(p => { p.things.push(s); p.things.find(x => x.id === t.id).unlock = s.id; });
          } else patchThing(t.id, { unlock: v });
        }, 'Unlocked with')));
      out.push(heirToggle());
      out.push(noteField());
      break;
    case 'seckey': case 'paper': case 'photoid':
      out.push(where());
      out.push(heirToggle());
      out.push(noteField());
      break;
    case 'number':
      out.push(h('label', { class: 'f' }, 'SIM in',
        select(k + ':sim', t.sim || '', [['', 'No phone (not in use)'], ...byKind('phone', 'tablet').map(d => [d.id, d.name])], v => patchThing(t.id, { sim: v }), 'SIM in')));
      out.push(h('label', { class: 'f' }, 'Carrier account',
        select(k + ':carrier', t.carrier || '', [['', 'Not listed'], ...S.profile.accounts.filter(a => a.category === 'carrier').map(a => [a.id, a.name])], v => patchThing(t.id, { carrier: v }), 'Carrier account')));
      break;
    case 'authapp': {
      const devices = byKind('phone', 'tablet', 'computer');
      out.push(h('span', { class: 'f' }, 'On', chips(k + ':dev', t.devices || [], devices.map(d => [d.id, d.name]), ids => patchThing(t.id, { devices: ids.length ? ids : '' }))));
      const backupOpts = [['', 'No backup'], ...S.profile.accounts.map(a => [a.id, a.name]), ...byKind('number').map(n => [n.id, 'Number ' + n.name]), ...byKind('paper').map(p => [p.id, p.name])];
      out.push(h('label', { class: 'f' }, 'Backs up to', select(k + ':backup', t.backup || '', backupOpts, v => patchThing(t.id, { backup: v }), 'Backs up to')));
      if (t.backup) out.push(h('label', { class: 'f' }, 'Backup password', select(k + ':bpw', t.backupSecret || '', [['', 'None'], ...byKind('secret').map(s => [s.id, s.name])], v => patchThing(t.id, { backupSecret: v }), 'Backup password')));
      const preset = AUTHAPP_PRESETS.find(p => t.name.toLowerCase().includes(p.name.toLowerCase()));
      if (preset) out.push(h('span', { class: 'note', style: 'flex-basis:100%' }, preset.backupHint));
      break;
    }
    case 'secret':
      out.push(h('span', { class: 'f' }, 'Written on', chips(k + ':w', t.writtenOn || [], byKind('paper').map(p => [p.id, p.name]), ids => patchThing(t.id, { writtenOn: ids.length ? ids : '' }), 'Nowhere')));
      out.push(h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!t.shared, dataset: { k: k + ':shared' }, onchange: e => patchThing(t.id, { shared: e.target.checked }) }), `${trusted()} knows it`));
      break;
    case 'place': {
      out.push(h('label', { class: 'f' }, 'Inside', select(k + ':inside', t.inside || '', [['', 'Nothing (a building or site)'], ...placeOptions(t.id)], v => patchThing(t.id, { inside: v, ...(v ? { home: false } : {}) }), 'Inside')));
      if (!t.inside) out.push(h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!t.home, dataset: { k: k + ':home' }, onchange: e => patchThing(t.id, { home: e.target.checked }) }), 'Home'));
      if (t.inside) out.push(h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!t.fireproof, dataset: { k: k + ':fp' }, onchange: e => patchThing(t.id, { fireproof: e.target.checked }) }), 'Fireproof'));
      out.push(h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: t.heirCan !== false, dataset: { k: k + ':heir' }, onchange: e => patchThing(t.id, { heirCan: e.target.checked ? '' : false }) }), `${trusted()} can get in`));
      out.push(noteField());
      break;
    }
    case 'person':
      out.push(h('span', { class: 'note' }, 'Use them as a recovery, legacy or emergency contact in your accounts.'));
      break;
  }
  return out;
}

function chips(key, selected, options, onchange, emptyText) {
  const names = new Map(options);
  const rest = options.filter(([v]) => !selected.includes(v));
  return h('span', { class: 'chips' },
    selected.length ? null : (emptyText ? h('span', { class: 'note' }, emptyText) : null),
    selected.map(id => h('span', { class: 'chip' }, names.get(id) ?? nameOf(id),
      h('button', { 'aria-label': 'Remove ' + (names.get(id) ?? ''), onclick: () => onchange(selected.filter(x => x !== id)) }, icon('x')))),
    rest.length ? h('select', { class: 'add', dataset: { k: key + ':add' }, 'aria-label': 'Add', onchange: e => { if (e.target.value) onchange([...selected, e.target.value]); } },
      h('option', { value: '' }, '+ add'), rest.map(([v, n]) => h('option', { value: v }, n))) : null,
  );
}

// ------------------------------------------------------------------------------------------
// Accounts

function accountList(openEditor) {
  const accts = S.profile.accounts;
  if (!accts.length) return h('div', { class: 'card' }, h('p', { class: 'empty' }, 'No accounts yet. Start with the ones everything else depends on: your main email, your password manager, your phone carrier and your bank.'));
  const today = scenarioResult('today', {});
  const stateOf = new Map(today.rows.map(r => [r.id, r.state]));
  const sorted = [...accts].sort((a, b) => (b.important - a.important) || a.name.localeCompare(b.name));
  return h('div', { class: 'card' }, sorted.map(a => {
    const on = a.ways.filter(w => w.enabled !== false);
    const incomplete = on.filter(w => w.steps.some(s => !s.anyOf.length)).length;
    return h('div', { class: 'acct' },
      h('button', { class: 'startoggle', 'aria-pressed': String(!!a.important), title: a.important ? 'Important' : 'Mark important', 'aria-label': `Important: ${a.name}`, onclick: () => commit(p => { const x = p.accounts.find(q => q.id === a.id); x.important = !x.important; }) }, icon('star')),
      h('div', null,
        h('div', { class: 'an' }, a.name, a.count > 1 ? h('span', { class: 'note' }, ` · ${a.count} accounts`) : null),
        h('div', { class: 'ac' }, ACCOUNT_CATEGORIES[a.category] || 'Other', ' · ', plural(on.length, 'way') + ' in', incomplete ? h('span', { class: 'warnline' }, ` · ${incomplete} not filled in`) : null),
      ),
      stateOf.get(a.id) < 3 ? stateChip(stateOf.get(a.id), stateOf.get(a.id) === 0 ? 'Broken today' : undefined) : h('span'),
      h('button', { class: 'btn small', onclick: () => openEditor(a.id), dataset: { k: 'edit:' + a.id } }, 'Edit'),
    );
  }));
}

// Fill obvious choices when there is exactly one candidate (one password manager, one number...).
export function autofill(account, profile = S.profile) {
  const others = [...profile.things, ...profile.accounts.filter(a => a.id !== account.id)];
  const only = (type) => {
    const c = others.filter(x => accepts(type, x));
    return c.length === 1 ? c[0] : null;
  };
  for (const w of account.ways) {
    if (w.enabled === false) continue;
    for (const s of w.steps) {
      if (s.anyOf.length) continue;
      for (const type of s.types) {
        if (['push', 'session', 'trusted_device', 'any', 'account', 'backup', 'passkey'].includes(type)) continue;
        const pick = type === 'password'
          ? (profile.accounts.filter(a => a.category === 'password_manager' && a.id !== account.id).length === 1 ? profile.accounts.find(a => a.category === 'password_manager' && a.id !== account.id) : null)
          : only(type);
        if (pick) { s.anyOf.push({ ref: pick.id, via: type }); break; }
      }
    }
  }
  return account;
}

export function addAccountFromTemplate(tplId, overrides = {}) {
  const t = TEMPLATE_BY_ID.get(tplId);
  const a = autofill(accountFromTemplate(t, uid('acct'), overrides));
  commit(p => { p.accounts.push(a); });
  return a.id;
}

// ------------------------------------------------------------------------------------------
// Dialogs

export function templatesDialog(close, openEditor, openDialog) {
  const q = (S.dialog.q || '').toLowerCase();
  const list = TEMPLATES.filter(t => !q || t.name.toLowerCase().includes(q) || (ACCOUNT_CATEGORIES[t.category] || '').toLowerCase().includes(q) || t.domains.some(d => d.includes(q)));
  return h('div', { class: 'dlg' },
    h('div', { class: 'dlg-h' }, h('h2', null, 'Add an account'), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, icon('x'))),
    h('div', { class: 'dlg-b' },
      h('input', { type: 'search', placeholder: 'Search: Gmail, bank, Bitwarden, carrier…', value: S.dialog.q || '', dataset: { k: 'tpl:q' }, oninput: e => { S.dialog.q = e.target.value; rerender(); }, 'aria-label': 'Search services' }),
      h('p', { class: 'note' }, 'Each service comes with its real sign-in and recovery options, checked against its help pages in September 2026. You switch on the ones you use.'),
      h('div', { class: 'tpl-grid' }, list.map(t => h('button', { class: 'tpl', onclick: () => { const id = addAccountFromTemplate(t.id); openEditor(id); } },
        h('b', null, t.name), h('span', null, ACCOUNT_CATEGORIES[t.category] || '')))),
      list.length ? null : h('p', { class: 'empty' }, 'Nothing matches. Use "Other account".'),
    ),
    h('div', { class: 'dlg-f' },
      h('button', { class: 'btn', onclick: () => openDialog({ type: 'import' }) }, icon('import'), 'Import from a password manager'),
      h('button', { class: 'btn', onclick: () => { const id = addAccountFromTemplate('generic', { name: S.dialog.q || 'New account' }); openEditor(id); } }, 'Other account'),
    ),
  );
}

export function accountDialog(id, close) {
  const a = findAccount(id);
  if (!a) return null;
  const tpl = TEMPLATE_BY_ID.get(a.template);
  const edit = (fn, opts) => commit(p => fn(p.accounts.find(x => x.id === id), p), opts);
  const addWay = () => edit(acc => acc.ways.push({
    id: uid('w'), label: 'Another way in', kind: 'recovery', speed: 'instant', who: 'both', inPerson: false, note: '', enabled: true, custom: true,
    steps: [{ label: 'Needs', types: Object.keys(VIA).filter(t => t !== 'any' && t !== 'account'), anyOf: [] }],
  }));
  return h('div', { class: 'dlg' },
    h('div', { class: 'dlg-h' },
      h('input', { type: 'text', value: a.name, 'aria-label': 'Account name', style: 'font-size:18px;font-weight:650;flex:1', dataset: { k: 'a:name' }, onchange: e => edit(acc => { acc.name = e.target.value.trim() || acc.name; }) }),
      h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, icon('x')),
    ),
    h('div', { class: 'dlg-b' },
      h('div', { class: 'fieldrow' },
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!a.important, dataset: { k: 'a:imp' }, onchange: e => edit(acc => { acc.important = e.target.checked; }) }), 'Important account'),
        h('label', { class: 'field', style: 'flex-direction:row;align-items:center;gap:8px' }, 'Type',
          select('a:cat', a.category, Object.entries(ACCOUNT_CATEGORIES), v => edit(acc => { acc.category = v; }), 'Account type')),
        a.count || tpl?.bulk ? h('label', { class: 'field', style: 'flex-direction:row;align-items:center;gap:8px' }, 'How many accounts',
          h('input', { type: 'number', min: '1', max: '100000', value: String(a.count || 1), style: 'width:90px', dataset: { k: 'a:count' }, onchange: e => edit(acc => { const n = Math.max(1, Math.min(100000, parseInt(e.target.value, 10) || 1)); if (n > 1) acc.count = n; else delete acc.count; }) })) : null,
      ),
      tpl && (tpl.tips.length || tpl.sources.length) ? h('div', { class: 'tips' },
        h('b', null, 'Good to know about ' + tpl.name),
        tpl.tips.length ? h('ul', null, tpl.tips.map(t => h('li', null, t))) : null,
        tpl.sources.length ? h('p', { class: 'note', style: 'margin-top:6px' }, 'Checked against: ', tpl.sources.map((s, i) => [i ? ', ' : '', h('a', { href: s, target: '_blank', rel: 'noreferrer noopener' }, new URL(s).hostname.replace(/^www\./, '') + ' [' + (i + 1) + ']')])) : null,
      ) : null,
      h('div', null,
        h('h3', { style: 'font-size:15px;margin-bottom:4px' }, 'Ways in'),
        h('p', { class: 'note', style: 'margin-bottom:10px' }, 'Switch on what you have set up, then say what each step needs. The drill tries every way that is on.'),
        h('div', { style: 'display:grid;gap:8px' }, a.ways.map((w, wi) => wayEditor(a, w, wi, edit))),
        h('button', { class: 'btn small', style: 'margin-top:10px', onclick: addWay }, icon('plus'), 'Add another way in'),
      ),
      h('div', { class: 'ho-acct' },
        h('h3', { style: 'font-size:15px;margin-bottom:4px' }, 'If something happens to you'),
        h('p', { class: 'note', style: 'margin-bottom:10px' }, `Goes into the handover guide for ${trusted()}.`),
        h('label', { class: 'field' }, 'What should happen to it',
          select('a:wish', a.wish || '', [['', 'Not decided'], ...Object.entries(WISHES)], v => edit(acc => { if (v) acc.wish = v; else delete acc.wish; }), 'What should happen to it')),
        h('label', { class: 'field', style: 'margin-top:10px' }, `Notes for ${trusted()}`,
          h('textarea', { rows: '3', maxlength: '2000', value: a.note || '', placeholder: "What's in it, what to save, who to tell. Never passwords or codes.", dataset: { k: 'a:note' }, onchange: e => edit(acc => { const v = e.target.value.trim().slice(0, 2000); if (v) acc.note = v; else delete acc.note; }) })),
        a.template && Object.hasOwn(LEGACY_BY_TEMPLATE, a.template) ? h('p', { class: 'note', style: 'margin-top:8px' }, h('b', null, 'Official route for families: '), LEGACY_BY_TEMPLATE[a.template]) : null,
      ),
    ),
    h('div', { class: 'dlg-f' },
      h('button', { class: 'btn danger', onclick: () => { const name = a.name; close(); commit(p => removeItem(p, id), { undoLabel: `Deleted ${name}` }); } }, icon('trash'), 'Delete account'),
      h('span', { style: 'flex:1' }),
      h('button', { class: 'btn primary', onclick: close }, 'Done'),
    ),
  );
}

function wayEditor(a, w, wi, edit) {
  const k = `w:${a.id}:${w.id}`;
  const on = w.enabled !== false;
  const who = w.who === 'me' ? 'Only you' : w.who === 'heir' ? 'After your death' : null;
  return h('div', { class: 'way-ed', 'data-on': String(on) },
    h('div', { class: 'wtop' },
      h('input', { type: 'checkbox', checked: on, 'aria-label': 'Use: ' + w.label, dataset: { k: k + ':on' }, onchange: e => edit(acc => { acc.ways[wi].enabled = e.target.checked; }) }),
      w.custom ? h('input', { type: 'text', class: 'lbl', value: w.label, 'aria-label': 'Name of this way in', dataset: { k: k + ':label' }, onchange: e => edit(acc => { acc.ways[wi].label = e.target.value.trim() || 'Another way in'; }) })
        : h('span', { class: 'lbl' }, w.label),
      h('span', { class: 'kind' }, WAY_KINDS[w.kind] || 'Sign in'),
      who ? h('span', { class: 'kind' }, who) : null,
      w.inPerson ? h('span', { class: 'kind' }, 'In person') : null,
      select(k + ':speed', w.speed, Object.entries(SPEEDS).map(([v, s]) => [v, s.label]), v => edit(acc => { acc.ways[wi].speed = v; }), 'How fast'),
      w.custom ? h('button', { class: 'icon-btn', 'aria-label': 'Remove this way', onclick: () => edit(acc => { acc.ways.splice(wi, 1); }) }, icon('trash')) : null,
    ),
    w.note ? h('p', { class: 'note', style: 'padding-left:26px' }, w.note) : null,
    h('div', { class: 'steps' },
      w.steps.length ? w.steps.map((s, si) => stepEditor(a, w, wi, s, si, edit, k)) : h('p', { class: 'note' }, 'Nothing needed from you beyond asking.'),
      w.custom ? h('div', null, h('button', { class: 'btn small ghost', onclick: () => edit(acc => { acc.ways[wi].steps.push({ label: 'And', types: Object.keys(VIA).filter(t => t !== 'any' && t !== 'account'), anyOf: [] }); }) }, icon('plus'), 'Add a step')) : null,
    ),
  );
}

const NEW_FOR = {
  backup_codes: (acc) => ({ kind: 'paper', name: `${acc.name} backup codes` }),
  recovery_key: (acc) => ({ kind: 'paper', name: `${acc.name} recovery key` }),
  secret_key: (acc) => ({ kind: 'paper', name: `${acc.name} Emergency Kit` }),
  security_key: () => ({ kind: 'seckey', name: 'Security key', at: 'carried' }),
  recovery_contact: () => ({ kind: 'person', name: S.profile.trusted || 'Trusted person' }),
  pin: (acc) => ({ kind: 'secret', name: `${acc.name} PIN` }),
  master_password: (acc) => ({ kind: 'secret', name: `${acc.name} master password` }),
  password: (acc) => ({ kind: 'secret', name: `${acc.name} password (memorized)` }),
  sms: () => ({ kind: 'number', name: 'Phone number', ...(byKind('phone')[0] ? { sim: byKind('phone')[0].id } : {}) }),
  voice: () => ({ kind: 'number', name: 'Phone number', ...(byKind('phone')[0] ? { sim: byKind('phone')[0].id } : {}) }),
  photo_id: () => ({ kind: 'photoid', name: 'Photo ID', at: 'carried' }),
  totp: () => ({ kind: 'authapp', name: 'Authenticator app', devices: byKind('phone')[0] ? [byKind('phone')[0].id] : [] }),
};

function stepEditor(a, w, wi, s, si, edit, k) {
  const phrase = (via, id) => (VIA[via]?.phrase || '{x}').replace('{x}', () => nameOf(id));
  const candidates = [...things(), ...S.profile.accounts.filter(x => x.id !== a.id)];
  const groups = s.types.map(type => ({ type, items: candidates.filter(c => accepts(type, c) && !s.anyOf.some(o => o.ref === c.id && o.via === type)) }));
  const onPick = (v) => {
    if (!v) return;
    const [type, ref] = v.split('|');
    if (type === 'new') {
      if (!Object.hasOwn(NEW_FOR, ref)) return;
      const make = NEW_FOR[ref];
      const home = homePlace();
      const t = { id: uid('t'), ...make(a) };
      if (THING_KINDS[t.kind].physical && !t.at) t.at = home ? home.id : 'carried';
      edit((acc, p) => { p.things.push(t); acc.ways[wi].steps[si].anyOf.push({ ref: t.id, via: ref }); });
      toast(`Added "${t.name}" to What you have. Rename it or say where it's kept in Setup.`);
      return;
    }
    edit(acc => { acc.ways[wi].steps[si].anyOf.push({ ref, via: type }); });
  };
  const newOpts = s.types.filter(t => Object.hasOwn(NEW_FOR, t));
  return h('div', { class: 'stepr' },
    h('span', { class: 'sl' }, s.label),
    h('span', { class: 'chips' },
      s.anyOf.map((o, oi) => h('span', { class: 'chip' }, phrase(o.via, o.ref),
        h('button', { 'aria-label': 'Remove ' + nameOf(o.ref), onclick: () => edit(acc => { acc.ways[wi].steps[si].anyOf.splice(oi, 1); }) }, icon('x')))),
      s.anyOf.length > 0 ? h('span', { class: 'note' }, s.anyOf.length > 1 ? '(any one works)' : '') : null,
      h('select', { class: 'add', dataset: { k: `${k}:s${si}:add` }, 'aria-label': `Add to ${s.label}`, onchange: e => onPick(e.target.value) },
        h('option', { value: '' }, s.anyOf.length ? '+ or…' : '+ choose…'),
        groups.filter(g => g.items.length).map(g => h('optgroup', { label: VIA[g.type].label }, g.items.map(c => h('option', { value: `${g.type}|${c.id}` }, c.name)))),
        newOpts.length ? h('optgroup', { label: 'Add something new' }, newOpts.map(t => h('option', { value: `new|${t}` }, `New ${VIA[t].label.toLowerCase()}…`))) : null,
      ),
    ),
    !s.anyOf.length && w.enabled !== false ? h('span', { class: 'warnline' }, 'Choose at least one, or switch this way off.') : null,
  );
}

// ------------------------------------------------------------------------------------------
// Import the list of sites from a password-manager export (names only).

export function importDialog(close) {
  const d = S.dialog;
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) { d.error = 'That file is too large for a password export.'; rerender(); return; }
    try {
      let text = await readFile(file);
      const result = sitesFromExport(text);
      text = null; // drop the raw export right away
      e.target.value = '';
      const known = new Map();
      const other = [];
      for (const site of result.sites) {
        const t = templateForDomain(site.domain);
        if (t && !t.bulk && t.id !== 'generic') {
          const prev = known.get(t.id);
          if (prev) { prev.count += site.count; prev.hasTotp = prev.hasTotp || site.hasTotp; }
          else known.set(t.id, { template: t, count: site.count, hasTotp: site.hasTotp, name: t.name, pick: !S.profile.accounts.some(a => a.template === t.id) });
        } else other.push(site);
      }
      d.result = { format: result.format, total: result.total, known: [...known.values()], other, groupOthers: other.length > 0, totpGroup: other.some(s => s.hasTotp) };
      d.error = null;
    } catch (err) {
      d.error = err.message || String(err);
      d.result = null;
    }
    rerender();
  };
  const r = d.result;
  const emails = S.profile.accounts.filter(a => a.category === 'email' || a.category === 'platform');
  const addAll = () => {
    let n = 0;
    for (const k of r.known) if (k.pick) { addAccountFromTemplate(k.template.id); n++; }
    const totpSites = r.totpGroup ? r.other.filter(s => s.hasTotp) : [];
    const plainSites = r.other.filter(s => !totpSites.includes(s));
    const plain = plainSites.reduce((x, s) => x + s.count, 0);
    const withTotp = totpSites.reduce((x, s) => x + s.count, 0);
    if (r.groupOthers && plain > 0) {
      // Replace an existing estimate (e.g. from the quick start) with the real number.
      const existing = S.profile.accounts.find(a => a.template === 'email-reset');
      if (existing && plain > 1) {
        commit(p => { const a = p.accounts.find(x => x.id === existing.id); a.count = plain; }, { silent: true });
      } else {
        const id = addAccountFromTemplate('email-reset', plain > 1 ? { name: 'Sites that reset by email', count: plain } : { name: plainSites[0].name });
        if (d.email) commit(p => { const a = p.accounts.find(x => x.id === id); const st = a.ways.find(w => w.key === 'reset').steps[0]; if (!st.anyOf.length) st.anyOf.push({ ref: d.email, via: 'email_code' }); }, { silent: true });
      }
      n++;
    }
    if (r.groupOthers && withTotp > 0) {
      addAccountFromTemplate('generic', withTotp > 1 ? { name: 'Sites with authenticator codes', count: withTotp } : { name: totpSites[0].name });
      n++;
    }
    close();
    toast(`Added ${plural(n, 'account')}. Open each one to check its ways in.`);
    S.view = 'setup';
    rerender();
  };
  return h('div', { class: 'dlg' },
    h('div', { class: 'dlg-h' }, h('h2', null, 'Import your list of sites'), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, icon('x'))),
    h('div', { class: 'dlg-b' },
      h('div', { class: 'privacy' }, icon('shield'),
        h('div', null, h('b', null, 'Only site names are read. '), 'Export a CSV from Bitwarden, 1Password, LastPass, Proton Pass, KeePassXC, Dashlane, Chrome, Edge, Firefox or Apple Passwords. This page reads each entry\'s name, website, and whether it has a 2FA code. Usernames, passwords, notes and 2FA secrets are skipped, nothing leaves this page, and the file is not kept. Delete the export when you\'re done: it contains your passwords.')),
      h('label', { class: 'btn', style: 'justify-self:start' }, icon('open'), 'Choose CSV file…',
        h('input', { type: 'file', accept: '.csv,text/csv', class: 'sr', onchange: onFile, dataset: { k: 'import:file' } })),
      d.error ? h('p', { class: 'err', role: 'alert' }, d.error) : null,
      r ? h('div', { style: 'display:grid;gap:12px' },
        h('p', null, `Found ${plural(r.total, 'login')} (${r.format} format).`),
        r.known.length ? h('div', null,
          h('h3', { style: 'font-size:15px;margin-bottom:6px' }, 'Services with ready-made templates'),
          h('div', { style: 'display:grid;gap:6px' }, r.known.map(k => h('label', { class: 'check' },
            h('input', { type: 'checkbox', checked: k.pick, onchange: e => { k.pick = e.target.checked; } }),
            k.name, h('span', { class: 'note' }, ` · ${plural(k.count, 'login')}${S.profile.accounts.some(a => a.template === k.template.id) ? ' · already added' : ''}`)))),
        ) : null,
        r.other.length ? h('div', null,
          h('h3', { style: 'font-size:15px;margin-bottom:6px' }, `${plural(r.other.reduce((x, s) => x + s.count, 0), 'other site')}`),
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: r.groupOthers, onchange: e => { r.groupOthers = e.target.checked; rerender(); } }), 'Add them as one group that resets by email'),
          r.groupOthers && emails.length ? h('label', { class: 'field', style: 'margin:8px 0 0 24px' }, 'Their reset emails go to',
            select('import:email', d.email || '', [['', 'Choose later'], ...emails.map(e => [e.id, e.name])], v => { d.email = v; rerender(); }, 'Reset email')) : null,
          r.groupOthers && r.totpGroup ? h('label', { class: 'check', style: 'margin:8px 0 0 24px' }, h('input', { type: 'checkbox', checked: r.totpGroup, onchange: e => { r.totpGroup = e.target.checked; rerender(); } }), `Keep the ${r.other.filter(s => s.hasTotp).length} with authenticator codes as a separate group`) : null,
        ) : null,
      ) : null,
    ),
    h('div', { class: 'dlg-f' },
      h('button', { class: 'btn', onclick: close }, 'Cancel'),
      h('button', { class: 'btn primary', disabled: !r, onclick: addAll }, 'Add to my accounts'),
    ),
  );
}
