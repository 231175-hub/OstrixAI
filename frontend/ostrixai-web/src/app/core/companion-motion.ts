/** Walk is the default. Flying only occurs on every fifth autonomous move. */
export function companionMotion(step: number, visibleCards: number): 'walk' | 'fly' | 'curious' {
  if (!Number.isFinite(step) || step < 0) return 'curious';
  if (step % 13 === 0) return 'curious';
  if (step % 5 === 0 && visibleCards > 1) return 'fly';
  return 'walk';
}
