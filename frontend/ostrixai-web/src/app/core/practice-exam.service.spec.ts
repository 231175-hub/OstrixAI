import { TestBed } from '@angular/core/testing';
import { LocalIdentityService } from './local-identity.service';
import { PracticeExamService } from './practice-exam.service';
import { LearningMemoryService } from './learning-memory.service';
import { DeviceCapabilitiesService } from './device-capabilities.service';
import { OstrixAiService } from './ostrix-ai.service';
import { migrateSessionIfNeeded } from './session-migration';

describe('Offline educational assessment', () => {
  let identity: LocalIdentityService;
  let exams: PracticeExamService;
  let memory: LearningMemoryService;
  beforeEach(async () => {
    TestBed.configureTestingModule({providers: [
      {provide: DeviceCapabilitiesService, useValue: {checkNano: async () => {}, nano: () => 'unavailable', engineState: () => 'unavailable'}},
      {provide: OstrixAiService, useValue: {processPromptDetailed: () => { throw new Error('Unexpected AI call'); }}},
    ]});
    identity = TestBed.inject(LocalIdentityService);
    exams = TestBed.inject(PracticeExamService);
    memory = TestBed.inject(LearningMemoryService);
    await identity.register('qa' + crypto.randomUUID().slice(0, 8), crypto.randomUUID());
  });
  afterEach(() => identity.logout());

  const session = () => migrateSessionIfNeeded({id: crypto.randomUUID(), course: 'Matemática', topic: 'Ecuaciones de primer grado',
    date: '2026-11-21', notes: 'Al resolver la ecuación lineal dos veces x más seis es igual a dieciocho, x vale seis.'});
  const config = {count: 5, difficulty: 'BASIC', type: 'MULTIPLE_CHOICE', allowCloud: false} as const;

  it('grades a matching curriculum item, persists and replays its SM-2 result once', async () => {
    const exam = await exams.generateExam(session(), config);
    expect(exam.inferenceSource).toBe('CURRICULUM_OFFLINE');
    const linear = exam.questions.find(q => q.questionText.includes('2x + 6'));
    expect(linear).toBeDefined();
    expect(exam.questions.some(q => /discriminante/i.test(q.questionText))).toBeFalse();
    const id = crypto.randomUUID();
    const attempt = await exams.createAndSaveAttempt(exam, {[linear!.id]: linear!.options.indexOf('6')}, 9, id);
    expect(attempt.correctCount).toBe(1);
    await exams.createAndSaveAttempt(exam, {}, 15, id);
    await memory.load();
    const [concept] = memory.concepts();
    expect(concept.history.length).toBe(1);
    expect(concept.status).toBe('TESTED');
    expect(concept.nextReviewDate > concept.lastReviewedDate!).toBeTrue();
    expect((await exams.getExamHistory(exam.sessionId)).length).toBe(1);
  });

  it('records repeated one-item practices without upgrading the doubt to mastery', async () => {
    const exam = await exams.createFocusedExam(session(), 'Ecuaciones');
    expect(exam).not.toBeNull();
    const q = exam!.questions[0];
    for (let i = 0; i < 2; i++) await exams.createAndSaveAttempt(exam!, { [q.id]: q.correctAnswerIndex }, 3);
    expect(memory.concepts()[0].history.length).toBe(2);
    expect(memory.concepts()[0].status).toBe('TESTED');
  });

  it('does not recycle an exam after the content changes', async () => {
    const old = session();
    await exams.generateExam(old, config);
    const changed = migrateSessionIfNeeded({id: old.id, course: old.course, topic: 'Biografías', notes: 'Biografías'});
    await expectAsync(exams.generateExam(changed, config)).toBeRejected();
  });

  it('returns five distinct offline fraction exercises and preserves a genuine one-item limit for linear equations', async () => {
    const fractions = migrateSessionIfNeeded({id: crypto.randomUUID(), course: 'Matemática', topic: 'Fracciones', notes: ''});
    const exam = await exams.generateExam(fractions, config);
    expect(new Set(exam.questions.map(q => q.questionText)).size).toBe(5);
    expect(exam.questions.every(q => q.source === 'CURRICULUM_OFFLINE' && q.topicName === 'Fracciones y partes')).toBeTrue();
    const scarce = await exams.generateExam(session(), config);
    expect(scarce.questionCount).toBe(1);
  });

  it('keeps valid items from partial model output, supplements from the library, and asks once for missing items', async () => {
    spyOn(TestBed.inject(DeviceCapabilitiesService), 'nano').and.returnValue('available');
    const question = (a: number) => ({
      type: 'MULTIPLE_CHOICE', questionText: '¿Cuánto es ' + a + ' + 2?', options: [String(a), String(a + 1), String(a + 2), String(a + 3)],
      correctAnswerIndex: 2, explanation: 'Sumar dos equivale a avanzar dos unidades.',
    });
    const broken = { ...question(7), correctAnswerIndex: 0 };
    // This fake exercises aggregation and consent. Only the live probe can attest device inference.
    let requestCount = 0;
    const infer = spyOn(TestBed.inject(OstrixAiService), 'processPromptDetailed').and.callFake(async () => ({
      source: 'ON_DEVICE', text: JSON.stringify(++requestCount === 1
        ? [question(1), {...question(1), questionText: 'Calcula 1+2.'}, broken] : [question(1), question(2), question(3), question(4)]),
    } as Awaited<ReturnType<OstrixAiService['processPromptDetailed']>>));
    const exam = await exams.generateExam(session(), config);
    expect(infer).toHaveBeenCalledTimes(2);
    expect(infer.calls.allArgs().every(([, , options]) => options?.modeOverride === 'local' && options.cloudConsent === false)).toBeTrue();
    expect(exam.curriculumSupplement).toBe(1);
    expect(new Set(exam.questions.map(q => q.questionText)).size).toBe(5);
    expect(new Set(exam.questions.map(q => q.id)).size).toBe(5);
    expect(exam.questions.some(q => q.questionText.includes('7 + 2'))).toBeFalse();
  });

  it('counts original notes toward the threshold, excluding headings and AI enrichments', () => {
    const s = session();
    const topics = s.topics.map(t => ({...t, notes: [], originalNotesText: '',
      enrichedExplanation: 'Estas palabras corresponden a una explicación generada antes de la práctica actual.'}));
    expect(exams['extractAcademicContent']({...s, topics}).totalWords).toBe(0);
  });

  it('does not automatically grade model-generated true/false or ambiguous grammar questions', () => {
    const parse = (row: object) => exams['parseAndValidateQuestions'](JSON.stringify([row]), 1, 'BASIC');
    const question = {type: 'TRUE_FALSE', questionText: '¿Es correcta la afirmación?', options: ['Falso', 'Verdadero'],
      correctAnswerIndex: 1, explanation: 'La afirmación se cumple.'};
    expect(parse(question)).toBeNull();
    expect(parse({...question, correctAnswerIndex: null})).toBeNull();
    expect(parse({...question, options: ['Sí','Sí']})).toBeNull();
    const ambiguous = {type: 'MULTIPLE_CHOICE', questionText: 'En la oración: El atleta corre rápidamente hacia la meta, ¿cuál es el verbo y su conjugación?',
      options: ['correr / corriendo', 'corre / corrió', 'corrió / corre', 'es / es'],
      correctAnswerIndex: 1, explanation: 'Corre es verbo en presente.'};
    expect(parse(ambiguous)).toBeNull();
  });
});
