import { cpSync, mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { HERE, ROOT, RUNTIME_HASH } from './config.mjs';

const output = path.resolve(process.argv[2] || path.join(ROOT, '.local', `tank-runner-${RUNTIME_HASH.slice(0, 12)}`));
const slots = Number(process.argv[3] || 1);
if (!Number.isInteger(slots) || slots < 1 || slots > 8) throw Error('并发配置必须为 1–8。');
if (existsSync(output)) throw Error('输出目录已存在，请另选空目录。');
mkdirSync(path.join(output, 'tools/tank-ladder'), { recursive: true });
mkdirSync(path.join(output, 'app/tanks/engine'), { recursive: true });
writeFileSync(path.join(output, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
for (const file of readdirSync(HERE).filter(file => file.endsWith('.mjs') || ['package.json', 'package-lock.json'].includes(file))) {
  cpSync(path.join(HERE, file), path.join(output, 'tools/tank-ladder', file));
}
cpSync(path.join(ROOT, 'app/tanks/engine/core'), path.join(output, 'app/tanks/engine/core'), { recursive: true });
cpSync(path.join(HERE, 'REMOTE-RUNNER.md'), path.join(output, 'README.md'));
writeFileSync(path.join(output, 'start-runner.cmd'), `@echo off\r\ncd /d "%~dp0tools\\tank-ladder"\r\nif not exist node_modules (call npm ci --ignore-scripts --no-audit --no-fund || goto end)\r\nset "TANK_RUNNER_TOKEN_FILE=%~dp0runner-token.txt"\r\nset "TANK_RUNNER_URL=http://127.0.0.1:5473"\r\nset "TANK_RUNNER_SLOTS=${slots}"\r\nnode runner.mjs\r\n:end\r\npause\r\n`);
writeFileSync(path.join(output, 'build.json'), JSON.stringify({ runtimeHash: RUNTIME_HASH, slots, note: 'Node.js >=22.13 required; dependencies installed on first start; token provisioned separately' }, null, 2));
console.log(output);
