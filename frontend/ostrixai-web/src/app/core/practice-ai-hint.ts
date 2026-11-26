/** PRACTICA-ALGEBRA-02: AI pedagogy grounded in verified local math. */
export function buildVerifiedPracticePrompt(
  base: string,
  verification: string,
  correct: boolean,
  english: boolean
): string {
  const instructions = english
    ? `VERIFIED MATHEMATICAL CHECK (trusted local calculation):
${verification}
The student's answer is ${correct ? 'correct' : 'incorrect'}.
Write ONLY one or two short, natural sentences of educational
guidance. Do not calculate anything, write equations, use numbers,
judge correctness again, ask a question, or propose another exercise.
Do not copy the verification. The application will display it separately.`
    : `COMPROBACION MATEMATICA VERIFICADA (calculo local confiable):
${verification}
La respuesta del estudiante es ${correct ? 'correcta' : 'incorrecta'}.
Escribe SOLO una o dos oraciones breves y naturales de orientacion
pedagogica. No hagas calculos, no escribas ecuaciones ni numeros,
no vuelvas a juzgar la respuesta, no hagas preguntas y no propongas
otro ejercicio. No copies la comprobacion: la aplicacion la mostrara
por separado.`;

  return `${base}\n\n${instructions}`;
}

/**
 * Conservative filter, not a general semantic-math proof.
 * Never accepts new numerical calculations from the AI.
 */
export function acceptPracticeAiHint(
  raw: string,
  correct: boolean
): string | null {
  const value = raw.trim().replace(/\s+/g, ' ');

  if (value.length < 25 || value.length > 450) return null;
  if (/[0-9=<>$\\]/.test(value)) return null;
  if (/[¿?]/.test(value)) return null;
  if (/<[^>]*>/.test(value)) return null;

  if (/\b(?:otro ejercicio|otra ecuaci[oó]n|nuevo ejercicio|next exercise|another exercise)\b/i.test(value)) {
    return null;
  }

  if (!correct && /\b(?:correct[oa]|excelente|muy bien|bien hecho|well done|great job|right answer)\b/i.test(value)) {
    return null;
  }

  if (correct && /\b(?:incorrect[oa]|equivocad[oa]|wrong answer|not correct)\b/i.test(value)) {
    return null;
  }

  if (!/(?:verific|comprob|sustitu|paso|igualdad|t[eé]rmino|inc[oó]gnita|operaci[oó]n|equation|check|substitut|step|variable|reason|process)/i.test(value)) {
    return null;
  }

  return value;
}