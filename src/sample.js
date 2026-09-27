// A realistic demo setup with the classic traps: the password manager's second factor lives on
// the phone, the Gmail password lives in the password manager, backup codes sit in a desk
// drawer, and nobody else knows the master password.

import { TEMPLATE_BY_ID, accountFromTemplate, inferVia } from './templates.js';

// Build an account from a template, switching on the listed ways and filling their steps.
// `fills` maps way key -> array (one per step) of arrays of item ids.
export function accountFrom(templateId, id, fills, items, overrides = {}) {
  const a = accountFromTemplate(TEMPLATE_BY_ID.get(templateId), id, overrides);
  const byId = new Map(items.map(x => [x.id, x]));
  for (const w of a.ways) {
    const f = fills[w.key];
    if (f === undefined) { w.enabled = false; continue; }
    w.enabled = true;
    w.steps.forEach((s, i) => {
      for (const ref of f[i] || []) {
        const via = inferVia(s.types, byId.get(ref));
        if (via) s.anyOf.push({ ref, via });
      }
    });
  }
  return a;
}

export function sampleProfile() {
  const T = (id, kind, name, extra = {}) => ({ id, kind, name, ...extra });
  const things = [
    T('home', 'place', 'Home', { home: true }),
    T('drawer', 'place', 'Desk drawer', { inside: 'home', note: 'Left side of the desk in the study. The key hangs inside the pantry door.' }),
    T('iphone', 'phone', 'iPhone', { at: 'carried', unlock: 'pin' }),
    T('macbook', 'computer', 'MacBook', { at: 'home', unlock: 'macpw' }),
    T('yubikey', 'seckey', 'YubiKey (on keychain)', { at: 'carried' }),
    T('license', 'photoid', "Driver's license", { at: 'carried' }),
    T('codes', 'paper', 'Printed Google backup codes', { at: 'drawer', note: 'In the blue folder at the back.' }),
    T('pin', 'secret', 'iPhone passcode', { shared: true }),
    T('macpw', 'secret', 'MacBook password'),
    T('bwpw', 'secret', 'Bitwarden master password'),
    T('num', 'number', '+1 555-0142', { sim: 'iphone', carrier: 'verizon' }),
    T('gauth', 'authapp', 'Google Authenticator', { devices: ['iphone'], backup: 'google' }),
    T('sam', 'person', 'Sam (partner)'),
  ];

  // Stubs so step types can be inferred for account references before the accounts exist.
  const stub = (id, category) => ({ id, category, ways: [] });
  const items = [...things, stub('google', 'platform'), stub('bitwarden', 'password_manager'), stub('apple', 'platform'), stub('verizon', 'carrier')];
  const A = (tpl, id, fills, o) => accountFrom(tpl, id, fills, items, o);

  const accounts = [
    A('google', 'google', {
      pw2sv: [['bitwarden'], ['iphone', 'gauth', 'num', 'codes']],
      session: [['macbook']],
      rinfo: [['num']],
      appeal: [],
    }, { name: 'Google (Gmail)' }),
    A('bitwarden', 'bitwarden', {
      mp2fa: [['bwpw'], ['gauth']],
      unlocked: [['macbook', 'iphone'], ['bwpw']],
    }),
    A('apple', 'apple', {
      pwcode: [['bitwarden'], ['iphone', 'macbook', 'num']],
      devreset: [['iphone', 'macbook']],
      recovery: [],
    }),
    A('carrier', 'verizon', {
      pwsms: [['bitwarden'], ['num']],
      store: [['license']],
    }, { name: 'Verizon (carrier)', important: false }),
    A('bank', 'bank', {
      pwcode: [['bitwarden'], ['num']],
      phone: [],
      estate: [['sam']],
    }, { name: 'Chase (bank)' }),
    A('coinbase', 'coinbase', {
      pw2sv: [['bitwarden'], ['gauth'], ['google']],
      idv: [['bitwarden'], ['license']],
    }),
    A('github', 'github', {
      pw2fa: [['bitwarden'], ['yubikey', 'gauth']],
    }, { important: false }),
    A('email-reset', 'rest', {
      pw: [['bitwarden']],
      reset: [['google']],
    }, { name: 'Everything that resets by Gmail', count: 38, important: false }),
  ];

  // What Alex wants done, for the handover guide.
  const wishes = {
    google: ['save', 'Download the photos first (Google Takeout), then close it.'],
    bitwarden: ['keep', 'Every other password is in here. Keep it until everything below is sorted.'],
    apple: ['save', 'The family photo library is in iCloud Photos.'],
    verizon: ['keep', 'Keep my number active until the other accounts no longer send codes to it.'],
    bank: ['money', 'Checking and savings. Sam is the payable-on-death beneficiary on savings.'],
    coinbase: ['money', 'A small amount of bitcoin. Use their Executor Services form.'],
    github: ['close', ''],
    rest: ['close', 'Shopping, streaming and old forums. Cancel anything that bills monthly.'],
  };
  for (const a of accounts) {
    const [wish, note] = wishes[a.id] || [];
    if (wish) a.wish = wish;
    if (note) a.note = note;
  }
  const handover = {
    note: 'Sam, start with the desk drawer at home. Most things run through my Bitwarden vault, so get into that first.',
    contacts: 'Estate lawyer: Dana Reyes. My will is with her.',
  };

  return { app: 'lockout-drill', schema: 1, owner: 'Alex', trusted: 'Sam', sample: true, things, accounts, handover };
}
