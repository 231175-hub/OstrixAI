import { prepareTutorSaveDraft } from './tutor-save-drafts';

describe('Tutor — borradores editables sin alterar el historial', () => {
  it('limpia la matemática y los rótulos numerados vacíos al proponer apuntes', () => {
    const source = '### $4 - 3 = 1$\n1.\n**Queda una papa.**\n2.\n';
    expect(prepareTutorSaveDraft('notes', '¿Cuántas quedan?', source))
      .toBe('4 - 3 = 1\nQueda una papa.');
    expect(source).toContain('$4 - 3 = 1$');
  });

  it('extrae una duda concreta y evita instrucciones de longitud', () => {
    expect(prepareTutorSaveDraft('doubts', '¿Qué significa 3/4? Máximo 30 palabras.', 'Respuesta extensa'))
      .toBe('¿Qué significa 3/4?');
    expect(prepareTutorSaveDraft('review', 'Explícame qué significa 3/4. Máximo 30 palabras.', 'Respuesta extensa'))
      .toBe('Explícame qué significa 3/4');
  });

  it('no convierte una afirmación de la IA en un descubrimiento del estudiante', () => {
    expect(prepareTutorSaveDraft('eureka', 'Explícame 3/4', '¡Hola! Tienes 3/4.')).toBe('');
  });
});
