// One-off text clean-up: removes the "Hyrox" trademark from the WOD files without regenerating them.
// Usage: node tools/wod/rebrand.mjs   (safe to run again; it only replaces exact phrases)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPLACEMENTS = [
  ['Hyrox Doubles rules', 'Doubles race rules'],
  ['Hyrox relay', 'Race relay'],
  ['Hyrox front half', 'Race front half'],
  ['Hyrox back half', 'Race back half'],
  ['Hyrox odd stations', 'Race odd stations'],
  ['Hyrox even stations', 'Race even stations'],
  ['Hyrox all 8 at half volume', 'All 8 race stations at half volume'],
  ['Hyrox-style', 'hybrid race'],
  ['Hyrox athlete', 'hybrid race athlete'],
];

const root = new URL('../../', import.meta.url);
const files = ['public/data/wods.json', 'tools/wod/generate_wods.py', 'tools/wod/wod-library.md'];

for (const rel of files) {
  const path = fileURLToPath(new URL(rel, root));
  let text = readFileSync(path, 'utf8');
  for (const [from, to] of REPLACEMENTS) text = text.split(from).join(to);
  writeFileSync(path, text);
  const left = (text.match(/Hyrox/g) || []).length;
  console.log(`${rel}: ${left} "Hyrox" left`);
}
