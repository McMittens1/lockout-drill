// Storage rules: under file:// nothing unencrypted is written without consent; failed encrypted
// writes never leave plaintext behind; persistNow reports whether it saved.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { S, persistNow, STORE_KEY, PREF_KEY, writePrefs } from '../src/store.js';
import { makeKeyring, isEncrypted } from '../src/crypto.js';
import { sampleProfile } from '../src/sample.js';

class MemStorage {
  constructor() { this.m = new Map(); this.failWrites = false; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { if (this.failWrites && k === STORE_KEY) throw new Error('QuotaExceededError'); this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}

const mine = () => { const p = sampleProfile(); delete p.sample; return p; };

beforeEach(() => {
  globalThis.localStorage = new MemStorage();
  globalThis.location = { protocol: 'file:' };
  S.profile = mine();
  S.keyring = null;
  S.saveState = 'saved';
});

test('file://: an unencrypted setup is not written without consent', async () => {
  assert.equal(await persistNow(), false);
  assert.equal(S.saveState, 'unsaved');
  assert.equal(localStorage.getItem(STORE_KEY), null);
  writePrefs({ plainOk: true });
  assert.equal(await persistNow(), true);
  assert.ok(localStorage.getItem(STORE_KEY).includes('"encrypted":false'));
});

test('file://: with a passphrase it saves encrypted, no consent needed', async () => {
  S.keyring = await makeKeyring('correct horse battery', null, 2000);
  assert.equal(await persistNow(), true);
  const stored = JSON.parse(localStorage.getItem(STORE_KEY));
  assert.ok(isEncrypted(stored));
  assert.ok(!localStorage.getItem(STORE_KEY).includes('Bitwarden'));
});

test('the sample is not personal: it saves without asking', async () => {
  S.profile = sampleProfile();
  assert.equal(await persistNow(), true);
});

test('http(s): origin-scoped storage saves without asking', async () => {
  globalThis.location = { protocol: 'http:' };
  assert.equal(await persistNow(), true);
});

test('a failed encrypted write reports failure and removes an older plaintext copy', async () => {
  writePrefs({ plainOk: true });
  assert.equal(await persistNow(), true); // plaintext stored
  S.keyring = await makeKeyring('correct horse battery', null, 2000);
  localStorage.failWrites = true;
  assert.equal(await persistNow(), false);
  assert.equal(S.saveState, 'error');
  assert.equal(localStorage.getItem(STORE_KEY), null, 'no plaintext left behind');
  assert.ok(localStorage.getItem(PREF_KEY), 'preferences untouched');
});
