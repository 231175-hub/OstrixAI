import { clarifyDoubtContext, extractUnambiguousSubject, isIncompleteDoubt, suggestedTopicTitle } from './companion-doubt-context';

describe('OSTRIX-CONTEXTO-02: dudas comprensibles y no atribuidas al azar', () => {
  it('recupera el tema de las nubes', () => {
    expect(clarifyDoubtContext('Hoy aprendí sobre las nubes', 'No entendí cómo se forman.').text).toBe('No entendí cómo se forman las nubes.');
  });
  it('recupera dinosaurios con qué son', () => {
    expect(clarifyDoubtContext('Aprendí qué son los dinosaurios', 'Pero no sé qué son.').text).toBe('Pero no sé qué son los dinosaurios.');
  });
  it('recupera dinosaurios sin tildes', () => {
    expect(clarifyDoubtContext('Aprendí que son los dinosaurios', 'pero no se que son').text).toBe('pero no se que son los dinosaurios.');
  });
  it('recupera la célula singular', () => {
    expect(clarifyDoubtContext('Aprendí sobre la célula', 'No comprendí cómo funciona.').text).toBe('No comprendí cómo funciona la célula.');
  });
  it('no cambia dudas con tema explícito', () => {
    const text = 'No sé qué son los dinosaurios';
    expect(clarifyDoubtContext('Aprendí sobre los dinosaurios',text)).toEqual({text,addedContext:false});
  });
  it('no adivina entre dos temas', () => {
    const text = 'No sé qué son.';
    expect(clarifyDoubtContext('Aprendí sobre las nubes y los dinosaurios', text).text).toBe(text);
    expect(isIncompleteDoubt(text)).toBe(true);
  });
  it('no adivina a partir de otro apunte', () => {
    const text = 'No entendí cómo se forman.';
    expect(clarifyDoubtContext('Hoy resolví sumas', text).text).toBe(text);
  });
  it('no cambia sujeto singular para verbo plural', () => {
    expect(clarifyDoubtContext('Hoy aprendí sobre el agua','No entendí cómo se forman.').addedContext).toBe(false);
  });
  it('no guarda frases inconclusas', () => {
    expect(isIncompleteDoubt('pero no se que son')).toBe(true);
    expect(isIncompleteDoubt('No entendí cómo se forman.')).toBe(true);
    expect(isIncompleteDoubt('No entendí cómo se forman las nubes.')).toBe(false);
  });
  it('extrae un único nombre sin añadir datos', () => {
    expect(extractUnambiguousSubject('Aprendí que son los dinosaurios')).toBe('los dinosaurios');
    expect(suggestedTopicTitle('Hoy aprendí sobre las nubes')).toBe('Las nubes');
  });
  it('no extrae sujetos genéricos', () => {
    expect(extractUnambiguousSubject('Aprendí sobre las cosas')).toBeNull();
  });
  it('no extrae de notas con dos temas independientes', () => {
    expect(extractUnambiguousSubject('Aprendí sobre las nubes. Aprendí sobre los dinosaurios.')).toBeNull();
  });
  it('nunca rebasa la longitud permitida de una duda', () => {
    const text='No entendí cómo se forman.';
    expect(clarifyDoubtContext('Hoy aprendí sobre las '+ 'x'.repeat(390), text).text.length).toBeLessThanOrEqual(400);
  });
});
