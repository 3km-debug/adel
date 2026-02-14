# Institutional Solana Memecoin Trading System

Autonomous Solana memecoin trading system with deterministic risk governance, Jupiter execution, encrypted key handling, multi-strategy allocation, shadow mode promotion/rollback, and Telegram controls.

## Core guarantees
- Continuous autonomous loop: scan -> analyze -> decide -> execute -> manage -> evaluate -> adapt.
- Safety-first architecture: risk governor hard constraints and performance circuit breakers.
- Deterministic control decisions via coded reason codes.
- Capital preservation defaults: starts in shadow mode, live disabled.
- Unreliable feature policy: experimental signal fusion is disabled by default with explicit reason in config.

## Architecture
- Data Layer: RPC failover + market/Jupiter data clients.
- Token Watchlist & Anti-Scam Gate.
- Market Regime Detection (MRD).
- Multi-Strategy Portfolio Engine (4 strategies):
  - Trend Breakout Momentum
  - Mean Reversion Range
  - Volatility Compression
  - Liquidity-Aware Conservative
- Verifier (critique layer).
- Risk Governor (hard deterministic limits).
- Capital Allocation Engine.
- Execution Intelligence Layer + EQS scoring.
- Position Management.
- Self-Evaluation Loop.
- Performance Guard & Circuit Breakers.
- Strategy Governance (shadow promotion/rollback).
- Storage Layer (SQLite + backups).
- Telegram Bot Interface.
- Health monitoring + RPC failover.

## Repository structure
- `/src` runtime modules
- `/scripts` operations scripts (key encryption, backup, healthcheck, reports)
- `/storage` runtime data, backups, reports, secrets
- `/tests` unit tests

## Quick start
```bash
npm install
cp .env.example .env
cp config.yaml.example config.yaml
```

1. Add RPC and wallet metadata in `.env` and `config.yaml`.
2. Add watchlist mints in `storage/watchlist/manual_tokens.json`.
3. Encrypt dedicated wallet key:
   ```bash
   export KEY_ENCRYPTION_PASSWORD='strong-password'
   npm run encrypt-key -- --key '<BASE58_PRIVATE_KEY>' --out storage/secrets/key.enc
   npm run print-public-key -- storage/secrets/key.enc
   ```
4. Start bot:
   ```bash
   npm start
   ```

## Live-trading safety rollout
1. Run shadow mode only (`SHADOW_MODE=true`, `LIVE_TRADING_ENABLED=false`).
2. Review daily reports in `storage/reports`.
3. Validate health file `storage/runtime/health.json`.
4. Enable live only after shadow metrics are stable.

## Docker
```bash
docker compose build
docker compose up -d
```

- Bot container uses restart policy and healthcheck.
- Backup sidecar creates daily SQLite snapshots.

## Testing
```bash
npm test
```

Included unit tests:
- Risk governor hard constraints.
- Anti-scam gate rules.
- EQS scoring behavior.

## Reports and operations
- Generate daily report manually:
  ```bash
  npm run report -- config.yaml
  ```
- Manual backup:
  ```bash
  npm run backup
  ```
- Health check:
  ```bash
  npm run healthcheck -- config.yaml
  ```

## Ubuntu deployment
Detailed Hetzner deployment steps:
- `docs/SETUP_UBUNTU_HETZNER.md`

## Security notes
- Never use your main wallet.
- Use a dedicated low-balance Phantom hot wallet.
- Store private key only as encrypted `key.enc`.
- Decryption password must be provided only at runtime via env var.
- Secrets are redacted from logs by logger middleware.
