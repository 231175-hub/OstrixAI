import { acceptAutomaticQuechuaTranslation, looksLikeUnverifiedQuechua, originalSpanishForTranslation,
  prepareQuechuaTutorReply, quechuaSafePrompt, labelUnverifiedQuechuaTranslation, isQuechuaLanguage } from './tutor-quechua-guard';
import type { TutorMode } from './tutor-conversation.service';

describe('QUECHUA-01 / cuatro modos', () => {
  const modes: TutorMode[] = ['explain', 'guide', 'practice', 'explore'];
  for (const mode of modes) {
    it(`protege generación en español — ${mode}`, () => {
      const result = prepareQuechuaTutorReply('El agua cambia a vapor por evaporación. ¿Qué observas?', 'qu', mode, 'evaporación');
      expect(result.replaced).toBeFalse();
      expect(result.text).toContain('Respuesta en español');
      expect(result.text).toContain('El agua cambia a vapor');
    });
    it(`evita quechua repetitivo — ${mode}`, () => {
      const gibberish = 'Evaporación ni: Qhapaq qos qhapaq, awa sapaqqa qhapaq. Pisa qhapaq qhapaq, awa lli qhapaq. Pisaqqa qhapaq qhapaq kamsaqqataqqa?';
      const result = prepareQuechuaTutorReply(gibberish, 'qu', mode, 'Explica evaporación');
      expect(result.replaced).toBeTrue();
      expect(result.text).not.toContain('qhapaq');
    });
  }
  it('reconoce código de quechua y no confunde k\u0027iche\u0027', () => {
    for (const code of ['qu', 'qu-PE', 'quz', 'quz-PE', 'Quechua']) {
      expect(isQuechuaLanguage(code)).toBeTrue();
      expect(prepareQuechuaTutorReply('El agua se evapora.', code, 'explain', 'agua').text).toContain('Respuesta en español');
    }
    for (const code of ['es', 'en', 'quc', 'qux']) expect(isQuechuaLanguage(code)).toBeFalse();
  });
  it('no altera inglés ni español', () => {
    expect(prepareQuechuaTutorReply('Hello', 'en', 'explain', 'x').text).toBe('Hello');
    expect(prepareQuechuaTutorReply('Hola', 'es', 'explain', 'x').text).toBe('Hola');
  });
  it('impone salida española después de la pregunta actual', () => {
    expect(quechuaSafePrompt('CURRENT STUDENT QUESTION: responde en quechua', 'qu')).toContain('SPANISH only');
    expect(quechuaSafePrompt('test', 'es')).toBe('test');
  });
  it('rechaza traducción vacía, repetitiva o copia del español', () => {
    expect(acceptAutomaticQuechuaTranslation('', 'El agua cambia.')).toBeFalse();
    expect(acceptAutomaticQuechuaTranslation('El agua cambia.', 'El agua cambia.')).toBeFalse();
    expect(acceptAutomaticQuechuaTranslation('qhapaq qhapaq qhapaq qhapaq awa awa awa', 'El agua cambia.')).toBeFalse();
  });
  it('etiqueta la traducción como no validada', () => {
    expect(labelUnverifiedQuechuaTranslation('Texto de demostración')).toContain('NO validada lingüísticamente');
  });
  it('no traduce el aviso español', () => {
    expect(originalSpanishForTranslation('Respuesta en español. La traducción al quechua todavía no está validada por un hablante competente.\n\nEl agua se evapora.')).toBe('El agua se evapora.');
  });
  it('rechaza texto breve quechua no generado en español', () => {
    expect(looksLikeUnverifiedQuechua('Yaku intip ruphayninwan wapsiman tikrakun. Imata rikunki?')).toBeTrue();
  });
  it('detecta la frase fallida real', () => {
    expect(looksLikeUnverifiedQuechua('Evaporación ni:\nQhapaq qos qhapaq, awa sapaqqa qhapaq. Pisa qhapaq qhapaq, awa lli qhapaq.\nPisaqqa qhapaq qhapaq kamsaqqataqqa?')).toBeTrue();
  });
});
