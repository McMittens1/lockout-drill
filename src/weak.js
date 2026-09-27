// Weak spots: whole-setup analysis shown on the Plan page. Which accounts fall to the fewest
// losses, which single things take the most with them, which loops exist, and what to fix first.

import { h, icon, stateChip, plural, listText } from './ui.js';
import { S, commit, analysis, memo, fixesFor } from './store.js';
import { LOCKED, APPEAL, SLOW, OK } from './engine.js';
import { bestFixes } from './advice.js';

// Summary numbers for the Plan page.
export function weakSummary() {
  const an = analysis();
  const p = S.profile;
  const label = id => an.graph.nodes.get(id)?.label ?? id;
  const fragile = p.accounts
    .map(a => ({ a, n: an.resilience.get(a.id), sets: an.sets.get(a.id) || [] }))
    .sort((x, y) => x.n - y.n || (y.a.important - x.a.important) || x.a.name.localeCompare(y.a.name));
  const ones = fragile.filter(f => f.n === 1);
  const broken = fragile.filter(f => f.n === 0);
  // Every fragile account paired with each of its smallest lockout sets.
  const minSize = Math.min(...fragile.filter(f => f.n > 0 && f.sets.length).map(f => f.n), Infinity);
  const pairs = fragile.filter(f => f.n > 0 && f.n === minSize && f.n <= 2).flatMap(f => f.sets.filter(s => s.length === f.n).slice(0, 3).map(s => ({ accountId: f.a.id, lost: s })));
  const top = memo('weak:top', () => (pairs.length ? bestFixes(p, pairs, 3) : []));
  const headline = !p.accounts.length ? 'Add accounts to see your weak spots.'
    : broken.length ? `${plural(broken.length, 'account')} ${broken.length === 1 ? "doesn't" : "don't"} work even today.`
      : ones.length ? `${plural(ones.length, 'account')} can be lost to a single thing going wrong.`
        : `No single loss locks you out. Losing ${an.maxSize >= 3 ? 'two or three' : 'two'} things at once is what to watch.`;
  return { an, label, fragile, ones, broken, top, minSize, headline };
}

// The whole-setup analysis, as sections for the Plan page.
export function weakSections(openEditor) {
  const { an, label, fragile, top, minSize } = weakSummary();
  if (!S.profile.accounts.length) return [];
  return [
    top.length ? h('section', null,
      h('h2', null, 'Fix these first'),
      h('p', { class: 'sub' }, `Changes that protect the most accounts against their weakest ${minSize === 1 ? 'single loss' : 'pair of losses'}. Each one was checked by re-running the drills with the change in place.`),
      h('div', { class: 'fixes' }, top.map(fx => h('div', { class: 'fix' },
        h('div', { class: 'ft' }, fx.title),
        h('div', { class: 'fd' }, 'Protects ', h('b', null, listText(fx.rescued.map(label))), '. ', fx.detail),
        h('div', { class: 'fa' }, h('button', { class: 'btn small primary', onclick: () => commit(q => { fx.apply(q); }, { undoLabel: 'Added to your setup' }) }, 'Add to my setup')),
      ))),
    ) : null,

    h('section', null,
      h('h2', null, 'How many losses each account survives'),
      h('p', { class: 'sub' }, `The fewest things you could lose at once and be locked out, or left with only a support appeal. We tried every thing on your list, alone and in combinations of up to ${an.maxSize} (${an.evaluated.toLocaleString()} drills).`),
      h('div', { class: 'card', style: 'padding:0' }, fragile.map(f => resilienceRow(f, label, openEditor, an))),
    ),

    h('section', null,
      h('h2', null, 'What takes the most with it'),
      h('p', { class: 'sub' }, 'If you lost just this one thing.'),
      h('div', { class: 'blast' }, an.blast.filter(b => b.locked.length || b.slowed.length).slice(0, 9).map(b => h('div', { class: 'card' },
        h('div', { class: 'bn' }, icon(an.graph.nodes.get(b.id)?.kind || 'account'), b.label),
        b.locked.length ? h('div', { class: 'bl' }, h('b', { class: 'tone0' }, 'Locks you out of '), listText(b.locked.map(label))) : null,
        b.slowed.length ? h('div', { class: 'bl' }, h('b', { class: 'tone2' }, 'Slows down '), listText(b.slowed.map(label))) : null,
      ))),
      an.blast.every(b => !b.locked.length && !b.slowed.length) ? h('p', { class: 'empty' }, 'Losing any one thing leaves every account reachable right away.') : null,
    ),

    an.cycles.length ? h('section', null,
      h('h2', null, 'Circular dependencies'),
      h('p', { class: 'sub' }, "Accounts that unlock each other. Fine while something outside the loop still works; a trap when it doesn't."),
      h('div', { style: 'display:grid;gap:10px' }, an.cycles.map(c => h('div', { class: 'card' },
        h('div', { class: 'chain' }, c.links.map((l, i) => [
          h('span', { class: 'node' }, l.fromLabel),
          h('span', { class: 'arrow' }, `→ ${l.step ? l.step.toLowerCase() : 'needs'} from →`),
          i === c.links.length - 1 ? h('span', { class: 'node' }, l.toLabel) : null,
        ])),
        h('p', { class: 'note', style: 'margin-top:8px' }, c.triggers.length
          ? ['It bites if you lose ', h('b', null, c.triggers.map(t => listText(t.map(label))).join(', or ')), '.']
          : 'Nothing we tried breaks it: something outside the loop always gets you in.'),
      ))),
    ) : null,

    an.warnings.length ? h('section', null,
      h('h2', null, 'Also worth checking'),
      h('ul', { class: 'warn-list' }, an.warnings.map(w => h('li', null, h('span', { class: 'lvl ' + w.level }), h('span', null, w.text)))),
    ) : null,
  ];
}

function resilienceRow(f, label, openEditor, an) {
  const { a, n, sets } = f;
  const cls = n <= 1 ? 'n1' : n === 2 ? 'n2' : 'n3';
  const numText = n === 0 ? 'Broken' : n > an.maxSize ? `${an.maxSize}+` : String(n);
  const sub = n === 0 ? 'today' : n === 1 ? 'thing' : 'things';
  let fix = null;
  if (n === 1 && sets[0]) {
    const fixes = fixesFor(a.id, { lost: sets[0] }, 1);
    if (fixes[0]) {
      const fx = fixes[0];
      fix = h('div', { class: 'fix', style: 'margin-top:8px' },
        h('div', { class: 'ft' }, fx.title),
        h('div', { class: 'fd' }, `If you lost ${listText(sets[0].map(label))}, this would leave you `, stateChip(fx.after), '.'),
        h('div', { class: 'fa' }, h('button', { class: 'btn small', onclick: () => commit(p => { fx.apply(p); }, { undoLabel: 'Added to your setup' }) }, 'Add to my setup')),
      );
    }
  }
  return h('div', { class: 'res' },
    h('div', { class: 'num ' + (n === 0 ? 'n0' : cls) }, h('b', null, numText), sub),
    h('div', null,
      h('div', { class: 'rn' }, a.important ? icon('star', 'i star') : null, ' ', a.name,
        h('button', { class: 'btn small ghost', style: 'margin-left:6px', onclick: () => openEditor(a.id) }, 'Edit')),
      n === 0 ? h('div', { class: 'sets' }, 'None of its ways in work on a normal day. Open it to check what each step needs.')
        : sets.length ? h('div', { class: 'sets' }, 'Locked out if you lose: ', sets.slice(0, 4).map((s, i) => [i ? h('span', null, 'or') : null, h('span', { class: 'set' }, s.map(label).join(' + '))]), sets.length > 4 ? h('span', null, `+${sets.length - 4} more`) : null)
          : h('div', { class: 'sets' }, `Survives any ${an.maxSize} losses we tried.`),
      fix,
    ),
  );
}
