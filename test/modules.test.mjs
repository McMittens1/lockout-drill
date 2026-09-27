import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, sitesFromExport, domainOf } from '../src/csv.js';
import { makeKeyring, encryptWith, decryptEnvelope, isEncrypted, WrongPassphrase } from '../src/crypto.js';
import { normalize, unwrap, removeItem, usages } from '../src/store.js';
import { verifiedFixes, bestFixes, candidateFixes } from '../src/advice.js';
import { buildFromAnswers, QS_DEFAULT } from '../src/quickstart.js';
import { TEMPLATES, VIA, accountFromTemplate, templateForDomain, inferVia } from '../src/templates.js';
import { compile, simulate, analyze, scenarioPresets, runScenario, OK, SLOW, LOCKED } from '../src/engine.js';
import { sampleProfile } from '../src/sample.js';

// ---------------------------------------------------------------- CSV import

test('parseCSV handles quotes, escaped quotes, commas, newlines and CRLF', () => {
  const rows = parseCSV('a,b,c\r\n"x, y","say ""hi""","multi\nline"\r\n,,\n');
  assert.deepEqual(rows[0], ['a', 'b', 'c']);
  assert.deepEqual(rows[1], ['x, y', 'say "hi"', 'multi\nline']);
  assert.deepEqual(rows[2], ['', '', '']);
  assert.equal(rows.length, 3);
});

test('domainOf normalizes URLs and rejects non-web entries', () => {
  assert.equal(domainOf('https://accounts.google.com/signin'), 'google.com');
  assert.equal(domainOf('www.bbc.co.uk'), 'bbc.co.uk');
  assert.equal(domainOf('androidapp://com.whatsapp'), '');
  assert.equal(domainOf('192.168.1.1'), '');
  assert.equal(domainOf('https://github.com, https://gist.github.com'), 'github.com');
  assert.equal(domainOf('not a url at all'), '');
});

const BITWARDEN = `folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp
,,login,Google,,,0,https://accounts.google.com,me@gmail.com,SuperSecret1!,
,,login,GitHub,"note, with comma",,0,https://github.com,me,hunter2,otpauth://totp/GitHub?secret=JBSWY3DPEHPK3PXP
,,note,Secure note,top secret note,,0,,,,
,,login,Some Shop,,,0,https://shop.example.com/login,me,pw123,
,,login,Some Shop again,,,0,https://www.shop.example.com,me2,pw456,
`;

test('sitesFromExport reads names, domains and TOTP presence only — never secrets', () => {
  const r = sitesFromExport(BITWARDEN);
  assert.equal(r.format, 'Bitwarden');
  assert.equal(r.total, 4, 'the secure note is skipped');
  const json = JSON.stringify(r);
  for (const secret of ['SuperSecret1!', 'hunter2', 'JBSWY3DPEHPK3PXP', 'pw123', 'me@gmail.com', 'top secret note', 'with comma']) {
    assert.ok(!json.includes(secret), 'result must not contain ' + secret);
  }
  const gh = r.sites.find(s => s.domain === 'github.com');
  assert.equal(gh.hasTotp, true);
  const shop = r.sites.find(s => s.domain === 'example.com');
  assert.equal(shop.count, 2, 'same site deduplicated');
});

test('sitesFromExport recognizes other managers and fails clearly on bad input', () => {
  const chrome = 'name,url,username,password,note\nexample,https://example.com,u,p,\n';
  assert.equal(sitesFromExport(chrome).format, 'Chrome or Edge');
  const onep = 'Title,Url,Username,Password,OTPAuth,Favorite,Archived,Tags,Notes\nCoinbase,https://coinbase.com,u,p,otpauth://x,false,false,,\n';
  const r = sitesFromExport(onep);
  assert.equal(r.format, '1Password');
  assert.equal(r.sites[0].hasTotp, true);
  assert.throws(() => sitesFromExport(''), /empty/);
  assert.throws(() => sitesFromExport('{"items":[]}'), /JSON/);
  assert.throws(() => sitesFromExport('foo,bar\n1,2\n'), /name or website/);
  assert.throws(() => sitesFromExport('name,url\n'), /No rows|No logins/);
});

test('imported domains match the right templates', () => {
  assert.equal(templateForDomain('google.com').id, 'google');
  assert.equal(templateForDomain('pass.proton.me').id, 'protonpass');
  assert.equal(templateForDomain('proton.me').id, 'proton');
  assert.equal(templateForDomain('chase.com').id, 'bank');
  assert.equal(templateForDomain('example.com'), null);
});

// ---------------------------------------------------------------- Crypto

test('encryption round-trips, rejects wrong passphrases and tampering', async () => {
  const ring = await makeKeyring('correct horse battery staple', null, 2000);
  const env = await encryptWith(ring, { hello: 'world', n: [1, 2, 3] });
  assert.ok(isEncrypted(env));
  assert.ok(!JSON.stringify(env).includes('world'), 'ciphertext does not leak plaintext');
  const { profile, keyring } = await decryptEnvelope(env, 'correct horse battery staple');
  assert.deepEqual(profile, { hello: 'world', n: [1, 2, 3] });
  const env2 = await encryptWith(keyring, { again: true });
  assert.notEqual(env2.cipher.iv, env.cipher.iv, 'fresh IV per save');
  assert.equal(env2.kdf.salt, env.kdf.salt, 'same key, same salt');
  await assert.rejects(decryptEnvelope(env, 'wrong'), WrongPassphrase);
  const tampered = { ...env, data: env.data.slice(0, -4) + (env.data.endsWith('AAAA') ? 'BBBB' : 'AAAA') };
  await assert.rejects(decryptEnvelope(tampered, 'correct horse battery staple'), WrongPassphrase);
  await assert.rejects(decryptEnvelope({ ...env, kdf: { ...env.kdf, iterations: 5 } }, 'x'), /unusual/);
});

// ---------------------------------------------------------------- Loading & validation

test('normalize repairs malformed and hostile input without throwing', () => {
  const weird = {
    owner: 'A'.repeat(1000),
    things: [
      { id: 'a', kind: 'phone', name: 'P', at: 'nowhere', unlock: 'ghost' },
      { id: 'a', kind: 'phone', name: 'duplicate id' },
      { id: 'b', kind: 'dragon', name: 'bad kind' },
      { id: 'c', kind: 'place', name: 'C', inside: 'd' },
      { id: 'd', kind: 'place', name: 'D', inside: 'c' },
      null, 42, 'x',
      { id: 's', kind: 'secret', name: '<img src=x onerror=alert(1)>' },
    ],
    accounts: [
      { id: 'g', name: 'G', category: 'nope', ways: [{ speed: 'warp', kind: 'x', steps: [{ types: ['sms', 'nope'], anyOf: [{ ref: 'a', via: 'push' }, { ref: 'zzz' }, { ref: 'g' }] }] }, 'garbage'] },
      { id: 'a', name: 'id collides with a thing' },
    ],
  };
  const p = normalize(weird);
  assert.equal(p.owner.length, 60);
  assert.deepEqual(p.things.map(t => t.id), ['a', 'c', 'd', 's']);
  assert.equal(p.things[0].at, undefined, 'dangling location dropped');
  assert.equal(p.things[0].unlock, undefined);
  const c = p.things.find(t => t.id === 'c'), d = p.things.find(t => t.id === 'd');
  assert.ok(!(c.inside === 'd' && d.inside === 'c'), 'place cycle broken');
  assert.equal(p.accounts.length, 1);
  const w = p.accounts[0].ways[0];
  assert.equal(w.speed, 'instant');
  assert.equal(w.kind, 'signin');
  assert.deepEqual(w.steps[0].types, ['sms']);
  assert.deepEqual(w.steps[0].anyOf.map(o => o.ref), ['a'], 'dangling and self references dropped');
  assert.equal(p.accounts[0].category, 'other');
  assert.doesNotThrow(() => analyze(p));
  assert.doesNotThrow(() => normalize(null));
  assert.doesNotThrow(() => normalize('nope'));
});

test('unwrap accepts saved files, raw profiles and encrypted envelopes; rejects others', () => {
  const p = sampleProfile();
  assert.ok(unwrap({ app: 'lockout-drill', encrypted: false, v: 1, profile: p }).profile);
  assert.ok(unwrap(p).profile);
  assert.ok(unwrap({ encrypted: true, data: 'x', kdf: {}, cipher: {} }).envelope);
  assert.throws(() => unwrap({ hello: 1 }), /isn't a Lockout Drill file/);
  assert.throws(() => unwrap(null));
});

test('sample survives a normalize round-trip unchanged in behavior', () => {
  const p = sampleProfile();
  const q = normalize(JSON.parse(JSON.stringify(p)));
  for (const sc of scenarioPresets(p)) {
    const a = runScenario(p, sc.ctx).rows.map(r => r.state);
    const b = runScenario(q, sc.ctx).rows.map(r => r.state);
    assert.deepEqual(a, b, sc.id);
  }
});

test('removeItem deletes every reference; usages lists them', () => {
  const p = sampleProfile();
  assert.ok(usages(p, 'num').length >= 3);
  removeItem(p, 'num');
  assert.ok(!JSON.stringify(p).includes('"num"'));
  assert.doesNotThrow(() => analyze(p));
  removeItem(p, 'home');
  assert.equal(p.things.find(t => t.id === 'macbook').at, 'carried', 'things at a deleted place fall back to carried');
  assert.equal(p.things.find(t => t.id === 'drawer').inside, undefined);
});

// ---------------------------------------------------------------- Advice

test('verified fixes actually improve the account in that scenario', () => {
  const p = sampleProfile();
  const heir = { perspective: 'heir' };
  const fixes = verifiedFixes(p, 'bitwarden', heir);
  assert.ok(fixes.length >= 1);
  for (const f of fixes) {
    const q = JSON.parse(JSON.stringify(p));
    assert.ok(f.apply(q));
    assert.ok(simulate(compile(q), heir).state.get('bitwarden') > LOCKED, f.title);
    assert.equal(f.before, LOCKED);
  }
  assert.deepEqual(verifiedFixes(p, 'google', {}), [], 'no fixes offered when already fine');
});

test('carrier PIN fix is offered and verified when robbed abroad', () => {
  const p = sampleProfile();
  const ctx = scenarioPresets(p).find(s => s.id === 'travel').ctx;
  const titles = verifiedFixes(p, 'verizon', ctx, 10).map(f => f.title);
  assert.ok(titles.some(t => /account PIN/.test(t)), titles.join(' | '));
});

test('bestFixes ranks the shared root cause first', () => {
  const p = sampleProfile();
  const an = analyze(p);
  const pairs = [...an.resilience].filter(([, n]) => n === 1).flatMap(([id]) => an.sets.get(id).filter(s => s.length === 1).map(lost => ({ accountId: id, lost })));
  const top = bestFixes(p, pairs, 3);
  assert.match(top[0].title, /Write down Bitwarden master password/);
  assert.deepEqual(new Set(top[0].rescued), new Set(['bitwarden', 'coinbase', 'github']));
  const fams = top.map(t => t.key.split('@')[0]);
  assert.equal(new Set(fams).size, fams.length, 'no near-duplicate fixes');
});

// ---------------------------------------------------------------- Templates & quick start

test('every template is well-formed', () => {
  const ids = new Set();
  for (const t of TEMPLATES) {
    assert.ok(!ids.has(t.id), 'unique id ' + t.id);
    ids.add(t.id);
    assert.ok(t.ways.length, t.id);
    for (const w of t.ways) {
      assert.ok(['instant', 'slow', 'appeal'].includes(w.speed), `${t.id}.${w.key} speed`);
      assert.ok(['signin', 'recovery', 'legacy'].includes(w.kind), `${t.id}.${w.key} kind`);
      for (const s of w.steps) for (const ty of s.types) assert.ok(VIA[ty], `${t.id}.${w.key} type ${ty}`);
    }
    if (!['generic', 'email-reset'].includes(t.id)) assert.ok(t.sources.length, `${t.id} cites sources`);
    const a = accountFromTemplate(t, 'x');
    assert.equal(a.ways.length, t.ways.length);
  }
});

test('inferVia picks the right step type for an item', () => {
  assert.equal(inferVia(['push', 'totp', 'sms'], { kind: 'phone' }), 'push');
  assert.equal(inferVia(['push', 'totp', 'sms'], { kind: 'number' }), 'sms');
  assert.equal(inferVia(['password'], { id: 'bw', category: 'password_manager', ways: [] }), 'password');
  assert.equal(inferVia(['password'], { id: 'x', category: 'bank', ways: [] }), null);
});

test('quick start builds a coherent setup for many answer combinations', () => {
  const combos = [];
  for (const pm of ['bitwarden', 'onepassword', 'lastpass', 'protonpass', 'apple', 'google', 'none']) {
    for (const email of ['google', 'microsoft', 'apple', 'proton', 'yahoo', 'email']) {
      for (const auth of ['Google Authenticator', 'Microsoft Authenticator', 'Authy', 'pm', 'none']) for (const computerKind of ['windows', 'mac', 'other']) {
        combos.push({ ...QS_DEFAULT, pm, email, auth, computerKind, keys: String(combos.length % 3), computer: combos.length % 2 ? 'yes' : 'no', phone: combos.length % 4 ? 'iPhone' : 'Android phone', trusted: combos.length % 5 ? 'Sam' : '' });
      }
    }
  }
  for (const a of combos) {
    const p = buildFromAnswers(a);
    const tag = `${a.pm}/${a.email}/${a.auth}`;
    assert.ok(p.accounts.length >= 4, tag);
    const today = runScenario(p, {});
    const broken = today.rows.filter(r => r.state < OK);
    assert.deepEqual(broken.map(r => r.name), [], `${tag}: everything should work on a normal day`);
    assert.doesNotThrow(() => analyze(p, { maxSize: 2 }), tag);
  }
});
