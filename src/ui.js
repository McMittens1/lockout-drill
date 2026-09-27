// Tiny DOM helpers and icons. No framework: views rebuild their DOM from state.

const SVGNS = 'http://www.w3.org/2000/svg';
const PROPS = new Set(['value', 'checked', 'selected', 'disabled', 'indeterminate', 'open']);

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  setAttrs(el, attrs);
  append(el, kids);
  return el;
}

function setAttrs(el, attrs) {
  if (!attrs) return;
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (PROPS.has(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
}

export function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false || k === true) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}

// Stroke icons (24px grid). Paths are constants, never user data.
const ICONS = {
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>',
  computer: '<rect x="3" y="4.5" width="18" height="12" rx="1.5"/><path d="M2 19.5h20"/>',
  tablet: '<rect x="4.5" y="2.5" width="15" height="19" rx="2"/><path d="M11 18.5h2"/>',
  number: '<path d="M6 3h8l4 4v14H6z"/><path d="M9 11h6v6H9z"/>',
  seckey: '<circle cx="8" cy="15" r="4.5"/><path d="M11.2 11.8 20 3m-4 4 2.5 2.5M14 9l2 2"/>',
  paper: '<path d="M6 2.5h8.5L19 7v14.5H6z"/><path d="M14 2.5V7h5M9 12h7M9 15.5h7"/>',
  photoid: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><circle cx="8.5" cy="11" r="2.2"/><path d="M5.5 16.5c.6-1.6 1.7-2.4 3-2.4s2.4.8 3 2.4M14 10h5M14 13.5h4"/>',
  place: '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/>',
  secret: '<path d="M9.5 20.5h5M12 17.5a6.5 6.5 0 1 0-4-1.4V17.5h8v-1.4"/><path d="M10 11.5h4"/>',
  authapp: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M9.5 10h1.5M12 10h1.5M9.5 13h5"/>',
  person: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5c1.2-3.6 4.1-5.5 7.5-5.5s6.3 1.9 7.5 5.5"/>',
  account: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  today: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  travel: '<path d="M2.5 13.5 21 6l-3.5 13.5-5-5-3 3v-5.5z"/><path d="m12.5 14.5 8.5-8.5"/>',
  fire: '<path d="M12 21.5c4 0 7-2.6 7-6.6 0-4.4-4-6.4-4.6-10.9-2.3 1.4-3.9 3.6-3.9 6.4-1-.6-1.6-1.8-1.7-3.1C6.6 9 5 11.6 5 14.9c0 4 3 6.6 7 6.6z"/>',
  sim: '<path d="M6 3h8l4 4v14H6z"/><path d="M4 21 20 3"/>',
  memory: '<path d="M8.5 20.5V17c-2.4-1.3-4-3.6-4-6.5a7.5 7.5 0 0 1 15 0V13l1.5 2.5h-1.5v2c0 1.1-.9 2-2 2H15v1"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5"/>',
  mail: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="m3 6.5 9 6.5 9-6.5"/>',
  heir: '<path d="M12 21s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 8.2a4.3 4.3 0 0 1 7.5 2.6C19.5 16.4 12 21 12 21z"/>',
  custom: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  hand: '<path d="M8 12.5V5.8a1.3 1.3 0 0 1 2.6 0V11m0-5.7V4.3a1.3 1.3 0 0 1 2.6 0V11m0-5.2a1.3 1.3 0 0 1 2.6 0V11m0-3.2a1.3 1.3 0 0 1 2.6 0v6.4c0 4-2.6 6.3-6 6.3-2.4 0-4-1.2-5.3-3.2L4.6 13.4a1.3 1.3 0 0 1 2.1-1.5L8 13.5"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  more: '<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
  star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.5 9.7l5.9-.8z"/>',
  loop: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 4v4.5h-4.5"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 20v-4.5h4.5"/>',
  save: '<path d="M5 3.5h11l3.5 3.5v13.5H5z"/><path d="M8 3.5v5h7v-5M8 20.5v-6h8v6"/>',
  open: '<path d="M3 7.5V19a1.5 1.5 0 0 0 1.5 1.5h15A1.5 1.5 0 0 0 21 19V9a1.5 1.5 0 0 0-1.5-1.5H12L10 4.5H4.5A1.5 1.5 0 0 0 3 6z"/>',
  import: '<path d="M12 3.5v11m-4-4 4 4 4-4"/><path d="M4.5 15v4.5h15V15"/>',
  print: '<path d="M7 8.5V3.5h10v5"/><rect x="3.5" y="8.5" width="17" height="8" rx="1.5"/><path d="M7 14h10v6.5H7z"/>',
  shield: '<path d="M12 21s-7.5-3.2-7.5-9.5V5.8L12 3l7.5 2.8v5.7C19.5 17.8 12 21 12 21z"/>',
  undo: '<path d="M9 7.5 4.5 12 9 16.5"/><path d="M4.5 12h10a5 5 0 0 1 0 10h-2"/>',
  trash: '<path d="M4.5 6.5h15M10 3.5h4M6.5 6.5l1 14h9l1-14"/>',
  sample: '<path d="M9 3.5h6M10 3.5v6L4.8 18.3a1.5 1.5 0 0 0 1.3 2.2h11.8a1.5 1.5 0 0 0 1.3-2.2L14 9.5v-6"/><path d="M7.5 14.5h9"/>',
};

export function icon(name, cls = 'i') {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name] || ICONS.account;
  return svg;
}

export function logo() {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('class', 'mark');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<rect x="1" y="1" width="30" height="30" rx="8" fill="currentColor"/><path d="M11 14v-3a5 5 0 0 1 9.4-2.4" fill="none" stroke="var(--bg)" stroke-width="2.4" stroke-linecap="round"/><rect x="8.5" y="14" width="15" height="11" rx="2.2" fill="var(--bg)"/><path d="M16 17.2v2.6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>';
  return svg;
}

export const STATE_LABEL = ['Locked out', 'Appeal only', 'Takes days', 'Fine'];
export const STATE_LONG = [
  'No way back in',
  'Only if support agrees',
  'Takes days: waiting period, store visit or support',
  'You can get in right away',
];
const STATE_ICON = ['lock', 'hand', 'clock', 'check'];

export function stateChip(s, text) {
  return h('span', { class: `st s${s}`, title: STATE_LONG[s] }, icon(STATE_ICON[s]), text ?? STATE_LABEL[s]);
}

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : (many || one + 's')}`;
}

export function listText(items) {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return items.join(' and ');
  return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}

// Stable keys let us restore focus after re-rendering.
export function captureFocus() {
  const a = document.activeElement;
  if (!a || !a.dataset || !a.dataset.k) return null;
  return { k: a.dataset.k, start: a.selectionStart, end: a.selectionEnd };
}

export function restoreFocus(f) {
  if (!f) return;
  const el = document.querySelector(`[data-k="${CSS.escape(f.k)}"]`);
  if (!el) return;
  el.focus({ preventScroll: true });
  try { if (f.start != null && el.setSelectionRange) el.setSelectionRange(f.start, f.end); } catch { /* not a text field */ }
}

export function download(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: filename, style: 'display:none' });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

export function readFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error || new Error('Could not read the file.'));
    r.readAsText(file);
  });
}
