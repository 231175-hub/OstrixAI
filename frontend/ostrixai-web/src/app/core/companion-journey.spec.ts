import { assessStudyPreview, canSaveJourney, journeyTutorPrompt, suggestStudyPreview } from './companion-journey';

describe('Ostrix — clasificación conservadora y consentimiento', () => {
  it('separa el aprendizaje y la duda sin inventar contenido', () => {
    const result = suggestStudyPreview('Hoy aprendí sobre las nubes, pero no entendí cómo se forman.');
    expect(result.note).toBe('Hoy aprendí sobre las nubes');
    expect(result.doubt).toBe('No entendí cómo se forman.');
  });
  it('conserva afirmaciones negativas como apuntes', () => {
    expect(suggestStudyPreview('No todos los mamíferos viven en tierra firme.').doubt).toBe('');
    expect(suggestStudyPreview('El Sol no es un planeta sino una estrella.').note).toBeTruthy();
  });
  it('reconoce preguntas abiertas aun si empiezan con verbos', () => {
    expect(suggestStudyPreview('¿Podrías ayudarme a estudiar fracciones?').note).toBe('');
    expect(suggestStudyPreview('¿Podrías ayudarme a estudiar fracciones?').doubt).toBeTruthy();
  });
  it('detecta dificultades expresadas en lenguaje cotidiano', () => {
    expect(suggestStudyPreview('Me cuesta imaginar cómo es un átomo.').doubt).toBeTruthy();
    expect(suggestStudyPreview('No puedo resolver ecuaciones con paréntesis.').doubt).toBeTruthy();
    expect(suggestStudyPreview('Me preguntaba si la Luna tiene terremotos.').doubt).toBeTruthy();
    expect(suggestStudyPreview('No recuerdo cuándo se coloca la coma.').doubt).toBeTruthy();
  });
  it('separa relatos mixtos sin duplicar el texto', () => {
    const result = suggestStudyPreview('Estudié triángulos, pero no puedo calcular su área.');
    expect(result.note).toBe('Estudié triángulos');
    expect(result.doubt).toBe('No puedo calcular su área.');
  });
  it('separa incluso si la duda aparece primero', () => {
    const result = suggestStudyPreview('No entendí qué es la gravedad, pero aprendí que atrae los objetos.');
    expect(result.doubt).toBe('No entendí qué es la gravedad');
    expect(result.note).toBe('aprendí que atrae los objetos.');
  });
  it('mantiene el contenido editable cuando solo hay una observación', () => {
    expect(suggestStudyPreview('Hoy comprendí las fracciones.').note).toBe('Hoy comprendí las fracciones.');
  });
  it('no inventa apuntes ante una pregunta directa', () => {
    expect(suggestStudyPreview('No entiendo qué es una célula.').note).toBe('');
  });
  it('no permite guardar texto vacío ni truncado silenciosamente', () => {
    expect(canSaveJourney('x'.repeat(401), 400)).toBe(false);
    expect(canSaveJourney(' una duda ', 400)).toBe(true);
  });
  it('no envía el contenido al Tutor si falta autorización', () => {
    expect(journeyTutorPrompt('guide', 'mi secreto privado', false, false)).not.toContain('mi secreto privado');
    expect(journeyTutorPrompt('guide', 'fracciones', true, false)).toContain('fracciones');
  });
  it('reconoce relatos mixtos con dificultad coloquial, sin depender del tema', () => {
    const result = suggestStudyPreview('La luz se refracta al cambiar de medio; no entiendo el ángulo crítico.');
    expect(result.note).toContain('luz');
    expect(result.doubt).toContain('No entiendo');
  });
  it('admite la duda primero y el apunte después', () => {
    const result = suggestStudyPreview('¿Qué significa ADN? En clase anotamos sus cuatro bases.');
    expect(result.note).toContain('En clase');
    expect(result.doubt).toContain('ADN');
  });
  it('las preguntas mencionadas como texto de una nota no se convierten en duda', () => {
    const result = suggestStudyPreview('La oración «no puedo resolverlo» es un ejemplo de comunicación.');
    expect(result.doubt).toBe('');
    expect(result.note).toContain('oración');
  });
  it('no separa números decimales como oraciones', () => {
    const result = suggestStudyPreview('Anoté que el valor es 3.1416; no entiendo por qué es irracional.');
    expect(result.note).toContain('3.1416');
    expect(result.doubt).toContain('No entiendo');
  });
  it('pide revisión antes de guardar un relato sin referente', () => {
    const result = assessStudyPreview('Lo de ayer me dejó pensando.');
    expect(result.needsReview).toBeTrue();
    expect(result.note).toBe('');
    expect(result.doubt).toBe('');
  });

});
