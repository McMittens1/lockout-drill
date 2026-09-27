// Regression tests for defects found in the independent review (research/review_condensed.txt).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, simulate, runScenario, scenarioPresets, analyze, LOCKED, APPEAL, SLOW, OK } from '../src/engine.js';
import { TEMPLATE_BY_ID, accountFromTemplate } from '../src/templates.js';
import { accountFrom, sampleProfile } from '../src/sample.js';
import { buildFromAnswers, QS_DEFAULT } from '../src/quickstart.js';
import { verifiedFixes, candidateFixes } from '../src/advice.js';
import { normalize } from '../src/store.js';

const stateOf = (p, ctx, id) => simulate(compile(p), ctx).state.get(id);
const person = (id, name = id) => ({ id, kind: 'person', name });

test('loops are only reported through steps that actually hold the account down', () => {
  const p = sampleProfile();
  const memory = scenarioPresets(p).find(s => s.id === 'memory').ctx;
  const row = runScenario(p, memory).rows.find(r => r.id === 'bitwarden');
  assert.equal(row.state, LOCKED);
  // Bitwarden is locked by the forgotten master password alone; Google and the authenticator are reachable.
  assert.ok(!row.cycles.some(c => c.includes('google')), JSON.stringify(row.cycles));
});

test('a nested place the heir may not enter stays out of reach in the heir drill', () => {
  const p = {
    things: [
      { id: 'home', kind: 'place', name: 'Home', home: true },
      { id: 'safe', kind: 'place', name: 'Locked safe', inside: 'home', heirCan: false },
      { id: 'kit', kind: 'paper', name: 'Kit', at: 'safe' },
    ],
    accounts: [{ id: 'a', name: 'A', ways: [{ id: 'w', label: 'w', kind: 'signin', speed: 'instant', enabled: true, steps: [{ label: 's', types: ['backup_codes'], anyOf: [{ ref: 'kit', via: 'backup_codes' }] }] }] }],
  };
  assert.equal(stateOf(p, {}, 'a'), OK);
  assert.equal(stateOf(p, { perspective: 'heir' }, 'a'), LOCKED);
});

test('a fireproof safe survives the fire even when it sits in a room of the home', () => {
  const p = {
    things: [
      { id: 'home', kind: 'place', name: 'Home', home: true },
      { id: 'office', kind: 'place', name: 'Office', inside: 'home' },
      { id: 'safe', kind: 'place', name: 'Fireproof safe', inside: 'office', fireproof: true },
      { id: 'codes', kind: 'paper', name: 'Codes', at: 'safe' },
    ],
    accounts: [{ id: 'a', name: 'A', ways: [{ id: 'w', label: 'w', kind: 'signin', speed: 'instant', enabled: true, steps: [{ label: 's', types: ['backup_codes'], anyOf: [{ ref: 'codes', via: 'backup_codes' }] }] }] }],
  };
  const fire = scenarioPresets(p).find(s => s.id === 'fire').ctx;
  assert.equal(stateOf(p, fire, 'a'), SLOW);
  assert.equal(stateOf(p, { lost: ['home', 'office'] }, 'a'), SLOW, 'monotone: losing more does not change it');
});

const items = (...xs) => xs;
const th = (id, kind, extra = {}) => ({ id, kind, name: id, ...extra });

test('Apple Account Recovery switches off once a recovery key or security keys are set up', () => {
  const things = [th('iphone', 'phone', { at: 'carried' }), th('num', 'number', { sim: 'iphone' }), th('rk', 'paper', { at: 'carried' }), th('k1', 'seckey', { at: 'carried' }), th('pw', 'secret')];
  const base = { pwcode: [['pw'], ['iphone', 'num']], recovery: [] };
  const withKey = { things, accounts: [accountFrom('apple', 'apple', { ...base, rkey: [['rk'], ['num']] }, things)] };
  const plain = { things, accounts: [accountFrom('apple', 'apple', base, things)] };
  const lost = { lost: ['iphone', 'rk', 'pw'] };
  assert.equal(stateOf(plain, lost, 'apple'), SLOW, 'Account Recovery available');
  assert.equal(stateOf(withKey, lost, 'apple'), LOCKED, 'a recovery key replaces Account Recovery');
  const withSecKey = { things, accounts: [accountFrom('apple', 'apple', { pwcode: [['pw'], ['k1']], recovery: [] }, things)] };
  assert.equal(stateOf(withSecKey, { lost: ['k1', 'pw'] }, 'apple'), LOCKED, 'security keys replace Account Recovery');
});

test('Microsoft recovery form is not a way back once two-step verification is on', () => {
  const things = [th('pw', 'secret'), th('app', 'authapp', { devices: [] })];
  const twoStep = { things, accounts: [accountFrom('microsoft', 'ms', { pw2sv: [['pw'], ['app']], appeal: [] }, things)] };
  assert.equal(stateOf(twoStep, { lost: ['app'] }, 'ms'), LOCKED);
  const noTwoStep = { things, accounts: [accountFrom('microsoft', 'ms', { passwordless: [[]], appeal: [] }, things)] };
  assert.equal(stateOf({ ...noTwoStep, accounts: [{ ...noTwoStep.accounts[0], ways: noTwoStep.accounts[0].ways.map(w => w.key === 'passwordless' ? { ...w, enabled: false } : w) }] }, {}, 'ms'), APPEAL);
});

test('Coinbase trusted-contact recovery needs two different people', () => {
  const things = [th('pw', 'secret'), person('sam'), person('jo')];
  const one = { things, accounts: [accountFrom('coinbase', 'cb', { contacts: [['sam'], [], ['pw']] }, things)] };
  const two = { things, accounts: [accountFrom('coinbase', 'cb', { contacts: [['sam'], ['jo'], ['pw']] }, things)] };
  assert.equal(stateOf(one, {}, 'cb'), LOCKED);
  assert.equal(stateOf(two, {}, 'cb'), OK);
  assert.equal(stateOf(two, { lost: ['jo'] }, 'cb'), LOCKED);
});

test('registrar backup codes replace the second factor, not the password', () => {
  const things = [th('pw', 'secret'), th('codes', 'paper', { at: 'carried' })];
  const p = { things, accounts: [accountFrom('registrar', 'reg', { bcodes: [['pw'], ['codes']] }, things)] };
  assert.equal(stateOf(p, {}, 'reg'), OK);
  assert.equal(stateOf(p, { lost: ['pw'] }, 'reg'), LOCKED);
});

test('1Password recovery code does not bypass two-factor when it is on', () => {
  const things = [th('pw', 'secret'), th('kit', 'paper', { at: 'carried' }), th('phone', 'phone', { at: 'carried' }), th('app', 'authapp', { devices: ['phone'] }), th('rc', 'paper', { at: 'carried' }), th('mail', 'secret')];
  const stubs = [{ id: 'gmail', category: 'email', ways: [] }];
  const gmail = { id: 'gmail', name: 'Gmail', category: 'email', ways: [{ id: 'w', label: 'w', kind: 'signin', speed: 'instant', enabled: true, steps: [{ label: 'p', types: ['password'], anyOf: [{ ref: 'mail', via: 'password' }] }] }] };
  const op = accountFrom('onepassword', 'op', { pwkey2fa: [['pw'], ['kit'], ['app']], rcode2fa: [['rc'], ['gmail'], ['app']] }, [...things, ...stubs]);
  const p = { things, accounts: [op, gmail] };
  assert.equal(stateOf(p, { lost: ['phone'] }, 'op'), LOCKED);
});

test('Login.gov personal key is not a substitute for MFA', () => {
  const t = TEMPLATE_BY_ID.get('logingov');
  assert.ok(t, 'Login.gov has its own template');
  assert.ok(!t.ways.some(w => w.kind !== 'legacy' && w.speed === 'instant' && w.steps.some(s => s.types.includes('recovery_key'))));
  assert.ok(TEMPLATE_BY_ID.get('idme'), 'ID.me has its own template');
});

test('quick start: only Apple hardware counts as an Apple trusted device', () => {
  const android = buildFromAnswers({ ...QS_DEFAULT, phone: 'Android phone', email: 'apple', computer: 'no' });
  const icloud = android.accounts.find(a => a.id === 'email');
  const refs = icloud.ways.filter(w => w.enabled).flatMap(w => w.steps.flatMap(s => s.anyOf.filter(o => ['trusted_device'].includes(o.via)).map(o => o.ref)));
  assert.deepEqual(refs, [], 'an Android phone is not an Apple trusted device');
  const windowsLaptop = buildFromAnswers({ ...QS_DEFAULT, computer: 'yes', computerKind: 'windows' });
  const apple = windowsLaptop.accounts.find(a => a.id === 'apple');
  assert.ok(!JSON.stringify(apple.ways.filter(w => w.enabled)).includes('"computer"'), 'a Windows laptop cannot reset an Apple Account');
  const mac = buildFromAnswers({ ...QS_DEFAULT, computer: 'yes', computerKind: 'mac' });
  assert.ok(JSON.stringify(mac.accounts.find(a => a.id === 'apple').ways.filter(w => w.enabled)).includes('"computer"'), 'a Mac can');
});

test('quick start: Apple Passwords is its own end-to-end encrypted keychain', () => {
  const p = buildFromAnswers({ ...QS_DEFAULT, pm: 'apple', computer: 'no' });
  const pm = p.accounts.find(a => a.id === 'pm');
  assert.equal(pm.template, 'applepw');
  assert.equal(stateOf(p, {}, 'pm'), OK);
  // Forgetting the iPhone passcode loses the unlocked device and the keychain escrow: getting the
  // Apple Account back is not enough.
  assert.equal(stateOf(p, { lost: ['pin'] }, 'pm'), LOCKED);
});

test('quick start: "Other email" recovery with 2FA on needs a second proof', () => {
  const p = buildFromAnswers({ ...QS_DEFAULT, email: 'email' });
  const rinfo = p.accounts.find(a => a.id === 'email').ways.find(w => w.key === 'rinfo2fa');
  assert.ok(rinfo.enabled && rinfo.steps.length === 2 && rinfo.steps.every(s => s.anyOf.length));
});

test('authenticator fixes only suggest devices the app runs on', () => {
  const things = [th('phone', 'phone', { at: 'carried' }), th('laptop', 'computer', { at: 'carried' }), th('aegis', 'authapp', { devices: ['phone'] }), th('pw', 'secret')];
  const p = { things, accounts: [{ id: 'gh', name: 'GitHub', template: 'github', category: 'developer', ways: [{ id: 'w', key: 'pw2fa', label: 'w', kind: 'signin', speed: 'instant', enabled: true, steps: [{ label: 'p', types: ['password'], anyOf: [{ ref: 'pw', via: 'password' }] }, { label: '2', types: ['totp'], anyOf: [{ ref: 'aegis', via: 'totp' }] }] }] }] };
  things[2].name = 'Aegis';
  const titles = candidateFixes(p, 'gh', { lost: ['phone'] }).map(f => f.title);
  assert.ok(!titles.some(t => /Aegis on laptop/i.test(t)), titles.join(' | '));
});

test('switching on a recovery route also completes its other steps (or the fix is dropped)', () => {
  const p = sampleProfile();
  p.things.find(t => t.id === 'gauth').backup = undefined;
  const ctx = { lost: ['yubikey', 'iphone'] };
  assert.equal(stateOf(p, ctx, 'github'), LOCKED);
  const fixes = verifiedFixes(p, 'github', ctx, 10);
  assert.ok(fixes.some(f => /backup codes/.test(f.title)), fixes.map(f => f.title).join(' | '));
});

test('normalize keeps custom ways and route guards, and rejects inherited property names', () => {
  const p = normalize({
    things: [{ id: 'x', kind: 'constructor', name: 'bad' }, { id: 'y', kind: 'phone', name: 'ok' }],
    accounts: [{ id: 'a', name: 'A', category: 'toString', ways: [
      { id: 'c', label: 'Mine', custom: true, kind: '__proto__', speed: 'constructor', steps: [{ types: ['constructor', 'sms'], anyOf: [{ ref: 'y', via: 'hasOwnProperty' }] }] },
      { id: 'r', label: 'Recovery', unlessWay: ['rkey'], unlessVia: ['security_key', 'valueOf'], steps: [] },
    ] }],
  });
  assert.deepEqual(p.things.map(t => t.id), ['y']);
  const [c, r] = p.accounts[0].ways;
  assert.equal(p.accounts[0].category, 'other');
  assert.equal(c.custom, true);
  assert.equal(c.kind, 'signin');
  assert.equal(c.speed, 'instant');
  assert.deepEqual(c.steps[0].types, ['sms']);
  assert.equal(c.steps[0].anyOf[0].via, 'any');
  assert.deepEqual(r.unlessWay, ['rkey']);
  assert.deepEqual(r.unlessVia, ['security_key']);
});

test('analysis still finds loop triggers, within one shared budget', () => {
  const an = analyze(sampleProfile());
  const loop = an.cycles.find(c => ['google', 'gauth'].every(id => c.members.includes(id)));
  assert.ok(loop && loop.triggers.length >= 1);
});
