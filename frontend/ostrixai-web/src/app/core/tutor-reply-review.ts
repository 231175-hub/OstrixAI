import { cleanMarkdownToText } from './markdown-cleaner';
import { inspectGuidedAlgebra } from './tutor-guide-algebra';
import { inspectExploreShadow } from './tutor-explore-shadow';
import { reviewExploreItemCounts } from './tutor-explore-structure';
import { findTutorFractionMismatch } from './tutor-fraction-check';
import { formatTutorFractions } from './tutor-fractions';
import { countTutorWords, requestedWordLimit } from './tutor-word-limit';
import { checkPracticeCalculation, directCalculation, incorrectEquation, sameNumericValue } from './tutor-calculation';
import type { TutorMessage, TutorMode } from './tutor-conversation.service';

/** Format notices never cause a second inference and are not part of the stored answer. */
export function tutorReplyFormatNotice(question: string, answer: string, english: boolean, mode?: TutorMode): string | null {
  const visible = cleanMarkdownToText(formatTutorFractions(answer));
  const limit = requestedWordLimit(question);
  const count = countTutorWords(visible);
  const notices: string[] = [];
  if (limit !== undefined && count > limit) {
    notices.push(english
      ? `Length notice: ${count} words; requested maximum ${limit}.`
      : `Aviso de extensión: ${count} palabras; máximo solicitado ${limit}.`);
  }
  if (mode === 'explore' && reviewExploreItemCounts(question, visible, english)) {
    notices.push(english
      ? 'The requested number or numbering of materials or steps could not be confirmed.'
      : 'No se pudo confirmar el número o la numeración solicitada de materiales o pasos.');
  }
  return notices.length ? notices.join(' ') : null;
}

/** A first draft may be revised once for substantive issues. Format notices are separate. */
export function reviewTutorReply(
  question: string, answer: string, english: boolean, stage: 'draft' | 'revised',
  mode?: TutorMode, history: readonly TutorMessage[] = []
): string | null {
  const visible = cleanMarkdownToText(formatTutorFractions(answer));
  const mismatch = findTutorFractionMismatch(formatTutorFractions(question), visible);
  const feedback: string[] = [];
  // NANO-FINAL-01: narrow detection of observed output artifacts, not a truth certificate.
  const leakedChecklist = /(?:^|\n)\s*(?:[•*–-]\s*)?(?:explain quantities\/elements\?\s*(?:yes|no)\.?|scientific accuracy(?:\s*[:?]\s*(?:yes|no))?\.?)\s*(?=\n|$)/i.test(visible);
  const brokenNumbering = /^\s*\)\s*\p{L}/u.test(visible) && (visible.match(/\(\d{1,3}\)/g)?.length ?? 0) >= 3;
  const lastOpen = visible.lastIndexOf('¿');
  const unfinishedQuestion = lastOpen > visible.lastIndexOf('?') &&
    (visible.slice(lastOpen + 1).match(/\p{L}+/gu)?.length ?? 0) >= 4 &&
    !/[.!]$/.test(visible.trim());
  if (!visible.trim() || leakedChecklist || brokenNumbering || unfinishedQuestion) {
    feedback.push(english
      ? 'Return a complete student-facing answer without internal checklists or broken numbering. Finish every question.'
      : 'Entrega una respuesta completa para el estudiante, sin listas internas ni numeración rota. Termina todas las preguntas.');
  }
  // NANO-FINAL-SCOPE: detect two specific failure classes, not general correctness.
  const asksNewPercentage = mode === 'practice' && /porcentaj|percent/i.test(question)
    && /prop[oó]n|propon\w*|plantea\w*|crea\w*|dame|genera\w*|pose|propose|create|give|generate/i.test(question);
  const numericQuestion = /cu[aá]nt[oa]s?|calcula|how much|how many|calculate/i.test(visible);
  if (asksNewPercentage && numericQuestion) {
    const rate = /\d+(?:[.,]\d+)?\s*(?:%|por ciento|percent)/gi;
    const hasRate = new RegExp(rate.source, 'i').test(visible);
    const hasOtherNumber = /\d/.test(visible.replace(rate, ''));
    const finalQuestion = visible.slice(Math.max(0, visible.lastIndexOf('¿')));
    const asksIncome = /\b(?:salario|sueldo|ingresos?|salary|income|wages?)\b/i.test(finalQuestion);
    const hasIncome = /(?:salario|sueldo|ingresos?|salary|income|wages?)(?:\s+(?:semanal|mensual|weekly|monthly|is|es|de|of|equals|asciende a|amounts to))*\s*(?:[:=]\s*)?(?:S\/\s*|\$\s*|PEN\s*|USD\s*)?\d+(?:[.,]\d+)?(?!\d|[.,]\d|\s*%)/i.test(visible)
      || /\b(?:gana|ganas|recibe|recibes|earns?|receives?)\s*(?:S\/\s*|\$\s*|PEN\s*|USD\s*)?\d+(?:[.,]\d+)?(?!\d|[.,]\d|\s*%)/i.test(visible)
      || /\d+(?:[.,]\d+)?\s*(?:soles|dollars|euros)\s+(?:de|as|in)\s+(?:salario|sueldo|ingresos?|salary|income|wages?)/i.test(visible);
    if (!hasRate || !hasOtherNumber || (asksIncome && !hasIncome)) {
      feedback.push(english
        ? 'The percentage exercise is missing a matching numerical base. Use one coherent scenario with a percentage and its base amount. Do not solve it.'
        : 'Falta una cantidad base correspondiente al porcentaje. Usa una sola situación coherente, con porcentaje y cantidad base explícitos. No resuelvas el ejercicio.');
    }
  }
  const asksEvaporationComparison = mode === 'explore' && /evapor\w*/i.test(question)
    && /\b(?:sol|sun|sunlight)\b/i.test(question) && /\b(?:sombra|shade)\b/i.test(question)
    && /experimen|investig|hip[oó]tes|hypothes|pasos?|steps?/i.test(question);
  if (asksEvaporationComparison && (!/evapor\w*/i.test(visible) || !/agua|water/i.test(visible)
    || !/\b(?:sol|sun|sunlight)\b/i.test(visible) || !/\b(?:sombra|shade)\b/i.test(visible)
    || !/volumen|volume|nivel|level|masa|mass|cantidad|amount|mililit|millilit/i.test(visible))) {
    feedback.push(english
      ? 'Keep the requested water evaporation experiment in sun and shade. Measure the change in water amount, not shadow length.'
      : 'Mantén el experimento solicitado de evaporación del agua al sol y a la sombra. Mide el cambio en la cantidad de agua, no la longitud de una sombra.');
  }
  const operation = directCalculation(question);
  const equation = incorrectEquation(visible);
  if (equation || (operation && sameNumericValue(visible, operation.result) === false)) {
    const check = equation ?? `${operation!.expression} = ${operation!.result}`;
    feedback.push(english ? `Check the arithmetic. The operation gives ${check}.`
      : `Revisa la aritmética. La operación da ${check}.`);
  }
  if (mode === 'guide') {
    const guide = inspectGuidedAlgebra(question, visible, history, english);
    if (guide) feedback.push(guide.feedback);
    const questions = visible.match(/\?/g)?.length ?? 0;
    if (questions !== 1) {
      feedback.push(english
        ? 'Give exactly one main question about the next step, preceded by a short hint.'
        : 'Incluye exactamente una sola pregunta principal sobre el siguiente paso, precedida de una pista breve.');
    }
  }
  if (mode === 'explore') {
    const shadow = inspectExploreShadow(question, visible, history, english);
    if (shadow) feedback.push(shadow.feedback);
    // NANO-FLEX-01: item counts are advisory, not a reason to regenerate.
  }
  if (mode === 'explore' && /\b(?:diseñ\w*|propon\w*|prop[oó]n|planea\w*|design|plan|suggest)\s+(?:un |an? |the )?exper[ií]ment/i.test(question)) {
    const required = [/\?/, /hip[oó]tesis|hypothesis|predic/i, /independiente|independent|cambiar|vary/i,
      /\bdependiente|\bdependent|medir|measure/i, /control|constante|constant|keep.+same/i,
      /material|necesitar|will need/i, /pasos?|procedimiento|steps?|procedure|1[.)]/i];
    if (!required.every(re => re.test(visible))) {
      feedback.push(english
        ? 'Give a testable question, hypothesis, factor to vary, measurement, controls, materials and steps.'
        : 'Incluye pregunta investigable, hipótesis, factor a cambiar, medición, controles, materiales y pasos.');
    }
  }
  const graded = mode === 'practice' ? checkPracticeCalculation(question, history) : null;
  if (graded?.correct === false) {
    const beforeQuestion = visible.split(/[¿?]/)[0];
    const corrected = /\b(?:incorrect[oa]?|aún no|not quite|wrong|not correct)\b|^\s*no\b/i.test(beforeQuestion);
    const praised = /^(?:[¡!\s]*)(?:muy bien|correct[oa]?|excelente|felicidades|well done|great job|that's right)\b/i.test(beforeQuestion);
    if (!corrected || praised || beforeQuestion.trim().split(/\s+/).length < 5) {
      feedback.push(english
        ? `Explain first why that answer is incorrect. The operation gives ${graded.expression} = ${graded.result}.`
        : `Explica primero por qué esa respuesta es incorrecta. La operación da ${graded.expression} = ${graded.result}.`);
    }
  }
  if (mismatch) {
    const { used, total } = mismatch;
    feedback.push(english
      ? `Recheck the example with ${used} units used out of ${total}. Calculate the remaining units by subtraction and label both fractions against the original whole.`
      : `Revisa el ejemplo con ${used} unidades usadas de ${total}. Calcula por resta cuántas quedan y distingue ambas fracciones del entero inicial.`);
  }
  // Word count is checked separately for a visible, non-blocking notice.
  if (!feedback.length) return null;
  if (stage === 'revised') {
    if (mismatch) {
      throw new Error(english
        ? 'The fractions in the revised answer still conflict with the quantities in the example. You can retry.'
        : 'Las fracciones de la respuesta revisada aún contradicen las cantidades del ejemplo. Puedes reintentar.');
    }
    // Only substantive checks reach this error path.
    throw new Error(english
      ? 'The revised answer failed the check for this exercise. You can retry.'
      : 'La respuesta revisada aún falla la comprobación de este ejercicio. Puedes reintentar.');
  }
  return feedback.join(' ');
}
