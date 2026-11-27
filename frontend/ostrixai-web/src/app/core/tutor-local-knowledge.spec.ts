import { buildGroundedLocalPrompt, retrieveLocalKnowledge } from './tutor-local-knowledge';

describe('NANO-RAG-01 local curricular retrieval', () => {
  const base = { question: '¿Por qué vemos el relámpago antes de escuchar el trueno?', mode: 'explain', language: 'es', grade: 2, hasSession: false, historyLength: 0 };
  it('grounds the observed light/sound failure with consistent speeds and units', () => {
    const r = buildGroundedLocalPrompt(base)!;
    expect(r.ids).toEqual(['light-sound']);
    expect(r.prompt).toContain('300 000 km/s');
    expect(r.prompt).toContain('343 m/s');
    expect(r.prompt).toContain('2,9 s');
    expect(r.prompt.endsWith(base.question)).toBeTrue();
  });
  it('retrieves scientific facts for the metal spoon failure', () => {
    const r = retrieveLocalKnowledge('¿Por qué una cuchara de metal se calienta más rápido que una de madera?', false);
    expect(r[0].id).toBe('heat-conduction');
    expect(r[0].fact).toContain('Conductividad no es capacidad calorífica');
  });
  it('grounds water transport without using dye as the cause', () => {
    const r = retrieveLocalKnowledge('¿Por qué el agua sube por el tallo de una planta?', false);
    expect(r[0].id).toBe('plant-water');
    expect(r[0].fact).toContain('presión menor que la atmosférica');
    expect(r[0].fact).toContain('mismo colorante');
  });
  it('distinguishes melting, dissolution and photosynthesis', () => {
    expect(retrieveLocalKnowledge('derretimiento del hielo', false)[0].id).toBe('phase-change');
    expect(retrieveLocalKnowledge('disolución del azúcar en agua tibia', false)[0].id).toBe('dissolution');
    expect(retrieveLocalKnowledge('¿Las plantas obtienen todo su alimento de la tierra?', false)[0].id).toBe('photosynthesis');
  });
  it('grounds fraction and percentage rules without fabricating student answers', () => {
    expect(retrieveLocalKnowledge('Sumar 2/3 y 1/4', false)[0].id).toBe('fractions');
    expect(retrieveLocalKnowledge('descuentos sucesivos', false)[0].fact).toContain('no se suman');
  });
  it('preserves each teaching mode', () => {
    expect(buildGroundedLocalPrompt({...base, mode:'guide'})!.prompt).toContain('No reveles el resultado final');
    expect(buildGroundedLocalPrompt({...base, mode:'practice'})!.prompt).toContain('sin solución');
    expect(buildGroundedLocalPrompt({...base, mode:'explore'})!.prompt).toContain('no inventes resultados');
  });
  it('never substitutes attached evidence, prior conversation or unmatched content', () => {
    expect(buildGroundedLocalPrompt({...base, hasSession:true})).toBeUndefined();
    expect(buildGroundedLocalPrompt({...base, historyLength:1})).toBeUndefined();
    expect(buildGroundedLocalPrompt({...base, question:'¿Qué fue el Tahuantinsuyo?'})).toBeUndefined();
    expect(buildGroundedLocalPrompt({...base, question:'x'.repeat(4001)})).toBeUndefined();
  });
  it('uses English facts for English and Spanish as the existing Quechua translation base', () => {
    expect(buildGroundedLocalPrompt({...base, language:'en', question:'Why do we see lightning before thunder?'})!.prompt).toContain('343 m/s');
    expect(buildGroundedLocalPrompt({...base, language:'qu'})!.prompt).toContain('Responde en español');
  });
  it('bounds retrieval and leaves the original question intact', () => {
    const question = 'Relaciona relámpagos, calor en metal y madera, fotosíntesis y gravedad.';
    const r = buildGroundedLocalPrompt({...base, question})!;
    expect(r.ids.length).toBe(2);
    expect(r.prompt.length).toBeLessThan(2500);
    expect(r.prompt.endsWith(question)).toBeTrue();
  });
});