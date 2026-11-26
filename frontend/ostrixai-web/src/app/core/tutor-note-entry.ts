/**
 * APUNTES-IA-01
 * Guarda una explicacion completa como una sola entrada.
 * El Diario separa apuntes con \n; los parrafos internos usan U+2028.
 * No modifica apuntes previamente almacenados.
 */
export function appendTutorNoteAsSingleEntry(
  existing: string,
  content: string
): string {
  const normalized = content
    .replace(/\r\n?/g, '\n')
    .trim();

  if (!normalized) {
    throw new Error('No hay una explicación para guardar.');
  }

  const body = normalized
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n/g, '\u2028');

  const entry = `[Explicación de Tutor Ostrix] ${body}`;
  const previous = existing.trimEnd();

  // Evitar guardar dos veces la misma explicacion.
  if (previous.split('\n').includes(entry)) {
    return previous;
  }

  return previous ? `${previous}\n${entry}` : entry;
}

/** APUNTES-IA-VISUAL-02: titulo separado y parrafos editables. */
export const TUTOR_NOTE_PREFIX = '[Explicación de Tutor Ostrix]';

export function isTutorStructuredNote(line: string): boolean {
  return line.startsWith(TUTOR_NOTE_PREFIX);
}

export function visibleTutorNoteText(line: string): string {
  const body = isTutorStructuredNote(line)
    ? line.slice(TUTOR_NOTE_PREFIX.length).trimStart()
    : line;

  return body.replace(/\u2028/g, '\n');
}

export function editedTutorNoteText(value: string): string {
  const body = value
    .replace(/\r\n?/g, '\n')
    .replace(/\n/g, '\u2028');

  return `${TUTOR_NOTE_PREFIX} ${body}`;
}