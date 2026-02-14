#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash scripts/hetzner-bootstrap.sh"
  exit 1
fi

TARGET_USER="${TARGET_USER:-solbot}"

apt-get update
apt-get install -y ca-certificates curl gnupg ufw git

if ! id -u "${TARGET_USER}" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "${TARGET_USER}"
fi
usermod -aG sudo "${TARGET_USER}"

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

source /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

usermod -aG docker "${TARGET_USER}"

ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw --force enable

echo "Bootstrap complete for user ${TARGET_USER}. Re-login as that user before running docker commands."
