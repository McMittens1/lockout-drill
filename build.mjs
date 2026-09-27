// Bundle src/*.js into one self-contained, offline HTML file: dist/lockout-drill.html.
// Each module becomes a function scope; `import { a, b as c } from './x.js'` becomes
// `const { a, b: c } = __m_x`. No dependencies, no network.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Script } from 'node:vm';

const ORDER = ['engine', 'templates', 'csv', 'crypto', 'sample', 'advice', 'guide', 'ui', 'store', 'quickstart', 'drill', 'setup', 'weak', 'plan', 'handover', 'app'];
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/^﻿/, '');

let js = '"use strict";\n';
for (const name of ORDER) {
  let src = read(`./src/${name}.js`);
  const exported = [];
  src = src.replace(/^export (async function|function|const|let|class) ([A-Za-z0-9_$]+)/gm, (_, kw, id) => { exported.push(id); return `${kw} ${id}`; });
  src = src.replace(/^import \{([^}]*)\} from '\.\/([a-z]+)\.js';[ \t]*$/gm, (_, names, mod) => {
    if (!ORDER.includes(mod) || ORDER.indexOf(mod) >= ORDER.indexOf(name)) throw new Error(`${name} imports ${mod}, which is not bundled before it`);
    return `const {${names.replace(/\s+as\s+/g, ': ')}} = __m_${mod};`;
  });
  if (/^(import|export)[\s{*]/m.test(src)) throw new Error(`Unhandled import/export syntax in ${name}.js`);
  // The app rebuilds its own page for handover files from this shell plus its own style and script.
  if (name === 'app') {
    if (!src.includes('/*__SHELL__*/null')) throw new Error('app.js has no /*__SHELL__*/ placeholder');
    src = src.replace('/*__SHELL__*/null', () => JSON.stringify(read('./src/index.html')));
  }
  js += `\nconst __m_${name} = (() => {\n${src}\nreturn { ${exported.join(', ')} };\n})();\n`;
}
js += '\n__m_app.boot();\n';
js = js.replace(/<\/script/gi, '<\\/script');

new Script(js, { filename: 'lockout-drill.bundle.js' }); // throws on syntax errors

const css = read('./src/styles.css');
const html = read('./src/index.html')
  .replace('/*__CSS__*/', () => css)
  .replace('/*__JS__*/', () => js);

mkdirSync(new URL('./dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('./dist/lockout-drill.html', import.meta.url), html);
console.log(`dist/lockout-drill.html  ${(html.length / 1024).toFixed(1)} KB  (${ORDER.length} modules)`);
