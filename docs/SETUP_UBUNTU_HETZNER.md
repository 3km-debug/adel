# Ubuntu (Hetzner) Setup Guide

## 1) Provision server
- Use Ubuntu 24.04 LTS.
- Create a dedicated user:
  ```bash
  sudo adduser --disabled-password --gecos "" solbot
  sudo usermod -aG sudo solbot
  ```
- Login as `solbot`.

## 2) Harden SSH and firewall
- Disable password login and root SSH.
- Enable UFW and allow only SSH:
  ```bash
  sudo ufw default deny incoming
  sudo ufw default allow outgoing
  sudo ufw allow OpenSSH
  sudo ufw enable
  ```

## 3) Install Docker and Compose
```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

## 4) Deploy bot
```bash
git clone <your-repo-url> bot
cd bot
cp .env.example .env
cp config.yaml.example config.yaml
```

## 5) Encrypt dedicated Phantom hot-wallet key
- Keep wallet funds limited to risk budget.
- Encrypt private key on server:
  ```bash
  export KEY_ENCRYPTION_PASSWORD='set-a-strong-long-password'
  npm install
  node scripts/encrypt-key.js --key '<BASE58_PRIVATE_KEY>' --out storage/secrets/key.enc
  node scripts/print-public-key.js storage/secrets/key.enc
  ```
- Put printed public key into:
  - `.env` as `WALLET_PUBLIC_KEY`
  - `config.yaml` as `wallet.expectedPublicKey`

## 6) Configure run mode
- Start with strict shadow mode:
  - `.env`: `SHADOW_MODE=true`
  - `.env`: `LIVE_TRADING_ENABLED=false`
- Keep `telegram.enabled=true` only after bot token/chat setup.

## 7) Start services
```bash
docker compose build
docker compose up -d
```

## 8) Validate health
```bash
docker compose ps
docker compose logs -f bot
node scripts/run-healthcheck.js config.yaml
```

## 9) Promote to live (after shadow validation)
- Confirm at least multiple days of stable metrics/reports.
- Change:
  - `.env`: `SHADOW_MODE=false`
  - `.env`: `LIVE_TRADING_ENABLED=true`
- Restart:
  ```bash
  docker compose up -d --force-recreate
  ```

## 10) Key operational controls
- Telegram commands:
  - `/status`
  - `/pause`
  - `/resume`
  - `/shadow_on`
  - `/shadow_off`
  - `/emergency_stop`
  - `/clear_emergency`

## 11) File permissions
```bash
chmod 700 storage
chmod 700 storage/secrets
chmod 600 storage/secrets/key.enc
chmod 600 .env
```

## 12) Backup and restore
- Automatic backup sidecar runs daily.
- Manual backup:
  ```bash
  bash scripts/backup-storage.sh
  ```
- Restore by replacing `storage/runtime/trading.sqlite` with a backup and restarting containers.
