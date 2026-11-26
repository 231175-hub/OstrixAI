import {
  EXPLORE_GUIDANCE_ES,
  EXPLORE_GUIDANCE_EN
} from './tutor-explore-guidance';

describe('EXPLORE-CIENCIA-01', () => {

  it('exige mediciones y cantidades concretas', () => {
    expect(EXPLORE_GUIDANCE_ES).toContain('cantidades concretas');
    expect(EXPLORE_GUIDANCE_ES).toContain('10 semillas');
  });

  it('exige tabla vacia y prohibe inventar resultados', () => {
    expect(EXPLORE_GUIDANCE_ES).toContain('tabla VACÍA');
    expect(EXPLORE_GUIDANCE_ES).toContain('No inventes');
  });

  it('reconoce riesgos del exceso de agua', () => {
    expect(EXPLORE_GUIDANCE_ES).toContain('exceso de agua');
    expect(EXPLORE_GUIDANCE_ES).toContain('misma cucharita');
  });

  it('mantiene instrucciones equivalentes en ingles', () => {
    expect(EXPLORE_GUIDANCE_EN).toContain('BLANK daily data table');
    expect(EXPLORE_GUIDANCE_EN).toContain('approximate');
  });

});