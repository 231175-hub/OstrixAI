/** CONTEXTO-02 — una duda sin referente no se guarda como si fuera completa. */
export interface ClarifiedDoubt { readonly text: string; readonly addedContext: boolean; }

// Deictic pronouns and bare causal questions do not identify their referent.
const DEICTIC_END = /\b(?:esto|eso|aquello|estas?\s+cosas?|esos?\s+temas?|sus?\s+[\p{L}-]+|por\s+qu[eé]|para\s+qu[eé])\s*[.!?…]*$/iu;
const QUESTION_END = /\b(?:c[oó]mo\s+se\s+forman?|c[oó]mo\s+funcionan?|qu[eé]\s+son|qu[eé]\s+es|qu[eé]\s+significan?|de\s+qu[eé]\s+tratan)\s*[.!?…]*$/iu;
const SUBJECT = /\b(?:sobre|acerca\s+de|qu[eé]\s+son|qu[eé]\s+es|estudi[eé]\s+|vimos\s+)\s+((?:el|la|los|las|un|una|unos|unas)\s+[\p{L}\p{N}-]+(?:\s+[\p{L}\p{N}-]+){0,5})(?=$|[.,;!?])/giu;
const CONNECTORS = /\b(y|o|pero|aunque|porque|cuando|que|qu[eé]|c[oó]mo|esto|eso|algo|cosas|temas)\b/iu;
const EMPTY_SUBJECT = /^(?:los?\s+(?:temas?|cosas?|objetos?)|las?\s+(?:cosas?|materias?))$/iu;

/** Extrae exclusivamente un sujeto explicitado en el apunte. Con ambigüedad devuelve null. */
export function extractUnambiguousSubject(note: string): string | null {
  if (!note || note.length > 2200) return null;
  const subjects = new Set<string>();
  SUBJECT.lastIndex = 0;
  for (const hit of note.matchAll(SUBJECT)) {
    const candidate = hit[1].replace(/\s+/g, ' ').trim();
    if (candidate.length > 70 || CONNECTORS.test(candidate) || EMPTY_SUBJECT.test(candidate)) return null;
    subjects.add(candidate.toLocaleLowerCase('es'));
    if (subjects.size > 1) return null;
  }
  const subject = [...subjects][0];
  return subject ?? null;
}

/** La duda termina en una referencia gramaticalmente incompleta y requiere su tema. */
export function isIncompleteDoubt(doubt: string): boolean {
  return QUESTION_END.test(doubt.trim()) || DEICTIC_END.test(doubt.trim());
}

/** No completa desde otras sesiones ni adivina entre dos referentes. */
export function clarifyDoubtContext(note: string, doubt: string): ClarifiedDoubt {
  const original = doubt.trim();
  if (!original || original.length > 400 || !isIncompleteDoubt(original)) return { text: original, addedContext: false };
  const subject = extractUnambiguousSubject(note);
  if (!subject) return { text: original, addedContext: false };
  const match = QUESTION_END.exec(original);
  if (!match) return { text: original, addedContext: false };
  const plural = /^(?:los|las|unos|unas)\s/iu.test(subject);
  const singular = /^(?:el|la|un|una)\s/iu.test(subject);
  const predicate = match[0].replace(/[.!?…]+$/u, '').trim();
  const isPlural = /(?:forman|son|funcionan|significan|tratan)$/iu.test(predicate);
  if ((isPlural && !plural) || (!isPlural && !singular)) return { text: original, addedContext: false };
  const lastChar = original.slice(-1);
  const punctuation = lastChar === '?' ? '?' : '.';
  const next = `${original.replace(/[.!?…]+$/u, '').trim()} ${subject}${punctuation}`;
  if (next.length > 400) return { text: original, addedContext: false };
  return { text: next, addedContext: true };
}

/** Solo nombres extraídos literalmente de una frase del alumno. */
export function suggestedTopicTitle(note: string): string | null {
  const subject = extractUnambiguousSubject(note);
  return subject ? subject[0].toLocaleUpperCase('es') + subject.slice(1) : null;
}
