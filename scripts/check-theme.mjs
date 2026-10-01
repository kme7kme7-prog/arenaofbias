// Theme preference is tested before loading React or CSS: this is the FOUC boundary.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import postcss from 'postcss';

const html = fs.readFileSync('index.html', 'utf8');
const script = html.match(/<script id="theme-boot">([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'a synchronous theme boot must precede the application');
assert.ok(html.indexOf('id="theme-boot"') < html.indexOf('type="module"'));
for (const stored of [null, 'paper', 'ink', 'system', 'garbage']) {
  for (const dark of [false, true]) {
    for (const blocked of [false, true]) {
      const root = { dataset: {}, style: {} };
      const meta = {
        setAttribute(_name, value) {
          this.value = value;
        },
      };
      vm.runInNewContext(script, {
        document: { documentElement: root, querySelector: () => meta },
        localStorage: {
          getItem() {
            if (blocked) throw Error('blocked');
            return stored;
          },
        },
        matchMedia: () => ({ matches: dark }),
      });
      const expected =
        !blocked && ['paper', 'ink'].includes(stored)
          ? stored
          : !blocked && stored === 'system' && dark
            ? 'ink'
            : 'paper';
      assert.equal(root.dataset.theme, expected);
      assert.equal(
        root.style.colorScheme,
        expected === 'ink' ? 'dark' : 'light',
      );
      assert.ok(meta.value);
    }
  }
}
console.log(
  'PASS prepaint: 20 combinations; paper default, explicit system, stored preference and denied storage',
);

const palette = postcss.parse(fs.readFileSync('app/theme-tokens.css', 'utf8'));
const themes = new Map();
for (const rule of palette.nodes.filter((node) => node.type === 'rule')) {
  const theme = rule.selector.includes(':root') ? 'paper' : 'ink';
  const values = themes.get(theme) ?? new Map();
  rule.walkDecls((declaration) => {
    assert.ok(
      !values.has(declaration.prop),
      `duplicate token: ${rule.selector} ${declaration.prop}`,
    );
    values.set(declaration.prop, declaration.value);
  });
  themes.set(theme, values);
}
const luminance = (hex) =>
  hex
    .slice(1)
    .match(/../g)
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
for (const theme of ['paper', 'ink']) {
  const values = new Map([...themes.get('paper'), ...themes.get(theme)]);
  const pairs = [
    'text-main,paper',
    'text-main,card',
    'muted-foreground,background',
    'muted-foreground,card',
    'text-faint,popover',
    'on-accent,accent',
    'text-on-inset,surface-inset',
  ];
  for (const pair of pairs) {
    const [a, b] = pair
      .split(',')
      .map((key) => luminance(values.get('--' + key)));
    assert.ok(
      (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5,
      `${theme}: ${pair} text contrast`,
    );
  }
}
console.log(
  'PASS both palettes: unique tokens and 14 core text/surface pairs ≥ 4.5:1',
);
