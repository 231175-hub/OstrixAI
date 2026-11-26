/** Deterministic, low-frequency gestures; no student data or AI/network access. */
export type CompanionGesture = 'curious' | 'walk' | 'fly';
export function nextCompanionGesture(step: number, visibleCards: number, perched: boolean): CompanionGesture {
  if (!Number.isFinite(step) || step < 0 || !Number.isFinite(visibleCards) || visibleCards < 0) return 'curious';
  const stage = Math.floor(step) % 3;
  if (stage === 1) return 'curious';
  if (stage === 2 && perched && visibleCards > 1) return 'fly';
  return 'walk';
}
