/** Deterministic feedback for one simple linear equation. */
export function gradeLinearPracticeAnswer(
  previousAssistant: string,
  studentAnswer: string,
  lang: 'es' | 'en' = 'es'
): { correct: boolean; feedback: string } | null {
  const equations = [...previousAssistant.matchAll(
    /([+-]?\d{1,4})\s*x\s*([+-])\s*(\d{1,4})\s*=\s*([+-]?\d{1,5}(?:[.,]\d{1,3})?)/gi
  )];

  if (equations.length !== 1) return null;

  // PRACTICA-FRACCIONES-01: aceptar enteros, decimales y fracciones completas.
  // El limite final impide interpretar 8/3 como 8 o 8/3/2 como 8/3.
  const answers = [...studentAnswer.matchAll(
    /(?:^|[^\w])x\s*=\s*([+-]?\d{1,6}(?:[.,]\d{1,3})?)(?:\s*\/\s*([+-]?\d{1,6}(?:[.,]\d{1,3})?))?(?=$|[\s!?;)\]}]|[.,](?:\s|$))/gi
  )];

  if (answers.length !== 1) return null;

  const equation = equations[0];
  const a = Number(equation[1]);
  const b = Number(equation[3]) * (equation[2] === '-' ? -1 : 1);
  const right = Number(equation[4].replace(',', '.'));
  const numerator = Number(answers[0][1].replace(',', '.'));
  const denominator = answers[0][2] === undefined
    ? 1
    : Number(answers[0][2].replace(',', '.'));

  // Nunca evaluar una fraccion con denominador cero.
  if (denominator === 0) return null;

  const submitted = numerator / denominator;

  if (!a || ![a, b, right, numerator, denominator, submitted].every(Number.isFinite)) {
    return null;
  }

  const left = a * submitted + b;
  if (!Number.isFinite(left)) return null;

  const fmt = (n: number) => String(Number(n.toFixed(6)));
  const submittedText = answers[0][2] === undefined
    ? fmt(submitted)
    : `${fmt(numerator)}/${fmt(denominator)}`;
  const sign = b < 0 ? '-' : '+';
  const expression = `${a}x ${sign} ${Math.abs(b)} = ${fmt(right)}`;
  const substitution = `${a}(${submittedText}) ${sign} ${Math.abs(b)} = ${fmt(left)}`;
  const correct = Math.abs(left - right) < 0.000001;

  const feedback = lang === 'en'
    ? (correct
      ? `Correct! Checking ${expression}: ${substitution}. Both sides agree.`
      : `Not yet. For ${expression}, substituting x = ${submittedText} gives ${substitution}, not ${fmt(right)}. What operation would remove ${b < 0 ? 'the negative term' : 'the positive term'} before dividing?`)
    : (correct
      ? `¡Correcto! Comprobamos ${expression}: ${substitution}. Ambos lados son iguales.`
      : `Todavía no. En ${expression}, al sustituir x = ${submittedText}, obtenemos ${substitution}, que no es ${fmt(right)}. ¿Qué operación harías para quitar el ${sign}${Math.abs(b)} antes de dividir?`);

  return {
    correct,
    feedback: feedback + (lang === 'en'
      ? '\n\nLocal mathematical check (not AI-generated).'
      : '\n\nComprobación matemática local (no generada por IA).'),
  };
}