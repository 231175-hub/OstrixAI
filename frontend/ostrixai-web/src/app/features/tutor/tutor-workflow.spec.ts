import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DeviceCapabilitiesService } from '../../core/device-capabilities.service';
import { LearningDiaryService } from '../../core/learning-diary.service';
import { LocalIdentityService } from '../../core/local-identity.service';
import { OstrixAiService } from '../../core/ostrix-ai.service';
import { ReviewSchedulerService } from '../../core/review-scheduler.service';
import { StudentSettingsService } from '../../core/student-settings.service';
import { TranslationService } from '../../core/translation.service';
import type { TutorMode } from '../../core/tutor-conversation.service';
import { TutorComponent } from './tutor.component';
import { prepareTutorSaveDraft } from '../../core/tutor-save-drafts';

describe('Tutor rendered workflows with encrypted student storage', () => {
  const note = 'La energía solar calienta el agua.';
  const question = '¿Qué explica mi apunte sobre la energía solar?';
  const password = 'synthetic-notebook-test';
  const transport = jasmine.createSpy('inference transport');
  const translate = jasmine.createSpy('translation transport');
  let identity: LocalIdentityService;
  let settings: StudentSettingsService;
  let fixture: ComponentFixture<TutorComponent>;
  let tutor: TutorComponent;
  let root: HTMLElement;
  let firstUser: string;
  let sessionId: string;

  beforeEach(async () => {
    transport.calls.reset();
    transport.and.rejectWith(new Error('Modelo no disponible en esta prueba'));
    translate.calls.reset();
    TestBed.configureTestingModule({ imports: [TutorComponent], providers: [
      { provide: OstrixAiService, useValue: {
        sessionGuard: () => { const owner = identity.student(); return () => owner === identity.student(); },
        processPromptDetailed: transport, inferencePhase: signal('generating'),
        streamingText: signal(''), modelDownloadProgress: signal(0),
      } },
      { provide: TranslationService, useValue: { translateDerivedText: translate } },
      { provide: DeviceCapabilitiesService, useValue: { nano: signal('unavailable'), online: signal(false) } },
    ] });
    identity = TestBed.inject(LocalIdentityService);
    settings = TestBed.inject(StudentSettingsService);
    firstUser = crypto.randomUUID().slice(0, 12);
    await identity.register(firstUser, password);
    await settings.save(2, 'es', false);
    const diary = TestBed.inject(LearningDiaryService);
    const session = await diary.create('2026-10-01', 'Ciencias', 'Energía');
    sessionId = session.id;
    await diary.update(sessionId, { notes: note });
    fixture = TestBed.createComponent(TutorComponent);
    tutor = fixture.componentInstance;
    root = fixture.nativeElement;
    tutor.activeSessionId = sessionId;
    fixture.detectChanges();
    await fixture.whenStable();
  });
  afterEach(() => identity.logout());

  it('renders fractions in existing replies and translations while preserving the stored messages and student input', () => {
    const createdAt = '2026-01-01T12:00:00Z';
    const questionText = '¿Qué es $\\frac{3}{4}$?';
    const reply = {
      id: 'answer', role: 'assistant', createdAt,
      text: 'Comiste $\\frac{3}{4}$ y queda \\(\\frac{1}{4}\\). <strong>Papas</strong>',
      translatedText: 'You ate $\\frac{3}{4}$ and \\frac{1}{4} remains.', translatedLang: 'en',
    } as const;
    tutor.chats.threads.set([{
      id: 'example', mode: 'explain', title: 'Fracciones', sessionId, createdAt, updatedAt: createdAt,
      messages: [{ id: 'question', role: 'user', text: questionText, createdAt }, reply],
    }]);
    tutor.chooseThread('example');
    fixture.detectChanges();
    expect(root.querySelector('.student-message .message-text')?.textContent?.trim()).toBe('¿Qué es 3/4?');
    expect(tutor.thread()!.messages[0].text).toBe(questionText);
    const answer = root.querySelector('.assistant-message .message-text')!;
    expect(answer.textContent?.trim()).toBe('Comiste 3/4 y queda 1/4. <strong>Papas</strong>');
    expect(answer.querySelector('strong')).toBeNull();
    root.querySelector<HTMLButtonElement>('.translation-header-badge button')!.click();
    fixture.detectChanges();
    expect(root.querySelector('.translated-content')?.textContent?.trim()).toBe('You ate 3/4 and 1/4 remains.');
    tutor.beginSave(reply, 'notes');
    expect(tutor.saveDraft).toBe('Comiste 3/4 y queda 1/4. <strong>Papas</strong>');
    tutor.beginSave(reply, 'doubts');
    expect(tutor.saveDraft).toBe('¿Qué es 3/4?');
    expect(tutor.thread()!.messages[1].text).toContain('$\\frac{3}{4}$');
    expect(tutor.thread()!.messages[1].translatedText).toContain('$\\frac{3}{4}$');
    expect(transport).not.toHaveBeenCalled();
    expect(translate).not.toHaveBeenCalled();
  });

  const cases: readonly [TutorMode, string, string][] = [
    ['explain', 'EXPLÍCAME', 'Reescribe esta idea'],
    ['guide', 'GUÍAME', 'Primero identifica'],
    ['practice', 'PRACTIQUEMOS', 'Sin mirar el pasaje'],
    ['explore', 'EXPLOREMOS', 'Propón una situación'],
  ];
  for (const [index, [mode, instruction, activity]] of cases.entries()) {
    it('sends both turns in ' + mode + ', renders errors and records the explicit offline activity', async () => {
      let started!: () => void;
      let fail!: (reason: Error) => void;
      const dispatch = new Promise<void>(resolve => { started = resolve; });
      transport.and.callFake(() => {
        started();
        return new Promise((_resolve, reject) => { fail = reject; });
      });
      root.querySelectorAll<HTMLButtonElement>('.mode-select .mode')[index].click();
      tutor.draft = question;
      const turn = tutor.send();
      await dispatch;
      fixture.detectChanges();
      expect(root.querySelector('.live-streaming')).not.toBeNull();
      TestBed.inject(OstrixAiService).streamingText.set('Borrador pendiente de revisión');
      fixture.detectChanges();
      expect(root.querySelector('.live-streaming')?.textContent).not.toContain('Borrador pendiente de revisión');
      expect(root.querySelector('.live-streaming .ai-progress-cancel-btn')).not.toBeNull();
      fail(new Error('Modelo no disponible en esta prueba'));
      await turn;
      fixture.detectChanges();
      expect(root.querySelector('[role=alert]')?.textContent).toContain('Modelo no disponible');
      expect(root.querySelector('.assistant-message')).toBeNull();
      const prompt = transport.calls.first().args[0];
      expect(prompt).toContain(instruction);
      expect(prompt).toContain('2.º de secundaria');
      expect(prompt).toContain(note);
      expect(tutor.thread()?.mode).toBe(mode);

      await tutor.useEssentialGuide();
      fixture.detectChanges();
      const reply = tutor.thread()!.messages.at(-1)!;
      expect(reply.source).toBe('OFFLINE_ESSENTIAL');
      expect(root.querySelector('.assistant-message .message-text')?.textContent).toContain(activity);
      expect(reply.text).toContain(note);
      transport.and.rejectWith(new Error('Modelo no disponible en esta prueba'));
      tutor.draft = 'Mi respuesta de prueba es que el agua se calienta.';
      await tutor.send();
      const next = transport.calls.mostRecent().args[0];
      expect(next).toContain(instruction);
      expect(next).toContain('Tutor: ' + reply.text);
      expect(next).toContain('CURRENT STUDENT QUESTION:\nMi respuesta de prueba');
      expect(tutor.thread()!.messages.map(m => m.role)).toEqual(['user', 'assistant', 'user']);
    });

    it('passes the preceding exercise and student answer through two successful adapter turns in ' + mode, async () => {
      // Guíame valida que cada salida incluya una pregunta principal.
      // Los textos simulados deben cumplir ese contrato; si no, se activa
      // legítimamente una revisión adicional y deja de ser una prueba de dos turnos.
      const first = mode === 'guide'
        ? 'Pista: recuerda la energía solar. ¿Qué paso investigarías primero?'
        : 'Primera salida de prueba del adaptador';
      const second = mode === 'guide'
        ? 'Pista: toma en cuenta tu respuesta anterior. ¿Qué comprobarías ahora?'
        : 'Segunda salida de prueba del adaptador';
      const answer = 'Mi respuesta al turno anterior';
      transport.and.returnValues(
        Promise.resolve({ text: first, source: 'ON_DEVICE', latencyMs: 4, limited: false }),
        Promise.resolve({ text: second, source: 'ON_DEVICE', latencyMs: 3, limited: false }),
      );
      root.querySelectorAll<HTMLButtonElement>('.mode-select .mode')[index].click();
      tutor.draft = question;
      await tutor.send();
      tutor.draft = answer;
      await tutor.send();
      fixture.detectChanges();
      expect(transport).toHaveBeenCalledTimes(2);
      const next = transport.calls.mostRecent().args[0];
      expect(next).toContain(instruction);
      expect(next).toContain('Tutor: ' + first);
      expect(next).toContain('CURRENT STUDENT QUESTION:\n' + answer);
      expect(tutor.thread()!.messages.map(m => m.text)).toEqual([question, first, answer, second]);
      expect(Array.from(root.querySelectorAll('.assistant-message .message-text'), el => el.textContent?.trim()))
        .toEqual([first, second]);
    });
  }

  it('selects the matching mode before each suggested question starts a conversation', () => {
    const buttons = root.querySelectorAll<HTMLButtonElement>('.suggestions button');
    for (const [index, mode] of (['explain', 'practice', 'explore'] as const).entries()) {
      tutor.activeMode = 'guide';
      buttons[index].click();
      expect(tutor.mode()).toBe(mode);
      expect(tutor.draft.length).toBeGreaterThan(10);
    }
  });

  it('excludes notebook context when consent is off and keeps the real generation language on replies', async () => {
    await settings.save(2, 'qu-chanka', false, false, true, false, false);
    // Sentinel payload verifies the adapter contract, never model quality.
    transport.and.resolveTo({ text: 'Texto de transporte de prueba', source: 'ON_DEVICE', latencyMs: 2, limited: false });
    tutor.draft = 'Pregunta sin adjuntos';
    await tutor.send();
    expect(transport.calls.first().args[0]).not.toContain(note);
    const reply = tutor.thread()!.messages.at(-1)!;
    expect(reply.originalLanguage).toBe('es');
    fixture.detectChanges();
    expect(root.querySelector('.assistant-message .message-text')?.textContent).toContain(reply.text);
    await settings.save(2, 'es', false);
    await tutor.translateDerived(reply);
    expect(translate).not.toHaveBeenCalled();
    await settings.save(2, 'en', false);
    translate.and.resolveTo({ translatedText: 'Derived test string' });
    await tutor.translateDerived(reply);
    expect(translate).toHaveBeenCalledWith(reply.id, reply.text, 'es', 'en', false);
    expect(tutor.thread()!.messages.at(-1)!.translatedLang).toBe('en');
    fixture.detectChanges();
    const toggle = root.querySelector<HTMLButtonElement>('.translation-header-badge button')!;
    expect(toggle.textContent).toContain('View translation');
    toggle.click();
    fixture.detectChanges();
    expect(toggle.textContent).toContain('View original');
    expect(root.querySelector('.translated-content')?.textContent).toContain('Derived test string');
    expect(tutor.thread()!.messages.at(-1)!.text).toBe(reply.text);
  });

  it('grades the offline recommended question only after an answer and drops the card across profiles', async () => {
    const d = await tutor.diary.create('2026-10-02', 'Matemática', 'Fracciones');
    await tutor.diary.addConcept(d.id, 'doubts', 'Fracciones');
    await tutor.memory.registerDoubt(d.id, d.course, d.topic, 'Fracciones');
    expect(tutor.recommendation()?.reason).toBe('doubt');
    await TestBed.inject(ReviewSchedulerService).add(d.id, d.course, 'Fracciones');
    expect(tutor.recommendation()?.reason).toBe('due');
    fixture.detectChanges();
    expect(root.querySelectorAll('[data-testid=learning-step]').length).toBe(1);
    expect(root.querySelector('[data-testid=learning-step]')?.textContent).toContain('Fracciones');
    root.querySelector<HTMLButtonElement>('[data-testid=learning-step] .primary-small')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(tutor.mode()).toBe('practice');
    expect(tutor.session()?.id).toBe(d.id);
    expect(await identity.list('attempts')).toEqual([]);
    expect(tutor.activity()?.inferenceSource).toBe('CURRICULUM_OFFLINE');
    await tutor.answerStep(tutor.activity()!.questions[0].correctAnswerIndex);
    expect((await identity.list('attempts')).length).toBe(1);
    expect(tutor.memory.concepts()[0].status).toBe('TESTED');
    expect(tutor.recommendation()).toBeNull();
    expect(transport).not.toHaveBeenCalled();
    identity.logout();
    await identity.register(crypto.randomUUID().slice(0, 12), password);
    fixture.detectChanges();
    expect(root.querySelector('[data-testid=focused-practice]')).toBeNull();
    expect(root.querySelector('[data-testid=learning-step]')).toBeNull();
    expect(await identity.list('attempts')).toEqual([]);
  });

  it('saves an old unscoped answer to the chosen owned session without changing its chat', async () => {
    const thread = await tutor.chats.create(null, 'guide', 'Conversación anterior');
    const reply = await tutor.chats.appendAssistant(thread.id, {text: note, source: 'OFFLINE_ESSENTIAL', limited: true, latencyMs: 0});
    tutor.chooseThread(thread.id);
    fixture.detectChanges();
    tutor.beginSave(reply, 'notes');
    fixture.detectChanges();
    expect(root.querySelector<HTMLSelectElement>('#save-destination')).not.toBeNull();
    tutor.saveDestination.set('foreign-session');
    await tutor.confirmSave();
    expect(tutor.error()).toBeTruthy();
    tutor.saveDestination.set(sessionId);
    await tutor.confirmSave();
    expect(tutor.error()).toBe('');
    expect(tutor.thread()?.sessionId).toBeNull();
    expect(tutor.thread()?.messages).toEqual([reply]);
    expect(tutor.diary.sessions().find(s => s.id === sessionId)?.notes).toContain('[Explicación de Tutor Ostrix]');
  });

  it('rejects a pending unscoped save when the owning profile changes, even with a valid new destination', async () => {
    const chat = await tutor.chats.create(null, 'guide', 'Historial privado');
    const reply = await tutor.chats.appendAssistant(chat.id, {text: note, source: 'OFFLINE_ESSENTIAL', limited: true, latencyMs: 0});
    tutor.chooseThread(chat.id);
    tutor.beginSave(reply, 'notes');
    identity.logout();
    await identity.register(crypto.randomUUID().slice(0, 12), password);
    const other = await tutor.diary.create('2026-11-23', 'Matemática', 'Otra sesión');
    tutor.saveDestination.set(other.id);
    await tutor.confirmSave();
    await tutor.diary.load();
    expect(tutor.diary.sessions().map(s => s.notes)).toEqual(['']);
    fixture.detectChanges();
    expect(root.textContent).not.toContain(note);
  });

  it('persists all four save destinations and reloads chat history only for the owning account', async () => {
    tutor.draft = question;
    await tutor.send();
    await tutor.useEssentialGuide();
    const thread = tutor.thread()!;
    const reply = thread.messages.at(-1)!;
    for (const kind of ['doubts', 'notes', 'eureka', 'review'] as const) {
      tutor.beginSave(reply, kind);
      if (kind === 'review') tutor.saveDraft = 'Repasar la energía del Sol';
      if (kind === 'eureka') tutor.saveDraft = 'Descubrí que el Sol puede calentar el agua.';
      await tutor.confirmSave();
      expect(tutor.error()).toBe('');
    }
    await tutor.diary.load();
    const lesson = tutor.diary.sessions().find(s => s.id === sessionId)!;
    expect(String(lesson.notes).replace(/\u2028/g, '\n')).toContain(prepareTutorSaveDraft('notes', question, reply.text));
    expect(lesson.doubts).toContain(question);
    expect(lesson.eureka).toContain('Descubrí que el Sol puede calentar el agua.');
    const scheduler = TestBed.inject(ReviewSchedulerService);
    await scheduler.load();
    expect(scheduler.cards().map(card => card.concept)).toContain('Repasar la energía del Sol');
    await tutor.memory.load();
    expect(tutor.memory.concepts().find(c => c.conceptText === question)?.explanation).toBe(prepareTutorSaveDraft('notes', question, reply.text).slice(0, 1200));
    await tutor.chats.lock();
    identity.logout();
    await identity.register(crypto.randomUUID().slice(0, 12), password);
    await tutor.chats.load();
    expect(tutor.chats.threads()).toEqual([]);
    identity.logout();
    await identity.login(firstUser, password);
    await tutor.chats.load();
    const saved = tutor.chats.get(thread.id)!.messages;
    expect(saved.map(m => [m.id, m.role, m.text, m.source])).toEqual(
      thread.messages.map(m => [m.id, m.role, m.text, m.source]));
  });
});
