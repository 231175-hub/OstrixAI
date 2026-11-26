import { reviewTutorReply } from './tutor-reply-review';

describe('TUTOR-MODOS-AUDITORIA-02', () => {
  it('guia requiere exactamente una pregunta', () => {
    expect(reviewTutorReply('Ayúdame a entender', 'Pista: revisa el calor.', false, 'draft', 'guide'))
      .toContain('exactamente una sola pregunta');
    expect(reviewTutorReply('Ayúdame a entender', 'Pista: revisa el calor. ¿Qué pasa con el agua?', false, 'draft', 'guide'))
      .toBeNull();
  });
  it('explora requiere cuatro pasos cuando se solicitan cuatro', () => {
    const q = 'Dame cuatro materiales y cuatro pasos para el experimento';
    const a = 'Materiales:\n1. Dos platos\n2. Agua\n3. Vaso\n4. Reloj\nPasos:\n1. Mide\n2. Coloca\n3. Espera\n4. Mide otra vez\n5. Anota\n6. Compara';
    expect(reviewTutorReply(q, a, false, 'draft', 'explore')).toContain('4 pasos');
    expect(() => reviewTutorReply(q, a, false, 'revised', 'explore'))
      .toThrowError(/número solicitado/);
  });
});


// NANO-FINAL-01
describe('Tutor response integrity', () => {
  it('rejects observed truncated and internal-output artifacts', () => {
    for (const answer of [
      ') Fabrican (24) alimento (25) con (26) luz (27)',
      'tallo de apio.\n• Explain quantities/elements? Yes.\n• Scientific accuracy',
      'Una planta tiene pared celular. ¿Por qué crees que se marchita'
    ]) {
      expect(reviewTutorReply('Explica las células.', answer, false, 'draft', 'explain')).toContain('respuesta completa');
      expect(() => reviewTutorReply('Explica las células.', answer, false, 'revised', 'explain')).toThrow();
    }
  });
  it('accepts complete short responses and normal numbered lists', () => {
    expect(reviewTutorReply('Explica las células.', 'Una célula vegetal típica tiene pared celular y una gran vacuola. ¿Por qué se marchita una planta?', false, 'draft', 'explain')).toBeNull();
    expect(reviewTutorReply('Enumera partes.', '1. Membrana\n2. Núcleo\n3. Citoplasma', false, 'draft', 'explain')).toBeNull();
    expect(reviewTutorReply('¿Cuánto es dos más dos?', '4', false, 'draft', 'explain')).toBeNull();
  });
});

// NANO-FINAL-SCOPE
describe('Topic and percentage checks', () => {
  const practice = 'Propón un ejercicio sobre porcentajes utilizando una compra en el mercado de Abancay.';
  it('rejects a missing salary base and accepts a coherent purchase', () => {
    const bad = 'Un kilo de papas cuesta S/ 3.50. Ahorras el 10% de tu salario semanal. ¿Cuánto dinero de tu salario semanal deberías ahorrar?';
    const good = 'Una compra cuesta S/ 80 y tiene un descuento del 15%. ¿Cuánto dinero ahorrarás?';
    expect(reviewTutorReply(practice, bad, false, 'draft', 'practice')).toContain('cantidad base');
    expect(() => reviewTutorReply(practice, bad, false, 'revised', 'practice')).toThrow();
    expect(reviewTutorReply(practice, good, false, 'draft', 'practice')).toBeNull();
    expect(reviewTutorReply(practice, 'Tu salario semanal es S/ 200. Ahorras 10%. ¿Cuánto dinero de tu salario semanal deberías ahorrar?', false, 'draft', 'practice')).toBeNull();
  });
  it('rejects a shadow-length experiment in place of water evaporation', () => {
    const q = 'Diseña un experimento para comparar la evaporación del agua al sol y a la sombra.';
    const a = 'Hipótesis: la sombra se acorta. Variable independiente: hora. Variable dependiente: longitud. Control: palo fijo. Materiales: palo y regla. Pasos: mide y registra.';
    expect(reviewTutorReply(q, a, false, 'draft', 'explore')).toContain('evaporación del agua');
  });
});