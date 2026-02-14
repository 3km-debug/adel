# CHANGES

## 2026-02-14

Full architecture upgrade to an institutional autonomous Solana memecoin trading system.

### Major additions
- Modular runtime under `/src` for data, watchlist, MRD, strategies, verifier, risk, allocation, execution, governance, position management, evaluation, reporting, health, and Telegram.
- Deterministic hard-risk governor with reason codes and token cooldown management.
- Performance guard with circuit-breaker pause logic.
- 4-strategy portfolio engine with governance-aware shadow/live routing.
- Jupiter execution intelligence with EQS scoring and retry escalation.
- Encrypted key vault (`AES-256-GCM + scrypt`) and key management scripts.
- SQLite storage layer for trades, positions, events, bot state, strategy stats, and equity snapshots.
- Docker and docker-compose deployment with health checks and daily backup sidecar.
- Daily report generation and operational scripts.
- Ubuntu Hetzner production setup documentation.
- Unit tests for risk governor, anti-scam gate, and EQS.

### Defaults and safety posture
- Global shadow mode enabled by default.
- Live trading disabled by default.
- Experimental signal fusion disabled by default with documented reliability rationale.
