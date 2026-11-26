import { countTutorWords, requestedWordLimit } from './tutor-word-limit';

describe('Tutor reply word limit', () => {
  it('reads the requested ceiling for a fraction explanation in Spanish or English', () => {
    for (const question of [
      'Explícame 3/4 en una chacra de papas, en 100 palabras.',
      'Máximo: cien palabras. ¿Qué representa 3/4?',
      'Responde en no más de 100 palabras.',
      'No uses más de 100 palabras.',
      'No escribas más de cien palabras.',
      'Quiero una explicación que no pase de 100 palabras.',
      'Explica con 100 palabras como máximo.',
      'Explain three quarters in one hundred words.',
      'Use no more than 100 words.',
      'Do not exceed 100 words.',
      'In 100 words or less, please.',
      '100 words or fewer, please.',
      'En cien palabras.',
    ]) {
      expect(requestedWordLimit(question)).withContext(question).toBe(100);
    }
  });

  it('distinguishes a strict ceiling and the upper end of an explicit range', () => {
    expect(requestedWordLimit('En menos de cien palabras, explica 4/5.')).toBe(99);
    expect(requestedWordLimit('Explain in fewer than 50 words.')).toBe(49);
    expect(requestedWordLimit('Describe the example in 60–90 words.')).toBe(90);
    expect(requestedWordLimit('Responde entre 50 y 80 palabras.')).toBe(80);
    expect(requestedWordLimit('Use between 30 and 40 words.')).toBe(40);
  });

  it('does not turn a lower bound, a quoted instruction or exercise data into a cap', () => {
    for (const question of [
      'En al menos 100 palabras, explica las fracciones.',
      'Usa 100 palabras o más.',
      'No menos de cien palabras, por favor.',
      'No uses menos de 100 palabras.',
      'Explica sin límite de 100 palabras.',
      'Dos ejemplos de máximo 100 palabras cada uno.',
      'Answer in at least 100 words.',
      'Use no fewer than 100 words.',
      'Do not use fewer than 100 words.',
      'Write two examples of at most 100 words each.',
      'Explícame qué significa «máximo 100 palabras».',
      'Un texto tiene 100 palabras y leo 3/4. ¿Cuántas quedan?',
      '¿Cuántas letras hay en 100 palabras?',
      'Explain this passage of 100 words.',
      'Tengo 100 papas y uso un cuarto.',
    ]) {
      expect(requestedWordLimit(question)).withContext(question).toBeUndefined();
    }
  });

  it('counts visible fractions, accented words and contractions, and ignores punctuation', () => {
    expect(countTutorWords('Se consumieron 3 / 4; queda 1/4.')).toBe(5);
    expect(countTutorWords('¡Comió ¾! Del total queda 0,25.')).toBe(6);
    expect(countTutorWords('We’ve used three-quarters.')).toBe(3);
    expect(countTutorWords(' ¿? = • + ')).toBe(0);
  });

  it('includes the final comprehension question and distinguishes exactly 100 words from 101', () => {
    const body = 'papas '.repeat(98);
    expect(countTutorWords(body + '¿Cuánto queda?')).toBe(100);
    expect(countTutorWords(body + '¿Qué fracción queda?')).toBe(101);
  });
});
