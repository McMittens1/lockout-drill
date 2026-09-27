// Handover: what the person you trust gets if you die or can't manage your accounts. You write a
// note and say what should happen to each account; the step-by-step guide is generated from the
// "You're gone" drill, so every step is a route the engine found using only what they can reach.

import { h, icon, stateChip, listText } from './ui.js';
import { S, commit, guide } from './store.js';
import { handoverFresh } from './guide.js';
import { KDF_ITERATIONS } from './crypto.js';
import { WISHES, LEGACY_BY_TEMPLATE } from './templates.js';

const REACH = ["Can't reach", 'Support appeal', 'Takes days', 'Right away'];

export function fmtDate(iso) {
  const d = new Date(iso || '');
  return Number.isFinite(+d) ? d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '';
}


// ------------------------------------------------------------------------------------------
// The owner's Handover tab

export function handoverView({ openDialog, openEditor, printGuide }) {
  const p = S.profile;
  const g = guide();
  const who = p.trusted || 'the person you trust';
  const ho = p.handover || {};
  const setHo = (k, v) => commit(q => { q.handover = { note: '', contacts: '', ...(q.handover || {}), [k]: v }; });
  const saved = ho.savedAt;
  const fresh = handoverFresh(p);

  return h('div', { class: 'weak handover' },
    h('header', { class: 'page-h' },
      h('div', null,
        h('p', { class: 'eyebrow' }, 'Handover'),
        h('h1', null, 'If something happens to you'),
        h('p', { class: 'lede' }, `What ${who} would need if you die or can't manage your accounts: a step-by-step guide built from your setup, what you want done with each account, and a note from you. It never holds passwords or codes, only where things are and how they connect.`)),
    ),

    h('div', { class: 'ho-grid' },
      h('section', { class: 'card ho-letter', 'aria-label': 'Your note' },
        h('label', { class: 'field' }, 'The person you trust',
          h('input', { type: 'text', value: p.trusted || '', placeholder: 'Partner, sibling, executor…', maxlength: '60', dataset: { k: 'ho:trusted' }, onchange: e => commit(q => { q.trusted = e.target.value.trim().slice(0, 60); }) })),
        h('label', { class: 'field' }, `A note for ${who}`,
          h('textarea', { rows: '5', maxlength: '4000', value: ho.note || '', placeholder: 'Where to start, what matters most, what can wait. Never passwords.', dataset: { k: 'ho:note' }, onchange: e => setHo('note', e.target.value.trim().slice(0, 4000)) })),
        h('label', { class: 'field' }, 'People to contact',
          h('textarea', { rows: '3', maxlength: '2000', value: ho.contacts || '', placeholder: 'Executor, lawyer, accountant, employer…', dataset: { k: 'ho:contacts' }, onchange: e => setHo('contacts', e.target.value.trim().slice(0, 2000)) })),
      ),
      h('section', { class: 'card ho-share', 'aria-labelledby': 'share-h' },
        h('h2', { id: 'share-h' }, 'Give it to them'),
        h('p', { class: 'ho-status ' + (fresh ? 'ok' : saved ? 'warn' : '') }, icon(fresh ? 'check' : saved ? 'clock' : 'lock'),
          !saved ? 'No handover file yet.'
            : fresh ? `Your handover file from ${fmtDate(saved)} is up to date.`
              : `Your plan changed after the handover file of ${fmtDate(saved)}. Make a new one and replace the old.`),
        h('div', { class: 'ho-opt' },
          h('div', null,
            h('b', null, 'Encrypted handover file'),
            h('p', { class: 'note' }, `One file ${who} opens by double-clicking, in any browser, even offline. Locked with a passphrase you give only to them.`)),
          h('button', { class: 'btn primary', onclick: () => openDialog({ type: 'export' }), dataset: { k: 'ho:export' } }, icon('lock'), 'Create handover file…')),
        h('div', { class: 'ho-opt' },
          h('div', null,
            h('b', null, 'Printed guide'),
            h('p', { class: 'note' }, 'The same guide on paper. Store it like the things it points to, for example with your will.')),
          h('button', { class: 'btn', onclick: printGuide }, icon('print'), 'Print the guide')),
        h('p', { class: 'note' }, 'Signing in as someone else can break a service\'s terms, and in some places the law, even with permission. The guide lists each service\'s official route for families next to the steps.'),
      ),
    ),

    wishesSection(p, g, who, openEditor),

    h('section', null,
      h('h2', null, `What ${who} will see`),
      h('p', { class: 'sub' }, 'Generated from your setup and the drill "You\'re gone". It changes as you change things.'),
      h('div', { class: 'paper' }, guideDoc(g)),
    ),
  );
}

function wishesSection(p, g, who, openEditor) {
  const accts = [...p.accounts].sort((a, b) => (b.important - a.important) || a.name.localeCompare(b.name));
  const edit = (id, fn) => commit(q => { const a = q.accounts.find(x => x.id === id); if (a) fn(a); });
  return h('section', null,
    h('h2', null, 'What should happen to each account'),
    h('p', { class: 'sub' }, `Your wishes and notes appear in the guide next to each account. Whether ${who} can get in comes from the drill "You're gone".`),
    accts.length ? h('div', { class: 'card wish-list', style: 'padding:0' }, accts.map(a => {
      const st = g.states.get(a.id) ?? 0;
      return h('div', { class: 'wish' },
        h('div', { class: 'wn' },
          h('button', { class: 'linkish', onclick: () => openEditor(a.id), title: 'Edit ways in' }, a.important ? icon('star', 'i star') : null, a.name),
          a.count > 1 ? h('span', { class: 'note' }, ` · ${a.count} accounts`) : null),
        stateChip(st, REACH[st]),
        h('select', { 'aria-label': `What should happen to ${a.name}`, dataset: { k: 'wish:' + a.id }, onchange: e => edit(a.id, x => { if (e.target.value) x.wish = e.target.value; else delete x.wish; }) },
          h('option', { value: '', selected: !a.wish }, 'Not decided'),
          Object.entries(WISHES).map(([v, label]) => h('option', { value: v, selected: a.wish === v }, label))),
        h('input', { type: 'text', class: 'wnote', value: a.note || '', maxlength: '2000', placeholder: 'Notes: what\'s in it, what to save. Never passwords.', 'aria-label': `Notes about ${a.name}`, dataset: { k: 'wnote:' + a.id }, onchange: e => edit(a.id, x => { const v = e.target.value.trim().slice(0, 2000); if (v) x.note = v; else delete x.note; }) }),
      );
    })) : h('p', { class: 'empty' }, 'Add your accounts in Setup first.'),
  );
}

// ------------------------------------------------------------------------------------------
// The guide itself: the owner's preview, the recipient's view and the printout.

export function guideDoc(g, { print = false } = {}) {
  const owner = g.owner || 'the owner';
  const Owner = g.owner || 'The owner';
  const t = g.tally;
  const datedText = [
    g.preparedAt ? `prepared ${fmtDate(g.preparedAt)}` : null,
    g.reviewedAt ? `last reviewed ${fmtDate(g.reviewedAt)}` : null,
  ].filter(Boolean).join(', ');
  const dated = datedText ? datedText[0].toUpperCase() + datedText.slice(1) : '';
  const usesNumber = g.gather.some(x => x.kind === 'number');
  const hasSlow = g.steps.some(s => s.state === 2 || s.state === 1);

  const got = [];
  if (t.now) got.push(`${t.now} right away`);
  if (t.days) got.push(`${t.days} in days`);
  if (t.appeal) got.push(`${t.appeal} only through a support appeal`);
  const of = `${t.total} ${t.total === 1 ? 'account' : 'accounts'}`;
  const summary = !t.total ? 'No accounts are listed yet.'
    : !got.length ? `With what you can reach, none of the ${of} can be opened yet. The official routes for families below are the way.`
      : `Of ${of}, you can get into ${listText(got)}.` + (t.none ? ` ${t.none} can't be reached with what you have.` : '');

  return h('article', { class: 'guide' },
    h('header', { class: 'g-head' },
      h('p', { class: 'eyebrow' }, 'Account handover guide'),
      h('h1', null, g.owner ? `${g.owner}'s accounts` : 'Accounts'),
      g.trusted ? h('p', { class: 'g-for' }, `For ${g.trusted}`) : null,
      dated ? h('p', { class: 'meta' }, dated + '.') : null,
    ),
    g.reviewedDays !== null && g.stale ? h('p', { class: 'g-warn' }, `${Owner} last checked this ${fmtDate(g.reviewedAt)}. Some details may have changed since.`) : null,

    g.letter ? h('blockquote', { class: 'g-letter' }, h('p', null, g.letter), h('footer', null, '— ', owner)) : null,

    h('section', null,
      h('p', { class: 'g-lede' }, `This guide shows how to get into ${owner}'s accounts using only what you can get to, in an order that works, and what ${owner} wants done with each one. It contains no passwords or codes.`),
      h('p', { class: 'g-sum' }, summary),
    ),

    g.steps.length || g.blocked.length ? h('section', null,
      h('h2', null, 'Before you start'),
      h('ul', { class: 'g-tips' },
        h('li', null, 'Go in order. Earlier steps open later ones.'),
        usesNumber ? h('li', null, 'Don\'t cancel the phone number or close the email accounts until the end. Other accounts send codes and reset links to them.') : null,
        hasSlow ? h('li', null, 'Start the steps that take days early. The wait starts when you ask.') : null,
        h('li', null, 'Signing in as someone else can break a service\'s terms, and in some places the law, even with permission. When unsure, use the service\'s official route for families, listed with each account, or ask the estate\'s lawyer.'),
      ),
    ) : null,

    g.gather.length ? h('section', null,
      h('h2', null, 'Gather these first'),
      h('ul', { class: 'g-gather' }, g.gather.map(x => h('li', null,
        h('span', { class: 'gk' }, icon(x.kind)),
        h('div', null,
          h('b', null, x.name),
          h('div', { class: 'gw' }, sentence(x)),
          x.note ? h('div', { class: 'gn' }, x.note) : null),
        h('span', { class: 'gs' }, `step ${x.step}`),
      ))),
    ) : null,

    g.steps.length ? h('section', null,
      h('h2', null, 'Step by step'),
      h('ol', { class: 'g-steps' }, g.steps.map(s => h('li', { class: 'g-step' },
        h('span', { class: 'g-n', 'aria-hidden': 'true' }, String(s.n)),
        h('div', { class: 'g-body' },
          h('h3', null, s.name, s.count > 1 ? h('span', { class: 'note' }, ` · ${s.count} accounts`) : null, ' ', stateChip(s.state, REACH[s.state])),
          s.way ? h('p', { class: 'g-how' }, h('b', null, s.way), s.picks.length ? ': ' : '', s.picks.map((pk, i) => [i ? ' + ' : '', pk.text, pk.step ? h('span', { class: 'g-ref' }, ` (step ${pk.step})`) : null])) : null,
          s.opens.length ? h('p', { class: 'note' }, `Once you're in, this opens ${stepList(s.opens.map(o => o.step))}.`) : null,
          s.dataOnly ? h('p', { class: 'note' }, 'This hands over the data or the money, not a way to sign in, so it can\'t be used to get into other accounts.') : null,
          wishBlock(s, Owner),
          s.legacy ? h('p', { class: 'g-legacy' }, h('b', null, 'Official route for families: '), s.legacy) : null,
        ),
      ))),
    ) : null,

    g.blocked.length ? h('section', null,
      h('h2', null, 'Not reachable this way'),
      h('p', { class: 'note', style: 'margin-bottom:8px' }, 'None of the ways in work with what you can get to. The official route for families is usually the way.'),
      h('ul', { class: 'g-blocked' }, g.blocked.map(b => h('li', null,
        h('h3', null, b.name, b.count > 1 ? h('span', { class: 'note' }, ` · ${b.count} accounts`) : null),
        b.reasons.length ? h('p', { class: 'note' }, 'Missing: ', b.reasons.map(r => `${r.label} (${r.reason})`).join('; '), '.') : null,
        wishBlock(b, Owner),
        b.legacy ? h('p', { class: 'g-legacy' }, h('b', null, 'Official route for families: '), b.legacy) : null,
      ))),
    ) : null,

    g.contacts ? h('section', null, h('h2', null, 'People to contact'), h('p', { class: 'g-pre' }, g.contacts)) : null,

    g.map.length ? h('section', { class: 'g-appendix' },
      h('h2', null, 'The full map'),
      h('p', { class: 'note', style: 'margin-bottom:8px' }, `Every way into each account as ${owner} set it up, and where everything is. Useful if something above no longer works.`),
      h('div', { class: 'g-map' }, g.map.map(a => {
        const body = a.ways.length
          ? h('ul', null, a.ways.map(w => h('li', null,
            h('b', null, w.label), w.speed ? ` (${w.speed.toLowerCase()})` : '', w.who === 'me' ? ` · only ${owner}` : w.who === 'heir' ? ' · for family or the estate' : '',
            w.steps.length ? h('ul', null, w.steps.map(st => h('li', null, `${st.label}: `, st.options.length ? st.options.join(' or ') : h('em', null, 'nothing chosen')))) : null)))
          : h('p', { class: 'note' }, 'No ways in are set up.');
        return h('details', { open: print },
          h('summary', null, a.name, a.count > 1 ? ` · ${a.count} accounts` : '', ' ', stateChip(a.state, REACH[a.state])),
          body);
      })),
      g.inventory.length ? h('details', { open: print, class: 'g-inv' },
        h('summary', null, 'Where everything is'),
        h('ul', null, g.inventory.map(x => h('li', null, h('b', null, x.name), ': ', sentence(x), x.note ? ' ' + x.note : '', !x.reach && x.where !== 'Not written down or shared' ? h('em', null, ' Probably out of your reach.') : null)))) : null,
    ) : null,

    h('footer', { class: 'g-foot' }, `Made with Lockout Drill from ${owner}'s setup. It lists where things are and how accounts connect; it contains no passwords or codes. Anyone holding this and the things it points to could get in, so keep it safe.`),
  );
}

// "Home › Desk drawer (left side of the desk). Unlock it with the PIN."
function sentence(x) {
  let s = x.where + (x.placeNote ? ` (${x.placeNote.replace(/[.\s]+$/, '')})` : '');
  if (s && !/[.!?]$/.test(s)) s += '.';
  return x.how ? (s ? `${s} ${x.how}` : x.how) : s;
}

function wishBlock(s, owner) {
  if (!s.wishLabel && !s.note) return null;
  return h('div', { class: 'g-wish' },
    s.wishLabel ? h('p', null, h('b', null, `${owner}'s wish: `), s.wishLabel + '.') : null,
    s.note ? h('p', { class: 'g-pre' }, s.note) : null);
}

function stepList(ns) {
  const words = ns.map(n => `step ${n}`);
  if (words.length === 1) return words[0];
  return 'steps ' + ns.slice(0, -1).join(', ') + ' and ' + ns[ns.length - 1];
}

// ------------------------------------------------------------------------------------------
// The recipient's view of a handover file

export function guidePage(g, { onPrint, onExplore, onClose }) {
  return h('div', null,
    h('header', { class: 'top' },
      h('div', { class: 'brand' }, h('span', null, 'Handover guide')),
      h('div', { class: 'spacer' }),
      h('div', { class: 'status', title: 'This page runs offline and sends nothing anywhere.' }, icon('lock'), 'Opened on this device only'),
      h('button', { class: 'btn small', onclick: onPrint }, icon('print'), 'Print'),
      h('button', { class: 'btn small', onclick: onExplore, dataset: { k: 'g:explore' } }, 'Explore the drills'),
      h('button', { class: 'btn small ghost', onclick: onClose }, 'Close'),
    ),
    h('main', { id: 'main' }, h('div', { class: 'paper solo' }, guideDoc(g))),
  );
}

// ------------------------------------------------------------------------------------------
// Creating the handover file

export function exportDialog(close, create) {
  const who = S.profile.trusted || 'the person you trust';
  let busy = false;
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const f = e.target;
    const err = f.querySelector('.err');
    const btn = f.querySelector('button[type=submit]');
    const pass = f.pass.value;
    if (pass.length < 10) { err.textContent = 'Use at least 10 characters. Four or five random words work well and are easy to read out.'; return; }
    if (pass !== f.again.value) { err.textContent = "The two passphrases don't match."; return; }
    busy = true;
    btn.disabled = true; btn.textContent = 'Encrypting…';
    try {
      await create(pass);
    } catch (x) {
      err.textContent = x.message || String(x);
      btn.disabled = false; btn.textContent = 'Create file';
      busy = false;
    }
  };
  const legacyCount = S.profile.accounts.filter(a => a.template && Object.hasOwn(LEGACY_BY_TEMPLATE, a.template)).length;
  return h('form', { class: 'dlg', onsubmit: submit },
    h('div', { class: 'dlg-h' }, h('h2', null, 'Create a handover file'),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: close }, icon('x'))),
    h('div', { class: 'dlg-b' },
      h('p', null, `One HTML file with this app and your plan inside, encrypted (AES-256-GCM, PBKDF2 with ${KDF_ITERATIONS.toLocaleString()} rounds). ${who} double-clicks it, types the passphrase and gets the guide${legacyCount ? ', with the official route for families for each service we know' : ''}. It works offline in any modern browser.`),
      h('ul', { class: 'ho-tips' },
        h('li', null, h('b', null, 'Use a new passphrase, '), 'not the one that protects your setup here.'),
        h('li', null, h('b', null, 'Keep the file and the passphrase apart. '), `Give ${who} the file (a USB stick, email or shared drive is fine: it's encrypted) and the passphrase another way: in person, in a sealed letter with your will, or through your lawyer.`),
        h('li', null, h('b', null, 'Make a new file when things change. '), 'The Plan page tells you when this one is out of date.'),
        h('li', null, 'A forgotten passphrase can\'t be recovered. If it\'s lost, make a new file.'),
      ),
      h('div', { class: 'fieldrow' },
        h('label', { class: 'field grow' }, 'Handover passphrase', h('input', { type: 'password', name: 'pass', autocomplete: 'new-password', autofocus: true, dataset: { k: 'ex:1' } })),
        h('label', { class: 'field grow' }, 'Again', h('input', { type: 'password', name: 'again', autocomplete: 'new-password', dataset: { k: 'ex:2' } }))),
      h('p', { class: 'err', role: 'alert' }),
    ),
    h('div', { class: 'dlg-f' },
      h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancel'),
      h('button', { class: 'btn primary', type: 'submit' }, 'Create file')),
  );
}
