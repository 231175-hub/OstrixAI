import { EXERCISE_CATALOG, findMatchingExercises } from './exercise-catalog';
import { isIndependentlyVerifiableQuestion } from './practice-question-verifier';

describe('Verified grading evidence', () => {
  const mc = (partial: Record<string, unknown> = {}) => ({
    id: 'nano-test', type: 'MULTIPLE_CHOICE' as const,
    questionText: '¿Cuánto es 4 + 3?', options: ['6', '7', '8', '9'], correctAnswerIndex: 1,
    ...partial,
  });

  it('rejects a plausible-looking, ambiguous Nano grammar item', () => {
    expect(isIndependentlyVerifiableQuestion(mc({
      questionText: 'En la oración: El atleta corre rápidamente hacia la meta, ¿cuál es el verbo y cuál es su conjugación?',
      options: ['correr / corriendo', 'corre / corrió', 'corrió / corre', 'es / es'],
    }))).toBeFalse();
  });

  it('accepts one independently computed numeric answer; rejects wrong keys and equivalent duplicate answers', () => {
    expect(isIndependentlyVerifiableQuestion(mc())).toBeTrue();
    expect(isIndependentlyVerifiableQuestion(mc({ correctAnswerIndex: 0 }))).toBeFalse();
    expect(isIndependentlyVerifiableQuestion(mc({ options: ['6', '7', '7.0', '9'] }))).toBeFalse();
    expect(isIndependentlyVerifiableQuestion(mc({ options: ['6', '7', 'no sé', '9'] }))).toBeFalse();
  });

  it('checks the full canonical text, options and answer for curated verbs', () => {
    const vetted = EXERCISE_CATALOG.find(x => x.id === 'com-verbo-sec1-001')!;
    const q = { id: vetted.id, type: 'MULTIPLE_CHOICE' as const,
      questionText: vetted.question, options: [...vetted.options!], correctAnswerIndex: Number(vetted.correctAnswer) };
    expect(findMatchingExercises('Comunicación', 'Verbos', 1, 1, true)[0]?.id).toBe(vetted.id);
    expect(isIndependentlyVerifiableQuestion(q)).toBeTrue();
    expect(isIndependentlyVerifiableQuestion({ ...q, correctAnswerIndex: 0 })).toBeFalse();
    expect(isIndependentlyVerifiableQuestion({ ...q, options: ['corre', 'atleta', 'rápidamente', 'meta'] })).toBeFalse();
  });

  it('does not mark model-generated true/false as independently verified', () => {
    expect(isIndependentlyVerifiableQuestion({ id: 'ai-tf', type: 'TRUE_FALSE',
      questionText: 'El atleta corre es una oración.', options: ['Verdadero', 'Falso'], correctAnswerIndex: 0 })).toBeFalse();
  });
});
