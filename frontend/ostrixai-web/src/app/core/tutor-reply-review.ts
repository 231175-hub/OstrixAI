import { cleanMarkdownToText } from './markdown-cleaner';
import { inspectGuidedAlgebra } from './tutor-guide-algebra';
import { inspectExploreShadow } from './tutor-explore-shadow';
import { reviewExploreItemCounts } from './tutor-explore-structure';
import { findTutorFractionMismatch } from './tutor-fraction-check';
import { formatTutorFractions } from './tutor-fractions';
import { countTutorWords, requestedWordLimit } from './tutor-word-limit';
import { checkPracticeCalculation, directCalculation, incorrectEquation, sameNumericValue } from './tutor-calculation';
import type { TutorMessage, TutorMode } from './tutor-conversation.service';

/** A first draft may be revised once. A revised draft must pass before it can be published. */
export function reviewTutorReply(
  question: string, answer: string, english: boolean, stage: 'draft' | 'revised',
  mode?: TutorMode, history: readonly TutorMessage[] = []
): string | null {
  const visible = cleanMarkdownToText(formatTutorFractions(answer));
  const mismatch = findTutorFractionMismatch(formatTutorFractions(question), visible);
  const feedback: string[] = [];
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
    const countFeedback = reviewExploreItemCounts(question, visible, english);
    if (countFeedback) feedback.push(countFeedback);
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
  const limit = requestedWordLimit(question);
  if (limit !== undefined) {
    const count = countTutorWords(visible);
    if (count > limit) {
      feedback.push(english
        ? `The previous draft had ${count} words. Give a complete answer in at most ${limit} words.`
        : `El borrador tenía ${count} palabras. Da una respuesta completa de un máximo de ${limit} palabras.`);
    }
  }
  if (!feedback.length) return null;
  if (stage === 'revised') {
    if (mismatch) {
      throw new Error(english
        ? 'The fractions in the revised answer still conflict with the quantities in the example. You can retry.'
        : 'Las fracciones de la respuesta revisada aún contradicen las cantidades del ejemplo. Puedes reintentar.');
    }
    if (limit !== undefined && countTutorWords(visible) > limit) throw new Error(english
      ? `The revised answer still exceeds the limit of ${limit} words. You can retry.`
      : `La respuesta revisada aún supera el límite de ${limit} palabras. Puedes reintentar.`);
    if (mode === 'explore' && reviewExploreItemCounts(question, visible, english)) {
      throw new Error(english
        ? 'The revised experiment still does not meet the requested numbers of steps or materials. You can retry in smaller stages.'
        : 'El experimento revisado todavía no respeta el número solicitado de pasos o materiales. Puedes reintentar por etapas.');
    }
    throw new Error(english
      ? 'The revised answer failed the check for this exercise. You can retry.'
      : 'La respuesta revisada aún falla la comprobación de este ejercicio. Puedes reintentar.');
  }
  return feedback.join(' ');
}
