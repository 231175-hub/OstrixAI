import { gradeLinearPracticeAnswer } from './practice-linear-feedback';

describe('PRACTICA-FRACCIONES-01', () => {
  const exercise = 'Resuelve: 3x + 7 = 15';

  it('acepta la fraccion correcta 8/3', () => {
    const result = gradeLinearPracticeAnswer(exercise, 'x = 8/3');
    expect(result).not.toBeNull();
    expect(result!.correct).toBeTrue();
    expect(result!.feedback).toContain('3(8/3) + 7 = 15');
  });

  it('acepta la fraccion equivalente 16/6', () => {
    const result = gradeLinearPracticeAnswer(exercise, 'x = 16/6');
    expect(result?.correct).toBeTrue();
  });

  it('rechaza una respuesta entera incorrecta', () => {
    const result = gradeLinearPracticeAnswer(exercise, 'x = 3');
    expect(result?.correct).toBeFalse();
  });

  it('rechaza una fraccion negativa incorrecta', () => {
    const result = gradeLinearPracticeAnswer(exercise, 'x = -8/3');
    expect(result?.correct).toBeFalse();
  });

  it('no evalua divisiones por cero', () => {
    expect(
      gradeLinearPracticeAnswer(exercise, 'x = 8/0')
    ).toBeNull();
  });

  it('no convierte expresiones invalidas en enteros', () => {
    expect(
      gradeLinearPracticeAnswer(exercise, 'x = 8/3/2')
    ).toBeNull();

    expect(
      gradeLinearPracticeAnswer(exercise, 'x = 8/abc')
    ).toBeNull();
  });

  it('no evalua respuestas no numericas', () => {
    expect(
      gradeLinearPracticeAnswer(exercise, 'x = abc')
    ).toBeNull();
  });

  it('mantiene soporte para respuestas decimales', () => {
    const result = gradeLinearPracticeAnswer(
      'Resuelve: 4x - 7 = 11',
      'x = 4.5'
    );

    expect(result?.correct).toBeTrue();
  });

  it('no califica dos respuestas diferentes a la vez', () => {
    expect(
      gradeLinearPracticeAnswer(exercise, 'x = 8/3 y x = 3')
    ).toBeNull();
  });
});