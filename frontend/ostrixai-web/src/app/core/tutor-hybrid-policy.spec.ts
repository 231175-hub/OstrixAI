import { compactExploreGuidance, essentialExploreActivity, isComplexTutorTask, useCompactExplore } from './tutor-hybrid-policy';

describe('HIBRIDO-ESTABLE-01: tutor route and independent local guidance', () => {
  it('classifies inquiry tasks as complex but keeps simple explanations device-preferred', () => {
    expect(isComplexTutorTask('¿Qué es un átomo?', 'explain')).toBeFalse();
    expect(isComplexTutorTask('¿Qué es un átomo?', 'explore')).toBeTrue();
    expect(isComplexTutorTask('Diseña un experimento', 'explain')).toBeTrue();
    expect(isComplexTutorTask('Dame una pista', 'guide')).toBeFalse();
  });
  it('never replaces session evidence, history or cloud guidance with a compact first turn', () => {
    expect(useCompactExplore('explore', false, false, true)).toBeTrue();
    expect(useCompactExplore('explore', true, false, true)).toBeFalse();
    expect(useCompactExplore('explore', false, true, true)).toBeFalse();
    expect(useCompactExplore('explore', false, false, false)).toBeFalse();
    expect(useCompactExplore('guide', false, false, true)).toBeFalse();
  });
  it('gives short scientific instructions rather than complete experiment scripts', () => {
    const prompt = compactExploreGuidance('Diseña un experimento sobre disolución del azúcar en agua fría', false);
    expect(prompt).toContain('temperatura');
    expect(prompt).toContain('No inventes resultados');
    expect(prompt).toContain('pasos');
    expect(prompt.length).toBeLessThan(800);
    expect(compactExploreGuidance('Experiment: water moving up a stem', true)).toContain('xylem');
    expect(compactExploreGuidance('¿Por qué brilla la Luna?', false)).not.toContain('materiales');
  });
  it('labels the offline activity honestly and never supplies invented observations', () => {
    expect(essentialExploreActivity(false)).toContain('no una respuesta específica verificada');
    expect(essentialExploreActivity(false)).toContain('tabla vacía');
    expect(essentialExploreActivity(true)).toContain('not a verified answer');
  });
});