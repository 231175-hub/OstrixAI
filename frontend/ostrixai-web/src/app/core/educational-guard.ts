/**
 * EDU-GUARD-01 — verificador curricular LOCAL y ACOTADO.
 * No inspecciona otros estudiantes, ni llama a Firebase o Gemini.
 * Nunca debe atribuir una corrección local a ON_DEVICE.
 * Retorna null cuando no hay una contradicción explícita y verificable.
 */
export type AcademicLanguage = 'es' | 'en';
export interface AcademicCorrection {
  readonly rule: 'FRACTION_DENOMINATOR' | 'PHOTOSYNTHESIS_STAGES' | 'GRAMMAR_SUBJECT';
  readonly text: string;
  readonly source: 'OFFLINE_ESSENTIAL';
  readonly limited: true;
}

function toPlain(input: string): string {
  return input.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2212\u2013\u2014]/g, '-')
    .replace(/\\text\s*\{([^{}]*)\}/g, '$1')
    .replace(/[\u00a0\u202f]/g, ' ')
    .toLowerCase();
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a), y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x || 1;
}

interface FractionTask { a: number; b: number; c: number; d: number; op: '+' | '-' }
function readFractionTask(q: string): FractionTask | null {
  const matches = [...toPlain(q).matchAll(/(^|[^\d])(-?\d{1,4})\s*\/\s*(\d{1,4})\s*([+-])\s*(-?\d{1,4})\s*\/\s*(\d{1,4})(?!\d)/g)];
  if (matches.length !== 1) return null;
  const m = matches[0];
  const [a, b, c, d] = [Number(m[2]), Number(m[3]), Number(m[5]), Number(m[6])];
  if (!b || !d || !Number.isSafeInteger(a * d) || !Number.isSafeInteger(c * b) || !Number.isSafeInteger(b * d)) return null;
  return { a, b, c, d, op: m[4] as '+' | '-' };
}

function falseDenominatorClaim(answer: string): boolean {
  const s = toPlain(answer).replace(/\s+/g, ' ');
  const regexes = [
    /(?:fraccion|fraction)[^.!?\n:]{0,65}?(?:ya\s+)?(?:tiene|has|have|con|with)\s+(?:el\s+|a\s+)?(?:denominador|denominator)\s*(?:de|of|igual\s+a|is|=|:)??\s*(\d{1,4})\s*[:;,]?\s*(\d{1,4})\s*\/\s*(\d{1,4})/g,
    /\b(\d{1,4})\s*\/\s*(\d{1,4})\b[^.!?\n]{0,35}\b(?:tiene|has|have)\s+(?:el\s+|a\s+)?(?:denominador|denominator)\s*(?:de|of|is|=|:)?\s*(\d{1,4})/g,
  ];
  for (const [idx, re] of regexes.entries()) {
    for (const m of s.matchAll(re)) {
      const claimed = Number(idx === 0 ? m[1] : m[3]);
      const actual = Number(idx === 0 ? m[3] : m[2]);
      // Evitar interceptar negaciones, citas críticas o ejemplos explícitamente incorrectos.
      const lead = s.slice(Math.max(0, (m.index ?? 0) - 35), m.index ?? 0);
      if (/\b(?:no|not|incorrecto|incorrect|falso|false)\b/.test(lead)) continue;
      if (claimed !== actual) return true;
    }
  }
  return false;
}

function falseCalvinClaim(question: string, answer: string): boolean {
  const q = toPlain(question), a = toPlain(answer).replace(/\s+/g, ' ');
  if (!/foto(?:sintesis)|photosynthesis|calvin|co\s*2|dioxido de carbono|carbon dioxide/.test(q)) return false;
  const bad = [
    /reacciones? luminosas?\s*\(\s*fase\s*(?:i|1|primera)\s+del\s+ciclo\s+de\s+calvin\s*\)/,
    /light(?:-dependent)? reactions?\s*\(\s*(?:phase|stage)\s*(?:i|1|one)\s+of\s+(?:the\s+)?calvin cycle\s*\)/,
    /(?:fase|reacciones?)\s+luminosas?\s+(?:son|es|forman parte|pertenecen)\s+(?:una?\s+)?(?:fase\s+|etapa\s+)?(?:del|de)\s+ciclo\s+de\s+calvin/,
    /light(?:-dependent)? reactions?\s+(?:are|is)\s+(?:part|stage|phase)\s+of\s+(?:the\s+)?calvin cycle/,
    /(?:el\s+)?(?:co\s*2|dioxido de carbono)\s+(?:se\s+)?(?:fija|absorbe)\s+(?:durante|en)\s+(?:la\s+)?(?:fase|reacciones?)\s+luminosas?/,
    /(?:co\s*2|carbon dioxide)\s+is\s+fix(?:ed)?\s+(?:during|in)\s+(?:the\s+)?light(?:-dependent)?\s+reactions?/, 
  ];
  for (const re of bad) {
    const match = re.exec(a);
    if (!match) continue;
    const previous = a.slice(Math.max(0, match.index - 52), match.index);
    // Una negación o la cita de un error no deben convertirse en falsa acusación.
    if (/(?:\bno\s+es\s+cierto\s+que|\bes\s+falso\s+(?:decir\s+)?que|\bnot\s+true\s+that|\bincorrect(?:o|a)\s+(?:decir\s+)?que)\s*(?:el\s+)?$/.test(previous)) continue;
    return true;
  }
  return false;
}

function falseGrammarSubject(question: string, answer: string): boolean {
  const q=toPlain(question), a=toPlain(answer).replace(/\s+/g,' ');
  if (!/maria lee un libro/.test(q) && !/maria lee un libro/.test(a)) return false;
  return /(?:un libro.{0,30}(?:es|se llama)\s+(?:el\s+)?sujeto|(?:el\s+)?sujeto\s+(?:es|:|se trata de)\s*(?:la\s+expresion\s+)?["'«]?un libro)/.test(a);
}

function fractionExplanation(task: FractionTask, en: boolean): string {
  const {a,b,c,d,op}=task;
  const common=(b/gcd(b,d))*d;
  const left=a*(common/b), right=c*(common/d);
  const result=op==='+' ? left+right : left-right;
  const reduced=gcd(result, common);
  const top=result/reduced, bottom=common/reduced;
  const original=`${a}/${b} ${op} ${c}/${d}`;
  const intermediate=`${left}/${common} ${op} ${right}/${common} = ${result}/${common}`;
  const final=`${top}/${bottom}`;
  return en
    ? `Verified local fraction explanation (limited scope):\n\nTo ${op==='+'?'add':'subtract'} fractions, use equal-sized parts. ${a}/${b} becomes ${left}/${common}; ${c}/${d} becomes ${right}/${common}. Then ${intermediate}; simplified result: ${final}. Check each denominator against the actual fraction before teaching it.\n\nLocal curricular verification (not AI-generated).`
    : `Explicación local verificada de fracciones (alcance limitado):\n\nPara ${op==='+'?'sumar':'restar'} fracciones, usamos partes del mismo tamaño. ${a}/${b} equivale a ${left}/${common}; ${c}/${d} equivale a ${right}/${common}. Después ${intermediate}; resultado simplificado: ${final}. Comprueba el denominador de cada fracción antes de explicarlo.\n\nComprobación curricular local (no generada por IA).`;
}

export function reviewEducationalAnswer(question: string, answer: string, language: AcademicLanguage): AcademicCorrection | null {
  if (!question?.trim() || !answer?.trim() || question.length>4000 || answer.length>24000) return null;
  const en=language==='en';
  const fractionTask=readFractionTask(question);
  if (fractionTask && falseDenominatorClaim(answer)) return {
    rule:'FRACTION_DENOMINATOR', text:fractionExplanation(fractionTask,en), source:'OFFLINE_ESSENTIAL',limited:true
  };
  if (falseCalvinClaim(question,answer)) return {
    rule:'PHOTOSYNTHESIS_STAGES', source:'OFFLINE_ESSENTIAL', limited:true,
    text: en
      ? 'Local curricular correction (limited scope): Light-dependent reactions and the Calvin cycle are distinct processes, not phases within the Calvin cycle. Light-dependent reactions occur in the thylakoid membranes, using light and water to produce ATP and NADPH and release oxygen. The Calvin cycle occurs in the stroma, uses ATP and NADPH, and fixes CO₂ into organic molecules such as G3P.\n\nLocal curricular verification (not AI-generated).'
      : 'Corrección curricular local (alcance limitado): las reacciones luminosas y el ciclo de Calvin son procesos diferentes; las reacciones luminosas no forman parte del ciclo de Calvin. Las primeras ocurren en las membranas de los tilacoides, utilizan luz y agua, producen ATP y NADPH y liberan oxígeno. El ciclo de Calvin ocurre en el estroma, utiliza ATP y NADPH y fija CO₂ en moléculas orgánicas como G3P.\n\nComprobación curricular local (no generada por IA).'
  };
  if (falseGrammarSubject(question,answer)) return {
    rule:'GRAMMAR_SUBJECT',source:'OFFLINE_ESSENTIAL',limited:true,
    text:en
      ? 'Local grammar correction (limited scope): In “María lee un libro”, María is the subject, lee is the conjugated verb, and un libro is the direct object.\n\nLocal curricular verification (not AI-generated).'
      : 'Corrección gramatical local (alcance limitado): en «María lee un libro», María es el sujeto, lee es el verbo conjugado y un libro es el complemento directo.\n\nComprobación curricular local (no generada por IA).'
  };
  return null;
}
