// Vocabulary: kinds of things, kinds of steps, and per-service templates of "ways in".
// Service facts were checked against each provider's own help pages in September 2026 (links in
// each template's `sources`). Providers change these flows, so every assumption is editable.

export const THING_KINDS = {
  phone:    { label: 'Phone', group: 'devices', physical: true, device: true },
  computer: { label: 'Computer', group: 'devices', physical: true, device: true },
  tablet:   { label: 'Tablet', group: 'devices', physical: true, device: true },
  number:   { label: 'Phone number', group: 'numbers' },
  seckey:   { label: 'Security key', group: 'keys', physical: true },
  paper:    { label: 'Paper or file', group: 'papers', physical: true },
  photoid:  { label: 'Photo ID', group: 'papers', physical: true },
  place:    { label: 'Place', group: 'places' },
  secret:   { label: 'Something you remember', group: 'secrets' },
  authapp:  { label: 'Authenticator app', group: 'apps' },
  person:   { label: 'Trusted person', group: 'people' },
};

export const THING_GROUPS = [
  { id: 'devices', label: 'Devices', hint: 'Phones and computers, and whether they stay signed in.', add: ['phone', 'computer', 'tablet'] },
  { id: 'numbers', label: 'Phone numbers', hint: 'Numbers that get texted or called with codes.', add: ['number'] },
  { id: 'apps', label: 'Authenticator apps', hint: 'Apps that show 6-digit codes, and where they back up.', add: ['authapp'] },
  { id: 'keys', label: 'Security keys', hint: 'YubiKeys and other hardware keys.', add: ['seckey'] },
  { id: 'papers', label: 'Papers and IDs', hint: 'Printed backup codes, recovery kits, photo ID.', add: ['paper', 'photoid'] },
  { id: 'secrets', label: 'Things you remember', hint: 'Master passwords, passcodes, PINs.', add: ['secret'] },
  { id: 'places', label: 'Places', hint: 'Where things are kept.', add: ['place'] },
  { id: 'people', label: 'People you trust', hint: 'Recovery, legacy and emergency contacts.', add: ['person'] },
];

export const ACCOUNT_CATEGORIES = {
  platform: 'Google / Apple / Microsoft',
  email: 'Email',
  password_manager: 'Password manager',
  carrier: 'Mobile carrier',
  bank: 'Bank',
  payments: 'Payments',
  crypto: 'Crypto',
  social: 'Social',
  messaging: 'Messaging',
  developer: 'Developer',
  cloud: 'Cloud & domains',
  shopping: 'Shopping',
  government: 'Government',
  gaming: 'Gaming',
  other: 'Other',
};

// What each kind of step accepts, and how a chosen alternative reads in a sentence.
// Accept entries are thing kinds, or 'acct:<category>' / 'acct:*' for accounts, or '*'.
export const VIA = {
  password:        { label: 'Password', accepts: ['secret', 'paper', 'acct:password_manager', 'acct:platform'], phrase: 'password from {x}' },
  master_password: { label: 'Master password', accepts: ['secret', 'paper'], phrase: '{x}' },
  secret_key:      { label: 'Secret Key', accepts: ['paper', 'computer', 'phone', 'tablet'], phrase: 'Secret Key from {x}' },
  sms:             { label: 'Text message', accepts: ['number'], phrase: 'text to {x}' },
  voice:           { label: 'Phone call', accepts: ['number'], phrase: 'call to {x}' },
  totp:            { label: 'Authenticator code', accepts: ['authapp', 'acct:password_manager'], phrase: 'code from {x}' },
  push:            { label: 'Approve a prompt', accepts: ['phone', 'tablet', 'computer'], phrase: 'prompt on {x}' },
  passkey:         { label: 'Passkey', accepts: ['phone', 'tablet', 'computer', 'seckey', 'acct:password_manager', 'acct:platform'], phrase: 'passkey in {x}' },
  security_key:    { label: 'Security key', accepts: ['seckey'], phrase: '{x}' },
  email_code:      { label: 'Email', accepts: ['acct:email', 'acct:platform'], phrase: 'email to {x}' },
  backup_codes:    { label: 'Backup codes', accepts: ['paper'], phrase: '{x}' },
  recovery_key:    { label: 'Recovery key', accepts: ['paper'], phrase: '{x}' },
  trusted_device:  { label: 'Trusted device', accepts: ['phone', 'tablet', 'computer'], phrase: '{x}' },
  session:         { label: 'Still signed in', accepts: ['phone', 'tablet', 'computer'], phrase: 'signed in on {x}' },
  recovery_contact:{ label: 'Trusted person', accepts: ['person'], phrase: '{x}' },
  photo_id:        { label: 'Photo ID', accepts: ['photoid'], phrase: '{x}' },
  pin:             { label: 'PIN or passcode', accepts: ['secret', 'paper'], phrase: '{x}' },
  backup:          { label: 'Backup', accepts: ['acct:*', 'number', 'paper'], phrase: 'backup in {x}' },
  account:         { label: 'Account', accepts: ['acct:*'], phrase: '{x}' },
  any:             { label: 'Anything', accepts: ['*'], phrase: '{x}' },
};

export const SPEEDS = {
  instant: { label: 'Minutes', long: 'Self-serve, works right away' },
  slow: { label: 'Days', long: 'Works, but takes time: a waiting period, a store visit, a support review' },
  appeal: { label: 'Appeal', long: 'Only by asking support and hoping they agree' },
};

export const WAY_KINDS = { signin: 'Sign in', recovery: 'Recovery', legacy: 'After death' };

const W = (key, label, kind, speed, steps, extra = {}) => ({ key, label, kind, speed, steps: steps.map(([l, types]) => ({ label: l, types })), ...extra });
const ME = { who: 'me' };
const HEIR = { who: 'heir' };

export const TEMPLATES = [
  {
    id: 'google', name: 'Google (Gmail)', category: 'platform', domains: ['google.com', 'gmail.com', 'youtube.com'],
    supports: ['backup_codes', 'security_key', 'passkey', 'recovery_contact', 'totp'],
    tips: [
      'A passkey skips 2-Step Verification entirely, so a synced passkey is a strong way back in.',
      'If you lose your second step with no backup codes, key or other signed-in device, recovery can take 3–5 business days, and a recovery email alone may not be accepted. There is no phone support.',
      'Changes to recovery phone or email take up to 7 days to count, so update them before you need them.',
      'Recovery contacts must be set up in advance and need about 14 days to become usable.',
    ],
    sources: ['https://support.google.com/accounts/answer/185834', 'https://support.google.com/accounts/answer/185839', 'https://support.google.com/accounts/answer/16590793', 'https://support.google.com/accounts/answer/3036546'],
    ways: [
      W('pw2sv', 'Password + 2-Step Verification', 'signin', 'instant', [['Password', ['password']], ['Second step', ['push', 'totp', 'sms', 'voice', 'security_key', 'backup_codes']]], { on: true }),
      W('pwonly', 'Password only (2-Step Verification off)', 'signin', 'instant', [['Password', ['password']]]),
      W('passkey', 'Passkey (skips 2-Step Verification)', 'signin', 'instant', [['Passkey', ['passkey']]]),
      W('session', 'Already signed in on a device', 'signin', 'instant', [['Signed-in device', ['session']]], { on: true }),
      W('rcontact', 'Recovery contact confirms it is you', 'recovery', 'instant', [['Recovery contact', ['recovery_contact']]]),
      W('rinfo', 'Account recovery with recovery phone or email', 'recovery', 'slow', [['Code to', ['sms', 'email_code']]], { ...ME, note: 'May work at once, or take 3–5 business days.' }),
      W('appeal', 'Account recovery questionnaire', 'recovery', 'appeal', [], ME),
      W('inactive', 'Inactive Account Manager sends your data', 'legacy', 'slow', [['Person you named', ['recovery_contact']]], { ...HEIR, dataOnly: true, note: 'A data download after months of inactivity, not a login.' }),
    ],
  },
  {
    id: 'apple', name: 'Apple Account (iCloud)', category: 'platform', domains: ['apple.com', 'icloud.com'],
    supports: ['recovery_key', 'recovery_contact', 'security_key'],
    tips: [
      'Any iPhone, iPad or Mac still signed in can reset your Apple Account password with that device\'s passcode, so the passcode is effectively a recovery key.',
      'Setting a recovery key turns off Account Recovery. Lose the key and your trusted devices and you are locked out for good.',
      'Account Recovery takes several days or more and Apple Support cannot speed it up.',
      'A Legacy Contact gets photos, messages, notes and files, but not passwords or passkeys in iCloud Keychain.',
    ],
    sources: ['https://support.apple.com/en-us/118574', 'https://support.apple.com/en-us/109345', 'https://support.apple.com/en-us/102641', 'https://support.apple.com/en-us/102631'],
    ways: [
      W('pwcode', 'Password + verification code', 'signin', 'instant', [['Password', ['password']], ['Code on a trusted device or number', ['trusted_device', 'sms', 'voice', 'security_key']]], { on: true }),
      W('session', 'Already signed in on a device', 'signin', 'instant', [['Signed-in device', ['session']]]),
      W('devreset', 'Reset the password on a signed-in Apple device', 'recovery', 'instant', [['Signed-in iPhone, iPad or Mac', ['trusted_device']]], { on: true }),
      W('rcontact', 'Recovery contact gives you a code', 'recovery', 'instant', [['Recovery contact', ['recovery_contact']]]),
      W('rkey', 'Recovery key + trusted number', 'recovery', 'instant', [['Recovery key', ['recovery_key']], ['Trusted number', ['sms', 'voice']]]),
      W('recovery', 'Account Recovery (waiting period)', 'recovery', 'slow', [], { ...ME, on: true, unlessWay: ['rkey'], unlessVia: ['security_key'], note: 'Needs any number that can receive texts. Switched off automatically if you set a recovery key or security keys, as Apple does.' }),
      W('legacy', 'Legacy Contact with access key', 'legacy', 'slow', [['Legacy Contact', ['recovery_contact']]], { ...HEIR, dataOnly: true, note: 'Photos, files and backups, not a login and not Keychain passwords.' }),
    ],
  },
  {
    id: 'microsoft', name: 'Microsoft account (Outlook)', category: 'platform', domains: ['microsoft.com', 'outlook.com', 'live.com', 'hotmail.com', 'xbox.com'],
    supports: ['recovery_key', 'security_key', 'passkey', 'totp'],
    tips: [
      'With two-step verification on and every method lost, Microsoft says it cannot help. Keep the 25-character recovery code.',
      'Microsoft is phasing out SMS codes for personal accounts. Add a verified email and a passkey.',
      'Replacing all security info puts the account in a 30-day restricted state.',
    ],
    sources: ['https://support.microsoft.com/en-us/account-billing/how-to-get-a-microsoft-account-recovery-code-2acc2f88-e37b-4b44-99d4-b4419f610013', 'https://support.microsoft.com/en-us/account-billing/what-does-security-info-change-is-still-pending-mean-cbd0f64f-02d9-45d2-90c3-2375e5a72e52'],
    ways: [
      W('pw2sv', 'Password + two-step verification', 'signin', 'instant', [['Password', ['password']], ['Second step', ['push', 'totp', 'email_code', 'sms', 'security_key']]], { on: true }),
      W('passwordless', 'Passwordless (Authenticator, passkey or key)', 'signin', 'instant', [['Approve or passkey', ['push', 'passkey', 'security_key']]]),
      W('emailcode', 'One-time code to your verified email', 'signin', 'instant', [['Email to', ['email_code']]]),
      W('session', 'Already signed in on a device', 'signin', 'instant', [['Signed-in device', ['session']]]),
      W('rcode', 'Recovery code', 'recovery', 'instant', [['Recovery code', ['recovery_key']]]),
      W('replace', 'Replace security info (30-day wait)', 'recovery', 'slow', [['Password', ['password']]], ME),
      W('appeal', 'Account recovery form (two-step off only)', 'recovery', 'appeal', [], { ...ME, on: true, unlessWay: ['pw2sv', 'passwordless'], note: 'Microsoft says it cannot help if two-step verification is on and every method is lost.' }),
    ],
  },
  {
    id: 'bitwarden', name: 'Bitwarden', category: 'password_manager', domains: ['bitwarden.com'],
    supports: ['backup_codes', 'security_key', 'totp', 'recovery_contact', 'passkey'],
    tips: [
      'Bitwarden cannot reset a forgotten master password or turn off your two-step login.',
      'Save the two-step login recovery code: with your master password it turns 2FA off.',
      'Without 2FA, new devices get an emailed code. If that email\'s password lives only in Bitwarden, you have a loop.',
      'Emergency access (Premium) lets a trusted Bitwarden user get in after a waiting period you choose.',
    ],
    sources: ['https://bitwarden.com/help/lost-two-step-device/', 'https://bitwarden.com/help/new-device-verification/', 'https://bitwarden.com/help/emergency-access/'],
    ways: [
      W('mp2fa', 'Master password + two-step login', 'signin', 'instant', [['Master password', ['master_password']], ['Two-step login', ['totp', 'security_key', 'passkey', 'email_code']]], { on: true }),
      W('mpemail', 'Master password + new-device email code (no 2FA)', 'signin', 'instant', [['Master password', ['master_password']], ['Email code', ['email_code']]]),
      W('unlocked', 'Vault still logged in on a device', 'signin', 'instant', [['Logged-in app', ['session']], ['Master password or PIN', ['master_password', 'pin']]], { on: true }),
      W('withdevice', 'Approve with a logged-in device', 'signin', 'instant', [['Logged-in app', ['push']], ['Master password', ['master_password']]]),
      W('rcode', 'Recovery code turns off two-step login', 'recovery', 'instant', [['Master password', ['master_password']], ['Recovery code', ['backup_codes']]]),
      W('emergency', 'Emergency access', 'legacy', 'slow', [['Emergency contact', ['recovery_contact']]], HEIR),
    ],
  },
  {
    id: 'onepassword', name: '1Password', category: 'password_manager', domains: ['1password.com'],
    supports: ['backup_codes', 'security_key', 'totp', 'recovery_contact'],
    tips: [
      'A new device needs your account password AND your 34-character Secret Key. 1Password has no copy of the Secret Key; it is on your Emergency Kit and signed-in devices.',
      'A recovery code gives you a new password and Secret Key, but two-factor stays on.',
      'There is no built-in emergency access: 1Password suggests giving your Emergency Kit to someone you trust.',
    ],
    sources: ['https://support.1password.com/secret-key/', 'https://support.1password.com/recovery-codes/', 'https://support.1password.com/recovery/'],
    ways: [
      W('pwkey', 'Account password + Secret Key', 'signin', 'instant', [['Account password', ['master_password']], ['Secret Key', ['secret_key']]], { on: true }),
      W('pwkey2fa', 'Account password + Secret Key + two-factor', 'signin', 'instant', [['Account password', ['master_password']], ['Secret Key', ['secret_key']], ['Two-factor', ['totp', 'security_key']]]),
      W('unlocked', 'Still signed in on a device', 'signin', 'instant', [['Signed-in app', ['session']], ['Account password', ['master_password', 'pin']]], { on: true }),
      W('rcode', 'Recovery code (two-factor off; needs your email)', 'recovery', 'instant', [['Recovery code', ['backup_codes']], ['Email', ['email_code']]]),
      W('rcode2fa', 'Recovery code + two-factor (two-factor stays on)', 'recovery', 'instant', [['Recovery code', ['backup_codes']], ['Email', ['email_code']], ['Two-factor', ['totp', 'security_key']]]),
      W('family', 'Family organizer recovers you', 'recovery', 'slow', [['Organizer', ['recovery_contact']], ['Email', ['email_code']]]),
    ],
  },
  {
    id: 'applepw', name: 'Apple Passwords (iCloud Keychain)', category: 'password_manager', domains: [],
    supports: ['recovery_contact', 'recovery_key'],
    tips: [
      'Keychain is always end-to-end encrypted. Getting your Apple Account back is not enough: a new device must be approved by another Keychain device, or you need the passcode of a previous device (10 tries).',
      'A Legacy Contact does not get Keychain passwords or passkeys.',
    ],
    sources: ['https://support.apple.com/guide/security/secure-icloud-keychain-recovery-secdeb202947/web', 'https://support.apple.com/en-us/102631'],
    ways: [
      W('unlocked', 'Open on an Apple device already in Keychain', 'signin', 'instant', [['Unlocked Apple device', ['session']]], { on: true }),
      W('escrow', 'Keychain recovery on a new device', 'recovery', 'instant', [['Apple Account', ['account']], ['Passcode of a previous device', ['pin']], ['Text to trusted number', ['sms']]], { on: true, note: '10 tries only.' }),
      W('rcontact', 'Recovery contact helps you back in', 'recovery', 'instant', [['Apple Account', ['account']], ['Recovery contact', ['recovery_contact']]]),
    ],
  },
  {
    id: 'lastpass', name: 'LastPass', category: 'password_manager', domains: ['lastpass.com'],
    supports: ['totp', 'security_key', 'recovery_contact'],
    tips: ['Self-service recovery needs a device or browser that logged in before. Support cannot reset the master password.'],
    sources: ['https://support.lastpass.com/s/document-item?language=en_US&bundleId=lastpass&topicId=LastPass%2Frecover-master-password.html'],
    ways: [
      W('mpmfa', 'Master password + multifactor', 'signin', 'instant', [['Master password', ['master_password']], ['Multifactor', ['push', 'totp', 'security_key', 'sms']]], { on: true }),
      W('unlocked', 'Still logged in on a device', 'signin', 'instant', [['Logged-in app', ['session']]]),
      W('recover', 'Account recovery on a browser you used before', 'recovery', 'instant', [['Code to', ['email_code', 'sms']], ['Browser that logged in before', ['trusted_device']]]),
      W('emergency', 'Emergency access', 'legacy', 'slow', [['Emergency contact', ['recovery_contact']]], HEIR),
    ],
  },
  {
    id: 'protonpass', name: 'Proton Pass', category: 'password_manager', domains: ['pass.proton.me'],
    supports: ['backup_codes', 'security_key', 'totp', 'recovery_key', 'recovery_contact'],
    tips: [
      'Resetting your password by email or phone gets you in, but your Pass vault stays encrypted unless you have the recovery phrase, a recovery file, a signed-in device or a recovery contact.',
      'Emergency Access (paid plans) lets up to 5 Proton users get in after a wait you choose.',
    ],
    sources: ['https://proton.me/support/set-account-recovery-methods', 'https://proton.me/support/emergency-access'],
    ways: [
      W('pw2fa', 'Password + two-factor', 'signin', 'instant', [['Password', ['master_password']], ['Two-factor', ['totp', 'security_key', 'backup_codes']]], { on: true }),
      W('pwonly', 'Password only', 'signin', 'instant', [['Password', ['master_password']]]),
      W('session', 'Still signed in on a device', 'signin', 'instant', [['Signed-in device', ['session']]], { on: true }),
      W('phrase', 'Recovery phrase (restores data too)', 'recovery', 'instant', [['Recovery phrase', ['recovery_key']]]),
      W('emergency', 'Emergency Access', 'legacy', 'slow', [['Emergency contact', ['recovery_contact']]], HEIR),
    ],
  },
  {
    id: 'proton', name: 'Proton Mail', category: 'email', domains: ['proton.me', 'protonmail.com'],
    supports: ['backup_codes', 'security_key', 'totp', 'recovery_key', 'recovery_contact'],
    tips: ['Reset by recovery email or phone restores the login, but old encrypted mail stays locked without the recovery phrase.', 'No SMS two-factor: authenticator app or security keys only.'],
    sources: ['https://proton.me/support/set-account-recovery-methods', 'https://proton.me/support/lost-two-factor-authentication-2fa'],
    ways: [
      W('pw2fa', 'Password + two-factor', 'signin', 'instant', [['Password', ['password']], ['Two-factor', ['totp', 'security_key', 'backup_codes']]], { on: true }),
      W('pwonly', 'Password only', 'signin', 'instant', [['Password', ['password']]]),
      W('session', 'Already signed in on a device', 'signin', 'instant', [['Signed-in device', ['session']]], { on: true }),
      W('phrase', 'Recovery phrase', 'recovery', 'instant', [['Recovery phrase', ['recovery_key']]]),
      W('reset', 'Reset by recovery email or phone (old mail stays locked)', 'recovery', 'instant', [['Code to', ['email_code', 'sms']]]),
      W('emergency', 'Emergency Access', 'legacy', 'slow', [['Emergency contact', ['recovery_contact']]], HEIR),
    ],
  },
  {
    id: 'yahoo', name: 'Yahoo Mail', category: 'email', domains: ['yahoo.com', 'aol.com'],
    supports: ['backup_codes', 'security_key', 'totp'],
    tips: ['If Sign-in Helper can\'t reach your recovery phone or email, Yahoo says you may not be able to regain access.'],
    sources: ['https://help.yahoo.com/kb/SLN5013.html', 'https://help.yahoo.com/kb/SLN2051.html'],
    ways: [
      W('pw2sv', 'Password + two-step verification', 'signin', 'instant', [['Password', ['password']], ['Second step', ['sms', 'totp', 'push', 'security_key']]], { on: true }),
      W('pwonly', 'Password only', 'signin', 'instant', [['Password', ['password']]]),
      W('session', 'Already signed in on a device', 'signin', 'instant', [['Signed-in device', ['session']]]),
      W('helper', 'Sign-in Helper with recovery phone or email', 'recovery', 'instant', [['Code to', ['sms', 'email_code']]], { on: true }),
      W('bcode', 'Security-key backup code', 'recovery', 'instant', [['Backup code', ['backup_codes']]]),
    ],
  },
  {
    id: 'email', name: 'Other email provider', category: 'email', domains: ['fastmail.com', 'zoho.com', 'gmx.com', 'mail.com', 'tutanota.com', 'tuta.com'],
    supports: ['backup_codes', 'totp', 'security_key', 'recovery_key'],
    tips: ['Fastmail: print the account recovery code; without it and your 2FA devices you may be locked out permanently.'],
    sources: ['https://www.fastmail.help/hc/en-us/articles/1500000279601-I-can-t-log-in'],
    ways: [
      W('pw2fa', 'Password + two-factor', 'signin', 'instant', [['Password', ['password']], ['Second step', ['totp', 'security_key', 'sms', 'push']]], { on: true }),
      W('pwonly', 'Password only', 'signin', 'instant', [['Password', ['password']]]),
      W('passkey', 'Passkey', 'signin', 'instant', [['Passkey', ['passkey']]]),
      W('session', 'Already signed in on a device', 'signin', 'instant', [['Signed-in device', ['session']]]),
      W('rcode', 'Recovery code', 'recovery', 'instant', [['Recovery code', ['recovery_key', 'backup_codes']]]),
      W('rinfo', 'Recovery by phone or another email (two-factor off)', 'recovery', 'instant', [['Code to', ['sms', 'email_code']]]),
      W('rinfo2fa', 'Recovery tool with two-factor on (two separate proofs)', 'recovery', 'instant', [['Code to', ['sms', 'email_code']], ['Second proof', ['password', 'totp', 'security_key']]], { note: 'Fastmail: with 2FA on, a phone number alone is not enough. Resets from an unfamiliar device wait 24 hours.' }),
      W('appeal', 'Support review', 'recovery', 'appeal', [], ME),
    ],
  },
  {
    id: 'carrier', name: 'Mobile carrier', category: 'carrier', domains: ['verizon.com', 'att.com', 't-mobile.com', 'vodafone.com', 'ee.co.uk', 'o2.co.uk', 'three.co.uk', 'rogers.com', 'bell.ca', 'telus.com', 'telstra.com.au', 'optus.com.au'],
    supports: ['recovery_contact', 'pin'],
    tips: [
      'Sign-in and reset codes usually go to the very number you are trying to recover.',
      'Moving your number to a new eSIM online usually needs the old phone. Without it: a store visit with photo ID, or a call with your account PIN and a SIM by mail.',
      'SIM-swap locks (SIM Protection, Wireless Account Lock) are often toggled only in the carrier app and must be off before a SIM change.',
    ],
    sources: ['https://www.verizon.com/support/my-verizon-app-esim-faqs/', 'https://www.att.com/support/article/wireless/KM1455633/', 'https://www.t-mobile.com/support/plans-features/sim-protection/'],
    ways: [
      W('pwsms', 'Password + code to your number', 'signin', 'instant', [['Password', ['password']], ['Code', ['sms', 'push']]], { on: true }),
      W('session', 'Carrier app signed in on a device', 'signin', 'instant', [['Signed-in device', ['session']]]),
      W('store', 'Store visit with photo ID', 'recovery', 'slow', [['Photo ID', ['photo_id']]], { inPerson: true, ...ME, on: true }),
      W('call', 'Call support with your account PIN', 'recovery', 'slow', [['Account PIN', ['pin']]], ME),
      W('manager', 'An account manager on your plan acts for you', 'recovery', 'slow', [['Account manager', ['recovery_contact']]]),
    ],
  },
  {
    id: 'bank', name: 'Bank', category: 'bank', domains: ['chase.com', 'bankofamerica.com', 'wellsfargo.com', 'citi.com', 'capitalone.com', 'usbank.com', 'pnc.com', 'hsbc.com', 'barclays.co.uk', 'lloydsbank.com', 'rbc.com', 'td.com'],
    supports: ['security_key', 'passkey'],
    tips: [
      'Banks usually fall back to a phone call where you answer knowledge questions (SSN, account or card numbers), or a branch visit with ID.',
      'Keep your account and card numbers somewhere other than your wallet.',
    ],
    sources: ['https://www.chase.com/digital/resources/privacy-security/security/how-you-can-protect', 'https://www.chase.com/personal/banking/education/basics/trusteddevice'],
    ways: [
      W('pwcode', 'Password + code', 'signin', 'instant', [['Password', ['password']], ['Code', ['sms', 'voice', 'email_code', 'push']]], { on: true }),
      W('passkey', 'Passkey', 'signin', 'instant', [['Passkey', ['passkey']]]),
      W('app', 'Bank app signed in on a device', 'signin', 'instant', [['Signed-in device', ['session']]]),
      W('phone', 'Call the bank and answer identity questions', 'recovery', 'slow', [], { ...ME, on: true }),
      W('branch', 'Visit a branch with photo ID', 'recovery', 'slow', [['Photo ID', ['photo_id']]], { inPerson: true, ...ME }),
      W('estate', 'Estate process (death certificate, executor papers)', 'legacy', 'slow', [['Executor', ['recovery_contact']]], { ...HEIR, dataOnly: true, note: 'Funds go to the estate or beneficiaries; nobody gets your login.' }),
    ],
  },
  {
    id: 'paypal', name: 'PayPal', category: 'payments', domains: ['paypal.com'],
    supports: ['totp', 'passkey'],
    tips: ['No backup codes for 2-step verification. The security check can use your email, phone, or questions about you.'],
    sources: ['https://www.paypal.com/us/cshelp/article/why-do-i-have-to-complete-a-security-check-help171', 'https://www.paypal.com/us/cshelp/article/what-is-2-step-verification-help167'],
    ways: [
      W('pw2sv', 'Password + 2-step verification', 'signin', 'instant', [['Password', ['password']], ['Second step', ['totp', 'sms', 'push']]], { on: true }),
      W('passkey', 'Passkey', 'signin', 'instant', [['Passkey', ['passkey']]]),
      W('session', 'App signed in on a device', 'signin', 'instant', [['Signed-in device', ['session']]]),
      W('check', 'Security check by email or text', 'recovery', 'instant', [['Code to', ['email_code', 'sms']]]),
      W('phone', 'Call customer service', 'recovery', 'slow', [], ME),
    ],
  },
  {
    id: 'venmo', name: 'Venmo / Cash App', category: 'payments', domains: ['venmo.com', 'cash.app'],
    supports: [],
    tips: ['New-device sign-in sends a code to your phone number (Cash App can use email instead). Keep your linked bank and card numbers handy for support.'],
    sources: ['https://help.venmo.com/cs/articles/lost-or-stolen-phone-vhel242', 'https://cash.app/help/us/en-us/3130-access-old-account'],
    ways: [
      W('app', 'App signed in on your phone', 'signin', 'instant', [['Signed-in device', ['session']]], { on: true }),
      W('code', 'Password + code by text', 'signin', 'instant', [['Password', ['password']], ['Code', ['sms']]], { on: true }),
      W('email', 'Code or link by email', 'signin', 'instant', [['Email to', ['email_code']]]),
      W('support', 'Support with bank or card details', 'recovery', 'slow', [], ME),
    ],
  },
  {
    id: 'coinbase', name: 'Coinbase', category: 'crypto', domains: ['coinbase.com'],
    supports: ['security_key', 'passkey', 'totp', 'recovery_contact'],
    tips: [
      'No backup codes. Coinbase recommends two security keys, or a passkey plus a key or push.',
      'Account recovery needs your password and a government ID, takes up to 24 hours, and blocks sending funds for 24 hours after.',
      'A new device must be confirmed from a link in your email.',
    ],
    sources: ['https://help.coinbase.com/en/coinbase/managing-my-account/get-back-into-my-account/account-recovery-lost-email-2step-verification'],
    ways: [
      W('pw2sv', 'Password + 2-step verification', 'signin', 'instant', [['Password', ['password']], ['Second step', ['totp', 'security_key', 'passkey', 'push', 'sms']], ['New-device email', ['email_code']]], { on: true }),
      W('session', 'App signed in on a device', 'signin', 'instant', [['Signed-in device', ['session']]]),
      W('contacts', 'Trusted contacts approve recovery', 'recovery', 'instant', [['First trusted contact', ['recovery_contact']], ['Second trusted contact', ['recovery_contact']], ['Password', ['password']]], { note: 'Coinbase needs 2 to 5 contacts and a majority to approve. Put a different person in each step.' }),
      W('idv', 'Account recovery with photo ID', 'recovery', 'slow', [['Password', ['password']], ['Photo ID', ['photo_id']]], { ...ME, on: true }),
    ],
  },
  {
    id: 'github', name: 'GitHub', category: 'developer', domains: ['github.com'],
    supports: ['backup_codes', 'security_key', 'passkey', 'totp'],
    tips: ['Without recovery codes, a recovery request needs your password plus a verified device, SSH key or token, then a 3–5 day wait.'],
    sources: ['https://docs.github.com/en/authentication/securing-your-account-with-two-factor-authentication-2fa/recovering-your-account-if-you-lose-your-2fa-credentials'],
    ways: [
      W('pw2fa', 'Password + two-factor', 'signin', 'instant', [['Password', ['password']], ['Two-factor', ['totp', 'security_key', 'passkey', 'sms', 'push']]], { on: true }),
      W('passkey', 'Passkey', 'signin', 'instant', [['Passkey', ['passkey']]]),
      W('session', 'Already signed in on a device', 'signin', 'instant', [['Signed-in device', ['session']]]),
      W('rcodes', 'Recovery codes', 'recovery', 'instant', [['Password', ['password']], ['Recovery code', ['backup_codes']]]),
      W('recovery', 'Recovery request (3–5 day wait)', 'recovery', 'slow', [['Password', ['password']], ['Verified device, SSH key or token', ['session', 'any']], ['Email', ['email_code']]], ME),
    ],
  },
  {
    id: 'meta', name: 'Facebook / Instagram', category: 'social', domains: ['facebook.com', 'instagram.com', 'meta.com', 'threads.net'],
    supports: ['backup_codes', 'security_key', 'totp'],
    tips: ['Identity checks use a video selfie or photo ID and compare against your profile photos.', 'Facebook legacy contacts manage a memorial page; they cannot log in.'],
    sources: ['https://www.facebook.com/help/148233965247823', 'https://www.facebook.com/help/instagram/566810106808145'],
    ways: [
      W('pw2fa', 'Password + two-factor', 'signin', 'instant', [['Password', ['password']], ['Two-factor', ['totp', 'sms', 'security_key', 'backup_codes', 'push']]], { on: true }),
      W('passkey', 'Passkey', 'signin', 'instant', [['Passkey', ['passkey']]]),
      W('session', 'App signed in on a device', 'signin', 'instant', [['Signed-in device', ['session']]], { on: true }),
      W('reset', 'Reset by email or text', 'recovery', 'instant', [['Code to', ['email_code', 'sms']]]),
      W('idv', 'Video selfie or ID check', 'recovery', 'appeal', [], ME),
    ],
  },
  {
    id: 'x', name: 'X (Twitter)', category: 'social', domains: ['x.com', 'twitter.com'],
    supports: ['backup_codes', 'security_key', 'totp'],
    tips: ['Without a session or backup code, X only offers a support request with no timeline.'],
    sources: ['https://help.x.com/en/managing-your-account/two-factor-authentication'],
    ways: [
      W('pw2fa', 'Password + two-factor', 'signin', 'instant', [['Password', ['password']], ['Two-factor', ['totp', 'security_key', 'sms', 'backup_codes']]], { on: true }),
      W('passkey', 'Passkey', 'signin', 'instant', [['Passkey', ['passkey']]]),
      W('session', 'App signed in on a device', 'signin', 'instant', [['Signed-in device', ['session']]], { on: true }),
      W('appeal', 'Support request', 'recovery', 'appeal', [], ME),
    ],
  },
  {
    id: 'linkedin', name: 'LinkedIn', category: 'social', domains: ['linkedin.com'],
    supports: ['totp', 'passkey'],
    tips: ['No backup codes. Without a signed-in session, you verify with a government ID through Persona.'],
    sources: ['https://www.linkedin.com/help/linkedin/answer/a1381088/turn-two-step-verification-on-and-off'],
    ways: [
      W('pw2sv', 'Password + two-step verification', 'signin', 'instant', [['Password', ['password']], ['Second step', ['totp', 'sms']]], { on: true }),
      W('passkey', 'Passkey', 'signin', 'instant', [['Passkey', ['passkey']]]),
      W('session', 'Signed in on a device', 'signin', 'instant', [['Signed-in device', ['session']]], { on: true }),
      W('idv', 'Verify identity with photo ID', 'recovery', 'slow', [['Photo ID', ['photo_id']]], ME),
    ],
  },
  {
    id: 'discord', name: 'Discord / Reddit', category: 'social', domains: ['discord.com', 'reddit.com'],
    supports: ['backup_codes', 'totp'],
    tips: ['Discord support cannot remove two-factor. Without backup codes or a signed-in client, the account is gone.'],
    sources: ['https://support.discord.com/hc/en-us/articles/115001221072-Lost-Two-Factor-Codes', 'https://support.reddithelp.com/hc/en-us/articles/360043047652'],
    ways: [
      W('pw2fa', 'Password + authenticator code', 'signin', 'instant', [['Password', ['password']], ['Two-factor', ['totp', 'sms', 'security_key', 'backup_codes']]], { on: true }),
      W('pwonly', 'Password only', 'signin', 'instant', [['Password', ['password']]]),
      W('session', 'Signed in on a device', 'signin', 'instant', [['Signed-in device', ['session']]], { on: true }),
      W('reset', 'Reset link by email (no 2FA)', 'recovery', 'instant', [['Email to', ['email_code']]]),
    ],
  },
  {
    id: 'whatsapp', name: 'WhatsApp / Signal', category: 'messaging', domains: ['whatsapp.com', 'signal.org'],
    supports: ['pin'],
    tips: ['The phone number is the account: a new phone needs a code by text to it. Chat history needs a backup.', 'Forgot the two-step PIN and no email? Wait 7 days.'],
    sources: ['https://faq.whatsapp.com/1082491466048496/', 'https://faq.whatsapp.com/1131652977717250/'],
    ways: [
      W('phone', 'Still installed on your phone', 'signin', 'instant', [['Phone', ['session']]], { on: true }),
      W('reregister', 'Register again with a text code', 'recovery', 'instant', [['Text or call to', ['sms', 'voice']], ['Two-step PIN', ['pin', 'email_code']]], { on: true }),
      W('wait', 'Register again, wait 7 days to reset the PIN', 'recovery', 'slow', [['Text or call to', ['sms', 'voice']]]),
    ],
  },
  {
    id: 'amazon', name: 'Amazon', category: 'shopping', domains: ['amazon.com', 'amazon.co.uk', 'amazon.de', 'amazon.ca', 'amazon.fr', 'amazon.in'],
    supports: ['totp', 'passkey'],
    tips: ['Losing your second step means an ID-photo check that takes up to about 48 hours.'],
    sources: ['https://www.amazon.com/gp/help/customer/display.html?nodeId=GU3SL3GTHLHPDQ2H'],
    ways: [
      W('pw2sv', 'Password + two-step verification', 'signin', 'instant', [['Password', ['password']], ['Second step', ['totp', 'sms', 'voice', 'push']]], { on: true }),
      W('passkey', 'Passkey', 'signin', 'instant', [['Passkey', ['passkey']]]),
      W('session', 'Already signed in on a device', 'signin', 'instant', [['Signed-in device', ['session']]]),
      W('otp', 'One-time code to email or phone (no 2-step)', 'signin', 'instant', [['Code to', ['email_code', 'sms']]]),
      W('idv', 'Two-step recovery with photo ID', 'recovery', 'slow', [['Photo ID', ['photo_id']]], ME),
    ],
  },
  {
    id: 'aws', name: 'AWS root account', category: 'cloud', domains: ['aws.amazon.com'],
    supports: ['security_key', 'totp', 'passkey'],
    tips: ['Lost root MFA? Sign in with alternative factors: an email to the root address AND a phone call to the primary contact number.'],
    sources: ['https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_mfa_lost-or-broken.html'],
    ways: [
      W('pwmfa', 'Password + MFA', 'signin', 'instant', [['Password', ['password']], ['MFA', ['totp', 'security_key', 'passkey']]], { on: true }),
      W('altfactor', 'Alternative factors: email + phone call', 'recovery', 'instant', [['Password', ['password']], ['Email', ['email_code']], ['Call to', ['voice']]], { on: true }),
      W('appeal', 'Lost MFA support form', 'recovery', 'appeal', [], ME),
    ],
  },
  {
    id: 'registrar', name: 'Domain registrar', category: 'cloud', domains: ['namecheap.com', 'godaddy.com', 'cloudflare.com', 'porkbun.com', 'squarespace.com', 'hover.com', 'gandi.net'],
    supports: ['backup_codes', 'totp', 'security_key'],
    tips: ['Losing your registrar can take your own domain\'s email with it: if your email is on your domain, that is a loop.'],
    sources: ['https://www.namecheap.com/support/knowledgebase/article.aspx/10073/45/', 'https://developers.cloudflare.com/fundamentals/user-profiles/account-recovery/'],
    ways: [
      W('pw2fa', 'Password + two-factor', 'signin', 'instant', [['Password', ['password']], ['Two-factor', ['totp', 'security_key', 'push', 'sms']]], { on: true }),
      W('session', 'Already signed in on a device', 'signin', 'instant', [['Signed-in device', ['session']]]),
      W('bcodes', 'Password + backup code', 'recovery', 'instant', [['Password', ['password']], ['Backup code', ['backup_codes']]]),
      W('idv', 'Support with ID documents', 'recovery', 'slow', [['Photo ID', ['photo_id']], ['Email', ['email_code']]], ME),
    ],
  },
  {
    id: 'logingov', name: 'Login.gov', category: 'government', domains: ['login.gov'],
    supports: ['backup_codes', 'security_key', 'totp', 'passkey'],
    tips: [
      'Login.gov cannot restore access if you lose every MFA method: you delete the account, wait 24 hours, and verify your identity again.',
      'The personal key only restores your verified identity data after a password reset. It does not replace MFA.',
      'Enroll two or more MFA methods.',
    ],
    sources: ['https://www.login.gov/help/manage-your-account/delete-your-account/', 'https://www.login.gov/help/create-account/authentication-methods/'],
    ways: [
      W('pwmfa', 'Password + MFA', 'signin', 'instant', [['Password', ['password']], ['MFA', ['totp', 'security_key', 'passkey', 'sms', 'voice', 'backup_codes']]], { on: true }),
      W('redo', 'Delete, wait 24 hours, verify identity again', 'recovery', 'slow', [['Email', ['email_code']], ['Photo ID', ['photo_id']]], { ...ME, on: true }),
    ],
  },
  {
    id: 'idme', name: 'ID.me', category: 'government', domains: ['id.me'],
    supports: ['recovery_key', 'security_key', 'totp', 'passkey'],
    tips: ['ID.me can re-verify you with a live selfie and photo ID, but you need your password and email first.'],
    sources: ['https://help.id.me/hc/en-us/articles/34192861849623', 'https://help.id.me/hc/en-us/articles/360017969334-Get-and-use-your-ID-me-recovery-code'],
    ways: [
      W('pwmfa', 'Password + MFA', 'signin', 'instant', [['Password', ['password']], ['MFA', ['push', 'totp', 'security_key', 'passkey', 'sms', 'voice']]], { on: true }),
      W('rcode', 'Password + recovery code', 'recovery', 'instant', [['Password', ['password']], ['Recovery code', ['recovery_key']]]),
      W('idv', 'MFA recovery with a live selfie and photo ID', 'recovery', 'instant', [['Password', ['password']], ['Email', ['email_code']], ['Photo ID', ['photo_id']]], { ...ME, on: true }),
    ],
  },
  {
    id: 'generic', name: 'Other account', category: 'other', domains: [],
    supports: ['backup_codes', 'totp', 'security_key', 'passkey'],
    tips: [],
    sources: [],
    ways: [
      W('pw2fa', 'Password + second step', 'signin', 'instant', [['Password', ['password']], ['Second step', ['totp', 'sms', 'push', 'security_key', 'passkey', 'email_code', 'backup_codes']]]),
      W('pwonly', 'Password only', 'signin', 'instant', [['Password', ['password']]], { on: true }),
      W('passkey', 'Passkey', 'signin', 'instant', [['Passkey', ['passkey']]]),
      W('session', 'Already signed in on a device', 'signin', 'instant', [['Signed-in device', ['session']]]),
      W('remail', 'Reset by email', 'recovery', 'instant', [['Email to', ['email_code']]], { on: true }),
      W('rsms', 'Reset by text', 'recovery', 'instant', [['Text to', ['sms']]]),
      W('appeal', 'Support appeal', 'recovery', 'appeal', [], ME),
    ],
  },
  {
    id: 'email-reset', name: 'Accounts that reset by email', category: 'other', domains: [], bulk: true,
    supports: [],
    tips: ['Most shopping, streaming and forum accounts: a saved password, or a reset link to your email. Set roughly how many there are.'],
    sources: [],
    ways: [
      W('pw', 'Saved password', 'signin', 'instant', [['Password', ['password']]], { on: true }),
      W('reset', 'Reset link by email', 'recovery', 'instant', [['Email', ['email_code']]], { on: true }),
    ],
  },
];

export const TEMPLATE_BY_ID = new Map(TEMPLATES.map(t => [t.id, t]));

// Authenticator apps and where their codes can be restored from (checked Sept 2026).
export const AUTHAPP_PRESETS = [
  { name: 'Google Authenticator', devices: ['phone', 'tablet'], backupHint: 'Syncs to your Google account if you signed in to the app. Without sync, codes live only on the phone.', backupTemplate: 'google' },
  { name: 'Microsoft Authenticator', devices: ['phone', 'tablet'], backupHint: 'Android backs up to your Microsoft account; iPhone backs up to iCloud. Restores only to the same platform.', backupTemplate: 'microsoft' },
  { name: 'Authy', devices: ['phone', 'tablet'], backupHint: 'Tied to your phone number; encrypted backups also need your backups password. Desktop apps ended in 2024.', backupTemplate: null },
  { name: 'Aegis', devices: ['phone', 'tablet'], os: 'android', backupHint: 'No cloud: automatic encrypted backups to a folder you choose, restored with the vault password.', backupTemplate: null },
  { name: 'Ente Auth', devices: ['phone', 'tablet', 'computer'], backupHint: 'End-to-end encrypted sync to your Ente account; keep the 24-word recovery key offline.', backupTemplate: null },
  { name: '2FAS', devices: ['phone', 'tablet'], backupHint: 'Optional sync to Google Drive (Android) or iCloud (iPhone).', backupTemplate: null },
  { name: 'Apple Passwords', devices: ['phone', 'tablet', 'computer'], os: 'apple', backupHint: 'Codes sync with iCloud Keychain through your Apple Account.', backupTemplate: 'apple' },
];

// Can this step type take this thing or account?
export function accepts(type, item) {
  const v = Object.hasOwn(VIA, type) ? VIA[type] : null;
  if (!v || !item) return false;
  const isAccount = !!item.ways;
  return v.accepts.some(a => a === '*' || (isAccount ? a === 'acct:*' || a === 'acct:' + item.category : a === item.kind));
}

// The first step type (in the step's own order) that can take this item.
export function inferVia(types, item) {
  return (types || []).find(t => accepts(t, item)) || null;
}

export function templateForDomain(domain) {
  if (!domain) return null;
  const d = domain.toLowerCase();
  let best = null;
  for (const t of TEMPLATES) {
    for (const x of t.domains) {
      if ((d === x || d.endsWith('.' + x)) && (!best || x.length > best.len)) best = { t, len: x.length };
    }
  }
  return best ? best.t : null;
}

// Build a fresh account from a template. Ways marked `on` start enabled; the rest can be
// switched on.
export function accountFromTemplate(template, id, overrides = {}) {
  let n = 0;
  return {
    id,
    name: overrides.name || template.name,
    template: template.id,
    category: template.category,
    important: overrides.important ?? ['platform', 'email', 'password_manager', 'bank', 'crypto', 'carrier'].includes(template.category),
    count: overrides.count > 1 ? overrides.count : (template.bulk ? 20 : undefined),
    ways: template.ways.map(w => ({
      id: w.key || 'w' + (n++),
      key: w.key,
      label: w.label,
      kind: w.kind,
      speed: w.speed,
      inPerson: !!w.inPerson,
      who: w.who || 'both',
      note: w.note || '',
      ...(w.dataOnly ? { dataOnly: true } : {}),
      ...(w.unlessWay ? { unlessWay: [...w.unlessWay] } : {}),
      ...(w.unlessVia ? { unlessVia: [...w.unlessVia] } : {}),
      enabled: !!w.on,
      steps: w.steps.map(s => ({ label: s.label, types: [...s.types], anyOf: [] })),
    })),
  };
}

// What the person you leave behind can ask each provider for. Taken from the providers' own
// help pages (September 2026, see research/services_condensed.txt). Shown in the handover guide.
export const LEGACY_BY_TEMPLATE = {
  google: 'If Inactive Account Manager was set up, the people named get a download link after the inactivity period. Otherwise family can use Google\'s deceased-user request to close the account or ask for some data; each case is reviewed and nothing is guaranteed. Google never gives out passwords.',
  apple: 'A Legacy Contact can request access with the access key and a death certificate. They get photos, messages, notes, files and backups, but not iCloud Keychain passwords or passkeys. Without a Legacy Contact, Apple needs a court order.',
  microsoft: 'Microsoft has no legacy feature and releases data only under a valid court order. Outlook.com and OneDrive freeze after a year without use.',
  bitwarden: 'Emergency Access (Premium): a named Bitwarden user can request view or takeover access after the waiting period the owner chose.',
  onepassword: 'No emergency-access feature. 1Password\'s advice is to leave the printed Emergency Kit with a trusted person or with the will. In a Families account, an organizer can recover a member.',
  lastpass: 'Emergency Access (Premium or Families): a named LastPass user can request access after the owner\'s waiting period.',
  applepw: 'A Legacy Contact does not get iCloud Keychain passwords or passkeys. The only ways in are a device that is still signed in and unlocked, or Keychain recovery with a previous device\'s passcode.',
  protonpass: 'Emergency Access (paid plans): named contacts with Proton accounts can request access after the wait the owner chose.',
  proton: 'Emergency Access (paid plans): named contacts with Proton accounts can request access after the wait the owner chose.',
  yahoo: 'Yahoo accounts can\'t be transferred. The executor can ask for closure, and sometimes content, with a letter, the Yahoo ID and proof of authority.',
  email: 'Most smaller providers, Fastmail included, have no legacy feature. Access usually comes through a recovery email set to someone trusted, or through the executor\'s legal authority.',
  carrier: 'Carriers don\'t hand over logins. The executor or a family member can move the number to their own account or cancel it, usually with a death certificate. Keep the number active while other accounts still send codes to it.',
  bank: 'No online access for family. Report the death: money goes to joint owners or named beneficiaries, or to the estate with a death certificate and letters testamentary.',
  paypal: 'The executor sends PayPal a death certificate, photo ID, proof of executor status and a W-9. PayPal closes the account and sends the balance to the estate.',
  venmo: 'Venmo and Cash App don\'t hand over access. Family contacts support with a death certificate; Cash App\'s estate services also need photo ID and probate or small-estate papers.',
  coinbase: 'No beneficiary option. The claimant opens their own Coinbase account and submits the Executor Services form with a death certificate and probate documents.',
  github: 'A named account successor can take over repositories. Otherwise an authorized person with documents can ask GitHub to decide what happens, case by case.',
  meta: 'Facebook: a legacy contact can manage a memorialized profile but can\'t log in or read messages. Instagram: anyone can request memorialization with proof of death; family can request removal.',
  x: 'X gives no access. Family or the estate can ask for deactivation with photo ID and a death certificate.',
  linkedin: 'Anyone can report a member as deceased to memorialize the profile. Closure needs court-issued letters.',
  discord: 'Discord and Reddit give no access. Family can ask Discord to delete the account with a death certificate. Whoever controls the account\'s email can reset the password.',
  whatsapp: 'No next-of-kin process. Messages live on the phone and in its Google or iCloud backup, so you need the phone, the same number and any backup password.',
  amazon: 'Amazon bereavement support (bereavement-support-cs@amazon.com) can end subscriptions and close the account with a death certificate and the account\'s email or phone.',
  aws: 'No legacy feature. In practice access follows the root email inbox, the account phone number and the password.',
  registrar: 'Renew domains so they don\'t lapse. GoDaddy\'s estate route is the Regain Access form with a death certificate, proof of authority and photo ID; other registrars handle it through support.',
  logingov: 'Login.gov can\'t act for survivors. Deal with each agency (SSA, VA and others) directly.',
  idme: 'No survivor process. Deal with each agency (IRS, SSA, VA, your state) directly.',
  'email-reset': 'These reset by email: whoever can get into that email can usually get in here.',
};

// What the owner wants done with each account.
export const WISHES = {
  keep: 'Keep it running',
  save: 'Save what matters, then close it',
  close: 'Close it',
  money: 'Move the money out',
  memorial: 'Memorialize it',
  transfer: 'Hand it over to someone',
};
