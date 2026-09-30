import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import postcss from 'postcss';

const seen = new Set(),
  styles = new Set();
function visit(file) {
  if (seen.has(file)) return;
  seen.add(file);
  const source = fs.readFileSync(file, 'utf8');
  const follow = (spec) => {
    const base = spec.startsWith('@/')
      ? path.resolve(spec.slice(2))
      : spec.startsWith('.')
        ? path.resolve(path.dirname(file), spec)
        : null;
    if (!base) return;
    const found = [
      base,
      ...['.ts', '.tsx', '.js', '.css'].map((ext) => base + ext),
    ].find(
      (candidate) =>
        fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
    );
    if (found) visit(found);
  };
  if (file.endsWith('.css')) {
    styles.add(file);
    postcss.parse(source).walkAtRules('import', (node) => {
      const spec = node.params.match(/^['"]([^'"]+)/)?.[1];
      if (spec) follow(spec);
    });
  } else {
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const walk = (node) => {
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier)
      )
        follow(node.moduleSpecifier.text);
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      )
        follow(node.arguments[0].text);
      ts.forEachChild(node, walk);
    };
    walk(ast);
  }
}
visit(path.resolve('src/main.tsx'));
const violations = [],
  declared = new Set(),
  used = new Set();
const forbidden = new Set(
  'account-page-turn account-page account-ink text-enter channel-unfold guess-enter guess-menu duel-lift duel-rise next-rise next-mark lobby-rise obs-rise obs-file-in obs-copy-in obs-page-in archive-heading-in rank-panel-slide-in rank-fade-in rank-fade-up'.split(
    ' ',
  ),
);
for (const file of styles) {
  const ast = postcss.parse(fs.readFileSync(file, 'utf8'));
  ast.walkDecls((d) => {
    if (d.prop.startsWith('--')) declared.add(d.prop);
    for (const match of d.value.matchAll(/var\((--[\w-]+)/g))
      used.add(match[1]);
    if (
      !file.endsWith('theme-tokens.css') &&
      /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|oklch)\(|\b(?:black|white)\b/i.test(
        d.value,
      )
    )
      violations.push(
        `${path.relative('.', file)}:${d.source.start.line} ${d.prop}`,
      );
    if (d.prop === 'transition' && /\ball\b/.test(d.value))
      violations.push(`${file}: unbounded transition`);
  });
  ast.walkAtRules('keyframes', (rule) =>
    assert.ok(
      !forbidden.has(rule.params),
      `unsafe container entry remains: ${rule.params}`,
    ),
  );
}
assert.deepEqual(
  violations,
  [],
  'page CSS must consume the theme authority, never literal colors',
);
const css = fs.readFileSync('app/theme.css', 'utf8');
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
assert.match(css, /animation:\s*none\s*!important/);
const game = fs.readFileSync('lib/game-transitions.ts', 'utf8');
assert.match(game, /copy\.hidden = time < timing\.covered/);
assert.match(game, /reducedMode[\s\S]*?options\.holdGate/);
const page = fs.readFileSync('app/page.tsx', 'utf8');
assert.doesNotMatch(page, /focusTransform|translate3d\(0,35px/);
const dialog = fs.readFileSync('components/ui/dialog.tsx', 'utf8');
assert.doesNotMatch(dialog, /fade-in|zoom-in|animate-in/);
console.log(
  `PASS ${styles.size} reachable CSS: centralized colors, no unbounded transitions, removed unsafe entries, reduced motion and text separation`,
);
