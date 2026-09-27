# Research record: why Lockout Drill

Research date: **26 September 2026**. Everything below was gathered from the live web on that
date. Condensed notes from every research agent are in [`research/`](research/) so any claim can be checked.

## How the search was run

| Stage | What | Scale |
|---|---|---|
| 1. Pain discovery | 9 parallel researchers, each mining a different angle (dev tools, AI-era tools, desktop, browser, files & documents, niche professions, life admin, creators & students, "I wish there was" threads), plus a completeness critic hunting for missed angles | 10 agents, 302 logged searches, ~1,280 tool calls, 50 candidate pains, each with 2+ independent evidence links |
| 2. Shortlist | 8 candidates picked on pain × frequency × apparent gap × buildability | — |
| 3. Kill check | For each candidate, two independent agents tried to **prove it already exists**: one through open source and package registries, one through commercial products, app and extension stores, and demand validation | 16 agents, 496 logged searches, ~1,380 tool calls |
| 4. Final check | My own targeted searches for the winner in app stores, Product Hunt and "lost phone drill" guides | — |
| 5. Facts for the model | Current sign-in, 2FA and recovery options for 46 services, taken from each provider's own help pages | 5 agents, ~600 tool calls |

## The problem

People discover only **after** losing a phone, a number or a house that their accounts depend on
each other in circles:

- The password manager's second factor lives on the phone.
- The email password lives in the password manager.
- The carrier texts its sign-in code to the number you're trying to recover.
- Nobody else knows the master password.

Recovery is often permanent failure, because the big providers have no human support. Heirs hit
the same wall.

### Evidence it's real and recurring

- **Ask HN, Sep 17 2026, "How to recover Google auth after phone stolen?"** (124 points, 131 comments). The poster was fully locked out, and 8+ commenters shared similar stories. <https://news.ycombinator.com/item?id=49742976>
- **Ask HN, "If I get locked out of everything, please try to help me"** (2022, 659 points). A phone failure cascaded into near-total lockout. <https://news.ycombinator.com/item?id=33963269>
- **Ask HN, "Google login has circular dependency"** (2025). <https://news.ycombinator.com/item?id=42581148>
- Google recovery loops and lost-number lockouts: <https://news.ycombinator.com/item?id=42350245>, <https://news.ycombinator.com/item?id=44952830>, <https://news.ycombinator.com/item?id=39269879>, <https://news.ycombinator.com/item?id=47650054> (abroad, 2026)
- Bitwarden's new-device check raised fears of being "locked out of literally every account": <https://news.ycombinator.com/item?id=42855681>
- Heirs blocked by phone-based 2FA: <https://news.ycombinator.com/item?id=43034787>, <https://news.ycombinator.com/item?id=48372317> (2026), <https://www.bogleheads.org/forum/viewtopic.php?t=370838>
- **Research: ICISSP 2024.** In 185 real Google and Apple setups, 10 Google users and 17 Apple users would lose their account by losing one phone. <https://arxiv.org/html/2403.15080>
- **Research: CHI 2022, "I'm Surprised So Much Is Connected".** Participants' account graphs contained cycles, and one participant was locked out of both email accounts for 30 days after losing a number. <https://people.inf.ethz.ch/basin/pubs/acm22.pdf>

### What people do instead (the manual workaround)

- **Tabletop simulations and hand-drawn graphs.** One HN user runs "little tabletop simulations" of losing the phone, hospitalisation and death: <https://news.ycombinator.com/item?id=19778241>. Another drew the dependency graph by hand: <https://news.ycombinator.com/item?id=21410736>.
- **Guides.** Practitioner articles tell readers to draw a recovery graph, find the loops and run a "lost-phone drill" by hand, with no tool offered: <https://dev.to/adev3loper/your-recovery-path-is-your-real-login-575a>. Guides from 2026 say the same.
- **Templates.** Printed backup-code sheets and "digital estate" templates, which are static documents with no analysis: <https://github.com/danieldurrans/Digital-Estate-Emergency-Kit>.

## What already exists (and why it isn't this)

| Closest thing | What it does | What it doesn't do |
|---|---|---|
| **Account Access Graphs**, ETH Zürich, CCS 2019 · <https://infsec.ethz.ch/research/software/account_access_graphs.html> | Formal model of accounts, devices and keys, with AND/OR edges and computed lockout sets. **This is the formalism Lockout Drill builds on, credited in `src/engine.js`.** | Research artifact (Java + Haskell, archived). No named scenarios, no plain-language explanations, no heirs, no templates, no fixes. |
| **AAG Analyser**, ICISSP 2024 · <https://github.com/Digital-Security-Lab/user-account-study-icissp2024> | Browser graph editor for a study, with an accessibility score. | Only scores: no scenarios, no causal chains, no loop explanations. 0 stars, last push March 2024. |
| **lnschroeder/account-access-graphs**, master's thesis · <https://github.com/lnschroeder/account-access-graphs> | WASM graph editor that propagates *compromise*. | Models the attacker's view, not lockout. No heir mode, no fixes. |
| **RecoveryCodes** (Show HN, Aug 2026) · <https://recoverycodes.eu/> | Team SaaS: which authenticator protects which account, and single points of failure. | Cloud-hosted and pre-launch. No transitive chains, no multi-item disasters, no death scenario, not personal. |
| **Number Exit Kit** (Jul 2026) · <https://github.com/dawnportinfo-design/number-exit-kit> | Local app listing every place a phone number is used. | Phone numbers only. No devices, places or loops. |
| **MAD KeePass plugin**, ARES 2022 · <https://github.com/Multi-Account-Dashboard/KeePass_Plugin> | Draws vault entries with dependency lines and scores. | No loss simulation. Abandoned in 2023. |
| **1Password Watchtower / Bitwarden reports** · <https://bitwarden.com/help/reports/> | Flag sites that support 2FA where it's off. | No idea which device, number or email each factor depends on. |
| **Google Security Checkup, Apple recovery contacts** | Recovery settings inside one provider. | Can't see across providers, and that's where the loops are. |
| **What If I Lose My 2FA** (2018) · <https://www.whatifilosemy2fa.com/> | Per-service recovery instructions. | No personal inventory and no simulation. |

## Novelty conclusion

After searching GitHub, npm and PyPI, Product Hunt, AlternativeTo, the Chrome and Firefox extension
stores, app stores, HN launches, academic literature and consumer security guides, I found **no
maintained, consumer-usable tool that simulates named loss scenarios across all of your accounts
and explains the result**. The capabilities in question are:

- phone stolen, robbed abroad, house fire, SIM hijack, memory loss, main email hacked, and your death seen from your heir's side;
- the exact chain of *why* each account is locked;
- circular dependencies;
- every combination of losses;
- fixes that are **verified by re-running the simulation**.

The underlying math is *not* new. Lockout sets were published in 2019, and research prototypes
exist, so I don't claim it is. What appears to be new is turning that model into something a
person can actually use:

1. Service templates built from the providers' own recovery rules.
2. Three recovery speeds (minutes, days, appeal only) instead of yes/no.
3. Physical places and fire-proof safes.
4. The heir's perspective.
5. Readable explanations and verified fixes.
6. Everything offline in one file.

## Why this beat the other candidates

Final shortlist and verdicts from the kill check:

| Candidate | Verdict | Why it lost |
|---|---|---|
| **DiskDelta**: "what grew on my disk since last week" | **Exists** | DiskHound, TreeMap (803★), SizeTrend, TreeSize, and *DiskSpace: See What Changed* (MS Store, Aug 2026) already do it. A pure-Python walk of this machine's home folder also took **20 minutes** (2.09M files). |
| **surgical**: format-preserving YAML/JSON edits | **Exists** | Mature tools already cover it. |
| **docx-redact**: true redaction for Word files | Crowded | `lowtidebuild/document-redactor` already ships about 75% of it, and about 8 near-clones appeared in 2026. |
| **certdoctor**: one-shot fix for corporate TLS interception | Partial, fading | `fumitm` plus many scripts. Runtimes are fixing it themselves (pip truststore, Node system CA, uv system-certs), Zscaler plans a fix, and I couldn't test it safely without changing this machine's trust settings. |
| **TabRescue**: recover lost tabs from every browser | Partial | Hindsight (1.5k★) already parses the formats. The recovery window is tiny, and the tool would look exactly like an infostealer to antivirus. |
| **Leftovers**: "is this old drive already backed up?" | Partial | The math is solved by `jdupes -I -u`, fclones and hashdeep. The job is episodic, and cloud placeholders and media re-encodes make results unreliable. |
| **Comment Harvester**: Word review comments into a matrix | Partial, strong demand | 700+ "same question" votes, and DocTools retired in April 2026. Very close runner-up, but a narrower audience and less of a wow moment. *Comment Master* (Jan 2026) already covers single-document extraction. |
| **Lockout Drill** | **Gap** | Real, painful, universal, live in September 2026, and the gap is specific. Buildable offline with no dependencies. |

## Technical feasibility and privacy

- The core is pure computation, so it needs no API, account, network or data source.
- Engine performance: an adversarial 200-account, 26-item profile finishes the full analysis (combinations up to 3 losses) in about 0.7 s in Node. A realistic setup takes milliseconds.
- `file://` is a secure context in Chromium: `crypto.subtle`, `localStorage` and `<dialog>` all work (tested in headless Edge).
- CSP `connect-src 'none'` means the page *cannot* make network requests. Only the page load itself appeared in the network log during testing.
- The data stored is metadata ("backup codes are in the desk drawer"), never passwords or codes. Because that map is itself sensitive, the app offers AES-256-GCM encryption with PBKDF2-SHA256 (600k rounds).

## Service facts behind the templates

These are from provider help pages, collected 26 September 2026. See the `sources` in `src/templates.js` and `research/services_condensed.txt`.

- **Apple:** any signed-in Apple device plus its passcode can reset the Apple Account password. Account Recovery takes days. A recovery key disables Account Recovery. Legacy Contacts don't get Keychain passwords.
- **Google:** a passkey skips 2-Step Verification. Recovery without a backup method takes 3–5 business days with no phone support. Changes to recovery info take 7 days to count. Recovery contacts take about 14 days to activate.
- **Microsoft:** SMS codes are being phased out. There is a 30-day restricted state after replacing security info.
- **Bitwarden:** can't reset the master password or remove 2FA. The recovery code needs the master password.
- **1Password:** a new device needs the Secret Key. A recovery code doesn't remove 2FA.
- **Carriers:** sign-in codes go to the number itself. eSIM moves usually need the old phone. The fallback is a store visit with photo ID, or a phone call with the account PIN.
- **Discord:** support cannot remove 2FA.
- **Login.gov:** losing every method means deleting the account and verifying again.

## Independent review

The finished code was reviewed by four agents, each through a different lens: engine correctness,
UI and state, security and privacy, and accuracy against the research above. Every finding then
went to a separate agent whose job was to refute it. 29 findings survived, and all were fixed. The
most important ones:

- **Apple devices.** Only Apple hardware now counts as an Apple trusted device.
- **Recovery that needs more than it looked.** 1Password recovery codes and Login.gov personal keys no longer bypass 2FA. Registrar backup codes need the password. Coinbase trusted-contact recovery needs two people.
- **Apple Account Recovery** switches off when a recovery key or security keys are set up, as Apple does.
- **Apple Passwords (iCloud Keychain)** is its own end-to-end encrypted account. Recovering the Apple Account is not enough to reach it.
- **Loop detection** only follows the steps that actually hold an account down.
- **Lock now** refuses to drop a setup that isn't safely stored.
- **Opening an encrypted file** never replaces your passphrase or accepts a weaker key.
- **Unencrypted setups are never written to shared `file://` storage without consent.**
- **Tabs stay in sync**, and a tab without the key locks instead of overwriting encrypted data.
- **Clicks aren't lost** after editing a field.

Each fix has a regression test in `test/review-regressions.test.mjs` or `test/storage.test.mjs`.
The full review is in `research/review_condensed.txt`.
