import type { TutorMessage } from './tutor-conversation.service';
import { formatTutorFractions } from './tutor-fractions';

// Only grade a standalone operation on two small integers/fractions. A word problem,
// compound expression, approximation or changed unit needs the tutor's interpretation.
const operand = /-?\d{1,4}(?:\s*\/\s*\d{1,4})?/.source;
const operation = new RegExp('^(' + operand + ')\\s*([+−×÷*\\-])\\s*(' + operand + ')$');
const numericAnswer = new RegExp('^(?:(?:mi respuesta es|my answer is|es|it is)\\s+)?(' + operand + ')[.!]?$', 'i');

function rational(text: string): [number, number] {
  const [numerator, denominator = 1] = text.split('/').map(Number);
  return [numerator, denominator];
}

function calculate(expression: string): [number, number] | null {
  if (/^-?\d{1,4}\s*\/\s*\d{1,4}$/.test(expression.trim())) {
    const value = rational(expression);
    return value[1] ? value : null;
  }
  const parts = operation.exec(expression.trim());
  if (!parts) return null;
  const [a, b] = rational(parts[1]);
  const [c, d] = rational(parts[3]);
  if (!b || !d) return null;
  switch (parts[2]) {
    case '+': return [a * d + b * c, b * d];
    case '-': case '−': return [a * d - b * c, b * d];
    case '*': case '×': return [a * c, b * d];
    case '÷': return c ? [a * d, b * c] : null;
    default: return null;
  }
}

function fractionText([n, d]: [number, number]): string {
  let a = Math.abs(n), b = Math.abs(d);
  while (b) [a, b] = [b, a % b];
  const divisor = d < 0 ? -a : a;
  return d === divisor ? String(n / divisor) : (n / divisor) + '/' + (d / divisor);
}

export function directCalculation(prompt: string): { expression: string; result: string } | null {
  const expression = formatTutorFractions(prompt).trim()
    .replace(/^¿?(?:(?:cu[aá]nto (?:es|da)|calcula|what is|calculate)\s+)?/i, '')
    .replace(/[?!.]$/, '').trim();
  const value = calculate(expression);
  return value ? { expression, result: fractionText(value) } : null;
}

export function sameNumericValue(answer: string, expected: string): boolean | null {
  const match = numericAnswer.exec(answer.trim());
  if (!match) return null;
  const [a, b] = rational(match[1]);
  const [n, d] = rational(expected);
  return b === 0 ? null : a * d === n * b;
}

export function checkPracticeCalculation(question: string, history: readonly Pick<TutorMessage, 'role' | 'text'>[]) {
  const last = history.at(-1);
  if (last?.role !== 'assistant') return null;
  const calculation = directCalculation(last.text);
  if (!calculation) return null;
  const correct = sameNumericValue(formatTutorFractions(question), calculation.result);
  return correct === null ? null : { ...calculation, correct };
}

export function incorrectEquation(answer: string): string | null {
  for (const clause of formatTutorFractions(answer).split(/\n+|[.!;](?:\s+|$)/)) {
    const sides = clause.trim().split('=');
    if (sides.length !== 2) continue;
    const value = calculate(sides[0]);
    if (value && sameNumericValue(sides[1], fractionText(value)) === false) {
      return sides[0].trim() + ' = ' + fractionText(value);
    }
  }
  return null;
}
