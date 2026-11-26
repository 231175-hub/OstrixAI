import { gradeLinearPracticeAnswer } from './practice-linear-feedback';

describe('PRACTICA-ALGEBRA-01', () => {
  const exercise = 'Resuelve la ecuación: 4x - 7 = 11.';

  it('detecta una respuesta incorrecta y explica la sustitución', () => {
    const result = gradeLinearPracticeAnswer(
      exercise,
      'Me salió x = 4. ¿Está bien?'
    );
    expect(result).not.toBeNull();
    expect(result!.correct).toBeFalse();
    expect(result!.feedback).toContain('4(4) - 7 = 9');
    expect(result!.feedback).not.toContain('x = 4.5');
  });

  it('acepta el resultado correcto', () => {
    const result = gradeLinearPracticeAnswer(exercise, 'x = 4.5');
    expect(result).not.toBeNull();
    expect(result!.correct).toBeTrue();
  });

  it('no intenta calificar respuestas sin valor de x', () => {
    expect(gradeLinearPracticeAnswer(exercise, 'No sé cómo hacerlo')).toBeNull();
  });

  it('rechaza ejercicios con varias ecuaciones', () => {
    expect(gradeLinearPracticeAnswer(
      'Resuelve 4x - 7 = 11 y 3x + 5 = 20',
      'x = 4'
    )).toBeNull();
  });
});