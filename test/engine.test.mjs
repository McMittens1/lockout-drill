import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compile, simulate, runScenario, analyze, scenarioPresets, derivation, blockers, rootCauses,
  findCycles, minimalLockouts, stuckLoop, LOCKED, APPEAL, SLOW, OK,
} from '../src/engine.js';
import { sampleProfile } from '../src/sample.js';

const pick = (ref, via = 'any') => ({ ref, via });
const way = (id, steps, extra = {}) => ({ id, label: id, kind: 'signin', speed: 'instant', enabled: true, steps, ...extra });
const step = (...refs) => ({ label: 's', types: [], anyOf: refs.map(r => (typeof r === 'string' ? pick(r) : r)) });
const acct = (id, ways, extra = {}) => ({ id, name: id, ways, ...extra });
const state = (profile, ctx, id) => simulate(compile(profile), ctx).state.get(id);

test('a thing kept at a place is lost with the place', () => {
  const p = {
    things: [{ id: 'home', kind: 'place', name: 'Home', home: true }, { id: 'codes', kind: 'paper', name: 'Codes', at: 'home' }],
    accounts: [acct('a', [way('w', [step(pick('codes', 'backup_codes'))])])],
  };
  assert.equal(state(p, {}, 'a'), OK);
  assert.equal(state(p, { lost: ['home'] }, 'a'), LOCKED);
  assert.equal(state(p, { lost: ['codes'] }, 'a'), LOCKED);
});

test('circular dependencies do not justify themselves (least fixed point)', () => {
  const p = {
    things: [{ id: 'phone', kind: 'phone', name: 'Phone', at: 'carried' }],
    accounts: [
      acct('mail', [way('pw', [step('vault')]), way('session', [step(pick('phone', 'session'))])]),
      acct('vault', [way('code', [step(pick('mail', 'email_code'))])]),
    ],
  };
  assert.equal(state(p, {}, 'mail'), OK);
  assert.equal(state(p, {}, 'vault'), OK);
  const sim = simulate(compile(p), { lost: ['phone'] });
  assert.equal(sim.state.get('mail'), LOCKED);
  assert.equal(sim.state.get('vault'), LOCKED);
  const g = compile(p);
  const rc = rootCauses(g, sim, 'vault');
  assert.deepEqual(rc.causes.map(c => c.id), ['phone']);
  assert.ok(rc.cycles.some(c => c.includes('mail') && c.includes('vault')), 'cycle reported');
  const loops = findCycles(g);
  assert.equal(loops.length, 1);
  assert.deepEqual(new Set(loops[0].members), new Set(['mail', 'vault']));
});

test('speed caps: slow and appeal ways cap the result, steps take the minimum', () => {
  const p = {
    things: [{ id: 'id', kind: 'photoid', name: 'ID', at: 'carried' }],
    accounts: [
      acct('s', [way('w', [step('id')], { speed: 'slow' })]),
      acct('ap', [way('w', [], { speed: 'appeal' })]),
      acct('chain', [way('w', [step('s'), step('id')])]),
      acct('best', [way('a', [step('ap')]), way('b', [step('s')])]),
    ],
  };
  const sim = simulate(compile(p), {});
  assert.equal(sim.state.get('s'), SLOW);
  assert.equal(sim.state.get('ap'), APPEAL);
  assert.equal(sim.state.get('chain'), SLOW);
  assert.equal(sim.state.get('best'), SLOW);
});

test('fireproof safe survives the fire but is slow to reach; plain drawer does not', () => {
  const p = {
    things: [
      { id: 'home', kind: 'place', name: 'Home', home: true },
      { id: 'safe', kind: 'place', name: 'Safe', inside: 'home', fireproof: true },
      { id: 'drawer', kind: 'place', name: 'Drawer', inside: 'home' },
      { id: 'kit', kind: 'paper', name: 'Kit', at: 'safe' },
      { id: 'note', kind: 'paper', name: 'Note', at: 'drawer' },
    ],
    accounts: [acct('a', [way('w', [step('kit')])]), acct('b', [way('w', [step('note')])])],
  };
  const sim = simulate(compile(p), { lost: ['home'] });
  assert.equal(sim.state.get('a'), SLOW);
  assert.equal(sim.state.get('b'), LOCKED);
  const presets = scenarioPresets(p);
  const fire = presets.find(s => s.id === 'fire');
  assert.ok(fire, 'fire preset offered when a home exists');
  assert.equal(simulate(compile(p), fire.ctx).state.get('a'), SLOW);
});

test('away makes places slow; abroad also disables in-person ways', () => {
  const p = {
    things: [
      { id: 'home', kind: 'place', name: 'Home', home: true },
      { id: 'laptop', kind: 'computer', name: 'Laptop', at: 'home' },
    ],
    accounts: [
      acct('a', [way('w', [step(pick('laptop', 'session'))])]),
      acct('store', [way('w', [], { speed: 'slow', inPerson: true })]),
    ],
  };
  assert.equal(state(p, { away: true }, 'a'), SLOW);
  assert.equal(state(p, { away: true }, 'store'), SLOW);
  assert.equal(state(p, { abroad: true }, 'store'), LOCKED);
});

test('heir perspective: only shared secrets, who=me ways off, who=heir ways on', () => {
  const p = {
    things: [
      { id: 'pw', kind: 'secret', name: 'Master password' },
      { id: 'pin', kind: 'secret', name: 'PIN', shared: true },
      { id: 'sam', kind: 'person', name: 'Sam' },
      { id: 'home', kind: 'place', name: 'Home', home: true },
      { id: 'bank', kind: 'place', name: 'Bank box', heirCan: false },
      { id: 'kit', kind: 'paper', name: 'Kit', at: 'bank' },
    ],
    accounts: [
      acct('vault', [way('w', [step('pw')])]),
      acct('phone', [way('w', [step('pin')])]),
      acct('support', [way('w', [], { speed: 'appeal', who: 'me' })]),
      acct('legacy', [way('w', [step('sam')], { speed: 'slow', who: 'heir' })]),
      acct('boxed', [way('w', [step('kit')])]),
    ],
  };
  const me = simulate(compile(p), {});
  assert.equal(me.state.get('legacy'), LOCKED);
  assert.equal(me.state.get('support'), APPEAL);
  const heir = simulate(compile(p), { perspective: 'heir' });
  assert.equal(heir.state.get('vault'), LOCKED);
  assert.equal(heir.state.get('phone'), OK);
  assert.equal(heir.state.get('support'), LOCKED);
  assert.equal(heir.state.get('legacy'), SLOW);
  assert.equal(heir.state.get('boxed'), LOCKED);
  // Writing the password down somewhere the heir can reach fixes it.
  p.things.push({ id: 'note', kind: 'paper', name: 'Sealed note', at: 'home' });
  p.things[0].writtenOn = ['note'];
  assert.equal(simulate(compile(p), { perspective: 'heir' }).state.get('vault'), OK);
});

test('SIM needs only the hardware; prompts need an unlocked device', () => {
  const p = {
    things: [
      { id: 'pin', kind: 'secret', name: 'PIN' },
      { id: 'phone', kind: 'phone', name: 'Phone', at: 'carried', unlock: 'pin' },
      { id: 'num', kind: 'number', name: '+1', sim: 'phone' },
    ],
    accounts: [
      acct('sms', [way('w', [step(pick('num', 'sms'))])]),
      acct('push', [way('w', [step(pick('phone', 'push'))])]),
    ],
  };
  const sim = simulate(compile(p), { lost: ['pin'] });
  assert.equal(sim.state.get('sms'), OK);
  assert.equal(sim.state.get('push'), LOCKED);
});

test('number: SIM swap leaves the slow carrier-store path; abroad removes it', () => {
  const p = {
    things: [
      { id: 'phone', kind: 'phone', name: 'Phone', at: 'carried' },
      { id: 'id', kind: 'photoid', name: 'ID', at: 'carried' },
      { id: 'num', kind: 'number', name: '+1', sim: 'phone' },
    ],
    accounts: [acct('bank', [way('w', [step(pick('num', 'sms'))])])],
  };
  assert.equal(state(p, { lost: ['num'] }, 'bank'), SLOW);
  assert.equal(state(p, { lost: ['phone'] }, 'bank'), SLOW);
  assert.equal(state(p, { lost: ['phone'], abroad: true }, 'bank'), LOCKED);
  assert.equal(state(p, { lost: ['phone', 'id'] }, 'bank'), LOCKED);
});

test('authenticator app restores from its cloud backup when the device is lost', () => {
  const p = {
    things: [
      { id: 'phone', kind: 'phone', name: 'Phone', at: 'carried' },
      { id: 'laptop', kind: 'computer', name: 'Laptop', at: 'carried' },
      { id: 'app', kind: 'authapp', name: 'Authenticator', devices: ['phone'], backup: 'cloud' },
    ],
    accounts: [
      acct('cloud', [way('w', [step(pick('laptop', 'session'))])]),
      acct('x', [way('w', [step(pick('app', 'totp'))])]),
    ],
  };
  assert.equal(state(p, { lost: ['phone'] }, 'x'), OK);
  assert.equal(state(p, { lost: ['phone', 'laptop'] }, 'x'), LOCKED);
  assert.equal(state(p, { lost: ['app'] }, 'x'), OK, 'wiped app data restores from backup');
});

test('a hijacked account keeps only support appeals', () => {
  const p = {
    things: [{ id: 'k', kind: 'seckey', name: 'Key', at: 'carried' }],
    accounts: [acct('a', [way('w', [step('k')]), way('appeal', [], { speed: 'appeal', kind: 'recovery' })])],
  };
  assert.equal(state(p, {}, 'a'), OK);
  assert.equal(state(p, { lost: ['a'] }, 'a'), APPEAL);
});

test('disabled ways, empty steps and dangling references are ignored safely', () => {
  const p = {
    things: [{ id: 'k', kind: 'seckey', name: 'Key', at: 'carried' }],
    accounts: [
      acct('a', [
        way('off', [step('k')], { enabled: false }),
        way('empty', [{ label: 'x', types: [], anyOf: [] }]),
        way('dangling', [step('nope')]),
      ]),
      acct('b', [way('w', [step('k'), step('ghost', 'k')])]),
    ],
  };
  const sim = simulate(compile(p), {});
  assert.equal(sim.state.get('a'), LOCKED);
  assert.equal(sim.state.get('b'), OK);
  assert.doesNotThrow(() => simulate(compile({}), {}));
  assert.doesNotThrow(() => analyze({ things: [], accounts: [] }));
  assert.doesNotThrow(() => compile({ things: [{ id: 'x', kind: 'weird' }], accounts: [{ id: 'y' }] }));
});

test('derivation is well-founded and names the way used', () => {
  const p = sampleProfile();
  const g = compile(p);
  const sim = simulate(g, { lost: ['iphone'] });
  const d = derivation(g, sim, 'bitwarden');
  assert.ok(d && d.way, 'has a way');
  const visit = (n, seen = new Set()) => {
    if (!n) return;
    assert.ok(!seen.has(n.id), 'no node repeats along a derivation path: ' + n.id);
    const next = new Set(seen).add(n.id);
    for (const p of n.picks || []) visit(p.sub, next);
  };
  visit(d);
});

test('blockers explain every applicable way and flag lost things', () => {
  const p = sampleProfile();
  const g = compile(p);
  const sim = simulate(g, { lost: ['bwpw'] });
  const b = blockers(g, sim, 'coinbase');
  assert.equal(b.state, LOCKED, 'Coinbase recovery also needs the password, which lives in Bitwarden');
  const pw = b.ways.find(w => w.id === 'pw2sv');
  assert.ok(pw.failing.length >= 1);
  assert.ok(b.ways.find(w => w.id === 'idv').failing.some(f => f.step === 'Password'));
  const rc = rootCauses(g, sim, 'coinbase');
  assert.ok(rc.causes.some(c => c.id === 'bwpw' && c.reason === 'forgotten'));
});

test('sample profile: the drill finds the expected weak spots', () => {
  const p = sampleProfile();
  const today = runScenario(p, {});
  assert.ok(today.rows.every(r => r.state === OK), 'everything works on a normal day');

  const heir = runScenario(p, { perspective: 'heir' });
  assert.equal(heir.rows.find(r => r.id === 'bitwarden').state, LOCKED);
  assert.equal(heir.rows.find(r => r.id === 'apple').state, OK, 'shared iPhone passcode resets the Apple Account');
  assert.equal(heir.rows.find(r => r.id === 'bank').state, SLOW, 'estate process');

  const travel = runScenario(p, scenarioPresets(p).find(s => s.id === 'travel').ctx);
  assert.equal(travel.rows.find(r => r.id === 'verizon').state, LOCKED, 'no store abroad, sign-in codes go to the lost number');
  assert.equal(travel.rows.find(r => r.id === 'bank').state, SLOW, 'phone support still works from abroad');
  assert.equal(travel.rows.find(r => r.id === 'google').state, SLOW);

  const an = analyze(p);
  assert.equal(an.resilience.get('bitwarden'), 1);
  assert.equal(an.resilience.get('coinbase'), 1);
  assert.ok(an.resilience.get('google') >= 3);
  assert.equal(an.blast[0].id, 'bwpw');
  const loop = an.cycles.find(c => ['google', 'bitwarden', 'gauth'].every(id => c.members.includes(id)));
  assert.ok(loop, 'Google -> Bitwarden -> Authenticator loop found');
  assert.ok(loop.triggers.length >= 1 && loop.triggers[0].length <= 3, 'and what makes it bite');
});

test('stuckLoop reports the shortest failing loop through an account', () => {
  const p = sampleProfile();
  const travel = runScenario(p, scenarioPresets(p).find(s => s.id === 'travel').ctx);
  const verizon = travel.rows.find(r => r.id === 'verizon');
  assert.deepEqual(verizon.cycles[0], ['verizon', 'num', 'verizon'], 'carrier code goes to the number; the number needs the carrier');
  const today = runScenario(p, {});
  assert.ok(today.rows.every(r => !r.cycles.length), 'no loops reported when nothing is stuck');
  const g = compile(p);
  assert.equal(stuckLoop(g, simulate(g, {}), 'google'), null);
});

test('minimalLockouts finds the smallest combination', () => {
  const p = {
    things: [
      { id: 'a', kind: 'seckey', name: 'A', at: 'carried' },
      { id: 'b', kind: 'seckey', name: 'B', at: 'carried' },
      { id: 'c', kind: 'seckey', name: 'C', at: 'carried' },
    ],
    accounts: [acct('x', [way('w', [step('a', 'b')])])],
  };
  const g = compile(p);
  assert.deepEqual(minimalLockouts(g, ['a', 'b', 'c'], ['x']), [['a', 'b']]);
});

test('analysis stays fast on a large profile', () => {
  const things = [{ id: 'home', kind: 'place', name: 'Home', home: true }];
  for (let i = 0; i < 25; i++) things.push({ id: 'k' + i, kind: i % 2 ? 'seckey' : 'paper', name: 'Item ' + i, at: i % 3 ? 'carried' : 'home' });
  const accounts = [];
  for (let i = 0; i < 200; i++) {
    accounts.push(acct('a' + i, [
      way('w1', [step('k' + (i % 25)), step('a' + ((i + 1) % 200), 'k' + ((i * 7) % 25))]),
      way('w2', [step('k' + ((i + 3) % 25))], { speed: 'slow' }),
    ]));
  }
  const t0 = performance.now();
  const an = analyze({ things, accounts });
  const ms = performance.now() - t0;
  assert.ok(an.resilience.size === 200);
  assert.ok(ms < 6000, `analysis took ${ms.toFixed(0)} ms`); // ~0.7 s locally; headroom for slow CI machines
});
