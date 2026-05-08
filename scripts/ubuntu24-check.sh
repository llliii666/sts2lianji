#!/usr/bin/env bash
set -Eeuo pipefail

echo "== spire-lobby ubuntu environment check =="
date -Is
echo

echo "== os =="
if [[ -r /etc/os-release ]]; then
  cat /etc/os-release
else
  uname -a
fi
echo

echo "== hardware =="
uname -m
nproc || true
free -h || true
df -h / || true
echo

echo "== network =="
hostname -I || true
ip -br addr || true
echo

echo "== commands =="
for cmd in sudo git curl gpg node npm caddy systemctl ss ufw; do
  if command -v "$cmd" >/dev/null 2>&1; then
    printf "%-10s %s\n" "$cmd" "$(command -v "$cmd")"
  else
    printf "%-10s MISSING\n" "$cmd"
  fi
done
echo

echo "== versions =="
git --version 2>/dev/null || true
curl --version 2>/dev/null | head -n 1 || true
gpg --version 2>/dev/null | head -n 1 || true
node --version 2>/dev/null || true
npm --version 2>/dev/null || true
caddy version 2>/dev/null || true
echo

echo "== node sqlite support =="
if command -v node >/dev/null 2>&1; then
  node --no-warnings=ExperimentalWarning -e "require('node:sqlite'); console.log('node:sqlite ok')" || true
else
  echo "node missing"
fi
echo

echo "== services =="
systemctl is-system-running 2>/dev/null || true
systemctl is-enabled caddy 2>/dev/null || true
systemctl is-active caddy 2>/dev/null || true
echo

echo "== listening ports =="
ss -ltnp 2>/dev/null | sed -n '1,20p' || true
echo

echo "== firewall =="
if command -v ufw >/dev/null 2>&1; then
  if [[ "$(id -u)" -eq 0 ]]; then
    ufw status verbose || true
  elif sudo -n true 2>/dev/null; then
    sudo ufw status verbose || true
  else
    ufw status verbose 2>/dev/null || echo "ufw status requires sudo"
  fi
else
  echo "ufw missing"
fi
echo

echo "== apt policy =="
apt-cache policy nodejs 2>/dev/null | sed -n '1,20p' || true
apt-cache policy caddy 2>/dev/null | sed -n '1,20p' || true
echo

echo "== result hints =="
echo "Need Ubuntu 24.x, node >=24, npm >=10, git, curl, caddy, systemd."
echo "If node:sqlite says ok and ports 80/443 are free or owned by caddy, the server is a good fit."
