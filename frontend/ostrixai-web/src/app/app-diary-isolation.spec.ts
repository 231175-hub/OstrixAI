import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { DeviceCapabilitiesService } from './core/device-capabilities.service';
import { LearningDiaryService } from './core/learning-diary.service';
import { LearningMemoryService } from './core/learning-memory.service';
import { LocalIdentityService } from './core/local-identity.service';
import { OstrixAiService } from './core/ostrix-ai.service';
import { PracticeExamService } from './core/practice-exam.service';
import { ReviewSchedulerService } from './core/review-scheduler.service';
import { StudentCoursesService } from './core/student-courses.service';
import { StudentSettingsService } from './core/student-settings.service';
import { SyncService } from './core/sync.service';
import { TopicEnrichmentService } from './core/topic-enrichment.service';
import { TranslationService } from './core/translation.service';
import { TutorConversationService } from './core/tutor-conversation.service';
import { migrateSessionIfNeeded } from './core/session-migration';

describe('Shared-device diary actions', () => {
  const student = signal<{ id: string } | null>(null);
  const list = jasmine.createSpy('list');
  const login = jasmine.createSpy('login');
  const register = jasmine.createSpy('register');
  const translate = jasmine.createSpy('translateDerivedText');
  let app: App;

  beforeEach(() => {
    student.set({ id: 'synthetic-A' });
    const records = new Map<string, unknown>();
    list.calls.reset();
    login.calls.reset();
    register.calls.reset();
    TestBed.configureTestingModule({ providers: [
      { provide: LocalIdentityService, useValue: {
        student, list, login, register, logout: () => student.set(null),
        async restoreSession() {}, watchSessionRevocation: () => () => {},
        async save(store: string, id: string, data: unknown) { records.set(store + id, data); },
        async readVersion(store: string, id: string) {
          return records.has(store + id) ? { value: records.get(store + id), nonce: 'test' } : undefined;
        },
      } },
      { provide: StudentSettingsService, useValue: { profile: () => ({ language: 'es' }), clear() {} } },
      { provide: OstrixAiService, useValue: { resetLocalSession() {}, cancelActiveRequest() {} } },
      { provide: TopicEnrichmentService, useValue: { resetSession() {} } },
      { provide: TranslationService, useValue: { cancelPending() {}, translateDerivedText: translate } },
      { provide: TutorConversationService, useValue: { async lock() {} } },
      ...[StudentCoursesService, SyncService]
        .map(provide => ({ provide, useValue: { clear() {} } })),
      { provide: DeviceCapabilitiesService, useValue: { async checkNano() {} } },
      { provide: PracticeExamService, useValue: {} },
    ] });
    app = TestBed.runInInjectionContext(() => new App());
    spyOn(app, 'showToast');
    spyOn(app, 'go');
  });

  it('keeps unattempted catalog items optional and grades only the selected exercise of the active session', async () => {
    const s = migrateSessionIfNeeded({ id: 's', topic: 'Fracciones', course: 'Matemática', notes: '' });
    const diary = TestBed.inject(LearningDiaryService);
    const memory = TestBed.inject(LearningMemoryService);
    const scheduler = TestBed.inject(ReviewSchedulerService);
    diary.sessions.set([s]);
    const unrelated = await memory.registerDoubt(s.id, s.course, s.topic, 'Una duda distinta.');
    const [exercise] = app.allReviews();
    expect(exercise.next).toBeUndefined();
    expect(app.dueReviews()).toEqual([]);
    await expectAsync(memory.submitAnswer(unrelated.id, exercise.id, 0)).toBeRejected();
    await app.answerReview(exercise, exercise.ok);
    expect(memory.concepts().find(c => c.id === unrelated.id)?.history.length).toBe(0);
    const answered = memory.concepts().find(c => c.conceptText === exercise.q)!;
    expect(answered.history.length).toBe(1);
    expect(app.allReviews().find(r => r.id === exercise.id)?.done).toBeTrue();
    memory.concepts.update(items => items.map(c => ({ ...c, nextReviewDate: app.TODAY })));
    expect(app.dueReviews().map(r => r.id)).toEqual([exercise.id]);
    await scheduler.add(s.id, s.course, 'Autovaloración.');
    await scheduler.add('otra-sesion', s.course, 'Sin sesión vigente.');
    expect(app.dueReviewCards().length).toBe(1);
    const [card] = app.reviewCards();
    await app.rateReviewCard(card, 2);
    expect(app.dueReviewCards().length).toBe(0);
    expect(memory.concepts().find(c => c.id === answered.id)?.history.length).toBe(1);
    student.set({id: 'synthetic-B'});
    diary.sessions.set([{...s}]); // Perfil distinto con el mismo ID de una sesión importada.
    memory.clear();
    scheduler.clear();
    await app.answerReview(exercise, exercise.ok);
    await app.rateReviewCard(card, 2);
    expect(memory.concepts()).toEqual([]);
    expect(scheduler.cards()).toEqual([]);
  });

  it('clears the previous login name and diary filters on logout', async () => {
    app.authUsername = 'synthetic-A';
    app.filterDate.set('2026-01-14');
    app.filterCourse.set('Curso privado A');
    app.notesFilterCourse.set('Curso privado A');
    app.eurekaFilterCourse.set('Curso privado A');
    await app.logout();
    student.set({ id: 'synthetic-B' });
    expect(app.authUsername).toBe('');
    expect(app.filterDate()).toBe('');
    expect(app.filterCourse()).toBe('all');
    expect(app.notesFilterCourse()).toBe('all');
    expect(app.eurekaFilterCourse()).toBe('all');
  });

  it('discards a late translation even when the next student opens the same topic ID', async () => {
    let finish!: (value: { translatedText: string }) => void;
    translate.and.returnValue(new Promise(resolve => { finish = resolve; }));
    app.bookId.set('same-session');
    app.topicNotesMap.set({ shared: ['Apunte sintético A'] });
    const pending = app.toggleTopicDerivedTranslation('shared');
    await app.logout();
    student.set({ id: 'synthetic-B' });
    app.bookId.set('same-session');
    app.showTopicTranslation.set({ shared: true });
    finish({ translatedText: 'Traducción sintética A' });
    await pending;
    expect(app.topicDerivedTranslation()).toEqual({});
  });

  it('rejects an export requested by A if B unlocks before the diary is loaded', async () => {
    const diary = TestBed.inject(LearningDiaryService);
    list.and.resolveTo([]);
    const exporting = diary.exportJson();
    student.set({ id: 'synthetic-B' });
    await expectAsync(exporting).toBeRejected();
  });

  it('keeps a locked profile private and requires logout before opening another account', async () => {
    const initialUrl = location.href;
    student.set(null);
    try {
      history.replaceState(history.state, '', '#perfil');
      await app.ngOnInit();
      expect(app.view()).toBe('acceso');
      const owner = { id: 'synthetic-A' };
      student.set(owner);
      app.authUsername = 'synthetic-B';
      app.authPassword = app.authConfirmPassword = 'synthetic-test-password';
      for (const hash of ['#registro', '#acceso']) {
        history.replaceState(history.state, '', hash);
        window.dispatchEvent(new HashChangeEvent('hashchange'));
        expect(app.view()).toBe('inicio');
      }
      await app.handleLogin();
      await app.handleRegister();
      expect(student()).toBe(owner);
      expect(login).not.toHaveBeenCalled();
      expect(register).not.toHaveBeenCalled();
    } finally {
      app.ngOnDestroy();
      history.replaceState(history.state, '', initialUrl);
    }
  });
});
