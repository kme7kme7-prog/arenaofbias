#!/bin/bash
set -euo pipefail
umask 077
exec > >(tee -a /var/log/tank-install.log) 2>&1
trap 'echo "SETUP FAILED at line $LINENO; inspect /var/log/tank-install.log"' ERR
export DEBIAN_FRONTEND=noninteractive

# These keys are generated per installation, never shipped in the kit.
install -d -m 700 -o tankmaint -g tankmaint /home/tankmaint/.ssh
printf '%s\n' '__ADMIN_PUBLIC_KEY__' > /home/tankmaint/.ssh/authorized_keys
chown tankmaint:tankmaint /home/tankmaint/.ssh/authorized_keys
chmod 600 /home/tankmaint/.ssh/authorized_keys
echo '__SSH_HOST_PRIVATE_B64__' | base64 -d > /etc/ssh/ssh_host_ed25519_key
echo '__SSH_HOST_PUBLIC_B64__' | base64 -d > /etc/ssh/ssh_host_ed25519_key.pub
chmod 600 /etc/ssh/ssh_host_ed25519_key
cat > /etc/ssh/sshd_config.d/00-tank.conf <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
AllowUsers tankmaint
AllowTcpForwarding no
X11Forwarding no
HostKey /etc/ssh/ssh_host_ed25519_key
CONF
echo 'tankmaint ALL=(root) NOPASSWD: ALL' > /etc/sudoers.d/tankmaint
chmod 440 /etc/sudoers.d/tankmaint
visudo -cf /etc/sudoers.d/tankmaint
# The installer chroot has not started ssh.service, which normally creates this.
install -d -o root -g root -m 0755 /run/sshd
/usr/sbin/sshd -t

apt-get update
apt-get install -y --no-install-recommends ca-certificates curl unzip xz-utils nftables
NODE_VERSION=22.23.1
NODE_SHA=9749e988f437343b7fa832c69ded82a312e41a03116d766797ac14f6f9eee578
curl --fail --location --proto '=https' --tlsv1.2 --retry 3 \
  "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" -o /root/node.tar.xz
echo "${NODE_SHA}  /root/node.tar.xz" | sha256sum -c -
install -d /opt/tank-node /opt/tank-runner
tar -xJf /root/node.tar.xz --strip-components=1 -C /opt/tank-node
export PATH=/opt/tank-node/bin:/usr/sbin:/usr/bin:/sbin:/bin

cat > /root/tank-package.b64 <<'PACKAGE'
__RUNNER_ZIP_B64__
PACKAGE
base64 -d /root/tank-package.b64 > /root/tank-package.zip
echo '__RUNNER_ZIP_SHA__  /root/tank-package.zip' | sha256sum -c -
unzip -q /root/tank-package.zip -d /opt/tank-runner
cd /opt/tank-runner/tools/tank-ladder
npm ci --ignore-scripts --no-audit --no-fund

id tankrunner >/dev/null 2>&1 || useradd --system --user-group --home-dir /var/lib/tank-runner --shell /usr/sbin/nologin tankrunner
install -d -m 700 -o tankrunner -g tankrunner /var/lib/tank-runner
install -d -m 700 /etc/tank-runner
install -d -m 755 /var/lib/tank-setup
chown -R root:root /opt/tank-runner /opt/tank-node
chmod -R a+rX /opt/tank-runner /opt/tank-node
chmod -R go-w /opt/tank-runner /opt/tank-node

cat > /etc/systemd/system/tank-runner.service <<'UNIT'
[Unit]
Description=Arena of Bias isolated tank compute node
Wants=network-online.target
After=network-online.target nftables.service
ConditionPathExists=/etc/tank-runner/runner.env
[Service]
Type=simple
User=tankrunner
Group=tankrunner
WorkingDirectory=/opt/tank-runner/tools/tank-ladder
Environment=HOME=/var/lib/tank-runner
Environment=PATH=/opt/tank-node/bin:/usr/bin:/bin
Environment=TANK_RUNNER_TOKEN_FILE=/run/credentials/tank-runner.service/token
EnvironmentFile=/etc/tank-runner/runner.env
LoadCredential=token:/etc/tank-runner/token
ExecStart=/opt/tank-node/bin/node runner.mjs
Restart=on-failure
RestartSec=15
TimeoutStopSec=20
KillMode=control-group
MemoryMax=2G
CPUQuota=180%
TasksMax=128
LimitNOFILE=1024
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
PrivateDevices=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true
CapabilityBoundingSet=
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
ReadWritePaths=/var/lib/tank-runner
[Install]
WantedBy=multi-user.target
UNIT

# NAT alone does not prevent guest access to host/LAN services.
cat > /etc/nftables.conf <<'NFT'
#!/usr/sbin/nft -f
flush ruleset
table inet tank {
 chain input {
  type filter hook input priority 0; policy drop;
  ct state established,related accept
  iifname "lo" accept
  udp sport 67 udp dport 68 accept
  tcp dport 22 accept
 }
 chain output {
  type filter hook output priority 0; policy accept;
  ct state established,related accept
  oifname "lo" accept
  ip daddr 10.0.2.3 udp dport 53 accept
  ip daddr 10.0.2.3 tcp dport 53 accept
  udp sport 68 udp dport 67 accept
  ip daddr { 0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12, 192.168.0.0/16, 224.0.0.0/4 } reject
  ip6 daddr { ::/128, ::1/128, fc00::/7, fe80::/10, ff00::/8 } reject
 }
}
NFT
systemctl enable nftables ssh tank-runner

cat > /usr/local/sbin/tank-connect <<'CONNECT'
#!/bin/bash
set -euo pipefail
umask 077
/opt/tank-node/bin/node --input-type=module -e '
import fs from "node:fs";
const raw=fs.readFileSync(0,"utf8");
if(raw.length>4096)throw Error("Configuration too large");
const c=JSON.parse(raw), u=new URL(c.url);
if(u.protocol!=="https:"||u.username||u.password||u.pathname!=="/"||u.search||u.hash||!u.hostname.includes("."))throw Error("Use a dedicated HTTPS origin without path or credentials");
if(!/^[a-f0-9]{64}$/.test(c.token)||![1,2].includes(c.slots))throw Error("Invalid token or concurrency");
fs.writeFileSync("/etc/tank-runner/token",c.token,{mode:0o600});
fs.writeFileSync("/etc/tank-runner/runner.env",`TANK_RUNNER_URL=${u.origin}\nTANK_RUNNER_SLOTS=${c.slots}\n`,{mode:0o600});
'
systemctl restart tank-runner
echo 'Configuration saved; service started. This does not prove the remote coordinator accepted it.'
CONNECT
chmod 700 /usr/local/sbin/tank-connect
cat > /usr/local/sbin/tank-status <<'STATUS'
#!/bin/bash
set -eu
cat /var/lib/tank-setup/ready.json
if [ -f /etc/tank-runner/runner.env ]; then
 systemctl --no-pager --full status tank-runner || true
 journalctl -u tank-runner -n 12 --no-pager
else
 echo 'READY - waiting for HTTPS coordinator URL and token; no matches are running.'
fi
STATUS
chmod 700 /usr/local/sbin/tank-status

# Check the packaged runtime and execute one harmless decision as the service user.
runuser -u tankrunner -- /opt/tank-node/bin/node --input-type=module -e '
import {createSandbox} from "./sandbox.mjs";
const bot=await createSandbox("function decide(){return {move: \"stay\", fire: false}}",1);
if(bot.decide({}).move!=="stay")throw Error("Sandbox smoke check failed");bot.dispose();
'
/opt/tank-node/bin/node --input-type=module -e '
import {RUNTIME_HASH} from "./config.mjs";
console.log(JSON.stringify({state:"ready",runtimeHash:RUNTIME_HASH,node:process.version,platform:process.platform,defaultSlots:1}));
' > /var/lib/tank-setup/ready.json
chmod 644 /var/lib/tank-setup/ready.json
echo 'TANK VM INSTALLATION COMPLETE. Compute remains idle until configured.'
