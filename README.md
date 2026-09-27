# Lockout Drill

**If you lost your phone tonight, or weren't around tomorrow, could anyone get into your accounts?**

**Try it:** <https://mcmittens1.github.io/lockout-drill/> · or download [`dist/lockout-drill.html`](dist/lockout-drill.html) and open it from your disk.

Lockout Drill is an account continuity plan: a map of how you get into the accounts that matter,
drills that test it, and a handover guide for the person you trust. You record the phones, numbers,
security keys, printed codes and places you rely on, and what you remember. Then it runs drills:

- your phone is stolen
- you're robbed while abroad
- your home burns down
- your number is SIM-swapped
- you can't remember your passwords
- your main email is hacked
- you're gone, and someone you trust has to pick up the pieces

For every account it tells you whether you'd get in right away, in days, only by appeal, or never.
It also shows **why**, down to the exact chain (for example, *"the Gmail password is in Bitwarden,
Bitwarden's code is in Google Authenticator on the stolen phone, and the Authenticator backup is
in Gmail"*), and it suggests **fixes it has proven** by re-running the drill with the change in
place.

The **handover** turns the "you're gone" drill into a step-by-step guide for the person you trust:
what to gather first and where it is, which account to open first and with what, which steps
unlock later ones, what you want done with each account (keep it, save what matters, move the
money out, close it…), your note to them, and each service's official route for families. You can
print it, or export an **encrypted handover file**: a copy of the app with your plan inside that
they double-click and unlock with a passphrase you give them separately. It never contains
passwords or codes.

It is one HTML file. It runs offline, needs no account and has no server. Its Content-Security-Policy
forbids network requests, so the browser itself guarantees your data never leaves the page.
When opened straight from disk, it won't keep an unencrypted setup in browser storage (which
other local HTML files could read) unless you say so. It asks you to set a passphrase first.

## Use it

1. Open the [hosted app](https://mcmittens1.github.io/lockout-drill/), or open `dist/lockout-drill.html` in Chrome, Edge, Firefox or Safari (double-clicking the file works). Either way it runs entirely in your browser; the hosted copy is the same file, built and tested by the workflow in `.github/workflows/`.
2. Pick **Explore a sample setup** to see it in action, or **Start with my setup** to answer seven quick questions that build your starting setup.
3. Correct and extend it in **Setup**. Each service template comes with that provider's real sign-in and recovery options, checked against its help pages in September 2026. You switch on the ones you use.
4. The **Plan** page is home: whether the handover is ready, how each drill turns out, when you last reviewed it (it nudges you after six months), and the weak spots to fix first. Press **Add to my setup** on a fix you like. Everything can be undone (Ctrl+Z).
5. In **Handover**, name the person you trust, write them a note, and say what should happen to each account. The preview shows exactly what they will get. Then **Create handover file…** or **Print the guide**. The Plan page tells you when the file is out of date.

**Never enter passwords or codes.** Lockout Drill only needs *where* things are and *how* they
connect. Because that map is sensitive in itself, use **⋯ → Protect with a passphrase** to encrypt
it (AES-256-GCM, PBKDF2-SHA256 with 600,000 rounds). Your setup autosaves in this browser. Use
**Save to file** for a copy you control. Encrypted setups save encrypted.

Other things in the ⋯ menu:
- **Import sites from a password manager.** Reads only the site names from a CSV export (Bitwarden, 1Password, LastPass, Proton Pass, KeePassXC, Dashlane, Chrome, Edge, Firefox, Apple Passwords). Passwords, usernames and 2FA secrets are skipped.
- **Print a recovery plan.** A one-page sheet for your emergency binder, listing where things are kept, what each drill does, and your fastest way back into each important account.
- **Create a handover file** and **Print the handover guide**, also on the Handover tab.

Keyboard: `1` `2` `3` `4` switch views, `↑` `↓` move between drills, `Ctrl+S` saves a file, `Ctrl+Z` undoes. `Ctrl+P` prints the guide from the Handover tab and the recovery plan elsewhere.

### The handover file

The file is the app itself, byte for byte, plus one `<script type="application/json">` tag that
holds your plan encrypted with AES-256-GCM under a key derived from a separate handover passphrase
(PBKDF2-SHA256, 600,000 rounds). Nothing readable is outside the encrypted part, not even names.
Opening it shows a passphrase screen, then the guide. The person can also explore the drills on
your plan; that copy lives only in memory and is never written to their browser. Give them the file
any way you like and the passphrase another way (in person, or sealed with your will). Make a new
file when your setup changes.

## What it models

- **Things.** Phones, computers and tablets (with the passcode that unlocks them), phone numbers (the SIM lives in a phone; a replacement needs a store visit with ID or your carrier account), authenticator apps (on which devices, backed up where), security keys, papers, photo ID, places (nested: a safe inside your home; fireproof containers survive a fire), memorized secrets (written down anywhere? shared with anyone?), and trusted people.
- **Ways into each account.** Each way is a set of steps, and each step can be satisfied by any one of several things: "password (from Bitwarden) **and** second step (prompt on iPhone **or** code from Authenticator **or** text to your number)". Each way has a speed (minutes, days, or appeal only), and can be limited to you or to your heir.
- **Scenarios** remove things. The engine computes the least fixed point of what's still reachable, so circular dependencies never unlock themselves.
- **The handover guide** is built from the "you're gone" drill: steps are ordered so every account comes after the accounts its route relies on, and each lists the exact things used and the later steps it opens.

The model follows the *Account Access Graphs* formalism from Hammann, Radomirovic, Sasse & Basin
(CCS 2019). It adds recovery speeds, places, heirs, named scenarios, readable explanations and
verified fixes. See [RESEARCH.md](RESEARCH.md) for how the idea was chosen and what already exists.

## Development

No dependencies. Needs Node 18+.

```bash
npm test          # 69 tests: engine, advice, handover guide, CSV import, crypto, storage rules, validation, templates, quick start, review regressions
node build.mjs    # bundles src/ into dist/lockout-drill.html
```

| File | Role |
|---|---|
| `src/engine.js` | Graph compile, worklist fixed point, explanations (derivation, blockers, root causes, loops), scenario presets, whole-setup analysis (blast radius, minimal lockout sets, cycles, warnings) |
| `src/advice.js` | Fix generators, plus verification by re-simulation and ranking by accounts rescued |
| `src/guide.js` | The handover guide (step order, what to gather, what can't be reached, the full map), readiness checklist, handover-file embedding |
| `src/templates.js` | Step vocabulary, 29 service templates with sources, each service's official route for families |
| `src/quickstart.js` | Seven answers become a coherent starting setup (all 630 answer combinations are tested) |
| `src/store.js` | State, undo, debounced (encrypted) autosave, input validation for loaded files |
| `src/crypto.js` | AES-GCM with PBKDF2 key; the key is cached so autosave doesn't re-derive it |
| `src/csv.js` | Password-manager CSV import, reading names and domains only |
| `src/plan.js`, `handover.js`, `drill.js`, `setup.js`, `weak.js`, `app.js`, `ui.js` | The interface (vanilla DOM) |

`scripts/qs-matrix.mjs` checks every quick-start combination. `scripts/guide-preview.mjs` prints the
sample's handover guide as text. `scripts/file-probe.html` checks
browser APIs under `file://` with the app's Content-Security-Policy.

## Limits worth knowing

- Recovery at the big providers is partly risk-scored (familiar device, location, account age), so no model can promise an outcome. Lockout Drill shows the route it assumed for every result, so you can judge it, and marks support-only routes as "appeal".
- Templates reflect providers' help pages as of September 2026. Providers change these flows. Every way in is editable.
- The drill is only as good as the setup you describe. A signed-in session you forgot to list, or backup codes you never actually printed, change the answer. The same goes for the handover guide: review it when things change.
- Signing in as someone else can break a service's terms, and in some places the law, even with permission. The guide says so, and lists each service's official route for families next to the steps. It is not legal advice and doesn't replace a will.
- The handover file is only as safe as its passphrase. Anyone with both the file and the passphrase sees the whole map.
