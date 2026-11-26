import { offlineStudyPreview, parseSmartStudyResponse, studyCapturePrompt } from './companion-smart-capture';

describe('OSTRIX-AUTO-01', () => {
  const story = 'Hoy aprendí sobre las nubes, pero no entendí cómo se forman.';
  it('conserva exactamente lo escrito', () => {
    const result = parseSmartStudyResponse('{"note":"Hoy aprendí sobre las nubes","doubt":"no entendí cómo se forman"}', story);
    expect(result?.note).toBe('Hoy aprendí sobre las nubes');
    expect(result?.doubt).toBe('no entendí cómo se forman');
  });
  it('rechaza contenido inventado por el modelo', () => {
    expect(parseSmartStudyResponse('{"note":"Las nubes son de algodón","doubt":"no entendí cómo se forman"}', story)).toBeNull();
  });
  it('rechaza categorías omitidas cuando la duda es evidente', () => {
    expect(parseSmartStudyResponse('{"note":"Hoy aprendí sobre las nubes","doubt":""}', story)).toBeNull();
  });
  it('mantiene método sin IA cuando no hay Nano', () => {
    expect(offlineStudyPreview(story).strategy).toBe('OFFLINE_ESSENTIAL');
    expect(offlineStudyPreview(story).doubt).toBe('No entendí cómo se forman.');
  });
  it('no da permiso para la nube dentro del prompt', () => {
    expect(studyCapturePrompt(story)).toContain('TEXTO ORIGINAL');
  });
  it('permite la clasificación del modelo aunque el respaldo discrepe', () => {
    const story = 'La parte del libro me dejó pensando. Puede ser una duda.';
    const result = parseSmartStudyResponse(JSON.stringify({ note: '', doubt: story }), story);
    expect(result?.doubt).toBe(story);
  });
  it('no permite ocultar una pregunta en un apunte único', () => {
    const story = '¿Qué significa ADN? En clase anotamos sus cuatro bases.';
    expect(parseSmartStudyResponse(JSON.stringify({ note: story, doubt: '' }), story)).toBeNull();
  });
  it('valida subcadenas literales incluso con emoji inicial', () => {
    const story = '🦉 Aprendí sobre nubes, pero no entendí su origen.';
    const result = parseSmartStudyResponse(JSON.stringify({ note: 'Aprendí sobre nubes', doubt: 'no entendí su origen.' }), story);
    expect(result?.note).toContain('nubes');
    expect(result?.doubt).toContain('origen');
  });
  it('indica revisión si no está seguro sin Nano', () => {
    const result = offlineStudyPreview('Eso era raro.');
    expect(result.needsReview).toBeTrue();
    expect(result.note).toBe('');
    expect(result.doubt).toBe('');
  });

  it('rechaza fragmentos literales cuando Gemini invierte una duda explícita y un apunte', () => {
    const q = 'No entiendo la gravedad.';
    expect(parseSmartStudyResponse(JSON.stringify({ note: q, doubt: '' }), q)).toBeNull();
    const n = 'Hoy aprendí que el Sol es una estrella.';
    expect(parseSmartStudyResponse(JSON.stringify({ note: '', doubt: n }), n)).toBeNull();
    const q2 = 'Tengo dudas sobre fracciones.';
    expect(parseSmartStudyResponse(JSON.stringify({ note: q2, doubt: '' }), q2)).toBeNull();
  });
  it('no rechaza automáticamente una nota que cita una dificultad como contenido escolar', () => {
    const n = 'En clase escribí que no podía resolverlo.';
    expect(parseSmartStudyResponse(JSON.stringify({ note: n, doubt: '' }), n)?.note).toBe(n);
  });
});
