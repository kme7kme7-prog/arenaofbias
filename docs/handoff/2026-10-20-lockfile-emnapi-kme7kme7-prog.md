# 2026-10-20 · 补回 lock 中缺失的 @emnapi 可选依赖 · kme7kme7-prog

- 负责人：kme7kme7-prog
- 提交范围：`4da8d90..`（本轮单提交，仅 `package-lock.json` 与交接文档）

## 本轮目标

修好 `package-lock.json` 里缺失的 `@emnapi/core`、`@emnapi/runtime` 1.11.3，让 Linux 上 Node 22 从干净目录跑 `npm ci && npm run build` 通过；改动最小，不带动其他包版本。

## 改动

- `package-lock.json`：恢复 `node_modules/@emnapi/core` 与 `node_modules/@emnapi/runtime` 两个根条目（1.11.3，dev + optional，官方 registry tarball/integrity），与 e4e0411 补入的内容逐字一致。其他条目零改动。
- 原因：两条曾在 e4e0411 补齐，44e2e3f（Windows 上 `npm install` 加 gsap/three 时重写 lock）又被裁掉。它们只被 wasm32 平台包（`@napi-rs/wasm-runtime`、`@tailwindcss/oxide-wasm32-wasi` 等）引用，Windows 本机 npm 重写 lock 时会把这类"本平台装不上的可选依赖"的根条目丢掉；Linux 的 `npm ci` 校验 lock 与依赖树一致时就报缺失。

## 决策

无新决策。

## 验证

- `npm install --package-lock-only`（npm 10.9.4）对照：同样新增这两条、integrity 相同；但它还会加 6 条 oxide-wasm32-wasi 内置 bundle 条目、改 7 个包的 `peer` 标记，属无关噪声，未采用。
- 新 worktree，Node 22.21.1 / npm 10.9.4：`npm ci`（含全新空 cache）通过，236 包；`npm run build` 通过；`npm run typecheck` 通过；`npm ci` 后 lock 无变化。
- 模拟 Windows：`npm ci --os=win32 --cpu=x64 --ignore-scripts` 通过，选中 `binding-win32-x64-msvc`、`oxide-win32-x64-msvc`，lock 无变化。
- 未跑：lint、check-* —— 原因：本轮不动源码。

## 明确没做

未改 package.json、任何依赖版本或应用源码；未部署。

## 遗留物

无。

## 下一步建议

在 Windows 上 `npm install`/升级依赖后，提交前在 Linux（或 `npm ci --os=linux --cpu=x64 --dry-run`）跑一次干净 `npm ci`，否则这两条会再次被裁掉。
