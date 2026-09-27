// Dev helper: list quick-start answer combinations that yield an account broken on a normal day.
import { buildFromAnswers, QS_DEFAULT } from '../src/quickstart.js';
import { runScenario, OK } from '../src/engine.js';

const bad = new Map();
let i = 0;
for (const pm of ['bitwarden', 'onepassword', 'lastpass', 'protonpass', 'apple', 'google', 'none']) {
  for (const email of ['google', 'microsoft', 'apple', 'proton', 'yahoo', 'email']) {
    for (const auth of ['Google Authenticator', 'Microsoft Authenticator', 'Authy', 'pm', 'none']) for (const computerKind of ['windows', 'mac', 'other']) {
      const a = { ...QS_DEFAULT, pm, email, auth, computerKind, keys: String(i % 3), computer: i % 2 ? 'yes' : 'no', phone: i % 4 ? 'iPhone' : 'Android phone', trusted: i % 5 ? 'Sam' : '' };
      i++;
      const p = buildFromAnswers(a);
      for (const r of runScenario(p, {}).rows.filter(r => r.state < OK)) {
        const list = bad.get(r.name) || [];
        list.push(JSON.stringify({ pm, email, auth, keys: a.keys, computer: a.computer, phone: a.phone }));
        bad.set(r.name, list);
      }
    }
  }
}
if (!bad.size) console.log('all', i, 'combinations work on a normal day');
for (const [name, list] of bad) console.log(`${name}: ${list.length} combos, e.g.\n  ${list.slice(0, 3).join('\n  ')}`);
