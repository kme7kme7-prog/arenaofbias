import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

// Share the approved prototype styles without letting their reset affect other routes.
export function playMenuStyles() {
  const id = 'virtual:play-menu-design.css';
  const resolved = '\0' + id;
  const paths = ['forum-menu.css', 'collection.css'].map((name) =>
    fileURLToPath(new URL(`../reference/menu-demo/${name}`, import.meta.url)),
  );
  return {
    name: 'play-menu-scoped-styles',
    resolveId(source) {
      if (source === id) return resolved;
    },
    async load(source) {
      if (source !== resolved) return;
      const sheets = await Promise.all(
        paths.map(async (path) => {
          this.addWatchFile(path);
          const css = postcss.parse(await readFile(path, 'utf8'), {
            from: path,
          });
          css.walkRules((rule) => {
            if (
              rule.parent?.type === 'atrule' &&
              rule.parent.name.endsWith('keyframes')
            )
              return;
            rule.selectors = rule.selectors.map((selector) =>
              /^(?:html|body|:root)$/.test(selector)
                ? '.play-collection'
                : `.play-collection ${selector}`,
            );
          });
          return css.toString();
        }),
      );
      return sheets.join('\n');
    },
    handleHotUpdate({ file, server }) {
      if (!paths.includes(file)) return;
      const module = server.moduleGraph.getModuleById(resolved);
      if (module) {
        server.moduleGraph.invalidateModule(module);
        return [module];
      }
    },
  };
}
