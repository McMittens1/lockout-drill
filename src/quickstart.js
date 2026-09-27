// Quick start: seven answers build a real starting setup (things, accounts and how they connect)
// that people then correct. Pure: no DOM, so it can be tested.

import { accountFrom } from './sample.js';
import { normalize } from './store.js';

export const QS_DEFAULT = { owner: '', trusted: '', phone: 'iPhone', number: '', computer: 'yes', computerName: 'Laptop', computerKind: 'windows', pm: 'bitwarden', auth: 'Google Authenticator', email: 'google', keys: '0', bank: 'yes' };

export function buildFromAnswers(a) {
  const T = (id, kind, name, extra = {}) => ({ id, kind, name, ...extra });
  const things = [T('home', 'place', 'Home', { home: true })];
  const phoneName = a.phone === 'iPhone' ? 'iPhone' : 'Android phone';
  things.push(T('pin', 'secret', `${phoneName} passcode`));
  things.push(T('phone', 'phone', phoneName, { at: 'carried', unlock: 'pin' }));
  things.push(T('num', 'number', (a.number || '').trim() || 'My phone number', { sim: 'phone', carrier: 'carrier' }));
  const devices = ['phone'];
  if (a.computer === 'yes') {
    things.push(T('comppw', 'secret', `${(a.computerName || 'Laptop').trim()} password`));
    things.push(T('computer', 'computer', (a.computerName || 'Laptop').trim(), { at: 'home', unlock: 'comppw' }));
    devices.push('computer');
  }
  things.push(T('id', 'photoid', "Driver's license", { at: 'carried' }));
  if (a.trusted.trim()) things.push(T('trusted', 'person', a.trusted.trim()));
  const keys = [];
  if (a.keys !== '0') { things.push(T('key1', 'seckey', 'Security key', { at: 'carried' })); keys.push('key1'); }
  if (a.keys === '2') { things.push(T('key2', 'seckey', 'Spare security key', { at: 'home' })); keys.push('key2'); }

  // Only Apple hardware can show Apple codes, reset an Apple Account or join iCloud Keychain.
  const appleDevices = [...(a.phone === 'iPhone' ? ['phone'] : []), ...(a.computer === 'yes' && a.computerKind === 'mac' ? ['computer'] : [])];
  const applePasscodes = [...(a.phone === 'iPhone' ? ['pin'] : []), ...(a.computer === 'yes' && a.computerKind === 'mac' ? ['comppw'] : [])];

  const pmIsService = ['bitwarden', 'onepassword', 'lastpass', 'protonpass'].includes(a.pm);
  const pmAccount = pmIsService || a.pm === 'apple';
  if (pmIsService) things.push(T('mp', 'secret', `${{ bitwarden: 'Bitwarden', onepassword: '1Password', lastpass: 'LastPass', protonpass: 'Proton' }[a.pm]} master password`));
  if (a.pm === 'onepassword') things.push(T('kit', 'paper', '1Password Emergency Kit', { at: 'home' }));
  if (a.pm === 'none') things.push(T('mem', 'secret', 'Passwords I remember'));

  const emailId = 'email';
  const appleAcc = a.email === 'apple' ? emailId : 'apple';
  const googlePm = a.pm === 'google' ? (a.email === 'google' ? emailId : 'gacct') : null;

  const authIsApp = !['pm', 'none'].includes(a.auth);
  if (authIsApp) {
    // Where each app's codes come back from (see AUTHAPP_PRESETS for the sources).
    const phoneCloud = a.phone === 'iPhone' ? (a.email === 'apple' ? emailId : 'apple') : (a.email === 'google' ? emailId : null);
    const backupFor = {
      'Google Authenticator': a.email === 'google' ? emailId : null,
      'Microsoft Authenticator': a.phone === 'iPhone' ? phoneCloud : (a.email === 'microsoft' ? emailId : null),
      Authy: 'num',
      '2FAS': phoneCloud,
    };
    const backup = backupFor[a.auth] || null;
    const extra = {};
    if (a.auth === 'Authy') {
      things.push(T('authypw', 'secret', 'Authy backups password'));
      extra.backupSecret = 'authypw';
    }
    things.push(T('auth', 'authapp', a.auth, { devices: ['phone'], ...(backup ? { backup } : {}), ...extra }));
  }
  const second = [...(authIsApp ? ['auth'] : a.auth === 'pm' && pmAccount ? ['pm'] : []), ...keys, 'num'];

  // Stubs so step types can be inferred before accounts exist.
  const stubs = [
    { id: emailId, category: a.email === 'google' || a.email === 'microsoft' || a.email === 'apple' ? 'platform' : 'email', ways: [] },
    { id: 'pm', category: 'password_manager', ways: [] },
    { id: 'apple', category: 'platform', ways: [] },
    { id: 'gacct', category: 'platform', ways: [] },
    { id: 'carrier', category: 'carrier', ways: [] },
  ];
  // Rebuilt on every call: pwFor() may add a memorized-password item just before use.
  const A = (tpl, id, fills, o) => accountFrom(tpl, id, fills, [...things, ...stubs], o);

  // Where each account's password comes from. The account that unlocks the password manager
  // itself (Apple Account for Keychain, Google account for Google Password Manager) is memorized.
  const pwFor = (accId) => {
    if (pmIsService) return ['pm'];
    if (a.pm === 'apple' && accId !== appleAcc) return ['pm'];
    if (googlePm && googlePm !== accId) return [googlePm];
    if (a.pm === 'none') return ['mem'];
    const id = 'pw_' + accId;
    if (!things.some(t => t.id === id)) things.push(T(id, 'secret', `${accId === emailId ? 'Email' : 'Account'} password (memorized)`));
    return [id];
  };

  const accounts = [];
  // Main email
  const ep = pwFor(emailId);
  const emailFills = {
    google: { pw2sv: [ep, ['phone', ...second]], session: [devices], rinfo: [['num']], appeal: [] },
    microsoft: { pw2sv: [ep, [...(a.auth === 'Microsoft Authenticator' ? ['phone'] : []), ...second]], session: [devices], appeal: [] },
    apple: { pwcode: [ep, [...appleDevices, 'num']], ...(appleDevices.length ? { devreset: [appleDevices] } : {}), recovery: [] },
    proton: authIsApp || keys.length ? { pw2fa: [ep, second.filter(x => x !== 'num')], session: [devices], reset: [['num']] } : { pwonly: [ep], session: [devices], reset: [['num']] },
    yahoo: { pw2sv: [ep, second], session: [devices], helper: [['num']] },
    email: { pw2fa: [ep, second], session: [devices], rinfo2fa: [['num'], ep] },
  }[a.email];
  const emailTpl = a.email;
  accounts.push(A(emailTpl, emailId, emailFills, { name: { google: 'Gmail', microsoft: 'Outlook', apple: 'iCloud Mail (Apple Account)', proton: 'Proton Mail', yahoo: 'Yahoo Mail', email: 'Email' }[a.email] }));

  // Apple Account for iPhone owners and Apple Passwords users (unless it's already the email).
  if ((a.phone === 'iPhone' || a.pm === 'apple') && a.email !== 'apple') {
    accounts.push(A('apple', 'apple', { pwcode: [pwFor('apple'), [...appleDevices, 'num']], ...(appleDevices.length ? { devreset: [appleDevices] } : {}), recovery: [] }));
  }
  // Google account for Google Password Manager when email isn't Gmail
  if (a.pm === 'google' && a.email !== 'google') {
    accounts.push(A('google', 'gacct', { pw2sv: [pwFor('gacct'), ['phone', ...second]], session: [devices], rinfo: [['num']], appeal: [] }, { name: 'Google account' }));
  }
  // Apple Passwords: iCloud Keychain is end-to-end encrypted, so it is its own account.
  if (a.pm === 'apple') {
    const keychainDevices = appleDevices.length ? appleDevices : devices; // iCloud for Windows also syncs passwords
    accounts.push(A('applepw', 'pm', {
      unlocked: [keychainDevices],
      ...(applePasscodes.length ? { escrow: [[appleAcc], applePasscodes, ['num']] } : {}),
    }, { name: 'Apple Passwords (iCloud Keychain)' }));
  }
  // Password manager
  if (pmIsService) {
    const pmSecond = second.filter(x => x !== 'num' && x !== 'pm');
    const f = {
      bitwarden: pmSecond.length ? { mp2fa: [['mp'], pmSecond], unlocked: [devices, ['mp']] } : { mpemail: [['mp'], [emailId]], unlocked: [devices, ['mp']] },
      onepassword: pmSecond.length ? { pwkey2fa: [['mp'], ['kit', ...devices], pmSecond], unlocked: [devices, ['mp']] } : { pwkey: [['mp'], ['kit', ...devices]], unlocked: [devices, ['mp']] },
      lastpass: { mpmfa: [['mp'], pmSecond.length ? pmSecond : ['phone']], unlocked: [devices] },
      protonpass: pmSecond.length ? { pw2fa: [['mp'], pmSecond], session: [devices] } : { pwonly: [['mp']], session: [devices] },
    }[a.pm];
    accounts.push(A(a.pm, 'pm', f, { name: { bitwarden: 'Bitwarden', onepassword: '1Password', lastpass: 'LastPass', protonpass: 'Proton Pass' }[a.pm] }));
  }
  accounts.push(A('carrier', 'carrier', { pwsms: [pwFor('carrier'), ['num']], store: [['id']] }, { name: 'Mobile carrier' }));
  if (a.bank === 'yes') accounts.push(A('bank', 'bank', { pwcode: [pwFor('bank'), ['num']], phone: [], ...(a.trusted.trim() ? { estate: [['trusted']] } : {}) }, { name: 'Bank' }));
  accounts.push(A('email-reset', 'rest', { pw: [pwFor('rest')], reset: [[emailId]] }, { name: 'Sites that reset by email', count: 30, important: false }));

  return normalize({ owner: a.owner.trim(), trusted: a.trusted.trim(), things, accounts });
}
