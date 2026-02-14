import { clamp } from '../utils/math.js';

export function evaluateAntiScamGate(candidate, config) {
  const reasons = [];
  const c = candidate || {};
  const w = config.watchlist;

  if (!c.mint) reasons.push('missing_mint');
  if (!c.exists) reasons.push('mint_not_found');

  if (w.denyToken2022 && c.isToken2022) {
    reasons.push('token2022_blocked');
  }

  if (w.denyFreezeAuthority && c.freezeAuthority) {
    reasons.push('freeze_authority_present');
  }

  if (w.requireMintAuthorityRenounced && c.mintAuthority) {
    reasons.push('mint_authority_present');
  }

  if (w.requireVerifiedToken && !c.isVerified) {
    reasons.push('token_not_verified');
  }

  if (c.liquidityUsd == null && !w.allowUnknownMetrics) {
    reasons.push('unknown_liquidity');
  }

  if (c.volume24hUsd == null && !w.allowUnknownMetrics) {
    reasons.push('unknown_volume');
  }

  if (Number.isFinite(c.liquidityUsd) && c.liquidityUsd < w.minLiquidityUsd) {
    reasons.push('liquidity_too_low');
  }

  if (Number.isFinite(c.volume24hUsd) && c.volume24hUsd < w.minVolume24hUsd) {
    reasons.push('volume_too_low');
  }

  if (Number.isFinite(c.holders) && c.holders < w.minHolders) {
    reasons.push('holders_too_low');
  }

  if (Number.isFinite(c.ageHours) && c.ageHours > w.maxTokenAgeHours) {
    reasons.push('token_too_old');
  }

  if (Number.isFinite(c.spreadBps) && c.spreadBps > w.maxSpreadBps) {
    reasons.push('spread_too_wide');
  }

  const qualitySignals = [
    c.exists ? 1 : 0,
    !c.isToken2022 ? 1 : 0,
    !c.freezeAuthority ? 1 : 0,
    Number.isFinite(c.liquidityUsd) ? clamp(c.liquidityUsd / Math.max(1, w.minLiquidityUsd), 0, 2) / 2 : 0,
    Number.isFinite(c.volume24hUsd) ? clamp(c.volume24hUsd / Math.max(1, w.minVolume24hUsd), 0, 2) / 2 : 0,
  ];

  const score = clamp(qualitySignals.reduce((sum, v) => sum + v, 0) / qualitySignals.length, 0, 1);

  return {
    allowed: reasons.length === 0,
    reasons,
    score,
  };
}
