import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../lib/api.ts', import.meta.url), 'utf8');
const apiCode = ts.transpileModule(source.replace('import.meta.env', '({})'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const promptIdCode = ts.transpileModule(await readFile(new URL('../lib/prompt-id.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;

export function withApiFixture(code) {
  return apiCode + '\n' + promptIdCode + '\n' + code.replace(
    /^import\s*\{\s*(?:apiFetch|apiReadJson)\s*\}\s*from\s*['"]@\/lib\/api['"];?\s*$/gm,
    '',
  ).replace(/^import\s*\{\s*isPromptId\s*\}\s*from\s*['"]\.\/prompt-id['"];?\s*$/gm, '');
}
