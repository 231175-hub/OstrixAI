import { companionPanelPosition } from './companion-panel-position';

describe('COMPANION-03-PANEL: posicionamiento lateral seguro', () => {
  it('abre a la izquierda del buho cuando esta junto al borde derecho', () => {
    expect(companionPanelPosition(
      { left: 1360, top: 500, right: 1478, width: 118, height: 118 },
      { width: 420, height: 540 }, { width: 1598, height: 950 },
    )).toEqual({ left: 924, top: 289 });
  });
  it('abre a la derecha cuando no cabe a la izquierda', () => {
    expect(companionPanelPosition(
      { left: 325, top: 340, right: 443, width: 118, height: 118 },
      { width: 420, height: 500 }, { width: 1440, height: 900 },
    )).toEqual({ left: 459, top: 149 });
  });
  it('mantiene el panel visible cerca del borde inferior', () => {
    const p = companionPanelPosition(
      { left: 1360, top: 780, right: 1478, width: 118, height: 118 },
      { width: 420, height: 600 }, { width: 1598, height: 950 },
    );
    expect(p.top).toBe(338);
    expect(p.left).toBe(924);
  });
  it('no deja que el panel sobrepase la pantalla pequena', () => {
    const p = companionPanelPosition(
      { left: 285, top: 760, right: 375, width: 90, height: 90 },
      { width: 366, height: 600 }, { width: 390, height: 844 },
    );
    expect(p).toEqual({ left: 12, top: 144 });
  });
  it('se ajusta a la parte superior si el buho esta muy arriba', () => {
    const p = companionPanelPosition(
      { left: 1300, top: 140, right: 1418, width: 118, height: 118 },
      { width: 420, height: 580 }, { width: 1598, height: 950 },
    );
    expect(p.top).toBe(12);
  });
});
