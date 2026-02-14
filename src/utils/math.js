export function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function safeDiv(numerator, denominator, fallback = 0) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return fallback;
  }
  return numerator / denominator;
}

export function mean(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const total = values.reduce((sum, v) => sum + safeNumber(v, 0), 0);
  return total / values.length;
}

export function median(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = values.map((v) => safeNumber(v, 0)).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export function standardDeviation(values) {
  if (!Array.isArray(values) || values.length < 2) return 0;
  const avg = mean(values);
  const variance = mean(values.map((v) => {
    const diff = safeNumber(v, 0) - avg;
    return diff * diff;
  }));
  return Math.sqrt(variance);
}

export function percentChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return 0;
  return (current - previous) / previous;
}
