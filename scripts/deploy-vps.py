"""Deploy a reviewed Git commit, never local data or untracked files.

First: npm run deploy:vps -- --check. Then: npm run deploy:vps.
Requires Paramiko (installed normally or in .local/vps-python) and known_hosts.
Credentials: .local/vps-credentials.txt, or VPS_HOST/VPS_USER with SSH keys/agent.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import io
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tarfile

ROOT = Path(__file__).resolve().parent.parent
REMOTE = '/www/wwwroot/arenaofbias'
LOCAL = ROOT / '.local/deploy-vps'


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)


def run(client, command):
    _, stdout, stderr = client.exec_command(command, timeout=600)
    result = stdout.read().decode('utf8', errors='replace')
    error = stderr.read().decode('utf8', errors='replace')
    if stdout.channel.recv_exit_status():
        raise RuntimeError(result + error)
    if error:
        print(error, file=sys.stderr)
    return result


def remote_hashes(client, files):
    code = ('import pathlib,hashlib,json; root=pathlib.Path(' + repr(REMOTE) + '); '
            'files=' + repr(files) + '; print(json.dumps({f:'
            'hashlib.sha256((root/f).read_bytes()).hexdigest() '
            'if (root/f).is_file() else None for f in files}))')
    return json.loads(run(client, 'python3 -c ' + shlex.quote(code)))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Read-only remote audit; save the deployment plan locally')
    args = parser.parse_args()
    if git('status', '--porcelain', '--untracked-files=no').strip():
        raise RuntimeError('Commit tracked changes before checking/deploying; untracked works are excluded.')
    revision = git('rev-parse', 'HEAD').decode().strip()
    # git archive also applies core.autocrlf; force LF for Linux shell scripts.
    archive = git('-c', 'core.autocrlf=false', '-c', 'core.eol=lf', 'archive', '--format=tar', 'HEAD')
    files = {}
    with tarfile.open(fileobj=io.BytesIO(archive)) as source:
        for item in source:
            if not item.isfile():
                continue
            name = item.name
            # Historical tracked review artifacts must not block or enter a release.
            if name.split('/')[0] in {'gui-test-screenshots', 'output', 'outputs'}:
                continue
            if name.split('/')[0] in {'.local', '.git', 'data', 'dist', 'node_modules', 'Temp'} or name.startswith('.env'):
                raise RuntimeError('Forbidden deployment path: ' + name)
            files[name] = source.extractfile(item).read()
    sys.path.insert(0, str(ROOT / '.local/vps-python'))
    import paramiko
    credentials = {}
    credential_file = ROOT / '.local/vps-credentials.txt'
    if credential_file.exists():
        for line in credential_file.read_text(encoding='utf-8-sig').splitlines():
            for separator in ('=', ':', '：'):
                if separator in line:
                    key, value = line.split(separator, 1)
                    credentials[key.strip()] = value.strip()
                    break
    host = os.environ.get('VPS_HOST', credentials.get('host', '114.66.27.88'))
    user = os.environ.get('VPS_USER', credentials.get('username', 'root'))
    port = int(os.environ.get('VPS_PORT', credentials.get('port', '22')))
    # Never send a stored password to an overridden destination.
    password = credentials.get('password') if (host, user, str(port)) == (
        credentials.get('host'), credentials.get('username'), credentials.get('port', '22')) else None
    client = paramiko.SSHClient()
    client.load_system_host_keys(str(Path.home() / '.ssh/known_hosts'))
    client.connect(host, port=port, username=user, password=password,
                   look_for_keys=password is None, allow_agent=password is None, timeout=20)
    try:
        before = remote_hashes(client, list(files))
        hashes = {name: hashlib.sha256(data).hexdigest() for name, data in files.items()}
        changed = [name for name in files if before[name] != hashes[name]]
        plan = {'revision': revision, 'host': host, 'port': port, 'user': user,
                'root': REMOTE, 'before': before, 'hashes': hashes, 'changed': changed}
        LOCAL.mkdir(parents=True, exist_ok=True)
        plan_file = LOCAL / 'plan.json'
        if args.check:
            plan_file.write_text(json.dumps(plan, indent=2), encoding='utf8')
            print(json.dumps({'revision': revision, 'files': len(files), 'changed': changed}, ensure_ascii=False))
            return
        if not plan_file.exists() or json.loads(plan_file.read_text(encoding='utf8')) != plan:
            raise RuntimeError('Plan missing or local/remote files changed. Run --check and review the new plan.')
        if not changed:
            print('All committed source files already match the server; no deployment needed.')
            return
        stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        stage = '/tmp/aob-deploy-' + stamp + '-' + revision[:8]
        run(client, 'install -d -m 700 ' + shlex.quote(stage))
        with tarfile.open(LOCAL / 'source.tgz', 'w:gz') as target:
            for name, data in files.items():
                item = tarfile.TarInfo(name)
                item.size = len(data)
                item.mode = 0o644
                target.addfile(item, io.BytesIO(data))
        with client.open_sftp() as sftp:
            sftp.put(str(LOCAL / 'source.tgz'), stage + '/source.tgz')
            sftp.put(str(plan_file), stage + '/plan.json')
            with sftp.open(stage + '/apply.sh', 'wb') as target:
                target.write(files['scripts/deploy-vps-remote.sh'])
        print('Staged ' + revision + '; building before changing the live site.', flush=True)
        print(run(client, 'bash ' + shlex.quote(stage + '/apply.sh') + ' ' + shlex.quote(stage)))
    finally:
        client.close()


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    main()
