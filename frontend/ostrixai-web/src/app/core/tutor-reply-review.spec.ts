import { TestBed } from '@angular/core/testing';
import { LearningDiaryService } from './learning-diary.service';
import { LearningMemoryService } from './learning-memory.service';
import { ReviewSchedulerService } from './review-scheduler.service';
import { StudentSettingsService } from './student-settings.service';
import { TutorContextService } from './tutor-context.service';
import { reviewTutorReply, tutorReplyFormatNotice } from './tutor-reply-review';
import { checkPracticeCalculation } from './tutor-calculation';
import type { TutorMessage } from './tutor-conversation.service';

describe('Tutor pedagogy before inference', () => {
  const message = (role: TutorMessage['role'], text: string): TutorMessage => ({
    id: crypto.randomUUID(), role, text, createdAt: '',
  });
  it('uses the preceding exchange in all four modes and checks only unambiguous arithmetic', () => {
    TestBed.configureTestingModule({ providers: [
      { provide: StudentSettingsService, useValue: { profile: () => ({ language: 'es', grade: 2 }) } },
      ...[LearningDiaryService, LearningMemoryService, ReviewSchedulerService].map(provide => ({ provide, useValue: {} })),
    ] });
    const context = TestBed.inject(TutorContextService);
    const explain = context.build('¿Y con cuartos?', 'explain', null, [
      message('user', 'Estoy midiendo una cinta.'), message('assistant', 'Usa partes iguales de la misma cinta.'),
    ]);
    expect(explain).toContain('Estoy midiendo una cinta.');
    expect(explain).toContain('Omite saludos');
    expect(explain).toContain('2.º de secundaria');
    expect(reviewTutorReply('¿Y con cuartos?', '3/4 - 1/4 = 2/8', false, 'draft', 'explain')).toContain('1/2');
    expect(reviewTutorReply('¿Y con cuartos?', '3/4 - 1/4 = 2/4', false, 'draft', 'explain')).toBeNull();
    const history = [message('assistant', '¿Qué representa el denominador?'), message('user', 'Cuatro partes iguales.')];
    expect(context.build('Dame otra pista.', 'guide', null, history)).toContain('Cuatro partes iguales.');
    expect(reviewTutorReply('Dame otra pista.', '¿Cuántas partes? ¿Cuántas quedan?', false, 'draft', 'guide')).toContain('sola pregunta');
    const exercise = [message('user', 'Quiero practicar restas.'), message('assistant', '¿Cuánto es 3/4 − 1/4?')];
    expect(context.build('2/8', 'practice', null, exercise)).toContain('respuesta numérica del estudiante es incorrecta');
    expect(reviewTutorReply('2/8', '¡Correcto! ¿Otro?', false, 'draft', 'practice', exercise)).toContain('1/2');
    expect(reviewTutorReply('2/8', 'Aún no. Al restar cuartos, el denominador sigue siendo cuatro.', false, 'draft', 'practice', exercise)).toBeNull();
    expect(checkPracticeCalculation('4/8', exercise)?.correct).toBeTrue();
    expect(checkPracticeCalculation('1/0', exercise)).toBeNull();
    expect(checkPracticeCalculation('2', [message('assistant', '¿Cuánto es 6 / 3?')])?.correct).toBeTrue();
    expect(checkPracticeCalculation('3', [message('assistant', '¿Cuánto es 1 + 2 en módulo 2?')])).toBeNull();
    expect(checkPracticeCalculation('3', [message('assistant', '¿Cuánto es 1 + 2 × 4?')])).toBeNull();
    const explore = context.build('Diseña un experimento.', 'explore', null, [
      message('user', 'Observé que mis plantas crecían más bajo la ventana.'), message('assistant', 'Podemos probar el efecto de la luz.'),
    ]);
    for (const fact of ['mis plantas crecían', 'pregunta investigable', 'hipótesis', 'variable independiente',
      'variable dependiente', 'variables controladas', 'materiales', 'pasos', 'único factor']) expect(explore).toContain(fact);
    expect(reviewTutorReply('Diseña un experimento.', '¿Qué observaste?', false, 'draft', 'explore')).toContain('medición');
    const design = '¿Cambia la altura con más luz? Hipótesis: crecerán más. Variable independiente: horas de luz. ' +
      'Variable dependiente: altura en cm. Controles: especie, agua y tierra. Materiales: seis macetas y regla. ' +
      'Pasos: asigna tres plantas a cada duración de luz y mide cada dos días.';
    expect(reviewTutorReply('Diseña un experimento.', design, false, 'draft', 'explore')).toBeNull();
  });
  for (const english of [false, true]) {
    it('puts the part–whole check and the current word limit in all four modes in ' + (english ? 'en' : 'es'), () => {
      TestBed.configureTestingModule({ providers: [
        { provide: StudentSettingsService, useValue: { profile: () => ({ language: english ? 'en' : 'es', grade: 2 }) } },
        ...[LearningDiaryService, LearningMemoryService, ReviewSchedulerService].map(provide => ({ provide, useValue: {} })),
      ] });
      const context = TestBed.inject(TutorContextService);
      const question = english ? 'Explain 3/4 in at most 100 words.' : 'Explica 3/4 en un máximo de 100 palabras.';
      const modes = ['explain', 'guide', 'practice', 'explore'] as const;
      const prompts = modes.map(mode => context.build(question, mode, null, []));
      expect(new Set(prompts).size).toBe(modes.length);
      for (const prompt of prompts) {
        expect(prompt).toContain('(T-U)/T');
        expect(prompt).toContain(english ? 'within 100 words' : 'como máximo 100 palabras');
        expect(prompt.endsWith(question)).toBeTrue();
      }
    });
  }
});

describe('NANO-FLEX-01 format notices', () => {
  it('does not regenerate for length alone in any mode', () => {
    const q = 'Responde en un máximo de 10 palabras.';
    const a = 'Esta explicación desarrolla el tema con suficiente detalle para que puedas entenderlo mejor.';
    for (const mode of ['explain', 'guide', 'practice', 'explore'] as const) {
      const answer = mode === 'guide' ? a + ' Pista: observa. ¿Qué notas?' : a;
      expect(reviewTutorReply(q, answer, false, 'draft', mode)).toBeNull();
      expect(reviewTutorReply(q, answer, false, 'revised', mode)).toBeNull();
      expect(tutorReplyFormatNotice(q, answer, false, mode)).toContain('máximo solicitado 10');
    }
  });
  it('still rejects substantive errors even when the answer is overlong', () => {
    const q = 'Responde en un máximo de 10 palabras.';
    const a = '3/4 - 1/4 = 2/8. ' + 'palabra '.repeat(20);
    expect(reviewTutorReply(q, a, false, 'draft', 'explain')).toContain('1/2');
    expect(() => reviewTutorReply(q, a, false, 'revised', 'explain')).toThrow();
    expect(tutorReplyFormatNotice(q, a, false, 'explain')).toContain('máximo solicitado 10');
  });
});

describe('Tutor review of written examples', () => {
  const question = 'Explica 3/4 con una chacra de papas en un máximo de 100 palabras.';

  it('requires the fraction correction but reports length separately', () => {
    const incorrect = 'Si comes 3 de las 4 papas, te quedan $\\frac{3}{4}$.';
    const feedback = reviewTutorReply(question, incorrect + ' Otra palabra.'.repeat(51), false, 'draft');
    expect(feedback).toContain('3 unidades usadas de 4');
    expect(feedback).not.toContain('100 palabras');
    expect(tutorReplyFormatNotice(question, incorrect + ' Otra palabra.'.repeat(51), false)).toContain('máximo solicitado 100');
  });

  it('accepts a correctly labelled example with equivalent fractions in plain or TeX notation', () => {
    const example = 'Si comes 3 de las 4 papas, has consumido 6/8 y te queda $\\frac{1}{4}$ del total.';
    expect(reviewTutorReply(question, example, false, 'draft')).toBeNull();
    expect(reviewTutorReply(question, example, false, 'revised')).toBeNull();
  });

  it('counts the visible fraction as one word at the exact boundary', () => {
    const exact = 'palabra '.repeat(99) + '$\\frac{3}{4}$';
    expect(reviewTutorReply(question, exact, false, 'draft')).toBeNull();
    expect(tutorReplyFormatNotice(question, exact, false)).toBeNull();
    expect(reviewTutorReply(question, exact + ' más', false, 'draft')).toBeNull();
    expect(tutorReplyFormatNotice(question, exact + ' más', false)).toContain('101 palabras');
  });

  it('blocks a wrong fraction but permits an overlong revised answer with a notice', () => {
    expect(() => reviewTutorReply(question, 'Si comes 3 de 4 papas, te quedan 3/4.', false, 'revised'))
      .toThrowError(/fracciones.*contradicen/);
    expect(reviewTutorReply(question, 'papas '.repeat(101), false, 'revised')).toBeNull();
    expect(tutorReplyFormatNotice(question, 'papas '.repeat(101), false)).toContain('101 palabras');
  });
});
