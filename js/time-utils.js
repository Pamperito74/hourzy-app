export function roundDurationMs(durationMs, roundingMinutes) {
  const safeDurationMs = Math.max(0, Number(durationMs) || 0);
  const minutes = Number(roundingMinutes) || 0;
  if (minutes <= 0) return safeDurationMs;

  const unitMs = minutes * 60 * 1000;
  return Math.max(unitMs, Math.round(safeDurationMs / unitMs) * unitMs);
}
