import { appendTutorNoteAsSingleEntry } from './tutor-note-entry';

describe('APUNTES-IA-01', () => {

  it('guarda toda una respuesta como una sola entrada', () => {
    const result = appendTutorNoteAsSingleEntry(
      'Apunte original',
      'Primera explicación.\n\nSegunda explicación.\n- Grupo A.\n- Grupo B.'
    );

    const entries = result.split('\n');

    expect(entries.length).toBe(2);
    expect(entries[0]).toBe('Apunte original');
    expect(entries[1]).toContain('Primera explicación.');
    expect(entries[1]).toContain('Segunda explicación.');
    expect(entries[1]).toContain('Grupo B.');
  });

  it('conserva separadores internos de parrafo', () => {
    const result = appendTutorNoteAsSingleEntry(
      '',
      'Introducción.\n\nConclusión.'
    );

    expect(result).toContain('\u2028');
    expect(result.split('\n').length).toBe(1);
  });

  it('no duplica un contenido ya guardado', () => {
    const first = appendTutorNoteAsSingleEntry(
      'Apunte anterior',
      'Una explicación científica.'
    );

    const second = appendTutorNoteAsSingleEntry(
      first,
      'Una explicación científica.'
    );

    expect(second).toBe(first);
  });

  it('no guarda explicaciones vacias', () => {
    expect(() =>
      appendTutorNoteAsSingleEntry('Apunte previo', '  ')
    ).toThrow();
  });

});

import {
  isTutorStructuredNote,
  visibleTutorNoteText,
  editedTutorNoteText
} from './tutor-note-entry';

describe('APUNTES-IA-VISUAL-02', () => {

  it('reconoce una explicacion de Ostrix', () => {
    expect(
      isTutorStructuredNote('[Explicación de Tutor Ostrix] Hola')
    ).toBeTrue();

    expect(isTutorStructuredNote('Apunte manual')).toBeFalse();
  });

  it('oculta el marcador y restaura los parrafos', () => {
    const stored =
      '[Explicación de Tutor Ostrix] Primero.\u2028\u2028Segundo.';

    expect(visibleTutorNoteText(stored))
      .toBe('Primero.\n\nSegundo.');
  });

  it('guarda las ediciones como una sola entrada', () => {
    const stored = editedTutorNoteText(
      'Primero.\n\nSegundo.\n- Grupo A'
    );

    expect(stored.split('\n').length).toBe(1);
    expect(visibleTutorNoteText(stored))
      .toBe('Primero.\n\nSegundo.\n- Grupo A');
  });

});