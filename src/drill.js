// The Drill: pick a scenario, see which accounts you'd lose, why, and what would fix it.

import { h, icon, stateChip, STATE_LABEL, plural, listText } from './ui.js';
import { S, commit, rerender, presets, scenarioResult, graph, currentScenario, fixesFor } from './store.js';
import { derivation, blockers, reasonFor, LOCKED, APPEAL, SLOW, OK, PHYSICAL_KINDS } from './engine.js';
import { VIA, SPEEDS, THING_KINDS, THING_GROUPS } from './templates.js';

export function drillView(openEditor) {
  const list = presets();
  const cur = currentScenario();
  const res = scenarioResult(cur.id, cur.ctx);
  return h('div', { class: 'drill' },
    scenarioList(list, cur),
    h('section', { class: 'results', 'aria-label': 'Drill results' },
      resultHead(cur, res),
      cur.id === 'custom' ? customPanel() : null,
      resultRows(cur, res, openEditor),
    ),
  );
}

// ------------------------------------------------------------------------------------------

function tallyText(t) {
  const parts = [];
  if (t[0]) parts.push(h('span', { class: 'tone0' }, h('b', null, t[0]), ' locked'));
  if (t[1]) parts.push(h('span', { class: 'tone1' }, h('b', null, t[1]), ' appeal'));
  if (t[2]) parts.push(h('span', { class: 'tone2' }, h('b', null, t[2]), ' slow'));
  if (!parts.length) parts.push(h('span', { class: 'tone3' }, 'All fine'));
  return parts;
}

function scenarioList(list, cur) {
  const pick = (id) => {
    S.scenario = id;
    S.open.clear();
    rerender();
    // On phones the list is a horizontal strip: keep the chosen drill in view.
    document.querySelector('.scn[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    document.querySelector('.results h1')?.focus({ preventScroll: true });
  };
  const onKey = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const btns = [...document.querySelectorAll('.scn')];
    const i = btns.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const next = btns[(i + (e.key === 'ArrowDown' ? 1 : btns.length - 1)) % btns.length];
    next.focus();
  };
  return h('nav', { class: 'scenarios', 'aria-label': 'Scenarios', onkeydown: onKey },
    h('h2', null, 'Drills'),
    list.map(sc => {
      const r = scenarioResult(sc.id, sc.ctx);
      return h('button', { class: 'scn', 'aria-current': cur.id === sc.id ? 'true' : 'false', onclick: () => pick(sc.id), dataset: { k: 'scn:' + sc.id } },
        h('span', { class: 'ico' }, icon(sc.icon)),
        h('span', { class: 't' }, sc.title),
        h('span', { class: 'm' }, tallyText(r.tally)),
      );
    }),
    h('button', { class: 'scn', 'aria-current': cur.id === 'custom' ? 'true' : 'false', onclick: () => pick('custom'), dataset: { k: 'scn:custom' } },
      h('span', { class: 'ico' }, icon('custom')),
      h('span', { class: 't' }, 'Build your own drill'),
      h('span', { class: 'm' }, 'Choose exactly what goes missing'),
    ),
  );
}

function resultHead(cur, res) {
  const t = res.tally;
  const total = t.reduce((a, b) => a + b, 0);
  const heir = cur.ctx.perspective === 'heir';
  const who = heir ? (S.profile.trusted || 'your trusted person') : 'You';
  let verdict;
  if (!total) verdict = 'Add some accounts in Setup to run this drill.';
  else if (t[0] + t[1] + t[2] === 0) verdict = heir ? `${who} could get into everything right away.` : 'Everything stays reachable right away.';
  else {
    const bits = [];
    if (t[0]) bits.push(h('span', null, heir ? `${who} would be ` : "You'd be ", h('b', { class: 'tone0' }, 'locked out of ' + plural(t[0], 'account')), ''));
    if (t[1]) bits.push(h('span', null, h('b', { class: 'tone1' }, plural(t[1], 'account')), ' would depend on a support appeal'));
    if (t[2]) bits.push(h('span', null, h('b', { class: 'tone2' }, String(t[2])), ' would take days to get back'));
    if (t[3]) bits.push(h('span', null, h('b', { class: 'tone3' }, String(t[3])), heir ? ' would open right away' : ' stay fine'));
    verdict = [];
    bits.forEach((b, i) => { if (i) verdict.push(i === bits.length - 1 ? ', and ' : ', '); verdict.push(b); });
    verdict.push('.');
  }
  return h('header', { class: 'result-head' },
    h('h1', { tabindex: '-1' }, cur.title),
    h('p', { class: 'blurb' }, cur.blurb),
    h('p', { class: 'verdict' }, verdict),
    total ? h('div', { class: 'bar', role: 'img', 'aria-label': `${t[0]} locked out, ${t[1]} appeal only, ${t[2]} days, ${t[3]} fine` },
      [0, 1, 2, 3].map(s => t[s] ? h('span', { class: 'b' + s, style: `width:${(100 * t[s]) / total}%` }) : null)) : null,
    total ? h('div', { class: 'legend' }, [0, 1, 2, 3].map(s => h('span', null, h('i', { class: 'b' + s, style: `background:var(--${['locked', 'appeal', 'slow', 'ok'][s]})` }), STATE_LABEL[s]))) : null,
  );
}

function customPanel() {
  const things = S.profile.things;
  const toggleLost = (id) => {
    const set = new Set(S.custom.lost);
    set.has(id) ? set.delete(id) : set.add(id);
    S.custom.lost = [...set];
    rerender();
  };
  const groups = THING_GROUPS.map(g => ({ g, items: things.filter(t => THING_KINDS[t.kind].group === g.id) })).filter(x => x.items.length);
  const verb = { devices: 'Lose', numbers: 'Lose', apps: 'Wipe', keys: 'Lose', papers: 'Lose', secrets: 'Forget', places: 'Destroy', people: 'Unavailable:' };
  return h('div', { class: 'custom', 'aria-label': 'Choose what goes missing' },
    h('div', { class: 'fieldrow' },
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: S.custom.abroad, dataset: { k: 'c:abroad' }, onchange: e => { S.custom.abroad = e.target.checked; rerender(); } }), "I'm abroad (no store visits, home is far away)"),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: S.custom.heir, dataset: { k: 'c:heir' }, onchange: e => { S.custom.heir = e.target.checked; rerender(); } }), `See it as ${S.profile.trusted || 'your trusted person'} would, after you're gone`),
    ),
    h('div', { class: 'fieldrow', style: 'align-items:start' },
      groups.map(({ g, items }) => h('div', { class: 'cg' },
        h('b', null, g.label),
        h('div', { class: 'opts' }, items.map(t => h('label', { class: 'check' },
          h('input', { type: 'checkbox', checked: S.custom.lost.includes(t.id), dataset: { k: 'c:' + t.id }, onchange: () => toggleLost(t.id) }),
          `${verb[g.id]} ${t.name}`))),
      )),
    ),
    S.profile.accounts.length ? h('div', { class: 'cg' },
      h('b', null, 'Accounts taken over'),
      h('div', { class: 'fieldrow' }, S.profile.accounts.filter(a => ['email', 'platform', 'password_manager', 'carrier'].includes(a.category)).map(a => h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: S.custom.lost.includes(a.id), dataset: { k: 'c:' + a.id }, onchange: () => toggleLost(a.id) }), `${a.name} hacked`))),
    ) : null,
  );
}

// ------------------------------------------------------------------------------------------

const GROUP_TITLE = ['Locked out', 'Only by support appeal', 'Back in days', 'Still fine'];

function resultRows(cur, res, openEditor) {
  if (!res.rows.length) return h('p', { class: 'empty' }, 'No accounts yet.');
  const out = [];
  for (const s of [LOCKED, APPEAL, SLOW, OK]) {
    const rows = res.rows.filter(r => r.state === s).sort((a, b) => (b.important - a.important) || a.name.localeCompare(b.name));
    if (!rows.length) continue;
    const n = rows.reduce((x, r) => x + r.count, 0);
    out.push(h('h2', { class: 'group-h' }, stateChip(s, GROUP_TITLE[s]), h('span', null, plural(n, 'account'))));
    out.push(h('div', { class: 'rows' }, rows.map(r => row(cur, res, r, openEditor))));
  }
  return out;
}

function row(cur, res, r, openEditor) {
  const open = S.open.has(r.id);
  const toggle = () => { open ? S.open.delete(r.id) : S.open.add(r.id); rerender(); };
  return h('article', { class: 'row', 'data-open': String(open) },
    h('button', { class: 'rh', 'aria-expanded': String(open), onclick: toggle, dataset: { k: 'row:' + r.id } },
      stateChip(r.state),
      h('div', null,
        h('div', { class: 'nm' }, r.important ? icon('star', 'i star') : null, r.name, r.count > 1 ? h('span', { class: 'count' }, `· ${r.count} accounts`) : null,
          r.cycles.length ? h('span', { class: 'cause', title: 'Part of a circular dependency' }, icon('loop'), 'loop') : null),
        h('div', { class: 'why' }, summary(res, r)),
      ),
      icon('chevron', 'i chev'),
    ),
    open ? detail(cur, res, r, openEditor) : null,
  );
}

function summary(res, r) {
  const g = res.graph;
  if (r.state === OK) {
    const d = derivation(g, res.sim, r.id, 1);
    return d?.way ? ['via ', h('b', null, d.way.label.toLowerCase())] : (d?.base ? 'available' : '');
  }
  const parts = r.causes.slice(0, 4).map(c => h('span', { class: 'cause' }, c.label, h('em', null, ' — ' + c.reason)));
  if (r.causes.length > 4) parts.push(h('span', { class: 'cause' }, `+${r.causes.length - 4} more`));
  if (r.state > LOCKED) {
    const d = derivation(g, res.sim, r.id, 1);
    if (d?.way) parts.push(h('span', null, '→ ', d.way.label.toLowerCase()));
  }
  if (!parts.length && r.state < OK) parts.push(h('span', null, 'Not set up with any way in that works here.'));
  return parts;
}

// ------------------------------------------------------------------------------------------

function detail(cur, res, r, openEditor) {
  const g = res.graph;
  const sim = res.sim;
  const blocks = [];

  if (r.state > LOCKED) {
    const d = derivation(g, sim, r.id, 6);
    blocks.push(h('div', null, h('h4', null, r.state === OK ? 'How you still get in' : 'Your best way back'), route(g, d)));
  }

  if (r.cycles.length) {
    const c = r.cycles[0];
    const names = c.map(id => g.nodes.get(id)?.label ?? id);
    blocks.push(h('div', { class: 'loop' }, icon('loop'),
      h('div', null, h('b', null, 'Circular dependency. '), names.join(' → '), '. ',
        c.every(id => (sim.state.get(id) ?? LOCKED) === LOCKED)
          ? 'Each needs another to get in, so none of them can be the way back.'
          : 'Right now they can only unlock each other, so the way back has to come from outside the loop.')));
  }

  if (r.state < OK) {
    const b = blockers(g, sim, r.id, { depth: 4 });
    blocks.push(h('div', null, h('h4', null, r.state === LOCKED ? 'What stops every way in' : 'Why not faster'), waysView(g, sim, b, 0, cur.id + ':' + r.id)));
    const fixes = fixesFor(r.id, cur.ctx);
    blocks.push(h('div', null,
      h('h4', null, 'Fixes that would work in this drill'),
      fixes.length
        ? h('div', { class: 'fixes' }, fixes.map(f => h('div', { class: 'fix' },
          h('div', { class: 'ft' }, f.title),
          h('div', { class: 'fd' }, f.detail),
          h('div', { class: 'fa' },
            h('span', { class: 'note' }, 'then'), stateChip(f.after),
            h('button', { class: 'btn small', onclick: () => commit(p => { f.apply(p); }, { undoLabel: 'Added to your setup' }) }, 'Add to my setup')),
        )))
        : h('p', { class: 'note' }, 'No single change we know of fixes this one here. Open the account to add another way in.'),
    ));
  }

  blocks.push(h('div', null, h('button', { class: 'btn small', onclick: () => openEditor(r.id) }, 'Edit ways in')));
  return h('div', { class: 'detail' }, blocks);
}

const phrase = (via, label) => (VIA[via]?.phrase || '{x}').replace('{x}', label);

function route(g, d) {
  if (!d) return h('p', { class: 'note' }, 'No way in.');
  if (d.base) return h('p', { class: 'note' }, 'Available directly.');
  const speed = d.way?.speed && d.way.speed !== 'instant' ? h('span', { class: 'kind' }, SPEEDS[d.way.speed].label) : null;
  return h('div', { class: 'route' },
    h('span', { class: 'way' }, d.way?.label || ''), speed,
    (d.picks || []).map(p => [h('span', { class: 'sep' }, '·'), h('span', { class: 'node' }, phrase(p.via, p.label)), subRoute(g, p.sub)]),
  );
}

// One short clause explaining how a picked item itself is reachable, when that matters.
function subRoute(g, sub) {
  if (!sub || sub.base || !sub.way) return null;
  const node = g.nodes.get(sub.id);
  if (!node) return null;
  if (node.type === 'account') return h('span', { class: 'note' }, `(via ${sub.way.label.toLowerCase()}${sub.state < OK ? ', ' + SPEEDS[sub.way.speed]?.label.toLowerCase() : ''})`);
  if (sub.way.id === 'restore') return h('span', { class: 'note' }, '(restored from backup)');
  if (sub.way.id === 'store' || sub.way.id === 'esim') return h('span', { class: 'note' }, `(${sub.way.label.toLowerCase()}, days)`);
  if (sub.way.id === 'written') return h('span', { class: 'note' }, '(from the written copy)');
  if (sub.state === SLOW && node.src?.at && node.src.at !== 'carried') return h('span', { class: 'note' }, '(once you get back to it)');
  return null;
}

const DISABLED = {
  lost: 'Not possible: this is gone',
  hijacked: 'Not possible: the account was taken over',
  abroad: "Not possible from abroad",
  'only-you': 'Only you can do this',
  'only-heir': 'Only after your death',
};

function waysView(g, sim, b, depth, path) {
  if (b.cycle) return h('p', { class: 'note' }, '↺ loops back to ', h('b', null, g.nodes.get(b.cycle[b.cycle.length - 1])?.label || ''), ', already shown above.');
  if (b.truncated) return h('p', { class: 'note' }, '…');
  const node = g.nodes.get(b.id);
  if (!b.ways.length) {
    return h('p', { class: 'note' }, b.lost ? reasonFor(g, node, sim.ctx) : (node?.type === 'account' ? 'No ways in are set up.' : reasonFor(g, node, sim.ctx) || 'Unavailable'));
  }
  const ways = b.ways.filter(w => w.disabled !== 'only-heir' || sim.ctx.perspective === 'heir').filter(w => w.disabled !== 'only-you' || sim.ctx.perspective !== 'heir' || depth === 0);
  return h('div', { class: 'ways' }, ways.map(w => {
    const head = h('div', { class: 'wh' },
      w.disabled ? h('span', { class: 'off' }, '—') : stateChip(w.value, w.value === OK ? 'Works' : STATE_LABEL[w.value]),
      h('span', { class: 'lbl' }, w.label),
      w.speed !== 'instant' ? h('span', { class: 'kind' }, SPEEDS[w.speed].label) : null,
      w.disabled ? h('span', { class: 'off' }, DISABLED[w.disabled] || w.disabled) : null,
    );
    if (w.disabled || !w.failing.length) return h('div', { class: 'wayx' }, head);
    return h('div', { class: 'wayx' }, head,
      h('ul', null, w.failing.map(f => h('li', null,
        h('span', { class: 'sl' }, f.step + ':'),
        f.empty ? h('span', { class: 'warnline' }, 'nothing chosen') : f.options.map(o => optionView(g, sim, o, depth, `${path}>${w.id}>${o.ref}`)),
      ))),
    );
  }));
}

function optionView(g, sim, o, depth, key) {
  const node = g.nodes.get(o.ref);
  const reason = o.why.lost ? reasonFor(g, node, sim.ctx) : (node && node.base && node.base(sim.ctx) < OK && !node.ways.length ? reasonFor(g, node, sim.ctx) : null);
  const label = h('span', null, phrase(o.via, o.label));
  const tag = reason ? h('em', { class: 'tone0' }, ` (${reason})`) : h('span', null, ' ', stateChip(o.state));
  const expandable = !o.why.lost && !o.why.cycle && o.why.ways.some(w => w.failing.length || w.disabled) && depth < 3;
  if (!expandable) return h('span', { class: 'opt' }, label, tag, o.why.cycle ? h('em', { class: 'note' }, ' ↺ loop') : null);
  const d = h('details', { class: 'sub', open: S.openDetails.has(key) },
    h('summary', { dataset: { k: 'd:' + key } }, label, tag),
    waysView(g, sim, o.why, depth + 1, key),
  );
  d.addEventListener('toggle', () => { d.open ? S.openDetails.add(key) : S.openDetails.delete(key); });
  return h('span', { class: 'opt' }, d);
}
