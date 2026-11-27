/**
 * GUIAME-01. Conservative deterministic guard for simple one-variable linear
 * equations. The parser only establishes the *kind of operation*; it never
 * sends the answer or calculated value of x to the student or the model.
 * Unsupported exercises keep the existing tutor route and are NOT certified.
 */
export interface GuidePriorTurn { readonly role: string; readonly text: string }
export interface GuideInspection { readonly feedback: string; readonly fallback: string; readonly issues: readonly string[] }

interface Equation { readonly a: number; readonly b: number; readonly c: number; readonly start: number }

function equations(text: string): Equation[] {
  const normalized = text.replace(/[−–]/g, '-').replace(/×/g, 'x');
  const re = /(^|[^\w])([+-]?\s*\d*)\s*x\s*([+-]\s*\d+)?\s*=\s*([+-]?\s*\d+)(?!\d|[.,]\d)/gi;
  const all: Equation[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(normalized)) !== null) {
    const coeff = match[2].replace(/\s/g, '');
    const a = coeff === '' || coeff === '+' ? 1 : coeff === '-' ? -1 : Number(coeff);
    const b = match[3] ? Number(match[3].replace(/\s/g, '')) : 0;
    const c = Number(match[4].replace(/\s/g, ''));
    if ([a,b,c].every(Number.isSafeInteger) && a !== 0 && Math.abs(a) <= 10000 && Math.abs(b) <= 100000 && Math.abs(c) <= 100000) {
      all.push({a,b,c,start:match.index + match[1].length});
    }
  }
  return all;
}

interface Exercise { equation: Equation; partial: Equation | undefined; studentWrongStep: boolean; studentWrongOperation: 'sumar' | 'restar' | 'multiplicar' | null; tutorOwnError: boolean }

function exerciseFor(question: string, history: readonly GuidePriorTurn[]): Exercise | null {
  const studentTexts = history.filter(m => m.role === 'user').map(m => m.text).concat(question);
  const currentEquations = equations(question);
  // A newly stated full equation must not inherit a partial step from old exercises.
  const found = currentEquations.some(eq => eq.b !== 0)
    ? currentEquations : studentTexts.flatMap(text => equations(text));
  const original = found.filter(eq => Math.abs(eq.a) > 1 && eq.b !== 0).at(-1);
  const partial = found.filter(eq => Math.abs(eq.a) > 1 && eq.b === 0).at(-1);
  const equation = original ?? partial;
  if (!equation || Math.abs(equation.a) <= 1) return null;
  // If the student cites an intermediate line, it must agree with the original.
  // An inconsistent line must be checked by a separate math module; don't silently certify it.
  if (original && partial && (partial.a !== original.a || partial.c !== original.c - original.b)) return null;
  const lastPartial = equations(question).filter(eq => eq.b === 0 && eq.a === equation.a).at(-1);
  const afterPartial = lastPartial ? question.slice(lastPartial.start).replace(/^.*?=\s*[+-]?\s*\d+/, '') : '';
  const coefficient = Math.abs(equation.a);
  // Detect both ADD and SUBTRACT misconceptions (and multiplication), not
  // only subtraction. Restrict checks to the proposed next step after ax = c.
  const wrongOperation = new RegExp(`\\b(sumar|sumarle|sumando|añadir|agregar|add|adding|restar|restarle|restando|subtract|subtracting|multiplicar|multiply)\\s+(?:el\\s+)?${coefficient}\\b`, 'i');
  const proposed = new RegExp(`\\b(?:creo\\s+que|pienso\\s+que|debo|deber[ií]a|propuse|voy\\s+a|i\\s+think|i\\s+should)[^.!?]{0,120}?\\b(sumar|sumarle|sumando|añadir|agregar|add|adding|restar|restarle|restando|subtract|subtracting|multiplicar|multiply)\\s+(?:el\\s+)?${coefficient}\\b`, 'i');
  const match = wrongOperation.exec(afterPartial) ?? proposed.exec(question);
  const word = match?.[1] ?? '';
  const studentWrongOperation = !word ? null
    : /^(?:sum|añad|agreg|add)/i.test(word) ? 'sumar'
    : /^(?:rest|subtract)/i.test(word) ? 'restar' : 'multiplicar';
  const negated = /\b(?:no\\s+(?:debo|deber[ií]a|voy\\s+a)|sin\\s+necesidad\\s+de)\\s+(?:sumar|restar|multiplicar)\b/i.test(question);
  const studentWrongStep = Boolean((lastPartial || partial) && studentWrongOperation && !negated);
  const tutorOwnError = /\b(?:dijiste|tu respuesta anterior|te equivocaste|you said|your previous answer|your last answer)\b/i.test(question);
  return {equation, partial: lastPartial ?? partial, studentWrongStep, studentWrongOperation, tutorOwnError};
}

function mentionsWrongPreviousOperation(text: string, equation: Equation): boolean {
  if (!equation.b) return false;
  const wrong = equation.b > 0 ? /\b(?:sumar|sumaste|sum[oó]|agregar|a[nñ]adir|add|added)\b/gi
    : /\b(?:restar|restaste|rest[oó]|subtract|subtracted)\b/gi;
  const number = String(Math.abs(equation.b));
  let match: RegExpExecArray | null;
  while ((match = wrong.exec(text)) !== null) {
    const tail = text.slice(match.index + match[0].length, match.index + match[0].length + 28);
    const head = text.slice(Math.max(0, match.index - 40), match.index);
    if (new RegExp(`^\\s+(?:el\\s+)?${number}\\b`).test(tail)
        && !/\b(?:no|nunca|never|not|en lugar de)\s*(?:que\s*)?$/i.test(head.trim())) return true;
  }
  return false;
}

function revealsResult(text: string): boolean {
  // Reject explicit answers, including when packaged as corrections or examples.
  if (/\bx\s*=\s*[+-]?\s*\d+(?:[.,]\d+)?/i.test(text)) return true;
  if (/\b(?:x|inc[oó]gnita|variable|soluci[oó]n)\s*(?:(?:es|vale|da|ser[ií]a|resulta|igual\s+a|is|equals)\s*){1,3}(?:[+-]?\d+(?:[.,]\d+)?|cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(text)) return true;
  return false;
}

export function guidedAlgebraFallback(question: string, history: readonly GuidePriorTurn[], english: boolean): string | null {
  const x = exerciseFor(question, history);
  if (!x) return null;
  // Without a verified partial equation, remove the constant first; never praise an unverified step.
  if (!x.partial && x.equation.b !== 0) {
    const term = x.equation.b > 0 ? '+' + x.equation.b : String(x.equation.b);
    return english
      ? `Hint: first remove the constant ${term} using its inverse operation. What operation would you apply to both sides?`
      : `Pista: primero elimina el término ${term} usando la operación inversa. ¿Qué operación debes aplicar a ambos miembros?`;
  }
  const k = Math.abs(x.equation.a);
  if (english) {
    const intro = x.tutorOwnError && x.equation.b
      ? `You are right: I was mistaken about the previous step. You ${x.equation.b > 0 ? 'subtracted' : 'added'} ${Math.abs(x.equation.b)}; I should not have said the opposite. `
      : x.studentWrongStep ? `${x.studentWrongOperation === 'sumar' ? 'Adding' : x.studentWrongOperation === 'restar' ? 'Subtracting' : 'Multiplying by'} ${k} is not the right next step. ` : 'You have made progress with the equation. ';
    return `${intro}Hint: The number ${k} multiplies x, so think of the inverse operation. What would you apply to both sides to isolate x?`;
  }
  const intro = x.tutorOwnError && x.equation.b
    ? `Tienes razón: yo me equivoqué al describir el paso anterior. Tú ${x.equation.b > 0 ? 'restaste' : 'sumaste'} ${Math.abs(x.equation.b)} a ambos lados, no hiciste la operación contraria. `
    : x.studentWrongStep ? `${x.studentWrongOperation === 'sumar' ? 'Sumar' : x.studentWrongOperation === 'restar' ? 'Restar' : 'Multiplicar por'} ${k} no es el siguiente paso correcto. ` : 'Has avanzado correctamente hasta este paso. ';
  return `${intro}Pista: el ${k} está multiplicando a x; piensa en la operación inversa. ¿Qué operación aplicarías a ambos lados para dejar x sola?`;
}

/** Null = no detected violation OR an unsupported task (not a correctness certificate). */
export function inspectGuidedAlgebra(question: string, answer: string, history: readonly GuidePriorTurn[], english: boolean): GuideInspection | null {
  const x = exerciseFor(question, history);
  if (!x) return null;
  const issues: string[] = [];
  if (!x.partial && x.equation.b !== 0 && !/(?:termino independiente|término independiente|constante|constant term|constant|sumar|restar|add|subtract)/i.test(answer)) issues.push('initial-step');
  if (revealsResult(answer)) issues.push('revealed-value');
  if ((answer.match(/\?/g) ?? []).length !== 1) issues.push('question-count');
  if (!/\b(?:pista|hint)\s*:/i.test(answer)) issues.push('missing-hint');
  if (!/multiplic|divid|invers|coeficient|factor|multipli|divis|inverse/i.test(answer)) issues.push('vague-hint');
  if (mentionsWrongPreviousOperation(answer, x.equation)) issues.push('wrong-previous-operation');
  if (x.studentWrongStep && !/\b(?:no|incorrect|equivoc|error|inv[aá]lid|not|wrong|instead|en lugar|no corresponde)\b/i.test(answer)) issues.push('did-not-correct-student');
  if (x.tutorOwnError && !/\b(?:me equivoqu[eé]|mi error|lo dije mal|me confund[ií]|i was wrong|my mistake|i made a mistake)(?![a-záéíóúñ])/i.test(answer)) issues.push('did-not-own-tutor-error');
  if (!issues.length) return null;
  const feedback = english
    ? `Guide mode validation failed (${issues.join(', ')}). Correct the error, include a specific hint and ONE question, and never state the value of x.`
    : `Falló la validación del modo Guíame (${issues.join(', ')}). Corrige el error, da una pista específica y UNA sola pregunta, sin revelar cuánto vale x.`;
  return {issues, feedback, fallback: guidedAlgebraFallback(question, history, english)!};
}
