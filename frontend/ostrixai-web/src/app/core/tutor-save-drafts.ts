import { cleanMarkdownToText } from './markdown-cleaner';

export type TutorSaveKind = 'notes' | 'doubts' | 'eureka' | 'review';

/**
 * Vista previa editable. Nunca modifica los mensajes originales del historial.
 * Eureka exige una idea redactada por el estudiante: no la inventamos a partir de la IA.
 */
export function prepareTutorSaveDraft(kind: TutorSaveKind, question: string, response: string): string {
  if (kind === 'eureka') return '';

  if (kind === 'notes') {
    return cleanMarkdownToText(response)
      .split('\n')
      .filter(line => !/^\d{1,2}[.)]\s*$/.test(line.trim()))
      .filter(line => !/^(?:¡?hola[!.…]*|hello[!.…]*|¡?claro[!.…]*)$/i.test(line.trim()))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, 20000);
  }

  // La pregunta anterior se usa como borrador, sin inventar dudas ni respuestas nuevas.
  const cleaned = cleanMarkdownToText(question).replace(/\s+/g, ' ').trim();
  const explicitQuestion = cleaned.match(/¿[^?]{3,400}\?/u)?.[0];
  const promptWithoutPresentationRules = (explicitQuestion ?? cleaned)
    .replace(/(?:[,;. ]+)?(?:máximo|en (?:un )?máximo de|en no más de|in (?:at most|under))\s+\d+\s+(?:palabras|words)\.?$/iu, '')
    .replace(/(?:[,;. ]+)?(?:responde|explícalo|answer|explain it)\s+en\s+\d+\s+(?:palabras|words)\.?$/iu, '')
    .trim();
  return promptWithoutPresentationRules.slice(0, 400);
}
