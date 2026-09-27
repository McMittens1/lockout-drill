// Import the *list of sites* from a password-manager CSV export (Bitwarden, 1Password,
// LastPass, Proton Pass, KeePassXC, Dashlane, Chrome/Edge, Firefox, Apple Passwords).
//
// Only three things are read from each row: the entry's name, its website, and whether it has
// an authenticator (TOTP) secret. Usernames, passwords, notes and the TOTP secrets themselves are
// never copied into any object this module returns.

export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let i = 0;
  let quoted = false;
  if (text.charCodeAt(0) === 0xfeff) i = 1; // BOM
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"' && field === '') { quoted = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0].trim() !== ''));
}

const NAME_COLS = ['name', 'title', 'item name', 'account', 'entry', 'site name'];
const URL_COLS = ['url', 'login_uri', 'uri', 'website', 'web site', 'login url', 'urls', 'address', 'hostname', 'origin_url', 'login_url'];
const TOTP_COLS = ['totp', 'login_totp', 'otpauth', 'otp', 'otpsecret', 'otp secret', 'one-time password', 'authenticator key', 'otpauth url', 'mfa', '2fa'];
const TYPE_COLS = ['type', 'item type'];

const findCol = (header, names) => {
  for (const want of names) {
    const i = header.findIndex(h => h === want);
    if (i >= 0) return i;
  }
  return -1;
};

const SECOND_LEVEL = new Set(['co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'co.jp', 'com.br', 'co.in', 'com.mx', 'co.za', 'com.sg', 'com.tr', 'com.cn', 'co.kr', 'com.ar']);

export function domainOf(raw) {
  if (!raw) return '';
  let u = String(raw).trim().split(/[\s,]+/)[0];
  if (!u || /^(androidapp|ios|app|chrome-extension|moz-extension|file|about|javascript|data):/i.test(u)) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = 'https://' + u;
  let host;
  try { host = new URL(u).hostname.toLowerCase(); } catch { return ''; }
  if (!host || !host.includes('.') || /^\d+(\.\d+){3}$/.test(host) || host.startsWith('[')) return '';
  host = host.replace(/^www\d*\./, '');
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  const last2 = parts.slice(-2).join('.');
  return SECOND_LEVEL.has(last2) ? parts.slice(-3).join('.') : last2;
}

// Returns { format, total, sites: [{ key, name, domain, hasTotp, count }] } with no secrets.
export function sitesFromExport(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('The file is empty.');
  if (/^\s*[{[]/.test(text)) throw new Error('This looks like a JSON export. Export as CSV from your password manager instead.');
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('No rows found. Is this a CSV export from a password manager?');
  const header = rows[0].map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));
  const nameCol = findCol(header, NAME_COLS);
  const urlCol = findCol(header, URL_COLS);
  const totpCol = findCol(header, TOTP_COLS);
  const typeCol = findCol(header, TYPE_COLS);
  if (urlCol < 0 && nameCol < 0) throw new Error("Couldn't find a name or website column. Supported: Bitwarden, 1Password, LastPass, Proton Pass, KeePassXC, Dashlane, Chrome, Edge, Firefox and Apple Passwords CSV exports.");
  const format = guessFormat(header);
  const byKey = new Map();
  let total = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (typeCol >= 0) {
      const type = (row[typeCol] || '').trim().toLowerCase();
      if (type && !['login', '1', 'password', 'logins'].includes(type)) continue;
    }
    const domain = urlCol >= 0 ? domainOf(row[urlCol]) : '';
    const name = (nameCol >= 0 ? (row[nameCol] || '').trim() : '') || domain;
    if (!name && !domain) continue;
    const hasTotp = totpCol >= 0 && !!(row[totpCol] || '').trim();
    total++;
    const key = domain || name.toLowerCase();
    const prev = byKey.get(key);
    if (prev) { prev.count++; prev.hasTotp = prev.hasTotp || hasTotp; }
    else byKey.set(key, { key, name: prettyName(name, domain), domain, hasTotp, count: 1 });
  }
  if (!total) throw new Error('No logins found in this file.');
  const sites = [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { format, total, sites };
}

function prettyName(name, domain) {
  const n = name.length > 60 ? name.slice(0, 57) + '…' : name;
  if (n && n !== domain) return n;
  if (!domain) return n;
  const base = domain.split('.')[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function guessFormat(h) {
  const has = x => h.includes(x);
  if (has('login_uri') && has('login_totp')) return 'Bitwarden';
  if (has('otpauth') && has('title') && has('url') && has('archived')) return '1Password';
  if (has('grouping') && has('extra')) return 'LastPass';
  if (has('vault') && has('totp') && has('createtime')) return 'Proton Pass';
  if (has('group') && has('title') && has('totp')) return 'KeePassXC';
  if (has('otpsecret')) return 'Dashlane';
  if (has('httprealm') || has('formactionorigin')) return 'Firefox';
  if (has('otpauth') && has('title')) return 'Apple Passwords';
  if (has('name') && has('url') && has('username') && has('note')) return 'Chrome or Edge';
  return 'CSV';
}
