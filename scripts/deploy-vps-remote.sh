#!/usr/bin/env bash
# Called by deploy-vps.py after an unchanged --check plan.
set -euo pipefail
stage="${1:?staging directory required}"
[[ "$stage" =~ ^/tmp/aob-deploy-[0-9TZ]+-[0-9a-f]{8}$ ]] || exit 2
root=/www/wwwroot/arenaofbias
backup="/www/wwwroot/arenaofbias-deploy-backups/${stage##*/}"
export AOB_ROOT="$root" AOB_STAGE="$stage" AOB_BACKUP="$backup"
mkdir "$stage/source"
tar xzf "$stage/source.tgz" -C "$stage/source"
ln -s "$root/node_modules" "$stage/source/node_modules"
cd "$stage/source"
# Dependency upgrades require a separate reviewed install; leave live node_modules alone.
node --input-type=module <<'NODE'
import fs from 'node:fs'; import assert from 'node:assert/strict';
const local=JSON.parse(fs.readFileSync('package.json'));
const live=JSON.parse(fs.readFileSync(process.env.AOB_ROOT+'/package.json'));
for(const key of ['dependencies','devDependencies']) assert.deepEqual(local[key],live[key],'Dependency changes require a separate install');
NODE
node node_modules/vite/bin/vite.js build --outDir "$stage/dist" > "$stage/build.log" 2>&1 || { tail -n 50 "$stage/build.log"; exit 1; }
cd "$root"
node --input-type=module <<'NODE'
import fs from 'node:fs'; import assert from 'node:assert/strict'; import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const plan=JSON.parse(fs.readFileSync(process.env.AOB_STAGE+'/plan.json'));
for(const [name,hash] of Object.entries(plan.before)) {
  const now=fs.existsSync(name)?createHash('sha256').update(fs.readFileSync(name)).digest('hex'):null;
  assert.equal(now,hash,'Remote changed after audit: '+name);
}
const app=JSON.parse(execFileSync('pm2',['jlist'])).find(p=>p.name==='arena');
assert.equal(app?.pm2_env.status,'online');
assert.equal(app.pm2_env.pm_cwd,process.env.AOB_ROOT);
fs.writeFileSync(process.env.AOB_STAGE+'/existing.txt',plan.changed.filter(f=>plan.before[f]!==null).join('\n')+'\n');
const contentChanged=name=>!fs.existsSync(name) || fs.readFileSync(name,'utf8').replaceAll('\r\n','\n')!==fs.readFileSync(process.env.AOB_STAGE+'/source/'+name,'utf8').replaceAll('\r\n','\n');
fs.writeFileSync(process.env.AOB_STAGE+'/restart',plan.changed.some(f=>(f.startsWith('server/') || f.startsWith('lib/')) && contentChanged(f))?'yes':'no');
const oldDist=[];
function walk(dir,prefix='') {
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const name=prefix+entry.name;
    if(entry.isDirectory()) walk(dir+'/'+entry.name,name+'/');
    else if(fs.existsSync('dist/'+name)) oldDist.push('dist/'+name);
  }
}
walk(process.env.AOB_STAGE+'/dist');
fs.writeFileSync(process.env.AOB_STAGE+'/dist-existing.txt',oldDist.join('\n')+'\n');
NODE
install -d -m 700 "$backup"
tar czf "$backup/source.tgz" -T "$stage/existing.txt"
tar czf "$backup/dist.tgz" -T "$stage/dist-existing.txt"
cp "$stage/plan.json" "$backup/plan.json"
node --input-type=module <<'NODE'
import Database from 'better-sqlite3';
const db=new Database('data/comments.db',{readonly:true});
await db.backup(process.env.AOB_BACKUP+'/comments.db'); db.close();
NODE
rollback() {
  trap - ERR
  tar xzf "$backup/source.tgz" -C "$root"
  tar xzf "$backup/dist.tgz" -C "$root"
  node --input-type=module <<'NODE'
import fs from 'node:fs';
const plan=JSON.parse(fs.readFileSync(process.env.AOB_STAGE+'/plan.json'));
for(const name of plan.changed) if(plan.before[name]===null) fs.rmSync(name,{force:true});
NODE
  if [[ "$(cat "$stage/restart")" == yes ]]; then pm2 restart arena; fi
  echo "Deployment failed; code and entry pages restored. Database NOT rolled back. Backup: $backup" >&2
  exit 1
}
trap rollback ERR
node --input-type=module <<'NODE'
import fs from 'node:fs'; import path from 'node:path';
const plan=JSON.parse(fs.readFileSync(process.env.AOB_STAGE+'/plan.json'));
for(const name of plan.changed) {
  fs.mkdirSync(path.dirname(name),{recursive:true});
  fs.copyFileSync(process.env.AOB_STAGE+'/source/'+name,name);
}
NODE
# Keep old hash assets for already-open pages; build contains only tracked public assets.
tar -C "$stage/dist" --exclude=./index.html --exclude=./admin.html --exclude=./capture.html -cf - . | tar -xf - -C "$root/dist"
for name in index.html admin.html capture.html; do
  install -m 644 "$stage/dist/$name" "$root/dist/$name.next"
  mv "$root/dist/$name.next" "$root/dist/$name"
done
if [[ "$(cat "$stage/restart")" == yes ]]; then pm2 restart arena; fi
node --input-type=module <<'NODE'
import fs from 'node:fs'; import assert from 'node:assert/strict'; import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const plan=JSON.parse(fs.readFileSync(process.env.AOB_STAGE+'/plan.json'));
for(const [name,hash] of Object.entries(plan.hashes)) assert.equal(createHash('sha256').update(fs.readFileSync(name)).digest('hex'),hash,name);
for(let attempt=0;;attempt++) {
  try { const r=await fetch('http://127.0.0.1:3000/api/prompts'); assert.equal(r.status,200); break; }
  catch(error) { if(attempt===19) throw error; await new Promise(r=>setTimeout(r,500)); }
}
let assets=0;
for(const page of ['index.html','admin.html','capture.html']) {
  const response=await fetch('http://127.0.0.1:3000/'+(page==='index.html'?'':page));
  assert.equal(response.status,200);
  const html=await response.text();
  const refs=[...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(m=>m[1]))];
  assert.ok(refs.length>0);
  for(const ref of refs) {
    const res=await fetch('http://127.0.0.1:3000'+ref); assert.equal(res.status,200);
    assert.deepEqual(Buffer.from(await res.arrayBuffer()),fs.readFileSync('dist'+ref)); assets++;
  }
}
const app=JSON.parse(execFileSync('pm2',['jlist'])).find(p=>p.name==='arena');
assert.equal(app?.pm2_env.status,'online');
console.log(JSON.stringify({revision:plan.revision,sources:Object.keys(plan.hashes).length,assets,status:app.pm2_env.status,pid:app.pid,restarts:app.pm2_env.restart_time,backup:process.env.AOB_BACKUP}));
NODE
trap - ERR
printf '%s\n' DEPLOY_OK
