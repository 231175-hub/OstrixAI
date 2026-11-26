/**
 * MEM-01: lectura textual y local de apuntes originales de UNA sesión autorizada.
 * Este módulo no accede a IndexedDB, Firebase o redes: el Tutor debe entregar
 * la sesión de la cuenta activa y comprobar el consentimiento vigente.
 */
export interface LocalOriginalTopic {
  readonly name?: string;
  readonly originalNotesText?: string;
  readonly notes?: readonly string[];
}

export interface LocalOriginalSession {
  readonly topic?: string;
  readonly notes?: string;
  readonly topics?: readonly LocalOriginalTopic[];
}

export function isExactOriginalNoteRequest(question: string): boolean {
  const q = question.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const refersToNotes = /\b(notes?|notebook|journal|apuntes?|notas?|texto|text|written|wrote|escrito)\b/.test(q);
  const asksExactly = /\b(exact|exactly|original|originales?|verbatim|quote|quoted|quotation|literal(?:mente)?|textual|cita(?:r|me)?|exacto|exacta|escribi|escribio)\b/.test(q);
  return refersToNotes && asksExactly;
}

/**
 * null = pregunta no relacionada con cita textual.
 * string = respuesta local segura, incluso cuando falta sesión o permiso.
 */
export function quoteOriginalNote(
  question: string,
  session: LocalOriginalSession | null,
  language: 'es' | 'en',
): string | null {
  if (!isExactOriginalNoteRequest(question)) return null;
  const en = language === 'en';
  if (!session) return en
    ? 'I cannot quote an original note because no authorized journal session is attached. Select the correct session and enable study-context permission.'
    : 'No puedo citar un apunte original porque no hay una sesión autorizada. Selecciona la sesión y habilita el permiso de contexto académico.';

  // La pizarra almacena el texto original en topics[].originalNotesText.
  // Nunca utilizar enrichedExplanation, enrichedExamples, keyIdeas ni commonMistakes.
  const topics = (session.topics ?? []).map(t => ({
    name: (t.name ?? '').trim(),
    text: (t.originalNotesText || t.notes?.join('\n') || '').trim(),
  })).filter(t => t.text.length > 0);

  // Compatibilidad con el modelo antiguo: campo plano solo cuando no hay temas.
  const candidates = topics.length ? topics : (session.topics?.length ?? 0) === 0 && session.notes?.trim()
    ? [{ name: (session.topic ?? '').trim(), text: session.notes.trim() }] : [];

  if (!candidates.length) return en
    ? 'The selected session has no original student notes to quote. AI-enriched explanations are not original notes.'
    : 'La sesión seleccionada no contiene apuntes originales para citar. El enriquecimiento generado por IA no es un apunte original.';

  if (candidates.length > 1) return en
    ? `The session contains ${candidates.length} topics with original notes. Please name the specific topic to quote.`
    : `La sesión contiene ${candidates.length} temas con apuntes originales. Indica el tema específico para citarlo.`;

  const exact = candidates[0].text;
  if (exact.length > 2400) return en
    ? 'The original note exceeds 2,400 characters. Open My Journal to read it in full without silently truncating a quotation.'
    : 'El apunte original supera los 2400 caracteres. Ábrelo en Mi diario para leerlo completo sin recortar la cita.';

  const label = en
    ? 'Exact original student note (from the local journal, not AI-generated):'
    : 'Apunte original exacto (del Diario local, no generado por IA):';
  return `${label}\n\n${exact}`;
}
