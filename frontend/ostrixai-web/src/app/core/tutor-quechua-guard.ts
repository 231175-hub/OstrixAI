import type { TutorMode } from './tutor-conversation.service';

/** QUECHUA-01: do not ask Nano to improvise an unverified Quechua translation.
 * The original Spanish response is kept for optional, consented translation.
 * This is a safety net, NOT a linguistic or semantic correctness certificate.
 */
export const QUECHUA_SPANISH_NOTICE =
  'Respuesta en español. La traducción al quechua todavía no está validada por un hablante competente.';

export const QUECHUA_TRANSLATION_NOTICE =
  'Traducción automática al quechua general (qu), NO validada lingüísticamente. Contrasta con el original en español.';

/** Acepta variantes de identificador del quechua; no confunde quc (k'iche') con qu. */
export function isQuechuaLanguage(value: unknown): boolean {
  const language = String(value ?? '').trim().toLowerCase().replace(/_/g, '-');
  return /^(?:qu|quz|quechua)(?:-[a-z0-9]+)*$/.test(language);
}

export function quechuaSafePrompt(prompt: string, language: string): string {
  if (!isQuechuaLanguage(language)) return prompt;
  // Must occur AFTER CURRENT STUDENT QUESTION to avoid direct unverified model translation.
  return `${prompt}\n\nQUECHUA-01 FINAL DELIVERY REQUIREMENT: Generate the complete pedagogical answer in clear, correct SPANISH only, even if the student asks for Quechua. Do not generate, imitate, or translate into Quechua. The interface will transparently indicate Spanish and provide a separate optional translation only with explicit cloud consent. Follow the selected pedagogical mode (EXPLAIN/GUIDE/PRACTICE/EXPLORE), its safety checks, the student's requested length and question count. Never claim a dialect is validated.`;
}

const spanishWords = /\b(?:el|la|los|las|un|una|se|en|para|que|por|con|cuando|porque|del|una|de|es|como|puedes|agua|pista|pregunta|sombra|estudiante|experimento|correcto|incorrecto|sumar|restar|dividir|multiplica|multiplicar|debes|observa|ejemplo|sucede|inversa|operación|proceso|después|forma|cambia|evaporación)\b/gi;
const quechuaTokens = /\b(?:qhapaq|ñuqanchik|ñuqayku|rimaykullayki|imaynalla|kaypi|nisqa|yachay|ruray|llankay|maypi|allillanchu|kawsay|pis[aá]qqa|qos)\b/gi;

/** Heuristic only; deliberately conservative about uncertain output. */
export function looksLikeUnverifiedQuechua(text: string): boolean {
  const tokens = (text.toLocaleLowerCase().match(/[\p{L}]+/gu) ?? []).filter(t => t.length > 2);
  if (!tokens.length) return true;
  const repeated = new Map<string, number>();
  for (const token of tokens) repeated.set(token, (repeated.get(token) ?? 0) + 1);
  const frequent = Math.max(...repeated.values());
  const spanish = (text.match(spanishWords) ?? []).length;
  const quechua = (text.match(quechuaTokens) ?? []).length;
  const oddRepetition = tokens.length >= 10 && frequent >= 4 && frequent / tokens.length >= 0.20;
  const clearQuechua = quechua >= 3 && quechua > spanish;
  const noSpanishFrame = (tokens.length >= 6 && spanish === 0) || (tokens.length >= 12 && spanish < 2);
  return oddRepetition || clearQuechua || noSpanishFrame;
}

function safeFallbackSpanish(mode: TutorMode, question: string): string {
  // One bounded, reviewed offline example. Other subjects get an honest limitation.
  if (/evapora(?:ci[oó]n|r)|evaporation/i.test(question) && mode === 'explain') {
    return 'La evaporación ocurre cuando el agua líquida pasa a vapor desde su superficie, incluso sin hervir. Por ejemplo, un charco puede secarse poco a poco. ¿Qué ocurre con un charco cuando pasa el tiempo?';
  }
  if (mode === 'guide') return 'No pude verificar la explicación generada. Para evitar confundirte, continuemos en español con una pista sobre tu último paso. ¿Qué operación o concepto quieres revisar primero?';
  if (mode === 'practice') return 'No pude verificar la retroalimentación generada. Conservaremos el ejercicio sin marcar tu respuesta como correcta o incorrecta. ¿Quieres revisar tu procedimiento en español?';
  if (mode === 'explore') return 'No pude verificar el experimento propuesto. No voy a inventar variables ni resultados. ¿Qué fenómeno deseas investigar paso a paso en español?';
  return 'No pude verificar la explicación generada y no voy a inventar contenido en quechua. ¿Puedes reformular tu pregunta en español?';
}

export interface QuechuaPublishResult { text: string; replaced: boolean; }
/** Apply to ALL four tutor modes, after the mathematical/scientific guards. */
export function prepareQuechuaTutorReply(
  answer: string, language: string, mode: TutorMode, question: string
): QuechuaPublishResult {
  if (!isQuechuaLanguage(language)) return { text: answer, replaced: false };
  const generated = answer.trim();
  const replaced = !generated || looksLikeUnverifiedQuechua(generated);
  return {
    text: `${QUECHUA_SPANISH_NOTICE}\n\n${replaced ? safeFallbackSpanish(mode, question) : generated}`,
    replaced,
  };
}

/** Gross checks only, not a substitute for verification by a Quechua speaker. */
export function acceptAutomaticQuechuaTranslation(translated: string, originalSpanish: string): boolean {
  const trimmed = translated.trim();
  if (!trimmed || trimmed.length < 12 || trimmed.length > originalSpanish.length * 4 + 300) return false;
  if (looksLikeUnverifiedQuechua(trimmed)) return false;
  // Reject copies of the Spanish original disguised as a translation.
  if (trimmed.toLocaleLowerCase().replace(/\s+/g, ' ') === originalSpanish.trim().toLocaleLowerCase().replace(/\s+/g, ' ')) return false;
  return true;
}

export function originalSpanishForTranslation(text: string): string {
  return text.startsWith(QUECHUA_SPANISH_NOTICE)
    ? text.slice(QUECHUA_SPANISH_NOTICE.length).trim() : text;
}

export function labelUnverifiedQuechuaTranslation(translated: string): string {
  return `${QUECHUA_TRANSLATION_NOTICE}\n\n${translated.trim()}`;
}
