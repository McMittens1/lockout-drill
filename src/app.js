// Shell: screens, header, menu, dialogs, files, passphrase, printing, keyboard, boot.

import { h, append, icon, logo, stateChip, plural, listText, captureFocus, restoreFocus, download, readFile } from './ui.js';
import {
  S, onRender, rerender, refreshChrome, commit, undo, replaceProfile, toast, persistNow, schedulePersist,
  readStored, clearStored, unwrap, normalize, presets, scenarioResult, analysis, graph, readPrefs, writePrefs,
  clearCache, onFileUrl, guide, stampHandover, STORE_KEY,
} from './store.js';
import { derivation, OK, PHYSICAL_KINDS } from './engine.js';
import { THING_KINDS } from './templates.js';
import { makeKeyring, encryptWith, decryptEnvelope, decryptWith, isEncrypted, WrongPassphrase, KDF_ITERATIONS } from './crypto.js';
import { buildGuide, makeHandoverHtml, readHandover, planFingerprint, HANDOVER_ID } from './guide.js';
import { sampleProfile } from './sample.js';
import { QS_DEFAULT, buildFromAnswers } from './quickstart.js';
import { uid } from './advice.js';
import { drillView } from './drill.js';
import { setupView, accountDialog, templatesDialog, importDialog, autofill } from './setup.js';
import { planView } from './plan.js';
import { handoverView, guideDoc, guidePage, exportDialog } from './handover.js';

const $ = (sel) => document.querySelector(sel);

// A handover file is this same app with an encrypted plan embedded. The page is rebuilt from its
// own parts, so the file is an exact copy of the app whatever else has touched the live document.
// The build fills in SHELL (index.html); unbundled, fall back to a cleaned copy of the document.
const SHELL = /*__SHELL__*/null;
const OWN_SCRIPT = document.currentScript?.textContent || '';
const OWN_STYLE = document.getElementById('app-style')?.textContent || '';
function pristineHtml() {
  if (SHELL && OWN_SCRIPT) return SHELL.replace('/*__CSS__*/', () => OWN_STYLE).replace('/*__JS__*/', () => OWN_SCRIPT);
  const doc = document.documentElement.cloneNode(true);
  doc.querySelector('#' + HANDOVER_ID)?.remove();
  for (const id of ['app', 'toast', 'dlg', 'print']) doc.querySelector('#' + id)?.replaceChildren();
  return '<!doctype html>\n' + doc.outerHTML;
}

// Opened as a handover file? Its data tag sits before this script, so it is already parsed.
const HANDOVER_EL = document.getElementById(HANDOVER_ID);
const EMBEDDED = HANDOVER_EL ? (readHandover(HANDOVER_EL.textContent) || {}) : null;
HANDOVER_EL?.remove();

const VIEWS = ['plan', 'drill', 'handover', 'setup'];

function openEditor(id) { S.dialog = { type: 'account', id }; rerender(); }
function openDialog(d) { S.dialog = d; rerender(); }
function closeDialog() { S.dialog = null; rerender(); }
function setView(v) {
  if (!VIEWS.includes(v)) v = 'plan';
  S.view = v; S.menu = false;
  if (!S.ephemeral) writePrefs({ view: v });
  rerender(); window.scrollTo({ top: 0 });
}

// Where the Plan page's shortcuts lead.
function go(target) {
  if (target === 'export') { openDialog({ type: 'export' }); return; }
  if (target === 'setup') { S.focusAfter = 'ho:trusted'; setView('handover'); return; }
  if (target === 'heir' || target.startsWith('drill:')) {
    S.scenario = target === 'heir' ? 'heir' : target.slice(6);
    S.open.clear();
    setView('drill');
    return;
  }
  setView(target);
}

// ------------------------------------------------------------------------------------------
// Render

// Rebuilding the DOM between a mouse press and its release would swallow the click (the button
// under the pointer is replaced, e.g. after a text field commits on blur). Defer until release.
let pointerDown = false;
let renderPending = false;
function requestRender() {
  if (pointerDown) { renderPending = true; return; }
  // A text field commits on "change", which fires before Tab moves focus on. Render once focus
  // has moved, so it can be restored to the next field instead of being lost with the old DOM.
  if (window.event?.type === 'change') {
    if (!renderPending) { renderPending = true; setTimeout(() => { if (renderPending && !pointerDown) render(); }, 0); }
    return;
  }
  render();
}

function render() {
  renderPending = false;
  const f = captureFocus();
  $('#app').replaceChildren(screen());
  renderDialog();
  renderChrome();
  if (S.focusAfter) {
    const el = document.querySelector(`[data-k="${CSS.escape(S.focusAfter)}"]`);
    S.focusAfter = null;
    if (el) { el.focus(); el.select?.(); }
  } else restoreFocus(f);
}

function renderChrome() {
  const t = $('#toast');
  t.replaceChildren();
  if (S.toast) {
    // Undo is only offered while it would still undo the change the toast names.
    const canUndo = S.toast.undo && S.history.length === S.toast.depth;
    t.append(h('div', { class: 'toast', role: 'status' }, S.toast.text,
      canUndo ? h('button', { onclick: () => { S.toast = null; undo(); } }, 'Undo') : null));
  }
  const st = $('#status');
  if (st) st.replaceWith(statusEl());
  const nb = $('#unsaved');
  const want = S.screen === 'app' && S.profile && S.saveState === 'unsaved';
  if (!!nb !== !!want) requestRender();
}

function statusEl() {
  if (S.ephemeral) {
    return h('div', { id: 'status', class: 'status', title: 'Opened from a handover file. Nothing is written to this browser.' }, icon('lock'), 'Read-only copy: nothing is saved');
  }
  const warn = S.saveState === 'error' || S.saveState === 'unsaved';
  const text = S.saveState === 'error' ? 'Not saved: browser storage is blocked. Use Save to file.'
    : S.saveState === 'unsaved' ? 'Not saved yet'
      : S.saveState === 'saving' ? 'Saving…'
        : S.keyring ? 'Saved in this browser, encrypted' : 'Saved in this browser';
  return h('div', { id: 'status', class: 'status' + (warn ? ' warn' : ''), title: 'Nothing is uploaded. Your setup lives only in this browser and in files you save.' },
    h('span', { class: 'dot' }), S.keyring ? icon('lock') : null, text);
}

// Opened from disk (file://), every local HTML file shares one browser storage area, so an
// unencrypted setup is only kept there if the person says so.
function unsavedBanner() {
  if (S.saveState !== 'unsaved') return null;
  return h('div', { class: 'banner', id: 'unsaved' }, icon('shield'),
    h('span', { class: 'grow' }, h('b', null, 'Not saved yet. '), 'You opened this file from your disk, where any other HTML file you open could read unencrypted browser storage. Protect your setup with a passphrase to keep it in this browser.'),
    h('button', { class: 'btn small primary', onclick: () => openDialog({ type: 'passphrase', mode: 'set' }) }, 'Protect with a passphrase'),
    h('button', { class: 'btn small', onclick: () => { writePrefs({ plainOk: true }); persistNow(); rerender(); } }, 'Save unencrypted'));
}

function screen() {
  if (S.screen === 'welcome') return welcome();
  if (S.screen === 'quickstart') return quickstart();
  if (S.screen === 'lock') return lockScreen();
  if (S.screen === 'guidelock') return guideLockScreen();
  if (S.screen === 'guide' && S.guideProfile) return guideScreen();
  if (S.screen === 'app' && S.profile) return appShell();
  return h('div');
}

// ------------------------------------------------------------------------------------------
// Welcome

function welcome() {
  return h('main', null,
    h('div', { class: 'welcome' },
      h('div', { class: 'brand' }, logo(), 'Lockout Drill'),
      h('h1', null, "If you lost your phone tonight, or weren't around tomorrow, could anyone get into your accounts?"),
      h('p', { class: 'lede' }, "Map how you get into the accounts that matter. Drills show what you'd lose if your phone, your home or your memory went, and which fix works. A handover guide tells the person you trust how to get in, in what order, and what you want done with each account."),
      h('div', { class: 'cta' },
        h('button', { class: 'btn primary', onclick: () => { S.screen = 'quickstart'; rerender(); }, dataset: { k: 'w:start' } }, 'Start with my setup'),
        h('button', { class: 'btn', onclick: loadSample }, icon('sample'), 'Explore a sample setup'),
        h('button', { class: 'btn ghost', onclick: openFile }, icon('open'), 'Open a saved file'),
      ),
      h('div', { class: 'steps3' },
        h('div', null, h('b', null, '1. List what you have'), 'Phones, numbers, security keys, printed codes, where they are kept, and what you remember.'),
        h('div', null, h('b', null, '2. Say how you get in'), 'The sign-in and recovery options you really set up. Templates for 29 services do most of it.'),
        h('div', null, h('b', null, '3. Run the drills'), 'Phone stolen, house fire, SIM hijacked: what you would lose, why, and fixes checked by re-running the drill.'),
        h('div', null, h('b', null, '4. Hand it over'), 'A step-by-step guide for the person you trust, as an encrypted file they double-click or on paper.'),
      ),
      h('p', { class: 'privacy' }, icon('shield'), h('span', null, 'Runs entirely in this page. No account, no server, no network requests. Never enter passwords or codes here: only where things are and how they connect. You can protect your plan with a passphrase.')),
    ),
  );
}

function loadSample() {
  replaceProfile(sampleProfile(), { keepHistory: !!S.profile });
  S.screen = 'app';
  S.view = 'plan';
  S.scenario = 'phone';
  rerender();
}

// ------------------------------------------------------------------------------------------
// Quick start: a few questions build a real starting setup.


function quickstart() {
  const a = S.qs || (S.qs = { ...QS_DEFAULT });
  const radio = (name, value, label) => h('label', { class: 'check' },
    h('input', { type: 'radio', name, value, checked: a[name] === value, onchange: () => { a[name] = value; } }), label);
  const text = (name, label, placeholder) => h('label', { class: 'field' }, label,
    h('input', { type: 'text', value: a[name], placeholder, dataset: { k: 'qs:' + name }, oninput: e => { a[name] = e.target.value; } }));
  return h('main', null,
    h('form', { class: 'qs', onsubmit: (e) => { e.preventDefault(); finishQuickstart(); } },
      h('div', { class: 'brand' }, logo(), 'Lockout Drill'),
      h('h1', null, "Let's sketch your setup"),
      h('p', { class: 'blurb' }, 'Seven quick questions. This builds a starting setup you can correct afterwards; no passwords, just names.'),
      h('fieldset', null, h('legend', null, 'People'),
        h('div', { class: 'fieldrow' }, text('owner', 'Your first name (optional)', 'You'), text('trusted', 'Who would handle things if something happened to you?', 'e.g. Sam, my partner'))),
      h('fieldset', null, h('legend', null, 'Your phone'),
        h('div', { class: 'radios' }, radio('phone', 'iPhone', 'iPhone'), radio('phone', 'Android phone', 'Android')),
        h('div', { class: 'fieldrow' }, text('number', 'Its phone number (just a label)', '+1 555 0100'))),
      h('fieldset', null, h('legend', null, 'A computer at home that stays signed in?'),
        h('div', { class: 'radios' }, radio('computer', 'yes', 'Yes'), radio('computer', 'no', 'No')),
        h('div', { class: 'radios' }, radio('computerKind', 'windows', 'Windows'), radio('computerKind', 'mac', 'Mac'), radio('computerKind', 'other', 'Linux / Chromebook')),
        h('div', { class: 'fieldrow' }, text('computerName', 'Name', 'Laptop'))),
      h('fieldset', null, h('legend', null, 'Where are your passwords?'),
        h('div', { class: 'radios' },
          radio('pm', 'bitwarden', 'Bitwarden'), radio('pm', 'onepassword', '1Password'), radio('pm', 'lastpass', 'LastPass'), radio('pm', 'protonpass', 'Proton Pass'),
          radio('pm', 'apple', 'Apple Passwords / iCloud Keychain'), radio('pm', 'google', 'Google Password Manager'), radio('pm', 'none', 'In my head / a notebook'))),
      h('fieldset', null, h('legend', null, 'Authenticator app for 6-digit codes'),
        h('div', { class: 'radios' },
          ['Google Authenticator', 'Microsoft Authenticator', 'Authy', '2FAS', 'Aegis', 'Ente Auth'].map(n => radio('auth', n, n)),
          radio('auth', 'pm', 'Codes are in my password manager'), radio('auth', 'none', 'None: I get codes by text'))),
      h('fieldset', null, h('legend', null, 'Main email'),
        h('div', { class: 'radios' }, radio('email', 'google', 'Gmail'), radio('email', 'microsoft', 'Outlook / Hotmail'), radio('email', 'apple', 'iCloud Mail'), radio('email', 'proton', 'Proton Mail'), radio('email', 'yahoo', 'Yahoo'), radio('email', 'email', 'Other'))),
      h('fieldset', null, h('legend', null, 'Hardware security keys'),
        h('div', { class: 'radios' }, radio('keys', '0', 'None'), radio('keys', '1', 'One'), radio('keys', '2', 'Two')),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: a.bank === 'yes', onchange: e => { a.bank = e.target.checked ? 'yes' : 'no'; } }), 'Add my bank too')),
      h('div', { class: 'cta', style: 'display:flex;gap:10px' },
        h('button', { class: 'btn primary', type: 'submit' }, 'Build my setup and run the drills'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { S.screen = S.profile ? 'app' : 'welcome'; rerender(); } }, 'Back')),
    ),
  );
}

function finishQuickstart() {
  const p = buildFromAnswers(S.qs || QS_DEFAULT);
  replaceProfile(p, { keepHistory: true });
  S.qs = null;
  S.screen = 'app';
  S.view = 'plan';
  S.scenario = 'phone';
  toast('Your starting plan is ready. We made a few guesses: check them in Setup.', { ms: 8000 });
  rerender();
}

// ------------------------------------------------------------------------------------------
// Lock screen (encrypted setup in this browser)

function lockScreen() {
  const env = S.pendingEnvelope;
  let busy = false;
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    busy = true;
    const form = e.target;
    const pass = form.pass.value;
    const err = form.querySelector('.err');
    const btn = form.querySelector('button[type=submit]');
    const forgot = form.querySelector('.forgot');
    btn.disabled = true; btn.textContent = 'Unlocking…';
    if (forgot) forgot.disabled = true;
    try {
      const { profile, keyring } = await decryptEnvelope(env, pass);
      // The person may have erased or reloaded while the key was being derived.
      if (S.screen !== 'lock' || S.pendingEnvelope !== env) return;
      S.keyring = keyring;
      S.profile = normalize(profile);
      S.pendingEnvelope = null;
      S.screen = 'app';
      S.version++;
      rerender();
    } catch (x) {
      if (S.screen !== 'lock' || S.pendingEnvelope !== env) return;
      err.textContent = x instanceof WrongPassphrase ? 'That passphrase does not open this setup.' : x.message;
      btn.disabled = false; btn.textContent = 'Unlock';
      if (forgot) forgot.disabled = false;
      busy = false;
      form.pass.select();
    }
  };
  return h('main', null,
    h('form', { class: 'lockscreen', onsubmit: submit },
      h('div', { class: 'brand' }, logo(), 'Lockout Drill'),
      h('h1', null, 'Your setup is locked'),
      h('p', { class: 'note' }, 'It is encrypted in this browser. Enter your passphrase to open it.'),
      h('input', { type: 'password', name: 'pass', autocomplete: 'current-password', 'aria-label': 'Passphrase', dataset: { k: 'lock:pass' }, autofocus: true }),
      h('p', { class: 'err', role: 'alert' }),
      h('button', { class: 'btn primary', type: 'submit' }, 'Unlock'),
      h('button', { class: 'btn ghost danger forgot', type: 'button', onclick: () => openDialog({ type: 'confirm', title: 'Erase the locked setup?', text: 'Without the passphrase it cannot be opened. This removes it from this browser. Files you saved are not affected.', yes: 'Erase and start over', danger: true, onYes: eraseAll }) }, 'Forgot the passphrase?'),
    ),
  );
}

// ------------------------------------------------------------------------------------------
// Handover file: the person you trust opens it, enters the passphrase and gets the guide.
// Nothing from it is ever written to this browser.

function guideLockScreen() {
  const env = S.handoverEnv;
  let busy = false;
  const submit = async (e) => {
    e.preventDefault();
    if (busy || !env) return;
    busy = true;
    const form = e.target;
    const err = form.querySelector('.err');
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Opening…';
    try {
      const { profile } = await decryptEnvelope(env, form.pass.value);
      if (S.screen !== 'guidelock') return;
      S.guideProfile = normalize(profile);
      S.guideCache = null;
      S.screen = 'guide';
      rerender();
      window.scrollTo({ top: 0 });
    } catch (x) {
      if (S.screen !== 'guidelock') return;
      err.textContent = x instanceof WrongPassphrase ? "That passphrase doesn't open this guide. Capitals and spaces count." : x.message;
      btn.disabled = false; btn.textContent = 'Open the guide';
      busy = false;
      form.pass.select();
    }
  };
  return h('main', null,
    h('form', { class: 'lockscreen', onsubmit: submit },
      h('div', { class: 'brand' }, logo(), 'Handover guide'),
      h('h1', null, env ? 'A guide to their accounts was left for you' : 'This handover file is damaged'),
      h('p', { class: 'note' }, env
        ? 'It is encrypted. Enter the passphrase you were given with it. Everything stays on this device: this page works offline and sends nothing anywhere.'
        : 'Its encrypted part could not be read. Ask for a new copy of the file.'),
      env ? [
        h('input', { type: 'password', name: 'pass', autocomplete: 'off', placeholder: 'Passphrase', 'aria-label': 'Passphrase', dataset: { k: 'glock:pass' }, autofocus: true }),
        h('p', { class: 'err', role: 'alert' }),
        h('button', { class: 'btn primary', type: 'submit' }, 'Open the guide'),
      ] : null,
      h('button', { class: 'btn ghost', type: 'button', onclick: openAppInstead }, 'Open Lockout Drill instead'),
    ),
  );
}

function guideScreen() {
  if (!S.guideCache) S.guideCache = buildGuide(S.guideProfile);
  return guidePage(S.guideCache, { onPrint: printGuide, onExplore: exploreHandover, onClose: closeGuide });
}

// Explore the drills on the handed-over plan, in memory only.
function exploreHandover() {
  S.profile = JSON.parse(JSON.stringify(S.guideProfile));
  S.history = [];
  S.version++;
  clearCache();
  S.saveState = 'saved';
  S.screen = 'app';
  S.view = 'drill';
  S.scenario = 'heir';
  S.open.clear();
  rerender();
  window.scrollTo({ top: 0 });
}

function backToGuide() {
  S.profile = null;
  S.history = [];
  S.dialog = null;
  S.menu = false;
  clearCache();
  S.screen = 'guide';
  rerender();
  window.scrollTo({ top: 0 });
}

function closeGuide() {
  S.guideProfile = null;
  S.guideCache = null;
  S.profile = null;
  S.history = [];
  clearCache();
  $('#print').replaceChildren();
  S.screen = 'guidelock';
  rerender();
}

function openAppInstead() {
  S.ephemeral = false;
  S.handoverEnv = null;
  S.guideProfile = null;
  S.guideCache = null;
  startApp();
}

// ------------------------------------------------------------------------------------------
// App shell

function appShell() {
  const tab = (id, label) => h('button', { class: 'tab', role: 'tab', 'aria-selected': String(S.view === id), onclick: () => setView(id), dataset: { k: 'tab:' + id } }, label);
  return h('div', null,
    h('header', { class: 'top' },
      h('div', { class: 'brand' }, logo(), h('span', null, 'Lockout Drill')),
      h('nav', { class: 'tabs', role: 'tablist', 'aria-label': 'Views' }, tab('plan', 'Plan'), tab('drill', 'Drills'), tab('handover', 'Handover'), tab('setup', 'Setup')),
      h('div', { class: 'spacer' }),
      statusEl(),
      menu(),
    ),
    h('main', { id: 'main' },
      unsavedBanner(),
      S.ephemeral ? h('div', { class: 'banner' }, icon('lock'),
        h('span', { class: 'grow' }, `You're exploring ${S.profile.owner ? S.profile.owner + "'s" : 'this'} plan from a handover file. Nothing you change here is saved.`),
        h('button', { class: 'btn small primary', onclick: backToGuide }, 'Back to the guide')) : null,
      S.profile.sample ? h('div', { class: 'banner' }, icon('sample'),
        h('span', { class: 'grow' }, `You're exploring a sample setup (${S.profile.owner}'s). Change anything; it's a sandbox.`),
        h('button', { class: 'btn small primary', onclick: () => { S.screen = 'quickstart'; rerender(); } }, 'Start my own')) : null,
      !S.profile.accounts.length ? h('div', { class: 'banner' }, h('span', { class: 'grow' }, 'Add your accounts in Setup, then come back to run the drills.'), h('button', { class: 'btn small', onclick: () => setView('setup') }, 'Go to Setup')) : null,
      S.view === 'setup' ? setupView(openEditor, openDialog)
        : S.view === 'drill' ? drillView(openEditor)
          : S.view === 'handover' ? handoverView({ openDialog, openEditor, printGuide })
            : planView({ openEditor, go, printPlan }),
    ),
  );
}

function menu() {
  const item = (ic, label, fn, cls) => h('button', { role: 'menuitem', class: cls, onclick: () => { S.menu = false; fn(); } }, icon(ic), label);
  const toggle = () => { S.menu = !S.menu; rerender(); if (S.menu) setTimeout(() => $('.menu button')?.focus(), 0); };
  return h('div', { class: 'menu-wrap' },
    h('button', { class: 'icon-btn', 'aria-label': 'Menu', 'aria-haspopup': 'menu', 'aria-expanded': String(S.menu), onclick: toggle, dataset: { k: 'menu' } }, icon('more')),
    S.menu && S.ephemeral ? h('div', { class: 'menu', role: 'menu', onkeydown: e => { if (e.key === 'Escape') { S.menu = false; rerender(); $('[data-k="menu"]')?.focus(); } } },
      item('heir', 'Back to the guide', backToGuide),
      item('print', 'Print the handover guide', printGuide),
      item('print', 'Print a recovery plan', printPlan),
      item('undo', 'Undo last change', () => { if (!undo()) toast('Nothing to undo'); }),
    ) : S.menu ? h('div', { class: 'menu', role: 'menu', onkeydown: e => { if (e.key === 'Escape') { S.menu = false; rerender(); $('[data-k="menu"]')?.focus(); } } },
      item('save', 'Save to file…', saveFile),
      item('open', 'Open a saved file…', openFile),
      item('import', 'Import sites from a password manager…', () => openDialog({ type: 'import' })),
      h('hr'),
      S.keyring ? item('lock', 'Change passphrase…', () => openDialog({ type: 'passphrase', mode: 'change' })) : item('lock', 'Protect with a passphrase…', () => openDialog({ type: 'passphrase', mode: 'set' })),
      S.keyring ? item('lock', 'Lock now', lockNow) : null,
      S.keyring ? item('shield', 'Remove passphrase', () => openDialog({ type: 'confirm', title: 'Remove the passphrase?', text: 'Your setup will be stored unencrypted in this browser. Anyone using this browser profile could read where your recovery codes are kept' + (onFileUrl() ? ', and so could any other HTML file you open from your disk.' : '.'), yes: 'Remove passphrase', onYes: () => { S.keyring = null; S.dialog = null; if (onFileUrl()) writePrefs({ plainOk: true }); persistNow(); toast('Passphrase removed'); rerender(); } })) : null,
      h('hr'),
      item('heir', 'Create a handover file…', () => openDialog({ type: 'export' })),
      item('print', 'Print the handover guide', printGuide),
      item('print', 'Print a recovery plan', printPlan),
      item('plus', 'Start a new setup…', () => S.profile.sample || !S.profile.accounts.length
        ? (S.screen = 'quickstart', rerender())
        : openDialog({ type: 'confirm', title: 'Start a new setup?', text: 'The quick start replaces your current setup. Save it to a file first if you want to keep it. You can also undo right after.', yes: 'Start new setup', onYes: () => { S.dialog = null; S.screen = 'quickstart'; rerender(); } })),
      S.profile.sample ? null : item('sample', 'Look at the sample setup', () => openDialog({ type: 'confirm', title: 'Open the sample setup?', text: 'This replaces what you see with the sample. You can undo right after.', yes: 'Open sample', onYes: () => { S.dialog = null; loadSample(); toast('Sample loaded', { undo: true }); } })),
      item('undo', 'Undo last change', () => { if (!undo()) toast('Nothing to undo'); }),
      item('trash', 'Erase everything…', () => openDialog({ type: 'confirm', title: 'Erase your setup?', text: 'This removes your setup from this browser. Save to file first if you want to keep it.', yes: 'Erase', danger: true, onYes: eraseAll }), 'danger'),
    ) : null,
  );
}

// Forget everything held in memory or on screen (setup, key, history, caches, printed plan).
function dropInMemory() {
  S.profile = null;
  S.keyring = null;
  S.history = [];
  S.open.clear();
  S.openDetails.clear();
  S.toast = null;
  clearCache();
  $('#print').replaceChildren();
}

function eraseAll() {
  clearStored();
  dropInMemory();
  S.pendingEnvelope = null;
  S.dialog = null;
  S.screen = 'welcome';
  rerender();
}

async function lockNow() {
  // Only lock once the encrypted copy is safely stored; otherwise locking would lose the setup.
  const ok = await persistNow();
  const stored = ok ? readStored() : null;
  if (!ok || !isEncrypted(stored)) {
    toast("Can't lock: this browser didn't save your encrypted setup. Use Save to file first, or locking would lose it.", { ms: 9000 });
    rerender();
    return;
  }
  dropInMemory();
  S.pendingEnvelope = stored;
  S.screen = 'lock';
  rerender();
}

// ------------------------------------------------------------------------------------------
// Files

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function saveFile() {
  // A plan opened from a handover file stays inside that encrypted file.
  if (S.ephemeral) { toast('This is a read-only copy from a handover file, so it cannot be saved separately.'); return; }
  const payload = S.keyring ? await encryptWith(S.keyring, S.profile) : { app: 'lockout-drill', encrypted: false, v: 1, savedAt: new Date().toISOString(), profile: S.profile };
  download(`lockout-drill-${localDate()}${S.keyring ? '.encrypted' : ''}.json`, JSON.stringify(payload, null, S.keyring ? 0 : 1));
  toast(S.keyring ? 'Saved an encrypted copy to your downloads.' : 'Saved to your downloads. It is not encrypted: keep it somewhere private, or set a passphrase first.', { ms: 7000 });
}

function openFile() {
  const input = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('That file is too large to be a Lockout Drill setup.');
      let data;
      try { data = JSON.parse(await readFile(file)); } catch { throw new Error("That file isn't valid JSON. Choose a file saved by Lockout Drill."); }
      const u = unwrap(data);
      if (u.envelope) openDialog({ type: 'passphrase', mode: 'file', envelope: u.envelope });
      else adoptProfile(u.profile, null);
    } catch (e) {
      toast(e.message || String(e), { ms: 7000 });
      rerender();
    }
  });
  document.body.append(input);
  input.click();
}

// The handover file: this app plus the plan, encrypted under a passphrase of its own.
async function createHandover(pass) {
  const keyring = await makeKeyring(pass);
  const now = new Date().toISOString();
  const savedHash = planFingerprint(S.profile);
  const copy = JSON.parse(JSON.stringify(S.profile));
  delete copy.sample;
  copy.handover = { note: '', contacts: '', ...(copy.handover || {}), savedAt: now, savedHash };
  const html = makeHandoverHtml(pristineHtml(), await encryptWith(keyring, copy));
  // A neutral name: the file may travel by email or a shared drive, and nothing readable should say whose it is.
  download(`handover-guide-${localDate()}.html`, html, 'text/html');
  S.dialog = null;
  stampHandover({ savedAt: now, savedHash });
  toast(`Handover file saved to your downloads. Give ${S.profile.trusted || 'them'} the passphrase separately.`, { ms: 9000 });
  rerender();
}

// Opening a file never replaces a passphrase you already use here: the opened setup is
// re-encrypted under yours. With no passphrase yet, an encrypted file's key is adopted, upgraded
// to full strength if the file used fewer KDF rounds.
async function adoptProfile(profile, fileKeyring, pass) {
  const hadProfile = !!S.profile;
  if (!S.keyring && fileKeyring) {
    S.keyring = fileKeyring.iterations >= KDF_ITERATIONS ? fileKeyring : await makeKeyring(pass);
  }
  replaceProfile(profile, { keepHistory: hadProfile });
  S.screen = 'app';
  S.dialog = null;
  toast(`Opened a setup with ${plural(profile.accounts.length, 'account')}.`, { undo: hadProfile });
  schedulePersist();
  rerender();
}

// ------------------------------------------------------------------------------------------
// Dialogs

function renderDialog() {
  const dlg = $('#dlg');
  if (!S.dialog) {
    if (dlg.open) dlg.close();
    dlg.replaceChildren();
    return;
  }
  const content = dialogContent();
  if (!content) { S.dialog = null; if (dlg.open) dlg.close(); return; }
  dlg.replaceChildren(content);
  if (!dlg.open) {
    dlg.showModal();
    const first = dlg.querySelector('[autofocus], input, select, button');
    first?.focus();
  }
}

function dialogContent() {
  const d = S.dialog;
  if (d.type === 'account') return accountDialog(d.id, closeDialog);
  if (d.type === 'templates') return templatesDialog(closeDialog, openEditor, openDialog);
  if (d.type === 'import') return importDialog(closeDialog);
  if (d.type === 'passphrase') return passphraseDialog(d);
  if (d.type === 'export') return S.profile ? exportDialog(closeDialog, createHandover) : null;
  if (d.type === 'confirm') return h('div', { class: 'dlg' },
    h('div', { class: 'dlg-h' }, h('h2', null, d.title)),
    h('div', { class: 'dlg-b' }, h('p', null, d.text)),
    h('div', { class: 'dlg-f' },
      h('button', { class: 'btn', onclick: closeDialog, autofocus: true }, 'Cancel'),
      h('button', { class: 'btn ' + (d.danger ? 'danger' : 'primary'), onclick: d.onYes }, d.yes || 'OK')));
  return null;
}

function passphraseDialog(d) {
  const file = d.mode === 'file';
  const submit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const err = f.querySelector('.err');
    const btn = f.querySelector('button[type=submit]');
    const pass = f.pass.value;
    if (file) {
      btn.disabled = true; btn.textContent = 'Opening…';
      try {
        const { profile, keyring } = await decryptEnvelope(d.envelope, pass);
        await adoptProfile(normalize(profile), keyring, pass);
      } catch (x) {
        err.textContent = x instanceof WrongPassphrase ? 'That passphrase does not open this file.' : x.message;
        btn.disabled = false; btn.textContent = 'Open';
      }
      return;
    }
    if (pass.length < 8) { err.textContent = 'Use at least 8 characters. A few random words work well.'; return; }
    if (pass !== f.again.value) { err.textContent = "The two passphrases don't match."; return; }
    btn.disabled = true; btn.textContent = 'Encrypting…';
    try {
      S.keyring = await makeKeyring(pass);
      S.dialog = null;
      const ok = await persistNow();
      toast(ok ? 'Encrypted. You will need this passphrase to open your setup.'
        : "Encrypted in this page, but this browser wouldn't store it. Use Save to file to keep a copy.", { ms: 9000 });
      rerender();
    } catch (x) {
      err.textContent = x.message;
      btn.disabled = false; btn.textContent = 'Protect';
    }
  };
  return h('form', { class: 'dlg', onsubmit: submit },
    h('div', { class: 'dlg-h' }, h('h2', null, file ? 'This file is encrypted' : d.mode === 'change' ? 'Change passphrase' : 'Protect with a passphrase'),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: closeDialog }, icon('x'))),
    h('div', { class: 'dlg-b' },
      file ? h('p', null, 'Enter the passphrase it was saved with.')
        : h('p', null, 'Your setup lists where recovery codes are kept and which number recovers which account. A passphrase encrypts it in this browser and in saved files (AES-256-GCM, PBKDF2 with ', KDF_ITERATIONS.toLocaleString(), ' rounds). There is no way to recover a forgotten passphrase.'),
      h('label', { class: 'field' }, 'Passphrase', h('input', { type: 'password', name: 'pass', autocomplete: file ? 'current-password' : 'new-password', autofocus: true, dataset: { k: 'pp:1' } })),
      file ? null : h('label', { class: 'field' }, 'Again', h('input', { type: 'password', name: 'again', autocomplete: 'new-password', dataset: { k: 'pp:2' } })),
      h('p', { class: 'err', role: 'alert' }),
    ),
    h('div', { class: 'dlg-f' },
      h('button', { class: 'btn', type: 'button', onclick: closeDialog }, 'Cancel'),
      h('button', { class: 'btn primary', type: 'submit' }, file ? 'Open' : 'Protect')),
  );
}

// ------------------------------------------------------------------------------------------
// Printable recovery plan

// What gets printed: the recovery plan (for you) or the handover guide (for the person you trust).
// Ctrl+P prints whichever fits the screen you're on.
let printKind = null;
function printNow(kind) {
  printKind = kind;
  buildPrint(kind);
  window.print();
}
function printPlan() { printNow('plan'); }
function printGuide() { printNow('guide'); }

function contextPrintKind() {
  if (S.screen === 'guide') return 'guide';
  if (S.screen !== 'app' || !S.profile) return null;
  return S.view === 'handover' ? 'guide' : 'plan';
}

function buildPrint(kind) {
  if (kind === 'guide') {
    // The recipient always prints the guide as handed over, even after exploring and editing a copy.
    const g = (S.screen === 'guide' || S.ephemeral) && S.guideProfile ? (S.guideCache || (S.guideCache = buildGuide(S.guideProfile))) : S.profile ? guide() : null;
    $('#print').replaceChildren();
    if (g) $('#print').append(guideDoc(g, { print: true }));
  } else if (kind === 'plan') buildPlan();
  else $('#print').replaceChildren();
}

function buildPlan() {
  const p = S.profile;
  if (!p) { $('#print').replaceChildren(); return; }
  const an = analysis();
  const label = id => an.graph.nodes.get(id)?.label ?? id;
  const places = p.things.filter(t => t.kind === 'place');
  const at = new Map();
  for (const t of p.things.filter(t => PHYSICAL_KINDS.has(t.kind))) {
    const k = t.at && t.at !== 'carried' ? t.at : 'carried';
    if (!at.has(k)) at.set(k, []);
    at.get(k).push(t.name);
  }
  const rows = presets().map(sc => {
    const r = scenarioResult(sc.id, sc.ctx);
    const names = s => r.rows.filter(x => x.state === s).map(x => x.name);
    return h('tr', null, h('td', null, sc.title), h('td', null, names(0).join(', ') || '—'), h('td', null, names(1).join(', ') || '—'), h('td', null, names(2).join(', ') || '—'));
  });
  const phone = presets().find(s => s.id === 'phone');
  const routes = phone ? p.accounts.filter(a => a.important).map(a => {
    const r = scenarioResult(phone.id, phone.ctx);
    const d = derivation(r.graph, r.sim, a.id, 1);
    return h('li', null, h('b', null, a.name), ': ', d?.way ? d.way.label + (d.picks?.length ? ' (' + d.picks.map(x => x.label).join(', ') + ')' : '') : 'no way back in found');
  }) : [];
  const fragile = p.accounts.filter(a => an.resilience.get(a.id) === 1);
  $('#print').replaceChildren();
  append($('#print'), [
    h('h1', null, 'Recovery plan', p.owner ? ` — ${p.owner}` : ''),
    h('p', null, `Printed ${new Date().toLocaleDateString()} from Lockout Drill. Review it whenever you change phones, numbers or passwords.`),
    h('div', { class: 'warnbox' }, 'This sheet says where your recovery materials are kept. Store it the way you would store the materials themselves, and never write codes or passwords on it.'),
    h('h2', null, 'Where things are'),
    h('ul', null, [...at.entries()].map(([k, list]) => h('li', null, h('b', null, k === 'carried' ? 'Carried every day' : (places.find(x => x.id === k)?.name || k)), ': ', list.join(', ')))),
    h('h2', null, 'Drill results'),
    h('table', null, h('thead', null, h('tr', null, h('th', null, 'Scenario'), h('th', null, 'Locked out'), h('th', null, 'Appeal only'), h('th', null, 'Takes days'))), h('tbody', null, rows)),
    routes.length ? [h('h2', null, 'If your phone is stolen: fastest way back into each important account'), h('ul', null, routes)] : null,
    fragile.length ? [h('h2', null, 'Accounts one loss away from lockout'), h('ul', null, fragile.map(a => h('li', null, a.name, ': ', (an.sets.get(a.id) || []).filter(s => s.length === 1).map(s => label(s[0])).join(', or '))))] : null,
    p.trusted ? [h('h2', null, `For ${p.trusted}`), h('p', null, 'If something happens to me, the handover guide (the Handover tab in Lockout Drill) has the steps in order. Start with the places above.')] : null,
  ]);
}

// ------------------------------------------------------------------------------------------
// Keyboard

function typing(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

document.addEventListener('keydown', (e) => {
  if (S.screen !== 'app') return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveFile(); return; }
  // Plain Ctrl/Cmd+Z only: Shift+Z is "redo" elsewhere and must not undo a second change.
  if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z' && !typing(e) && !S.dialog) { e.preventDefault(); undo(); return; }
  if (typing(e) || mod || e.altKey || S.dialog) return;
  const i = ['1', '2', '3', '4'].indexOf(e.key);
  if (i >= 0) setView(VIEWS[i]);
});

document.addEventListener('click', (e) => {
  if (S.menu && !e.target.closest('.menu-wrap')) { S.menu = false; rerender(); }
});

// ------------------------------------------------------------------------------------------
// Boot

// Another tab saved, changed the passphrase, or erased: follow it instead of overwriting it.
async function onStorage(e) {
  if (S.ephemeral) return;
  if (e.key !== STORE_KEY && e.key !== null) return;
  let data = null;
  try { data = e.newValue ? JSON.parse(e.newValue) : null; } catch { return; }
  if (!data) {
    if (S.screen === 'welcome') return;
    dropInMemory();
    S.pendingEnvelope = null; S.dialog = null; S.screen = 'welcome';
    rerender();
    toast('Your setup was erased in another tab.');
    return;
  }
  let u;
  try { u = unwrap(data); } catch { return; }
  if (u.envelope) {
    if (S.keyring && u.envelope.kdf.salt === S.keyring.salt) {
      try { S.profile = normalize(await decryptWith(S.keyring, u.envelope)); S.version++; clearCache(); S.saveState = 'saved'; rerender(); return; } catch { /* fall through to lock */ }
    }
    dropInMemory();
    S.pendingEnvelope = u.envelope; S.dialog = null; S.screen = 'lock';
    rerender();
    toast('Your setup was locked or its passphrase changed in another tab.');
    return;
  }
  S.keyring = null;
  S.profile = u.profile; S.version++; clearCache(); S.saveState = 'saved';
  if (S.screen !== 'quickstart') S.screen = 'app';
  rerender();
}

export function boot() {
  onRender(requestRender, renderChrome);
  document.addEventListener('pointerdown', () => { pointerDown = true; }, true);
  const release = () => {
    if (!pointerDown) return;
    pointerDown = false;
    // The click for this press is dispatched before this timer runs.
    if (renderPending) setTimeout(() => { if (renderPending) render(); }, 0);
  };
  document.addEventListener('pointerup', release, true);
  document.addEventListener('pointercancel', release, true);
  // Native pop-ups (select menus) can swallow the pointerup: never stay stale for long.
  setInterval(() => { if (renderPending && pointerDown) { pointerDown = false; render(); } }, 700);
  window.addEventListener('storage', onStorage);
  window.addEventListener('afterprint', () => $('#print').replaceChildren());
  window.addEventListener('beforeunload', (e) => {
    if (S.profile && !S.profile.sample && (S.saveState === 'unsaved' || S.saveState === 'error')) { e.preventDefault(); e.returnValue = ''; }
  });
  const dlg = $('#dlg');
  dlg.addEventListener('close', () => { if (S.dialog) { S.dialog = null; rerender(); } });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) closeDialog(); });
  window.addEventListener('beforeprint', () => { buildPrint(printKind || contextPrintKind()); });
  window.addEventListener('afterprint', () => { printKind = null; });
  if (EMBEDDED) {
    // A handover file: never read or write this browser's saved setup.
    S.ephemeral = true;
    S.handoverEnv = isEncrypted(EMBEDDED) ? EMBEDDED : null;
    S.screen = 'guidelock';
    render();
    return;
  }
  startApp();
}

function startApp() {
  const prefs = readPrefs();
  S.view = VIEWS.includes(prefs.view) ? prefs.view : 'plan';
  const stored = readStored();
  if (!stored) {
    S.screen = 'welcome';
  } else {
    try {
      const u = unwrap(stored);
      if (u.envelope) { S.pendingEnvelope = u.envelope; S.screen = 'lock'; }
      else { S.profile = u.profile; S.screen = 'app'; }
    } catch {
      S.screen = 'welcome';
      toast('Your saved setup could not be read, so we started fresh. Open a saved file if you have one.', { ms: 9000 });
    }
  }
  render();
}
