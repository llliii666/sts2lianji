#!/usr/bin/env bash
set -Eeuo pipefail

log() {
  printf '\n== %s ==\n' "$*"
}

require_ubuntu_24() {
  if [[ ! -r /etc/os-release ]]; then
    echo "Cannot read /etc/os-release." >&2
    exit 1
  fi

  # shellcheck disable=SC1091
  source /etc/os-release
  if [[ "${ID:-}" != "ubuntu" || "${VERSION_ID:-}" != 24.* ]]; then
    echo "This script is intended for Ubuntu 24.x. Detected: ${PRETTY_NAME:-unknown}" >&2
    exit 1
  fi
}

as_root() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

INSTALL_CADDY="${INSTALL_CADDY:-0}"

require_ubuntu_24

log "Install base packages"
as_root apt-get update
as_root apt-get install -y ca-certificates curl gnupg git debian-keyring debian-archive-keyring apt-transport-https

log "Configure NodeSource Node.js 24 repository"
if [[ "$(id -u)" -eq 0 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
else
  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
fi
as_root apt-get install -y nodejs

if [[ "$INSTALL_CADDY" == "1" ]]; then
  if ss -ltn 2>/dev/null | awk '{print $4}' | grep -Eq '(^|:)(80|443)$'; then
    echo "Port 80 or 443 is already in use. Refusing to install/start Caddy automatically." >&2
    echo "Use the existing reverse proxy, or stop the listener before rerunning with INSTALL_CADDY=1." >&2
    exit 1
  fi

  log "Configure official Caddy repository"
  as_root install -d -m 0755 /usr/share/keyrings
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | as_root gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | as_root tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  as_root chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  as_root chmod o+r /etc/apt/sources.list.d/caddy-stable.list
  as_root apt-get update
  as_root apt-get install -y caddy
  as_root systemctl enable --now caddy
else
  log "Skip Caddy"
  echo "INSTALL_CADDY is not 1. This is correct when Nginx already owns port 80/443."
fi

log "Verify installed environment"
git --version
node --version
npm --version
node --no-warnings=ExperimentalWarning -e "require('node:sqlite'); console.log('node:sqlite ok')"
if command -v caddy >/dev/null 2>&1; then
  caddy version
  systemctl is-active caddy || true
else
  echo "caddy skipped"
fi

log "Done"
echo "Next: clone the repository, run npm ci, npm run build, then create the systemd app service."
