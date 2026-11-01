import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCAN_ROOTS = ['client/src', 'server/src', 'shared/src'];
const EXTENSIONS = new Set(['.ts', '.html', '.scss']);
const SKIP_DIRS = new Set(['dist', 'node_modules', 'coverage', '.angular', '.turbo']);
const TARGET = 350;
const CAP = 400;

function walk(directory, files) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(fullPath, files);
      continue;
    }
    if (!EXTENSIONS.has(path.extname(entry.name))) continue;
    if (entry.name.endsWith('.spec.ts')) continue;
    files.push(fullPath);
  }
  return files;
}

// Replica il conteggio di `max-lines` con `skipBlankLines` e `skipComments`:
// una riga conta solo se contiene codice (non vuota e non composta da soli commenti).
function countEffectiveLines(text, extension) {
  const lines = text.split(/\r?\n/);
  const linePrefixes = extension === '.html' ? [] : ['//'];
  const [blockStart, blockEnd] = extension === '.html' ? ['<!--', '-->'] : ['/*', '*/'];
  let blank = 0;
  let comments = 0;
  let inBlock = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (inBlock) {
      comments += 1;
      if (line.includes(blockEnd)) inBlock = false;
      continue;
    }
    if (line === '') {
      blank += 1;
      continue;
    }
    if (linePrefixes.some((prefix) => line.startsWith(prefix))) {
      comments += 1;
      continue;
    }
    if (line.startsWith(blockStart)) {
      comments += 1;
      if (!line.includes(blockEnd)) inBlock = true;
      continue;
    }
  }
  return lines.length - blank - comments;
}

const files = SCAN_ROOTS.flatMap((scanRoot) => walk(path.join(ROOT, scanRoot), []));
const rows = files
  .map((file) => ({
    file: path.relative(ROOT, file).split(path.sep).join('/'),
    effective: countEffectiveLines(readFileSync(file, 'utf8'), path.extname(file)),
  }))
  .sort((a, b) => b.effective - a.effective || a.file.localeCompare(b.file));

const overCap = rows.filter((row) => row.effective > CAP);
const inBand = rows.filter((row) => row.effective > TARGET && row.effective <= CAP);
const width = String(Math.max(0, ...rows.map((row) => row.effective))).length;

function section(title, items) {
  const header = `${title}: ${items.length} file`;
  if (items.length === 0) return `${header} (nessuno)`;
  const body = items.map((row) => `  ${String(row.effective).padStart(width)}  ${row.file}`);
  return [header, ...body].join('\n');
}

const output = [
  `files:report — policy R0: target ${TARGET}, cap ${CAP} (righe effettive, esclusi vuoti e commenti)`,
  `Scansionati ${rows.length} file in ${SCAN_ROOTS.join(', ')}`,
  section(`Sopra il cap ${CAP}`, overCap),
  section(`Fascia ${TARGET}–${CAP} (candidati allo split)`, inBand),
];

process.stdout.write(`${output.join('\n\n')}\n`);
