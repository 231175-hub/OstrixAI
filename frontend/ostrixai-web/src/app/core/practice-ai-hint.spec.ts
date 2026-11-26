import {
  buildVerifiedPracticePrompt,
  acceptPracticeAiHint
} from './practice-ai-hint';

describe('PRACTICA-ALGEBRA-02', () => {

  it('incluye el resultado matematico verificado en el prompt', () => {
    const prompt = buildVerifiedPracticePrompt(
      'Ayuda al estudiante',
      '4(4) - 7 = 9, que no es 11.',
      false,
      false
    );
    expect(prompt).toContain('4(4) - 7 = 9');
    expect(prompt).toContain('incorrecta');
  });

  it('acepta una pista pedagogica sin calculos nuevos', () => {
    const result = acceptPracticeAiHint(
      'Revisa el paso en el que debes aislar la incógnita antes de continuar.',
      false
    );
    expect(result).not.toBeNull();
  });

  it('rechaza calculos numericos no verificados', () => {
    expect(acceptPracticeAiHint(
      'Comprueba nuevamente: 4(4) - 7 = 11.',
      false
    )).toBeNull();
  });

  it('rechaza elogios de acierto para una respuesta equivocada', () => {
    expect(acceptPracticeAiHint(
      '¡Muy bien! Tu procedimiento para despejar la incógnita es excelente.',
      false
    )).toBeNull();
  });

  it('rechaza preguntas nuevas en la pista', () => {
    expect(acceptPracticeAiHint(
      'Revisa el paso anterior. ¿Quieres otro ejercicio?',
      false
    )).toBeNull();
  });

  it('acepta una pista de refuerzo para una respuesta correcta', () => {
    expect(acceptPracticeAiHint(
      'Comprobar mediante sustitución ayuda a confirmar que la igualdad se mantiene.',
      true
    )).not.toBeNull();
  });
});