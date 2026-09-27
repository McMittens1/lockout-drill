// The handover guide: ordering, what to gather, what can't be reached, readiness, the handover
// file's embedded data, and the plan fields that feed them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGuide, readiness, makeHandoverHtml, readHandover, placePath, daysSince, ago, planFingerprint, handoverFresh, STALE_DAYS, HANDOVER_ID } from '../src/guide.js';
import { LEGACY_BY_TEMPLATE, WISHES } from '../src/templates.js';
import { normalize, S, commit, undo, stampHandover } from '../src/store.js';
import { sampleProfile } from '../src/sample.js';

// The sample with the one missing piece fixed: the master password written on a sealed sheet at home.
function fixedSample() {
  const p = sampleProfile();
  p.things.push({ id: 'kit', kind: 'paper', name: 'Sealed emergency sheet', at: 'drawer' });
  p.things.find(t => t.id === 'bwpw').writtenOn = ['kit'];
  return p;
}

test('the guide for the sample shows the trap: the master password was never shared', () => {
  const g = buildGuide(sampleProfile());
  assert.equal(g.tally.total, g.tally.now + g.tally.days + g.tally.appeal + g.tally.none);
  const bw = g.blocked.find(b => b.id === 'bitwarden');
  assert.ok(bw, 'Bitwarden is blocked');
  assert.ok(bw.reasons.some(r => /master password/i.test(r.label) && /never shared/.test(r.reason)));
  // The bank still works through its estate process, and says so.
  const bank = g.steps.find(s => s.id === 'bank');
  assert.ok(bank);
  assert.equal(bank.state, 2);
  assert.equal(bank.wish, 'money');
  assert.equal(bank.legacy, LEGACY_BY_TEMPLATE.bank);
});

test('steps come after the steps they rely on, and "opens" mirrors "uses"', () => {
  const g = buildGuide(fixedSample());
  assert.equal(g.tally.none, 0);
  assert.equal(g.steps.length, 8);
  for (const s of g.steps) {
    for (const pk of s.picks) if (pk.step) assert.ok(pk.step < s.n, `${s.name} uses step ${pk.step}, which comes later`);
    for (const o of s.opens) {
      const later = g.steps.find(x => x.n === o.step);
      assert.ok(later.picks.some(pk => pk.step === s.n), `${later.name} should use step ${s.n}`);
    }
  }
  assert.equal(g.steps[0].id, 'bitwarden');
  const coinbase = g.steps.find(s => s.id === 'coinbase');
  const google = g.steps.find(s => s.id === 'google');
  assert.ok(google.n < coinbase.n, 'Coinbase needs Gmail first');
});

test('gather lists what the steps need, where it is, and the first step that needs it', () => {
  const g = buildGuide(fixedSample());
  const sheet = g.gather.find(x => x.id === 'kit');
  assert.equal(sheet.where, 'Home › Desk drawer');
  assert.match(sheet.placeNote, /pantry door/);
  assert.equal(sheet.step, 1);
  const pw = g.gather.find(x => x.id === 'bwpw');
  assert.equal(pw.where, 'Written on Sealed emergency sheet');
  const codes = g.gather.find(x => x.id === 'codes');
  assert.equal(codes.note, 'In the blue folder at the back.');
  // Sorted by first use.
  for (let i = 1; i < g.gather.length; i++) assert.ok(g.gather[i - 1].step <= g.gather[i].step);
  // Places and people are never gathered as items.
  assert.ok(g.gather.every(x => x.kind !== 'place' && x.kind !== 'person'));
});

test('the guide never routes through a way only the owner can use', () => {
  const p = fixedSample();
  const g = buildGuide(p);
  for (const s of g.steps) {
    const a = p.accounts.find(x => x.id === s.id);
    const way = a.ways.find(w => w.label === s.way);
    assert.ok(way, `${s.name}: way "${s.way}" exists`);
    assert.notEqual(way.who, 'me');
  }
});

test('the full map lists every account and every thing', () => {
  const p = sampleProfile();
  const g = buildGuide(p);
  assert.equal(g.map.length, p.accounts.length);
  const google = g.map.find(a => a.id === 'google');
  assert.ok(google.ways.length >= 3);
  assert.ok(google.ways.some(w => w.steps.some(s => s.options.some(o => /Printed Google backup codes/.test(o)))));
  const codes = g.inventory.find(x => x.id === 'codes');
  assert.equal(codes.where, 'Home › Desk drawer');
  assert.ok(!g.inventory.some(x => x.kind === 'place' || x.kind === 'person'));
});

test('readiness tracks the person, the password manager, wishes, the note, the review and the file', () => {
  const now = new Date('2026-09-27T12:00:00Z');
  const p = sampleProfile();
  let items = Object.fromEntries(readiness(p, buildGuide(p, now), now).map(i => [i.key, i]));
  assert.equal(items.trusted.ok, true);
  assert.equal(items.pm.ok, false);
  assert.equal(items.wishes.ok, true);
  assert.equal(items.letter.ok, true);
  assert.equal(items.reviewed.ok, false);
  assert.equal(items.file.ok, false);

  const q = fixedSample();
  q.reviewedAt = '2026-09-01T10:00:00Z';
  q.handover.savedAt = '2026-09-21T10:00:00Z';
  q.handover.savedHash = planFingerprint(q);
  items = Object.fromEntries(readiness(q, buildGuide(q, now), now).map(i => [i.key, i]));
  assert.ok(Object.values(items).every(i => i.ok), JSON.stringify(Object.values(items).filter(i => !i.ok)));

  // Bookkeeping and key order don't count as changes; content does.
  q.updatedAt = '2026-09-25T10:00:00Z';
  q.sample = true;
  q.accounts[0] = Object.fromEntries(Object.entries(q.accounts[0]).reverse());
  assert.equal(handoverFresh(q), true);
  assert.equal(handoverFresh(normalize(q)), true, 'survives a save and reload');

  // An edit after the file was made makes it stale; so does a review (the date is in the file).
  q.accounts.find(a => a.id === 'github').wish = 'transfer';
  assert.equal(handoverFresh(q), false);
  q.accounts.find(a => a.id === 'github').wish = 'close';
  assert.equal(handoverFresh(q), true, 'undoing the edit by hand makes it current again');
  q.reviewedAt = new Date(now - (STALE_DAYS + 20) * 86400000).toISOString();
  items = Object.fromEntries(readiness(q, buildGuide(q, now), now).map(i => [i.key, i]));
  assert.equal(items.file.ok, false);
  assert.match(items.file.text, /changed after/);
  assert.equal(items.reviewed.ok, false);
  assert.match(items.reviewed.text, /time for a check/);
  assert.equal(buildGuide(q, now).stale, true);

  // Without a name, sentences still start with a capital.
  const r = fixedSample();
  r.trusted = '';
  assert.ok(readiness(r, buildGuide(r, now), now).every(i => /^[A-Z]/.test(i.text)));
});

test('undo keeps the record of the last handover file', () => {
  S.profile = normalize(fixedSample());
  S.history = [];
  commit(p => { p.owner = 'Alexandra'; }, { silent: true });
  stampHandover({ savedAt: '2026-09-27T12:00:00Z', savedHash: planFingerprint(S.profile) });
  assert.equal(handoverFresh(S.profile), true);
  undo();
  assert.equal(S.profile.owner, 'Alex');
  assert.equal(S.profile.handover.savedAt, '2026-09-27T12:00:00Z');
  assert.equal(handoverFresh(S.profile), false, 'the file says Alexandra; the plan now says Alex');
});

test('data-only family routes count for the account but unlock nothing else', () => {
  const p = sampleProfile();
  const google = p.accounts.find(a => a.id === 'google');
  const iam = google.ways.find(w => w.key === 'inactive');
  assert.equal(iam.dataOnly, true);
  iam.enabled = true;
  iam.steps[0].anyOf.push({ ref: 'sam', via: 'recovery_contact' });
  const g = buildGuide(p);
  const step = g.steps.find(s => s.id === 'google');
  assert.ok(step && step.dataOnly && step.state === 2);
  assert.deepEqual(step.opens, []);
  assert.ok(g.blocked.some(b => b.id === 'rest'), 'accounts that reset by Gmail stay blocked');
  // Older files without the flag get it from the template.
  delete iam.dataOnly;
  assert.equal(normalize(p).accounts.find(a => a.id === 'google').ways.find(w => w.key === 'inactive').dataOnly, true);
});

test('gather follows the route used: a restored app, a replacement eSIM, the reachable copy', () => {
  const p = fixedSample();
  // The heir can't get the phone back; the authenticator restores from Google, the number moves by eSIM.
  p.things.find(t => t.id === 'iphone').heirCan = false;
  p.things.push({ id: 'box', kind: 'place', name: 'Bank box', heirCan: false });
  p.things.push({ id: 'kit2', kind: 'paper', name: 'Copy in the bank box', at: 'box' });
  p.things.find(t => t.id === 'bwpw').writtenOn = ['kit2', 'kit'];
  p.things.find(t => t.id === 'macpw').shared = true;
  const g = buildGuide(p);
  const byId = Object.fromEntries(g.gather.map(x => [x.id, x]));
  assert.equal(byId.bwpw.where, 'Written on Sealed emergency sheet');
  const google = g.steps.find(s => s.id === 'google');
  assert.equal(byId.gauth.where, `Restore it on a new phone from its backup in Google (Gmail) (step ${google.n}).`);
  const coinbase = g.steps.find(s => s.id === 'coinbase');
  assert.ok(google.n < coinbase.n, 'the backup account comes before the step that needs the restored app');
  assert.ok(!g.gather.some(x => x.id === 'iphone'));
  const inv = Object.fromEntries(g.inventory.map(x => [x.id, x]));
  assert.equal(inv.iphone.reach, false);
});

test('makeHandoverHtml puts the data before the app script and nothing in it can close the tag', () => {
  const pristine = '<!doctype html>\n<html><head><title>x</title></head>\n<body>\n<div id="app"></div>\n<script>boot()</script>\n</body>\n</html>\n';
  const evil = { app: 'lockout-drill', encrypted: true, data: '</script><script>alert(1)</script><!--', kdf: {}, cipher: {} };
  const html = makeHandoverHtml(pristine, evil);
  const tagAt = html.indexOf(`<script type="application/json" id="${HANDOVER_ID}">`);
  assert.ok(tagAt > html.indexOf('<body>') && tagAt < html.indexOf('<script>boot()'), 'data tag sits between <body> and the app script');
  const start = tagAt + `<script type="application/json" id="${HANDOVER_ID}">`.length;
  const end = html.indexOf('</script>', start);
  const text = html.slice(start, end);
  assert.ok(!text.includes('<'), 'no raw < inside the data');
  assert.deepEqual(readHandover(text), { ...evil, purpose: 'handover' });
  // Everything else is the page, unchanged.
  assert.equal(html.slice(0, tagAt) + html.slice(end + '</script>\n'.length), pristine);
  assert.throws(() => makeHandoverHtml('<html>no body</html>', evil));
  assert.equal(readHandover('not json'), null);
  assert.equal(readHandover('{"purpose":"other"}'), null);
});

test('normalize keeps the plan fields and drops bad ones', () => {
  const p = normalize({
    owner: 'A', trusted: 'B',
    reviewedAt: '2026-01-02T03:04:05.000Z', updatedAt: 'not a date',
    handover: { note: 'x'.repeat(5000), contacts: 42, savedAt: '2026-01-03T00:00:00Z', extra: 'dropped' },
    things: [{ id: 'd', kind: 'place', name: 'Drawer', note: 'n'.repeat(900) }],
    accounts: [
      { id: 'a', name: 'A', wish: 'money', note: 'y'.repeat(3000), ways: [] },
      { id: 'b', name: 'B', wish: 'bogus', ways: [] },
      { id: 'c', name: 'C', wish: '__proto__', ways: [] },
      { id: 'e', name: 'E', wish: 'toString', ways: [] },
    ],
  });
  assert.equal(p.reviewedAt, '2026-01-02T03:04:05.000Z');
  assert.equal(p.updatedAt, undefined);
  assert.equal(p.handover.note.length, 4000);
  assert.equal(p.handover.contacts, '42');
  assert.equal(p.handover.savedAt, '2026-01-03T00:00:00Z');
  assert.equal(p.handover.extra, undefined);
  assert.equal(p.things[0].note.length, 500);
  assert.equal(p.accounts[0].wish, 'money');
  assert.equal(p.accounts[0].note.length, 2000);
  for (const a of p.accounts.slice(1)) assert.equal(a.wish, undefined);
  assert.ok(Object.keys(WISHES).includes('money'));
});

test('commit stamps updatedAt unless told not to; a handover copy is never written', async () => {
  S.profile = normalize(sampleProfile());
  S.keyring = null;
  commit(p => { p.owner = 'Alex'; }, { silent: true });
  const stamped = S.profile.updatedAt;
  assert.ok(Number.isFinite(Date.parse(stamped)));
  commit(p => { p.reviewedAt = new Date().toISOString(); }, { silent: true, touch: false });
  assert.equal(S.profile.updatedAt, stamped);

  const writes = [];
  globalThis.localStorage = { getItem: () => null, setItem: (k, v) => writes.push(k), removeItem() {} };
  S.ephemeral = true;
  S.saveState = 'saved';
  commit(p => { p.owner = 'Someone else'; }, { silent: true });
  await new Promise(r => setTimeout(r, 450));
  assert.deepEqual(writes, []);
  assert.equal(S.saveState, 'saved');
  S.ephemeral = false;
});

test('names with $ patterns appear exactly as typed', () => {
  const p = fixedSample();
  const odd = "Sheet $' $& $` $$ $1";
  p.things.find(t => t.id === 'kit').name = odd;
  const g = buildGuide(p);
  assert.equal(g.gather.find(x => x.id === 'kit').name, odd);
  assert.equal(g.gather.find(x => x.id === 'bwpw').where, `Written on ${odd}`);
  const google = g.map.find(a => a.id === 'google');
  const yk = p.things.find(t => t.id === 'yubikey');
  yk.name = 'Key $&';
  const g2 = buildGuide(p);
  assert.ok(g2.steps.find(s => s.id === 'github').picks.some(pk => pk.text.includes('Key $&')));
  assert.ok(google.ways.length > 0);
});

test('places read as a path and survive loops', () => {
  const things = new Map([
    ['home', { id: 'home', name: 'Home' }],
    ['study', { id: 'study', name: 'Study', inside: 'home' }],
    ['safe', { id: 'safe', name: 'Safe', inside: 'study' }],
    ['x', { id: 'x', name: 'X', inside: 'y' }],
    ['y', { id: 'y', name: 'Y', inside: 'x' }],
  ]);
  assert.equal(placePath(things, 'safe'), 'Home › Study › Safe');
  assert.equal(placePath(things, 'x'), 'Y › X');
});

test('review dates read naturally', () => {
  const now = new Date('2026-09-27T12:00:00Z');
  assert.equal(daysSince(undefined, now), null);
  assert.equal(daysSince('2026-09-27T01:00:00Z', now), 0);
  assert.equal(daysSince('2027-01-01T00:00:00Z', now), 0);
  assert.equal(ago(null), 'never');
  assert.equal(ago(0), 'today');
  assert.equal(ago(1), 'yesterday');
  assert.equal(ago(20), '20 days ago');
  assert.equal(ago(45), 'a month ago');
  assert.equal(ago(200), '7 months ago');
  assert.equal(ago(540), 'a year ago');
  assert.equal(ago(900), '2 years ago');
});
