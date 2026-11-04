#!/usr/bin/env node
// Gestione del subset self-hosted di Material Symbols Outlined.
//
//   node scripts/material-symbols.mjs --check   verifica che i sorgenti non usino icone fuori lista
//   node scripts/material-symbols.mjs --build   riscarica il woff2 del subset da Google Fonts
//
// Il font è self-hosted: nessuna CDN viene contattata a runtime dal client.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLIENT_SRC = path.join(ROOT, 'client/src');
const FONT_DIR = path.join(ROOT, 'client/public/fonts');
const OUTPUT = path.join(FONT_DIR, 'material-symbols-outlined.v2.woff2');
const CSS_URL = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined&icon_names=';
const USER_AGENT
  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) '
    + 'Chrome/131.0.0.0 Safari/537.36';
const ICON_NAME = /^[a-z][a-z0-9_]*$/;

// Elenco canonico delle icone usate dal client. Se aggiungi un'icona a un template
// o a un elenco TypeScript, aggiungila qui e rigenera con `npm run icons:build`.
const ICONS = [
  'add',
  'add_photo_alternate',
  'arrow_back',
  'arrow_downward',
  'arrow_selector_tool',
  'arrow_upward',
  'casino',
  'category',
  'check',
  'check_box_outline_blank',
  'chevron_left',
  'chevron_right',
  'close',
  'dark_mode',
  'delete',
  'door_front',
  'download',
  'draw',
  'edit',
  'fence',
  'fit_screen',
  'flag',
  'grid_on',
  'image',
  'ink_eraser',
  'inventory_2',
  'keyboard_arrow_down',
  'lasso_select',
  'light_mode',
  'lightbulb',
  'location_on',
  'lock',
  'lock_open',
  'pentagon',
  'pets',
  'play_arrow',
  'redo',
  'rectangle',
  'search',
  'settings',
  'straighten',
  'swap_horiz',
  'swap_vert',
  'title',
  'undo',
  'vertical_align_bottom',
  'vertical_align_top',
  'visibility',
  'visibility_off',
  'wall_art',
  'window',
  'zoom_in',
  'zoom_out',
];

function walk(directory, extensions, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, extensions, files);
      continue;
    }
    if (extensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function relative(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

// Estrae i nomi icona letterali dai template: testo dell'elemento e rami delle
// ternarie dentro le interpolazioni (es. `{{ locked ? 'lock' : 'lock_open' }}`).
function iconsInTemplate(content) {
  const names = [];
  const plainText = content.replace(/\{\{[\s\S]*?\}\}/g, '').trim();
  if (ICON_NAME.test(plainText)) {
    names.push(plainText);
  }

  for (const expression of content.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
    const body = (expression[1] ?? '').trim();
    const direct = body.match(/^(['"])([^'"]+)\1$/);
    if (direct?.[2] !== undefined && ICON_NAME.test(direct[2])) {
      names.push(direct[2]);
    }
    const ternary = /\?\s*(?:'([^']+)'|"([^"]+)")\s*:\s*(?:'([^']+)'|"([^"]+)")/g;
    for (const branch of body.matchAll(ternary)) {
      for (const value of [branch[1], branch[2], branch[3], branch[4]]) {
        if (value !== undefined && ICON_NAME.test(value)) {
          names.push(value);
        }
      }
    }
  }
  return names;
}

function iconsInHtml(text) {
  const names = [];
  const elements
    = /<([a-z][a-z0-9-]*)\b[^>]*\bclass="[^"]*\bmaterial-symbols-outlined\b[^"]*"[^>]*>([\s\S]*?)<\/\1>/gi;
  for (const match of text.matchAll(elements)) {
    names.push(...iconsInTemplate(match[2] ?? ''));
  }
  return names;
}

function iconsInTypeScript(text) {
  const names = [];
  // Proprietà `icon: '...'` (es. TOOL_LABELS in map-editor.page.ts).
  for (const match of text.matchAll(/\bicon\s*:\s*['"]([^'"]+)['"]/g)) {
    const value = match[1];
    if (value !== undefined && ICON_NAME.test(value)) {
      names.push(value);
    }
  }
  // Record di icone, es. `const LAYER_ICONS: Record<MapLayerKind, string> = { ... }`.
  for (const match of text.matchAll(/\bconst\s+\w*ICONS\w*\s*(?::[^=]+)?=\s*\{([\s\S]*?)\};/g)) {
    for (const literal of (match[1] ?? '').matchAll(/'([^']+)'|"([^"]+)"/g)) {
      const value = literal[1] ?? literal[2];
      if (value !== undefined && ICON_NAME.test(value)) {
        names.push(value);
      }
    }
  }
  return names;
}

function collectUsages() {
  const usages = [];
  const htmlFiles = walk(CLIENT_SRC, new Set(['.html']));
  for (const file of htmlFiles) {
    for (const name of iconsInHtml(readFileSync(file, 'utf8'))) {
      usages.push({ name, file });
    }
  }
  const tsFiles = walk(CLIENT_SRC, new Set(['.ts']));
  for (const file of tsFiles) {
    for (const name of iconsInTypeScript(readFileSync(file, 'utf8'))) {
      usages.push({ name, file });
    }
  }
  return usages;
}

function check() {
  const duplicates = ICONS.filter((name, index) => ICONS.indexOf(name) !== index);
  if (duplicates.length > 0) {
    console.error(`ICONS contiene duplicati: ${[...new Set(duplicates)].join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const known = new Set(ICONS);
  const usages = collectUsages();
  const unknown = new Map();
  for (const usage of usages) {
    if (known.has(usage.name)) {
      continue;
    }
    const files = unknown.get(usage.name) ?? new Set();
    files.add(relative(usage.file));
    unknown.set(usage.name, files);
  }

  if (unknown.size > 0) {
    console.error('Icone usate nei sorgenti ma assenti da ICONS:');
    for (const [name, files] of [...unknown].sort(([a], [b]) => a.localeCompare(b))) {
      console.error(`  - ${name} (${[...files].sort().join(', ')})`);
    }
    console.error('Aggiungi i nomi a ICONS in scripts/material-symbols.mjs e rigenera il font.');
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `icons:check OK — ${String(ICONS.length)} icone canoniche, `
    + `${String(usages.length)} usi letterali verificati.\n`,
  );
}

function findWoff2Url(css) {
  for (const block of css.matchAll(/@font-face\s*\{([\s\S]*?)\}/g)) {
    const body = block[1] ?? '';
    if (!/font-weight:\s*400\b/.test(body)) {
      continue;
    }
    const url = body.match(/url\((https:\/\/[^)]+)\)\s*format\(['"]woff2['"]\)/);
    if (url?.[1] !== undefined) {
      return url[1];
    }
  }
  return null;
}

// `unicode-range` copre i codepoint dei nomi richiesti. Google lo restituisce per
// le richieste `text=`; con `icon_names=` di solito è assente, quindi la verifica
// viene eseguita solo quando presente.
function parseUnicodeRange(css) {
  const ranges = [];
  for (const match of css.matchAll(/U\+([0-9a-f]+)(?:-([0-9a-f]+))?/gi)) {
    const start = Number.parseInt(match[1] ?? '', 16);
    const end = match[2] === undefined ? start : Number.parseInt(match[2], 16);
    ranges.push([start, end]);
  }
  return ranges;
}

function coversText(css, text) {
  const ranges = parseUnicodeRange(css);
  const missing = new Set();
  for (const character of new Set(text)) {
    if (character === ',') {
      continue;
    }
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) {
      continue;
    }
    const covered = ranges.some(([start, end]) => codePoint >= start && codePoint <= end);
    if (!covered) {
      missing.add(character);
    }
  }
  return [...missing];
}

async function build() {
  // `icon_names` (ordinato alfabeticamente) produce un subset reale: con `text=`
  // Google manteneva nel woff2 l'intero set di glifi delle ligature.
  const names = [...ICONS].sort();
  const requested = names.join(',');
  const cssUrl = `${CSS_URL}${encodeURIComponent(requested)}&display=block`;
  const iconCount = String(names.length);
  const charCount = String(requested.length);
  process.stdout.write(
    `Scarico il CSS di Google Fonts per ${iconCount} icone (${charCount} caratteri)...\n`,
  );

  const cssResponse = await fetch(cssUrl, { headers: { 'User-Agent': USER_AGENT } });
  if (!cssResponse.ok) {
    throw new Error(
      `Google Fonts CSS ha risposto ${String(cssResponse.status)} ${cssResponse.statusText}`,
    );
  }
  const css = await cssResponse.text();

  if (css.includes('unicode-range:')) {
    const missing = coversText(css, requested);
    if (missing.length > 0) {
      throw new Error(`unicode-range incompleto, caratteri mancanti: ${missing.join(' ')}`);
    }
  }

  const fontUrl = findWoff2Url(css);
  if (fontUrl === null) {
    throw new Error('nessun URL woff2 con weight 400 nella risposta CSS di Google Fonts');
  }

  const fontResponse = await fetch(fontUrl, { headers: { 'User-Agent': USER_AGENT } });
  if (!fontResponse.ok) {
    throw new Error(
      `download del font fallito: ${String(fontResponse.status)} ${fontResponse.statusText}`,
    );
  }
  const bytes = Buffer.from(await fontResponse.arrayBuffer());
  if (bytes.length === 0) {
    throw new Error('il font scaricato è vuoto');
  }
  const magic = bytes.subarray(0, 4).toString('ascii');
  if (magic !== 'wOF2') {
    throw new Error(`magic bytes inattesi: "${magic}" (atteso "wOF2")`);
  }

  mkdirSync(FONT_DIR, { recursive: true });
  writeFileSync(OUTPUT, bytes);
  process.stdout.write(
    `Scritto ${relative(OUTPUT)}: ${String(bytes.length)} byte (magic wOF2).\n`,
  );
}

const mode = process.argv[2];

if (mode === '--check') {
  check();
} else if (mode === '--build') {
  try {
    await build();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`icons:build fallito: ${message}`);
    process.exitCode = 1;
  }
} else {
  console.error('Uso: node scripts/material-symbols.mjs --check|--build');
  process.exitCode = 1;
}
