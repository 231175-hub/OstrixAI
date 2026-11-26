/**
 * OstrixAi MATH-03: calificación acotada de una respuesta numérica a un ejercicio previo.
 * Sin red ni IA. No certifica respuestas abiertas ni problemas no reconocidos.
 */
export interface LocalPracticeGrade {
  readonly expected: number;
  readonly submitted: number;
  readonly correct: boolean;
  readonly feedback: string;
}

function normalize(s: string): string {
  return s.replace(/[\u2212\u2013\u2014]/g, '-')
    .replace(/\\text\s*\{([^}]*)\}/g, '$1')
    .replace(/\\(?:,|;|:|!|quad|qquad)/g, ' ')
    .replace(/\$/g, '')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

interface Problem { a: number; delta: number; isTemperature: boolean }
function recognizeProblem(previousAssistant: string): Problem | null {
  const s = normalize(previousAssistant);
  // Solo corregimos respuestas a una pregunta clara, no cifras mencionadas en una explicación.
  if (!/[?¿]/.test(s) || (s.match(/\?/g)?.length ?? 0) !== 1) return null;
  const asksForAnswer = /(?:cu[aá]l\s+es|cu[aá]nto\s+(?:es|da)|resultado|what\s+is|how\s+much|calculate|calcula)/i.test(s);
  if (!asksForAnswer) return null;

  const temp = /\btemperatura\s+(?:(?:comienza|empieza|inicia)\s+en|(?:es\s+)?de)\s*([+-]?\d+)\b[\s\S]{0,120}?\b(sube|aumenta|asciende|baja|desciende|disminuye)\s*(?:en\s+)?([+-]?\d+)\b/i.exec(s)
    ?? /\btemperature\s+(?:(?:starts|begins)\s+at|(?:of|is))\s*([+-]?\d+)\b[\s\S]{0,120}?\b(rises|increases|goes up|drops|falls|decreases)\s*(?:by\s+)?([+-]?\d+)\b/i.exec(s);
  if (temp) {
    const a = Number(temp[1]), amount = Number(temp[3]);
    if (!Number.isSafeInteger(a) || !Number.isSafeInteger(amount) || Math.abs(a) > 100000 || amount < 0 || amount > 100000) return null;
    const down = /^(?:baja|desciende|disminuye|drops|falls|decreases)$/i.test(temp[2]);
    return {a, delta: down ? -amount : amount, isTemperature: true};
  }
  // Evitar elegir arbitrariamente una operación si hay varias.
  const matches = [...s.matchAll(/(^|[^\w.])([+-]?\d+)\s*([+\-])\s*([+-]?\d+)(?=\b|\s|$|[?.,;])/g)];
  if (matches.length !== 1) return null;
  const m = matches[0];
  const a = Number(m[2]), b = Number(m[4]);
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || Math.abs(a) > 100000 || Math.abs(b) > 100000) return null;
  return {a, delta: m[3] === '+' ? b : -b, isTemperature: false};
}

/** Devuelve null si el ejercicio/respuesta no se pueden calificar con seguridad. */
export function gradeSimplePracticeAnswer(previousAssistant: string, studentAnswer: string, lang: 'es' | 'en' = 'es'): LocalPracticeGrade | null {
  const match = /^([+-]?\d{1,7})(?:\s*(?:°\s*C|grados(?:\s+celsius)?|degrees(?:\s+celsius)?))?\.?$/i.exec(normalize(studentAnswer));
  if (!match) return null;
  const problem = recognizeProblem(previousAssistant);
  if (!problem) return null;
  const submitted = Number(match[1]);
  const expected = problem.a + problem.delta;
  if (!Number.isSafeInteger(submitted) || !Number.isSafeInteger(expected) || Math.abs(expected) > 200000) return null;
  const correct = submitted === expected;
  const operation = `${problem.a} ${problem.delta < 0 ? '-' : '+'} ${Math.abs(problem.delta)} = ${expected}`;
  const feedback = lang === 'en'
    ? (correct
      ? `Correct! ${problem.isTemperature ? `The final temperature is ${expected} °C.` : `The answer is ${expected}.`} ${operation}.\n\nLocal arithmetic check (not AI-generated).`
      : `You answered ${submitted}, but the correct answer is ${expected}${problem.isTemperature ? ' °C' : ''}. ${problem.isTemperature ? 'Start at the initial temperature and apply the change:' : 'Calculate the operation:'} ${operation}.\n\nLocal arithmetic check (not AI-generated).`)
    : (correct
      ? `¡Correcto! ${problem.isTemperature ? `La temperatura final es ${expected} °C.` : `El resultado es ${expected}.`} ${operation}.\n\nComprobación matemática local (no generada por IA).`
      : `Respondiste ${submitted}, pero la respuesta correcta es ${expected}${problem.isTemperature ? ' °C' : ''}. ${problem.isTemperature ? 'Partimos de la temperatura inicial y aplicamos el cambio:' : 'Realizamos la operación:'} ${operation}.\n\nComprobación matemática local (no generada por IA).`);
  return { expected, submitted, correct, feedback };
}
