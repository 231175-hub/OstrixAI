/**
 * OstrixAi — validador determinista acotado a aritmética de enteros.
 * Módulo puro, sin red, Firebase, Angular, IndexedDB ni datos privados.
 * No garantiza la corrección general de una explicación: solo verifica
 * afirmaciones numéricas explícitas de problemas sencillos reconocidos.
 */
export type IntegerGuardStatus = 'blocked' | 'numeric-claim-verified' | 'unverifiable' | 'not-applicable';

export interface IntegerGuardResult {
  readonly status: IntegerGuardStatus;
  readonly expected?: number;
  readonly claimed?: number;
  readonly reason: string;
  /** Sustitución local únicamente si hay un resultado erróneo inequívoco. */
  readonly deterministicCorrection?: string;
}

function clean(text: string): string {
  return text.replace(/[\u2212\u2013\u2014]/g, '-')
    .replace(/\$/g, '')
    .replace(/\\(?:left|right)/g, '')
    .replace(/[\u00a0\u202f]/g, ' ');
}

function problemFrom(text: string): { start: number; delta: number; expected: number; isTemperature: boolean } | null {
  const s = clean(text);
  const temperature = /temperatura\s+de\s+([+-]?\d+)\b[\s\S]{0,140}?\b(sube|aumenta|asciende|baja|desciende|disminuye)\s+([+-]?\d+)\b/i.exec(s)
    ?? /temperature\s+(?:of|at|is)\s+([+-]?\d+)\b[\s\S]{0,140}?\b(rises|increases|goes up|drops|decreases|falls)\s+(?:by\s+)?([+-]?\d+)\b/i.exec(s);
  if (temperature) {
    const start = Number(temperature[1]);
    const value = Number(temperature[3]);
    const falling = /^(baja|desciende|disminuye|drops|decreases|falls)$/i.test(temperature[2]);
    if (Math.abs(start) > 1000000 || Math.abs(value) > 1000000) return null;
    const delta = falling ? -value : value;
    return { start, delta, expected: start + delta, isTemperature: true };
  }
  const exp = /(^|[^\w.])([+-]?\d+)\s*([+\-])\s*([+-]?\d+)(?=\b|\s|$|[?.,;])/m.exec(s);
  if (!exp) return null;
  const start = Number(exp[2]);
  const second = Number(exp[4]);
  if (Math.abs(start) > 1000000 || Math.abs(second) > 1000000) return null;
  const delta = exp[3] === '+' ? second : -second;
  return { start, delta, expected: start + delta, isTemperature: false };
}

function numericClaim(reply: string): number | null {
  const s = clean(reply);
  const pattern = /\b(?:la\s+respuesta\s+correcta|el\s+resultado(?:\s+correcto)?|la\s+nueva\s+temperatura|the\s+correct\s+answer|the\s+result|the\s+new\s+temperature)\s+(?:es|ser[ií]a|is|would\s+be)\s*(?:igual\s+a\s*|de\s*)?([+-]?\d+)\b/i;
  const hit = pattern.exec(s);
  return hit ? Number(hit[1]) : null;
}

/** Llamar solo con el enunciado exacto y la respuesta producida, no con el chat entero. */
export function verifyIntegerFeedback(problemText: string, assistantReply: string, language: 'es' | 'en' = 'es'): IntegerGuardResult {
  const problem = problemFrom(problemText);
  if (!problem) return { status: 'not-applicable', reason: 'No se reconoció un problema de dos enteros soportado.' };
  const claimed = numericClaim(assistantReply);
  if (claimed === null) {
    return { status: 'unverifiable', expected: problem.expected, reason: 'El modelo no expresó una respuesta final en un formato verificable.' };
  }
  if (claimed === problem.expected) {
    return { status: 'numeric-claim-verified', expected: problem.expected, claimed,
      reason: 'La afirmación numérica explícita coincide con el cálculo determinista; no se validó el resto de la explicación.' };
  }
  const expression = `${problem.start} ${problem.delta < 0 ? '-' : '+'} ${Math.abs(problem.delta)} = ${problem.expected}`;
  const deterministicCorrection = language === 'en'
    ? `Arithmetic check: the result is ${problem.expected}. ${expression}. Check the step before continuing.`
    : `Comprobación aritmética local: el resultado correcto es ${problem.expected}. ${expression}. Revisa este paso antes de continuar.`;
  return { status: 'blocked', expected: problem.expected, claimed,
    reason: `Corrección incorrecta detectada: el modelo afirmó ${claimed}, pero el resultado es ${problem.expected}.`,
    deterministicCorrection };
}
