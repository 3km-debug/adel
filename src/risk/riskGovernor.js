import { minutesToMs } from '../utils/time.js';

export function evaluateRiskConstraints(input, config, cooldowns = {}) {
  const reasons = [];

  const {
    nowMs,
    controls,
    intent,
    allocation,
    portfolio,
    performance,
    quoteMetrics,
  } = input;

  if (controls.emergencyStop) reasons.push('emergency_stop_active');
  if (controls.pauseUntilMs && nowMs < controls.pauseUntilMs) reasons.push('bot_paused');

  if (portfolio.openPositions >= config.risk.maxOpenPositions) {
    reasons.push('max_open_positions_reached');
  }

  if (allocation.amountSol <= 0) {
    reasons.push('allocation_zero');
  }

  if (allocation.amountSol > config.risk.maxTradeSol) {
    reasons.push('trade_size_exceeds_max');
  }

  const maxExposureSol = portfolio.equitySol * config.risk.maxExposurePct;
  if (portfolio.exposureSol + allocation.amountSol > maxExposureSol) {
    reasons.push('exposure_limit_exceeded');
  }

  if (performance.dailyPnlSol <= -Math.abs(config.risk.maxDailyLossSol)) {
    reasons.push('daily_loss_limit_breached');
  }

  if (performance.drawdownPct >= config.risk.maxDrawdownPct) {
    reasons.push('drawdown_limit_breached');
  }

  if (performance.consecutiveLosses >= config.risk.maxConsecutiveLosses) {
    reasons.push('consecutive_losses_limit_breached');
  }

  const cooldown = cooldowns[intent.mint];
  if (cooldown && nowMs < cooldown.untilMs) {
    reasons.push('token_cooldown_active');
  }

  if ((quoteMetrics?.priceImpactBps ?? 0) > config.risk.maxPriceImpactBps) {
    reasons.push('price_impact_too_high');
  }

  if ((quoteMetrics?.instantLossBps ?? 0) > config.risk.maxInstantLossBps) {
    reasons.push('instant_loss_too_high');
  }

  return {
    allowed: reasons.length === 0,
    reasons,
  };
}

export class RiskGovernor {
  constructor(config, storage, logger) {
    this.config = config;
    this.storage = storage;
    this.logger = logger;
    this.cooldowns = storage.getState('tokenCooldowns', {});
  }

  setCooldown(mint, reason, durationMinutes = this.config.risk.tokenCooldownMinutes) {
    const untilMs = Date.now() + minutesToMs(durationMinutes);
    this.cooldowns[mint] = {
      reason,
      untilMs,
      updatedAt: new Date().toISOString(),
    };
    this.storage.setState('tokenCooldowns', this.cooldowns);
  }

  evaluate(input) {
    const decision = evaluateRiskConstraints(input, this.config, this.cooldowns);

    if (!decision.allowed) {
      this.logger.warn('risk.entry_blocked', {
        mint: input.intent.mint,
        reasons: decision.reasons,
      });
    }

    return decision;
  }

  onTradeClosed({ mint, pnlSol }) {
    if (Number(pnlSol || 0) < 0) {
      this.setCooldown(mint, 'loss_realized');
    }
  }

  getCooldowns() {
    return this.cooldowns;
  }
}
