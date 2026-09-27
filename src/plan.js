// The Plan: the home screen. Whether the handover is ready, how the setup holds up in each drill,
// when it was last reviewed, and the weak spots worth fixing first.

import { h, icon, plural } from './ui.js';
import { S, commit, presets, scenarioResult, guide } from './store.js';
import { readiness, ago } from './guide.js';
import { weakSummary, weakSections } from './weak.js';
import { tallyText } from './drill.js';

const GO_LABEL = {
  trusted: 'Add a name',
  pm: 'See why',
  reach: 'See why',
  wishes: 'Add wishes',
  letter: 'Write it',
  reviewed: 'Mark reviewed',
  file: 'Create file',
};

// The review date travels in the handover file (it tells the reader how current it is), so a
// review also asks for a fresh file.
export function markReviewed() {
  commit(p => { p.reviewedAt = new Date().toISOString(); }, { undoLabel: 'Marked as reviewed today' });
}

export function planView({ openEditor, go, printPlan }) {
  const p = S.profile;
  const g = guide();
  const items = readiness(p, g);
  const done = items.filter(i => i.ok).length;
  const title = p.owner ? `${p.owner}'s plan` : 'Your plan';
  const meta = [
    g.reviewedDays === null ? 'Never reviewed' : `Reviewed ${ago(g.reviewedDays)}`,
    plural(p.accounts.reduce((n, a) => n + Math.max(1, a.count || 1), 0), 'account'),
    plural(p.things.length, 'thing'),
  ];

  return h('div', { class: 'weak plan' },
    h('header', { class: 'page-h' },
      h('div', null,
        h('p', { class: 'eyebrow' }, 'Account continuity plan'),
        h('h1', null, title),
        h('p', { class: 'meta' }, meta.join(' · '))),
      h('div', { class: 'actions' },
        h('button', { class: 'btn' + (g.stale && p.accounts.length ? ' primary' : ''), onclick: markReviewed, dataset: { k: 'plan:review' } }, icon('check'), 'Mark as reviewed'),
        h('button', { class: 'btn', onclick: printPlan }, icon('print'), 'Print')),
    ),

    staleNote(p, g),

    h('div', { class: 'plan-grid' },
      h('section', { class: 'card', 'aria-labelledby': 'ready-h' },
        h('div', { class: 'card-h' }, h('h2', { id: 'ready-h' }, 'Handover'), h('span', { class: 'note' }, `${done} of ${items.length} done`)),
        h('p', { class: 'note', style: 'margin-bottom:8px' }, `What ${p.trusted || 'the person you trust'} would need if you die or can't manage your accounts.`),
        h('ul', { class: 'ready' }, items.map(it => h('li', { class: it.ok ? 'ok' : 'todo' },
          h('span', { class: 'tick', 'aria-label': it.ok ? 'Done' : 'To do' }, it.ok ? icon('check') : null),
          h('span', { class: 'grow' }, it.text),
          it.ok ? null : h('button', { class: 'btn small', onclick: () => (it.go === 'review' ? markReviewed() : go(it.go)), dataset: { k: 'ready:' + it.key } }, GO_LABEL[it.key] || 'Open'),
        ))),
        h('div', { style: 'margin-top:10px' }, h('button', { class: 'btn small ghost', onclick: () => go('handover') }, 'Open Handover', icon('chevron'))),
      ),
      h('section', { class: 'card', 'aria-labelledby': 'drills-h' },
        h('div', { class: 'card-h' }, h('h2', { id: 'drills-h' }, 'Drills'), h('span', { class: 'note' }, 'If this happened today')),
        p.accounts.length
          ? h('div', { class: 'drill-list' }, presets().map(sc => {
            const r = scenarioResult(sc.id, sc.ctx);
            return h('button', { class: 'drow', onclick: () => go('drill:' + sc.id), dataset: { k: 'plan:scn:' + sc.id } },
              h('span', { class: 'ico' }, icon(sc.icon)),
              h('span', { class: 't' }, sc.title),
              h('span', { class: 'm' }, tallyText(r.tally)),
              icon('chevron', 'i chev'));
          }))
          : h('p', { class: 'empty' }, 'Add your accounts in Setup to run the drills.'),
      ),
    ),

    p.accounts.length ? h('section', { class: 'weak-h' },
      h('h2', null, 'Weak spots'),
      h('p', { class: 'sub' }, weakSummary().headline)) : null,
    weakSections(openEditor),
  );
}

function staleNote(p, g) {
  if (!p.accounts.length || !g.stale) return null;
  const text = g.reviewedDays === null
    ? "Once this plan matches your real setup, mark it as reviewed. We'll remind you to look again in six months."
    : `Last reviewed ${ago(g.reviewedDays)}. Phones, numbers and passwords change: walk through Setup, fix what's different, then mark it as reviewed.`;
  return h('div', { class: 'banner' + (g.reviewedDays !== null ? ' warn' : '') }, icon('clock'), h('span', { class: 'grow' }, text));
}
