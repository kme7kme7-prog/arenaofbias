import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Reuse the previous menu artwork rather than draw twelve replacement illustrations.
await mkdir('.local/menu-motif-export', { recursive: true });
const source = await readFile('app/play-menu-art.tsx', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
}).outputText;
const modulePath = '.local/menu-motif-export/art.mjs';
await writeFile(modulePath, compiled);
const { PlayMenuArt } = await import(
  pathToFileURL(`${process.cwd()}/${modulePath}`)
);
const palettes = {
  formal: ['#627d81', '#dde5df'],
  event: ['#b58a56', '#e5dcc2'],
  guess: ['#7b8e62', '#dfe6cf'],
  tierlist: ['#b37159', '#e9d3b9'],
  tanks: ['#7c8762', '#d8dec6'],
  werewolf: ['#817182', '#ded8de'],
  geoguess: ['#68868a', '#dbe5df'],
  generals: ['#a5634d', '#d7dfce'],
  league: ['#a68a52', '#e6dec7'],
  debate: ['#a8644d', '#dfe5d8'],
  ctf: ['#638578', '#d4e2d7'],
};
for (const [mode, [color, soft]] of Object.entries(palettes)) {
  const svg = renderToStaticMarkup(createElement(PlayMenuArt, { mode }))
    .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
    .replace('viewBox="0 0 720 390"', 'viewBox="60 0 600 390"')
    .replaceAll('var(--shelf-ink)', '#3f5148')
    .replaceAll('var(--shelf-color)', color)
    .replaceAll('var(--shelf-soft)', soft)
    .replaceAll('var(--shelf-paper)', '#f8f4e6');
  await writeFile(`reference/menu-demo/assets/motif-${mode}.svg`, svg);
}
const pelican = (await readFile('public/art/pelican-cover.html', 'utf8'))
  .match(/<svg[\s\S]*?<\/svg>/)[0]
  .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
await writeFile('reference/menu-demo/assets/pelican-scene.svg', pelican);
console.log('Exported 11 existing menu motifs and the existing pelican scene.');
