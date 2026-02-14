export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function nowIso() {
  return new Date().toISOString();
}

export function utcDateKey(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10);
}

export function minutesToMs(minutes) {
  return Math.max(0, Number(minutes || 0)) * 60_000;
}

export function hoursToMs(hours) {
  return Math.max(0, Number(hours || 0)) * 3_600_000;
}
