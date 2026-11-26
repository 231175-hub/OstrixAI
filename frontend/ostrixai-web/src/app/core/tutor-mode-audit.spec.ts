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
