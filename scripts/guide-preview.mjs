// Dev helper: print the handover guide for the sample, before and after writing the master
// password down, as plain text.
import { buildGuide, readiness } from '../src/guide.js';
import { sampleProfile } from '../src/sample.js';

function show(title, p) {
  const g = buildGuide(p);
  console.log(`\n=== ${title}`);
  console.log('tally', JSON.stringify(g.tally));
  console.log('gather:');
  for (const x of g.gather) console.log(`  [step ${x.step}] ${x.name} — ${x.where}${x.how ? ' ' + x.how : ''}`);
  console.log('steps:');
  for (const s of g.steps) console.log(`  ${s.n}. ${s.name} (${s.speed}) via ${s.way}: ${s.picks.map(p => p.text + (p.step ? ` [step ${p.step}]` : '')).join(' + ')}${s.opens.length ? ' → opens ' + s.opens.map(o => o.step).join(',') : ''} | wish: ${s.wishLabel}`);
  console.log('blocked:');
  for (const b of g.blocked) console.log(`  ${b.name}: ${b.reasons.map(r => r.label + ' (' + r.reason + ')').join(', ')}`);
  console.log('readiness:');
  for (const r of readiness(p, g)) console.log(`  ${r.ok ? '✓' : '✗'} ${r.text}`);
}

const p = sampleProfile();
show('Sample as is', p);
const q = sampleProfile();
q.things.push({ id: 'kit', kind: 'paper', name: 'Sealed emergency sheet', at: 'drawer' });
q.things.find(t => t.id === 'bwpw').writtenOn = ['kit'];
show('After writing the Bitwarden master password on a sealed sheet in the desk drawer', q);
