import { EXPLORE_INITIAL_ES, EXPLORE_INITIAL_EN, EXPLORE_GUIDANCE_ES, exploreGuidanceForTurn } from './tutor-explore-guidance';

describe('TUTOR-EXPLORE-PRIMER-TURNO-05', () => {
  const question = 'Quiero investigar la evaporación del agua al sol y a la sombra. Propón una hipótesis, exactamente 4 materiales y 4 pasos.';

  it('usa contexto breve en un experimento inicial', () => {
    const prompt = exploreGuidanceForTurn(question, false, false);
    expect(prompt).toBe(EXPLORE_INITIAL_ES);
    expect(prompt.length).toBeLessThan(EXPLORE_GUIDANCE_ES.length);
  });

  it('preserva los requisitos de materiales, pasos y medición', () => {
    const prompt = exploreGuidanceForTurn(question, false, false);
    expect(prompt).toContain('EXACTAMENTE');
    expect(prompt).toContain('Materiales:');
    expect(prompt).toContain('Pasos:');
    expect(prompt).toContain('medir los volúmenes');
    expect(prompt).toContain('No inventes resultados');
  });

  it('conserva protocolo detallado para germinación', () => {
    const prompt = exploreGuidanceForTurn('Diseña un experimento de germinación de lentejas y agua.', false, false);
    expect(prompt).toBe(EXPLORE_GUIDANCE_ES);
  });

  it('no cambia las consultas generales de ciencias', () => {
    const prompt = exploreGuidanceForTurn('¿Qué es la fotosíntesis?', false, false);
    expect(prompt).toBe(EXPLORE_GUIDANCE_ES);
  });

  it('conserva la revisión breve de un experimento previo', () => {
    const prompt = exploreGuidanceForTurn('Corrige el experimento anterior y los materiales.', false, true);
    expect(prompt).toContain('corrige el experimento ya conversado');
  });

  it('soporta prompts científicos iniciales en inglés', () => {
    const prompt = exploreGuidanceForTurn('Design an experiment with 4 materials and 4 steps', true, false);
    expect(prompt).toBe(EXPLORE_INITIAL_EN);
    expect(prompt).toContain('Never invent measurements');
  });
});
