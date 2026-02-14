export function parsePriceImpactBps(rawValue) {
  const n = Number(rawValue);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 10_000);
}

export function lamportsToSol(rawLamports) {
  const n = Number(rawLamports || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n / 1_000_000_000;
}

export function computeInstantLossBps(inputSol, expectedOutputSol) {
  const inSol = Number(inputSol || 0);
  const outSol = Number(expectedOutputSol || 0);
  if (!(inSol > 0)) return 0;
  const loss = (inSol - outSol) / inSol;
  if (!Number.isFinite(loss) || loss <= 0) return 0;
  return Math.round(loss * 10_000);
}

export function calcPnlPct(currentValueSol, costBasisSol) {
  const current = Number(currentValueSol || 0);
  const cost = Number(costBasisSol || 0);
  if (!(cost > 0)) return 0;
  return (current - cost) / cost;
}

export function calcPnlSol(currentValueSol, costBasisSol) {
  return Number(currentValueSol || 0) - Number(costBasisSol || 0);
}
