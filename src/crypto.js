// Passphrase protection for saved setups: AES-256-GCM with a PBKDF2-SHA256 key.
// The derived key is cached in memory so autosave doesn't re-run the KDF on every edit.

export const KDF_ITERATIONS = 600000;
const te = new TextEncoder();
const td = new TextDecoder();

function toB64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromB64(str) {
  const s = atob(str);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

export class WrongPassphrase extends Error {
  constructor() { super('That passphrase does not open this file.'); this.name = 'WrongPassphrase'; }
}

export function isEncrypted(x) {
  return !!x && typeof x === 'object' && x.encrypted === true && typeof x.data === 'string' && x.kdf && x.cipher;
}

export async function makeKeyring(passphrase, saltB64, iterations = KDF_ITERATIONS) {
  if (!globalThis.crypto?.subtle) throw new Error('This browser does not offer Web Crypto here, so encryption is unavailable.');
  const salt = saltB64 ? fromB64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const material = await crypto.subtle.importKey('raw', te.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return { key, salt: toB64(salt), iterations };
}

export async function encryptWith(keyring, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, keyring.key, te.encode(JSON.stringify(obj)));
  return {
    app: 'lockout-drill',
    encrypted: true,
    v: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: keyring.iterations, salt: keyring.salt },
    cipher: { name: 'AES-GCM', iv: toB64(iv) },
    data: toB64(ct),
  };
}

// Decrypt with a key already in memory (same salt), e.g. to pick up another tab's save.
export async function decryptWith(keyring, envelope) {
  if (!isEncrypted(envelope) || envelope.kdf.salt !== keyring.salt) throw new WrongPassphrase();
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(envelope.cipher.iv) }, keyring.key, fromB64(envelope.data));
    return JSON.parse(td.decode(plain));
  } catch {
    throw new WrongPassphrase();
  }
}

// Returns { profile, keyring } so the caller can keep saving with the same key.
export async function decryptEnvelope(envelope, passphrase) {
  if (!isEncrypted(envelope)) throw new Error('Not an encrypted Lockout Drill file.');
  const iterations = Number(envelope.kdf.iterations);
  if (!Number.isFinite(iterations) || iterations < 1000 || iterations > 10_000_000) throw new Error('This file has an unusual key setting and was not opened.');
  const keyring = await makeKeyring(passphrase, envelope.kdf.salt, iterations);
  let plain;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(envelope.cipher.iv) }, keyring.key, fromB64(envelope.data));
  } catch {
    throw new WrongPassphrase();
  }
  return { profile: JSON.parse(td.decode(plain)), keyring };
}
