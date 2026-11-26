/**
 * Verificación independiente para preguntas puntuables.
 *
 * La estructura JSON y el índice que devuelve una IA no demuestran que su
 * respuesta sea cierta. Solo permitimos puntuación si la pregunta coincide
 * exactamente con el banco curricular revisado o si una operación numérica
 * puede comprobarse de forma determinista y tiene una única opción correcta.
 *
 * Las preguntas abiertas, de gramática, cultura, ciencias y verdadero/falso
 * generadas por IA siguen siendo posibles en el Tutor, pero NO se califican
 * automáticamente hasta disponer de verificadores específicos.
 */
import { EXERCISE_CATALOG } from './exercise-catalog';
import { directCalculation, sameNumericValue } from './tutor-calculation';
type Candidate = {
  id: string;
  type: 'MULTIPLE_CHOICE' | 'TRUE_FALSE';
  questionText: string;
  options: readonly string[];
  correctAnswerIndex: number;
};

function sameOptions(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, i) => value.trim() === right[i].trim());
}

/** Compara también pregunta, opciones e índice; no basta confiar en el ID. */
export function isVerifiedCurriculumQuestion(question: Candidate): boolean {
  for (const ex of EXERCISE_CATALOG) {
    if (!ex.options || typeof ex.correctAnswer !== 'number') continue;
    if (question.id !== ex.id && !new RegExp(`^curr-${ex.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+$`).test(question.id)) continue;
    if (question.type === 'MULTIPLE_CHOICE') {
      if (question.questionText === ex.question && sameOptions(question.options, ex.options) &&
        question.correctAnswerIndex === ex.correctAnswer) return true;
    } else if (question.type === 'TRUE_FALSE' && sameOptions(question.options, ['Verdadero', 'Falso'])) {
      for (let i = 0; i < ex.options.length; i++) {
        if (question.questionText === `${ex.question} ¿Es correcta la respuesta «${ex.options[i]}»?` &&
          question.correctAnswerIndex === (i === ex.correctAnswer ? 0 : 1)) return true;
      }
    }
  }
  return false;
}

/** Acepta únicamente cálculos que el motor independiente puede comprobar. */
export function isVerifiedDeterministicQuestion(question: Candidate): boolean {
  if (question.type !== 'MULTIPLE_CHOICE' || question.options.length !== 4 ||
      !Number.isInteger(question.correctAnswerIndex) ||
      question.correctAnswerIndex < 0 || question.correctAnswerIndex >= question.options.length) return false;
  const calculation = directCalculation(question.questionText);
  if (!calculation) return false;
  const matches = question.options.map(option => sameNumericValue(option, calculation.result));
  // Una opción que no puede analizarse también impide afirmar que sea falsa.
  return matches.every(match => match === true || match === false) &&
    matches.filter(match => match === true).length === 1 &&
    matches[question.correctAnswerIndex] === true;
}

export function isIndependentlyVerifiableQuestion(question: Candidate): boolean {
  return isVerifiedCurriculumQuestion(question) || isVerifiedDeterministicQuestion(question);
}
