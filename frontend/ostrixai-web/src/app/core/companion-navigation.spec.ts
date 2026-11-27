import { companionIntent, perchOnCard } from './companion-navigation';
describe('COMPANION-02: ubicacion y acceso rapido', () => {
  it('se posa sobre la tarjeta superior visible', () => {
    const p = perchOnCard([{ top: 268, right: 1477, width: 1040, height: 140 }], 1597, 950);
    // COMPANION-03 uses an enlarged 118 px perched avatar; its bottom overlaps the card by 20 px.
    expect(p).toEqual({ left: 1359, top: 170 });
    expect(p!.left + 118).toBe(1477);
    expect(p!.top + 118 - 268).toBe(20);
  });
  it('no invade pantallas pequenas', () => {
    expect(perchOnCard([{ top: 270, right: 360, width: 300, height: 150 }], 390, 844)).toBeNull();
  });
  it('no se posa sobre tarjetas demasiado bajas', () => {
    expect(perchOnCard([{ top: 720, right: 1420, width: 850, height: 150 }], 1597, 850)).toBeNull();
  });
  it('respeta los cuatro modos del Tutor', () => {
    expect(companionIntent('Dame una pista con mi ecuación')).toBe('guide');
    expect(companionIntent('Quiero practicar fracciones')).toBe('practice');
    expect(companionIntent('Diseña un experimento sobre nubes')).toBe('explore');
    expect(companionIntent('Explícame qué es la fotosíntesis')).toBe('explain');
  });
});
