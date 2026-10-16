// Shared backend has no TypeScript dependency. Generate its pure core from the
// canonical source, or fail a read-only parity check before releasing either repo.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

const backend = process.argv.find(arg => arg.startsWith('--backend='))?.slice(10);
if (!backend) throw new Error('Provide --backend=<arenaofbias-server path>');
const source = readFileSync(new URL('../lib/guess-logic.ts', import.meta.url), 'utf8');
const generated = '// Generated from Show1 lib/guess-logic.ts by scripts/sync-guess-core.mjs. Do not edit directly.\n'
  + ts.transpileModule(source.replace("import rawData from './guess-models.json';", "import { readFileSync } from 'node:fs';\nconst rawData = JSON.parse(readFileSync(new URL('./guess-models.json', import.meta.url), 'utf8'));"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true },
  }).outputText;
const data = readFileSync(new URL('../lib/guess-models.json', import.meta.url), 'utf8');
for (const [name, content] of [['guess-logic.mjs', generated], ['guess-models.json', data]]) {
  const dest = resolve(backend, 'server/show1', name);
  if (process.argv.includes('--write')) writeFileSync(dest, content);
  else if (readFileSync(dest, 'utf8').replaceAll('\r\n', '\n') !== content.replaceAll('\r\n', '\n')) throw new Error(`${name} is out of sync`);
}
console.log(process.argv.includes('--write') ? 'Guess core and catalogue synchronized' : 'Guess core and catalogue match');
