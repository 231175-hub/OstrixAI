import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TutorComponent } from './tutor.component';
import { buildEssentialTutorGuide } from '../../core/essential-tutor';
import { TutorConversationService, type TutorThread } from '../../core/tutor-conversation.service';
import { TutorContextService } from '../../core/tutor-context.service';
import { OstrixAiService } from '../../core/ostrix-ai.service';
import { StudentSettingsService } from '../../core/student-settings.service';
import { LocalIdentityService } from '../../core/local-identity.service';
import { LearningDiaryService } from '../../core/learning-diary.service';
import { LearningMemoryService } from '../../core/learning-memory.service';
import { ReviewSchedulerService } from '../../core/review-scheduler.service';
import { TranslationService } from '../../core/translation.service';
import { DeviceCapabilitiesService } from '../../core/device-capabilities.service';

describe('Tutor request ownership and review selection', () => {
  const thread: TutorThread = {
    id: 'thread', sessionId: 'lesson', mode: 'explain', title: 'Células',
    createdAt: '', updatedAt: '', messages: [
      { id: 'q1', role: 'user', text: '¿Qué es la mitosis?', createdAt: '' },
      { id: 'a1', role: 'assistant', text: 'División celular.', source: 'ON_DEVICE', createdAt: '' },
      { id: 'q2', role: 'user', text: '¿Qué es una célula?', createdAt: '' },
    ],
  };
  let tutor: TutorComponent;
  let resolveThread: (value: TutorThread) => void;
  let validSession: boolean;
  const append = jasmine.createSpy('appendUser');
  const reply = jasmine.createSpy('appendAssistant');
  const infer = jasmine.createSpy('processPromptDetailed');
  const profile = signal({ language: 'es', autoInjectSessionContext: true });
  const lesson = { id: 'lesson', notes: 'La célula contiene material genético. Las plantas necesitan agua.', topics: [] };

  beforeEach(() => {
    validSession = true;
    append.calls.reset();
    reply.calls.reset();
    infer.calls.reset();
    profile.set({ language: 'es', autoInjectSessionContext: true });
    TestBed.configureTestingModule({ providers: [
      { provide: TutorConversationService, useValue: {
        load: async () => {}, create: () => new Promise<TutorThread>(resolve => { resolveThread = resolve; }),
        get: (id: string | null) => id === thread.id ? thread : undefined, appendUser: append, appendAssistant: reply,
      } },
      { provide: OstrixAiService, useValue: { sessionGuard: () => () => validSession, processPromptDetailed: infer } },
      { provide: LocalIdentityService, useValue: { student: signal({ id: 'audit' }) } },
      { provide: StudentSettingsService, useValue: { profile } },
      { provide: LearningDiaryService, useValue: { sessions: signal([lesson]) } },
      { provide: TutorContextService, useValue: { build: () => 'from notes' } },
      ...[LearningMemoryService, ReviewSchedulerService, TranslationService,
        DeviceCapabilitiesService].map(provide => ({ provide, useValue: {} })),
    ] });
    tutor = TestBed.runInInjectionContext(() => new TutorComponent());
    tutor.selectedSessionId.set('lesson');
  });

  for (const cancel of ['button', 'logout']) {
    it('prevents dispatch during pending conversation creation after ' + cancel, async () => {
      tutor.draft = '¿Qué es la mitosis?';
      const first = tutor.send();
      const second = tutor.send();
      if (cancel === 'button') tutor.cancelRequest();
      else validSession = false;
      resolveThread(thread);
      await Promise.all([first, second]);
      expect(append).not.toHaveBeenCalled();
      expect(infer).not.toHaveBeenCalled();
      expect(tutor.selectedThreadId()).toBeNull();
    });
  }

  it('selects the question immediately preceding a historical answer for SM-2', () => {
    tutor.selectedThreadId.set(thread.id);
    tutor.beginSave(thread.messages[1], 'review');
    expect(tutor.saveDraft).toBe(thread.messages[0].text);
    expect(tutor.sourceLabel(undefined)).toBe('Origen sin verificar');
  });

  it('adds a deterministic reply only on explicit choice after failed inference, with attached notes', async () => {
    tutor.selectedThreadId.set(thread.id);
    await tutor.useEssentialGuide();
    expect(reply).not.toHaveBeenCalled();
    infer.and.rejectWith(new Error('Gemini no disponible'));
    await tutor.retry();
    expect(reply).not.toHaveBeenCalled();
    expect(tutor.canUseEssential()).toBeTrue();
    profile.set({ language: 'es', autoInjectSessionContext: false });
    await tutor.useEssentialGuide();
    expect(reply).not.toHaveBeenCalled();
    profile.set({ language: 'es', autoInjectSessionContext: true });
    await tutor.useEssentialGuide();
    expect(reply).toHaveBeenCalledOnceWith(thread.id, jasmine.objectContaining({
      source: 'OFFLINE_ESSENTIAL', text: jasmine.stringContaining('«La célula contiene material genético.»'),
    }));
    expect(infer).toHaveBeenCalledTimes(1);
  });

  it('offers four distinct reading activities grounded in a verbatim passage', () => {
    for (const english of [true, false]) {
      const guides = (['explain', 'guide', 'practice', 'explore'] as const)
        .map(mode => buildEssentialTutorGuide('célula', mode, lesson, english));
      expect(new Set(guides).size).toBe(4);
      for (const guide of guides) {
        expect(guide).toContain('La célula contiene material genético.');
        expect(guide).not.toContain('Las plantas');
        expect(guide.split('\n\n').length).toBe(2);
      }
    }
  });

  it('reports missing evidence for an unrelated question or empty notes', () => {
    expect(buildEssentialTutorGuide('Ecuaciones cuadráticas', 'explain', lesson, false))
      .toContain('No encontré un pasaje');
    expect(buildEssentialTutorGuide('My notes', 'guide', { notes: '', topics: [] }, true))
      .toContain('could not find a passage');
  });
});
