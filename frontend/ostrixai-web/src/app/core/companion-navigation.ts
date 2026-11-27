/** COMPANION-03: positioning and intent suggestion only; no AI or network requests. */
export interface PerchRect { top: number; right: number; width: number; height: number; }
export interface PerchPoint { left: number; top: number; }
export type CompanionDestination = 'diario' | 'apuntes' | 'dudas' | 'repaso';
export type CompanionTutorMode = 'explain' | 'guide' | 'practice' | 'explore';

/** Position owl above a visible card, larger and easier to notice, with a safe in-viewport margin. */
export function perchOnCard(rects: readonly PerchRect[], viewportWidth: number, viewportHeight: number): PerchPoint | null {
  if (viewportWidth < 900 || viewportHeight < 500) return null;
  const visible = rects.filter(r => r.width >= 240 && r.height >= 70 && r.top >= 175 && r.top <= viewportHeight - 185 && r.right > 360 && r.right <= viewportWidth + 30);
  if (!visible.length) return null;
  const card = [...visible].sort((a, b) => a.top - b.top)[0];
  return {
    left: Math.max(14, Math.min(viewportWidth - 132, Math.round(card.right - 118))),
    top: Math.max(78, Math.min(viewportHeight - 145, Math.round(card.top - 98))),
  };
}

/** Default remains an explanation; the student can still select the four Tutor modes. */
export function companionIntent(query: string): CompanionTutorMode {
  const text = query.toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/\b(pista|guiame|ayudame a resolver|guide me|hint)\b/.test(text)) return 'guide';
  if (/\b(practicar|practiquemos|ejercicio|repasar|practica|practice|quiz|repaso)\b/.test(text)) return 'practice';
  if (/\b(experimento|explorar|investigar|explore|experiment)\b/.test(text)) return 'explore';
  return 'explain';
}
