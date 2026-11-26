import { EXPLORE_GUIDANCE_ES, exploreGuidanceForTurn } from './tutor-explore-guidance';

describe('TUTOR-EXPLORE-CONTEXTO-04', () => {
  const correction = 'Revisa críticamente el experimento anterior. Corrige los materiales y los pasos.';

  it('usa instrucciones compactas al corregir un experimento previo', () => {
    const guidance = exploreGuidanceForTurn(correction, false, true);
    expect(guidance).toContain('corrige el experimento ya conversado');
    expect(guidance).toContain('instrumento de medición');
    expect(guidance).toContain('cantidades exactas');
    expect(guidance.length).toBeLessThan(EXPLORE_GUIDANCE_ES.length);
  });

  it('conserva la orientación completa para un experimento inicial', () => {
    expect(exploreGuidanceForTurn(correction, false, false)).toBe(EXPLORE_GUIDANCE_ES);
  });

  it('no compacta preguntas ajenas a la corrección científica', () => {
    expect(exploreGuidanceForTurn('¿Qué es la fotosíntesis?', false, true)).toBe(EXPLORE_GUIDANCE_ES);
  });

  it('detecta las correcciones en inglés', () => {
    const guidance = exploreGuidanceForTurn('Please correct the experiment materials and steps.', true, true);
    expect(guidance).toContain('revise the experiment already discussed');
    expect(guidance).toContain('measuring tool');
  });

  it('conserva la seguridad de resultados en respuestas compactas', () => {
    expect(exploreGuidanceForTurn(correction, false, true)).toContain('No inventes mediciones ni resultados');
  });
});
