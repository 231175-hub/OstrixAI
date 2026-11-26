import { appendTutorNoteAsSingleEntry } from '../../core/tutor-note-entry';
import { CommonModule } from '@angular/common';
import { Component, computed, inject, Input, OnDestroy, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { buildEssentialTutorGuide } from '../../core/essential-tutor';
import { OstrixAiService, formatFriendlyDuration, type InferenceCallOptions } from '../../core/ostrix-ai.service';
import { LearningDiaryService, migrateSessionIfNeeded, type StudySession } from '../../core/learning-diary.service';
import { PracticeExamService, type PracticeAttempt, type PracticeExam } from '../../core/practice-exam.service';
import { nextLearningStep, localStudyDay, type LearningStep } from '../../core/learning-recommendation';
import { LearningMemoryService } from '../../core/learning-memory.service';
import { LocalIdentityService, type LocalStudent } from '../../core/local-identity.service';
import { StudentSettingsService } from '../../core/student-settings.service';
import { DeviceCapabilitiesService } from '../../core/device-capabilities.service';
import { ReviewSchedulerService } from '../../core/review-scheduler.service';
import { TranslationService } from '../../core/translation.service';
import { TutorContextService } from '../../core/tutor-context.service';
import { quoteOriginalNote } from '../../core/original-note-lookup';
import { reviewTutorReply } from '../../core/tutor-reply-review';
import { quechuaSafePrompt, prepareQuechuaTutorReply, acceptAutomaticQuechuaTranslation, labelUnverifiedQuechuaTranslation, originalSpanishForTranslation, isQuechuaLanguage } from '../../core/tutor-quechua-guard';
import { keepOneGuideQuestion } from '../../core/tutor-guide-turn';
import { guidedAlgebraFallback, inspectGuidedAlgebra } from '../../core/tutor-guide-algebra';
import { inspectExploreShadow, shadowScienceFallback } from '../../core/tutor-explore-shadow';
import { verifyIntegerFeedback } from '../../core/tutor-integer-guard';
import { gradeSimplePracticeAnswer } from '../../core/practice-integer-feedback';
import { reviewEducationalAnswer } from '../../core/educational-guard';
import { TutorConversationService, type TutorMessage, type TutorMode, type TutorThread } from '../../core/tutor-conversation.service';
import { interfaceText, type InterfaceKey } from '../../core/interface-language';
import { cleanMarkdownToText } from '../../core/markdown-cleaner';
import { renderTutorMathHtml } from '../../core/tutor-math-renderer';
import { formatTutorFractions } from '../../core/tutor-fractions';
import { gradeLinearPracticeAnswer } from '../../core/practice-linear-feedback';
import { buildVerifiedPracticePrompt, acceptPracticeAiHint } from '../../core/practice-ai-hint';
import { formatTutorReadableMath } from '../../core/tutor-readable-math';
import { prepareTutorSaveDraft } from '../../core/tutor-save-drafts';
import { AiProgressComponent } from '../../components/ai-progress/ai-progress.component';

type SaveKind = 'notes' | 'doubts' | 'eureka' | 'review';

/** An actual tutor workflow; never displays fabricated AI answers or leaks across accounts. */
@Component({
  selector: 'app-tutor',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, AiProgressComponent],
  templateUrl: './tutor.component.html',
  styleUrl: './tutor.component.css',
})
export class TutorComponent implements OnDestroy {
  readonly chats = inject(TutorConversationService);
  readonly diary = inject(LearningDiaryService);
  readonly memory = inject(LearningMemoryService);
  readonly identity = inject(LocalIdentityService);
  readonly settings = inject(StudentSettingsService);
  readonly device = inject(DeviceCapabilitiesService);
  readonly ai = inject(OstrixAiService);
  private readonly context = inject(TutorContextService);
  private readonly reviews = inject(ReviewSchedulerService);
  private readonly translator = inject(TranslationService);
  private readonly exams = inject(PracticeExamService);
  private readonly screenOwner = this.identity.student();
  readonly currentOwner = computed(() => !!this.screenOwner && this.identity.student() === this.screenOwner);
  private readonly attempts = signal<readonly PracticeAttempt[]>([]);
  @Input() set practiceAttempts(value: readonly PracticeAttempt[]) { this.attempts.set(value); }
  @Input() set initialMode(mode: TutorMode) { this.mode.set(mode); }
  readonly openDiary = output<string>();
  readonly practiceSaved = output<PracticeAttempt>();
  readonly canPersonalize = computed(() => this.currentOwner() && this.settings.profile().autoInjectSessionContext);
  readonly recommendation = computed(() => this.canPersonalize()
    ? nextLearningStep(this.diary.sessions(), this.memory.concepts(), this.reviews.cards(), this.attempts(), localStudyDay()) : null);
  readonly stepSession = computed(() => this.diary.sessions().find(s => s.id === this.recommendation()?.sessionId));
  readonly hiddenStep = signal<LearningStep | null>(null);
  readonly activity = signal<PracticeExam | null>(null);
  readonly activityResult = signal<PracticeAttempt | null>(null);
  readonly readingStep = signal('');
  private activityStarted = 0;
  private activityId = '';
  readonly saveDestination = signal('');
  private saveOrigin?: { owner: LocalStudent; threadId: string };

  readonly selectedThreadId = signal<string | null>(null);
  readonly selectedSessionId = signal<string | null>(null);
  readonly mode = signal<TutorMode>('explain');
  readonly thread = computed(() => this.chats.get(this.selectedThreadId()));
  readonly session = computed(() => this.diary.sessions().find(s => s.id === this.selectedSessionId()) ?? null);
  readonly busy = signal(false);
  readonly preparing = signal(false);
  readonly translatingId = signal<string | null>(null);
  readonly error = signal('');
  readonly notice = signal('');
  readonly saving = signal(false);
  readonly failedTurnId = signal<string | null>(null);
  readonly canUseEssential = computed(() => !!this.session() && this.settings.profile().autoInjectSessionContext
    && !!this.failedTurnId() && this.failedTurnId() === this.thread()?.messages.at(-1)?.id);
  readonly saveKind = signal<SaveKind | null>(null);
  readonly saveMessageId = signal<string | null>(null);
  readonly showContextPreview = signal(false);
  readonly mobileHistoryOpen = signal(false);
  readonly requestStartTime = signal<number | null>(null);
  readonly showOriginalMap = signal<Record<string, boolean>>({});

  private requestVersion = 0;
  private generating = false;
  draft = '';
  saveDraft = '';

  readonly modes: readonly { id: TutorMode; titleKey: InterfaceKey; descKey: InterfaceKey; icon: string }[] = [
    { id: 'explain', titleKey: 'modeExplainTitle', descKey: 'modeExplainDesc', icon: 'pi pi-book' },
    { id: 'guide', titleKey: 'modeGuideTitle', descKey: 'modeGuideDesc', icon: 'pi pi-compass' },
    { id: 'practice', titleKey: 'modePracticeTitle', descKey: 'modePracticeDesc', icon: 'pi pi-pencil' },
    { id: 'explore', titleKey: 'modeExploreTitle', descKey: 'modeExploreDesc', icon: 'pi pi-lightbulb' },
  ];

  t(key: InterfaceKey): string {
    return interfaceText(key, this.settings.profile().language);
  }

  cleanText(text: string): string {
    return cleanMarkdownToText(formatTutorReadableMath(formatTutorFractions(text)));
  }

  // MATH-VISUAL-02: solo presenta HTML escapado, no altera el historial.
  mathHtml(text: string): string {
    return renderTutorMathHtml(text);
  }

  /** Contexto suministrado por el libro del estudiante (navegación #tutor). */
  @Input() set initialSessionId(value: string | null) {
    if (value && this.diary.sessions().some(s => s.id === value)) {
      this.selectedSessionId.set(value);
      if (this.thread() && this.thread()?.sessionId !== value) {
        this.selectedThreadId.set(null);
      }
    }
  }

  /** Duda precargada desde el Libro de Dudas para continuar el ciclo educativo. */
  @Input() set initialQuestion(value: string | null) {
    if (value && value.trim()) {
      this.draft = value.trim();
    }
  }

  constructor() {
    void this.chats.load().catch(() => this.error.set('No se pudo abrir el historial privado.'));
  }

  ngOnDestroy(): void {
    ++this.requestVersion;
    if (this.generating) this.ai.cancelActiveRequest();
  }

  get activeMode(): TutorMode { return this.mode(); }
  set activeMode(value: TutorMode) { this.activity.set(null); this.readingStep.set(''); this.mode.set(value); }
  get activeSessionId(): string { return this.selectedSessionId() ?? ''; }
  set activeSessionId(value: string) {
    if (this.busy()) return;
    this.activity.set(null);
    this.readingStep.set('');
    this.selectedSessionId.set(value || null);
    this.selectedThreadId.set(null);
  }

  contextSnapshot(): string {
    const shouldInclude = this.settings.profile().autoInjectSessionContext;
    return this.context.previewSnapshot(this.session(), shouldInclude);
  }

  formatDuration(ms?: number): string {
    return formatFriendlyDuration(ms ?? 0, this.settings.profile().language);
  }

  toggleOriginal(messageId: string): void {
    const map = { ...this.showOriginalMap() };
    map[messageId] = !map[messageId];
    this.showOriginalMap.set(map);
  }

  canTranslate(message: TutorMessage): boolean {
    // Older Spanish replies sometimes stored the Quechua interface language here.
    const source = message.originalLanguage === 'en' ? 'en' : 'es';
    const target = this.settings.profile().language;
    const supported = source !== target && (source === 'es' || target === 'es');
    return message.role === 'assistant' && supported &&
      (!message.translatedText || (!!message.translatedLang && message.translatedLang !== target));
  }

  async translateDerived(message: TutorMessage): Promise<void> {
    const targetLang = this.settings.profile().language;
    if (!this.canTranslate(message)) return;
    const spanishOriginal = originalSpanishForTranslation(message.text);
    const threadId = this.selectedThreadId();
    if (!threadId) return;
    const sameSession = this.ai.sessionGuard();

    this.error.set('');
    this.translatingId.set(message.id);
    try {
      const derived = await this.translator.translateDerivedText(
        message.id,
        spanishOriginal,
        message.originalLanguage === 'en' ? 'en' : 'es',
        targetLang,
        this.settings.profile().allowCloudEnrichment && !this.settings.profile().offlineOnly
      );
      if (!sameSession() || this.selectedThreadId() !== threadId) return;
      if (isQuechuaLanguage(targetLang) && !acceptAutomaticQuechuaTranslation(derived.translatedText, spanishOriginal)) {
        this.notice.set('Traducción al quechua rechazada por controles básicos. Se conserva el original en español.');
        return;
      }
      await this.chats.storeTranslation(threadId, message.id,
        isQuechuaLanguage(targetLang) ? labelUnverifiedQuechuaTranslation(derived.translatedText) : derived.translatedText, targetLang);
      this.notice.set(isQuechuaLanguage(targetLang)
        ? 'Traducción automática a quechua general guardada, sin validación lingüística; consulta también el original.'
        : this.t('derivedTranslationNotice'));
    } catch (e: unknown) {
      this.error.set(this.message(e));
    } finally {
      this.translatingId.set(null);
    }
  }

  toggleMobileHistory(): void {
    this.mobileHistoryOpen.set(!this.mobileHistoryOpen());
  }

  chooseThread(id: string): void {
    if (this.busy()) return;
    const target = this.chats.get(id);
    if (!target) return;
    this.activity.set(null);
    this.readingStep.set('');
    this.selectedThreadId.set(id);
    this.selectedSessionId.set(target.sessionId);
    this.mode.set(target.mode);
    this.error.set('');
    this.notice.set('');
    this.cancelSave();
    this.mobileHistoryOpen.set(false);
  }

  newThread(): void {
    if (this.busy()) return;
    this.activity.set(null);
    this.readingStep.set('');
    this.selectedThreadId.set(null);
    this.draft = '';
    this.error.set('');
    this.notice.set('');
    this.cancelSave();
    this.mobileHistoryOpen.set(false);
  }

  cancelRequest(): void {
    ++this.requestVersion;
    if (this.generating) this.ai.cancelActiveRequest();
    this.generating = false;
    this.busy.set(false);
    this.requestStartTime.set(null);
    this.notice.set(this.settings.profile().language === 'en' ? 'Request cancelled.' : 'Consulta cancelada.');
  }

  // UI-PULIDO-01: Enter envía; Shift+Enter añade una línea; IME nunca envía.
  onComposerEnter(event: Event): void {
    const kEvent = event as KeyboardEvent;
    if (kEvent.key !== 'Enter' || kEvent.isComposing || kEvent.keyCode === 229 || kEvent.shiftKey) return;
    kEvent.preventDefault();
    if (kEvent.repeat || this.busy() || this.saving() || !this.draft.trim()) return;
    void this.send();
  }

  async send(): Promise<void> {
    const question = this.draft.trim();
    if (!question || this.busy() || this.saving()) return;
    this.activity.set(null);
    this.readingStep.set('');
    await this.ask(question, false);
  }

  async retry(): Promise<void> {
    if (this.busy() || this.saving()) return;
    const last = this.thread()?.messages.at(-1);
    if (last?.role === 'user') await this.ask(last.text, true);
  }

  private async ask(question: string, retry: boolean): Promise<void> {
    const ownerStudentId = this.identity.student()?.id;
    if (!ownerStudentId) {
      this.error.set('Inicia sesión para usar Tutor Ostrix.');
      return;
    }
    if (!question.trim() || question.length > 4000) {
      this.error.set('La pregunta admite hasta 4000 caracteres.');
      return;
    }

    const version = ++this.requestVersion;
    const sameSession = this.ai.sessionGuard();
    const active = () => version === this.requestVersion && sameSession();
    const studentProfile = this.settings.profile();
    this.busy.set(true);
    this.requestStartTime.set(performance.now());
    this.error.set('');
    this.notice.set('');
    const ownerThreadId = this.selectedThreadId();
    this.failedTurnId.set(null);
    let inferenceTurnId: string | null = null;

    try {
      let current = this.chats.get(ownerThreadId);
      if (!current) {
        current = await this.chats.create(this.selectedSessionId(), this.mode(), question.slice(0, 70));
        if (!active()) return;
        this.selectedThreadId.set(current.id);
      }
      if (current.sessionId !== this.selectedSessionId()) {
        throw new Error('La conversación pertenece a otra sesión. Crea una nueva conversación.');
      }
      const contextMessages = retry ? current.messages.slice(0, -1) : current.messages;
      let questionId = current.messages.at(-1)?.id;
      if (!retry) {
        const appended = await this.chats.appendUser(current.id, question);
        if (!active()) return;
        questionId = appended.id;
        this.draft = '';
      }

      if (!active()) return;
      const mode = this.mode();
      const session = studentProfile.autoInjectSessionContext ? this.session() : null;
      const buildPrompt = () => quechuaSafePrompt(this.context.build(
        question, mode, this.settings.profile().autoInjectSessionContext ? session : null, contextMessages
      ), studentProfile.language);
      const english = studentProfile.language === 'en';
      // MEM01-LOCAL-ORIGINAL-QUOTE: nunca pedirle al modelo que invente una cita.
      // Solo el Diario ya cargado para el usuario activo puede proporcionar el texto.
      const localQuote = quoteOriginalNote(question, session, english ? 'en' : 'es');
      if (localQuote !== null) {
        if (!active() || !this.currentOwner() || this.selectedThreadId() !== current.id
          || this.selectedSessionId() !== current.sessionId) return;
        await this.chats.appendAssistant(current.id, {
          text: localQuote, source: 'OFFLINE_ESSENTIAL', limited: true,
          latencyMs: Math.max(0, Math.round(performance.now() - (this.requestStartTime() ?? performance.now()))),
          originalLanguage: english ? 'en' : 'es',
        });
        if (active()) this.notice.set(this.t('tutorSourceEssential'));
        return;
      }
      // PRACTICA-ALGEBRA-02: verified AI tutoring with local fallback.
      if (mode === 'practice') {
        const previous = contextMessages.at(-1);
        const checked = previous?.role === 'assistant'
          ? gradeLinearPracticeAnswer(
              previous.text, question, english ? 'en' : 'es'
            )
          : null;

        if (checked) {
          const startedPractice = performance.now();
          this.generating = true;
          inferenceTurnId = questionId ?? null;

          const prompt = buildVerifiedPracticePrompt(
            buildPrompt(), checked.feedback, checked.correct, english
          );

          let modelResult:
            Awaited<ReturnType<typeof this.ai.processPromptDetailed>> | null = null;

          try {
            // Same device-first route and Cloud consent as the Tutor.
            modelResult = await this.ai.processPromptDetailed(
              prompt,
              false,
              {
                cloudConsent: 'profile',
                saveInOutbox: false,
                rawPrompt: true,
                allowEssentialFallback: false,
              }
            );
          } catch {
            // Inference unavailable: use the verified local explanation.
          }

          if (!active() || !this.currentOwner() ||
              this.selectedThreadId() !== current.id ||
              this.selectedSessionId() !== current.sessionId) return;

          const guidance = modelResult &&
            modelResult.source !== 'OFFLINE_ESSENTIAL'
              ? acceptPracticeAiHint(modelResult.text, checked.correct)
              : null;

          // PRACTICA-ALGEBRA-02-DIAG: temporary metadata only.
          console.info('[PRACTICA-ALGEBRA-02-DIAG]', {
            result: modelResult ? 'MODEL_RETURNED' : 'NO_MODEL_RESULT',
            source: modelResult?.source ?? 'NONE',
            accepted: Boolean(guidance),
            responseLength: modelResult?.text.length ?? 0,
            hasMathOrNumbers: modelResult
              ? /[0-9=<>$\\]/.test(modelResult.text) : false,
            hasQuestion: modelResult
              ? /[¿?]/.test(modelResult.text) : false,
            hasPedagogicalTerms: modelResult
              ? /(?:verific|comprob|sustitu|paso|igualdad|t[eé]rmino|inc[oó]gnita|operaci[oó]n|equation|check|substitut|step|variable|reason|process)/i.test(modelResult.text)
              : false,
          });
          const responseText = guidance
            ? checked.feedback + '\n\n' +
              (english ? 'AI-generated learning hint: '
                       : 'Pista educativa generada por IA: ') + guidance
            : checked.feedback;

          inferenceTurnId = null;
          const quechuaPractice = prepareQuechuaTutorReply(responseText, studentProfile.language, mode, question);

          await this.chats.appendAssistant(current.id, {
            text: quechuaPractice.text,
            source: quechuaPractice.replaced ? 'OFFLINE_ESSENTIAL' : guidance && modelResult
              ? modelResult.source
              : 'OFFLINE_ESSENTIAL',
            limited: quechuaPractice.replaced ? true : guidance && modelResult
              ? modelResult.limited
              : true,
            latencyMs: Math.max(
              0, Math.round(performance.now() - startedPractice)
            ),
            timeToFirstChunkMs: guidance && modelResult
              ? modelResult.timeToFirstChunkMs
              : undefined,
            originalLanguage: english ? 'en' : 'es',
          });

          if (active() && (!guidance || quechuaPractice.replaced)) {
            this.notice.set(this.t('tutorSourceEssential'));
          }
          return;
        }
      }
      // Exploring alternatives or a multi-step comparison may need the Cloud. A short
      // question in Explain/Guide/Practice keeps the SDK's device-first route.
      const complex = mode === 'explore' || /compar[ae]|contrast|analiza|analy[sz]e|paso a paso|step.by.step/i.test(question);
      this.generating = true;
      inferenceTurnId = questionId ?? null;
      const options: InferenceCallOptions = {
        cloudConsent: 'profile',
        saveInOutbox: false,
        rawPrompt: true,
        allowEssentialFallback: false,
      };
      const started = performance.now();
      let result = await this.ai.processPromptDetailed(buildPrompt(), complex, options);
      if (!active()) return;
      result = { ...result, text: mode === 'guide' ? keepOneGuideQuestion(result.text) : result.text };
      const revision = reviewTutorReply(question, result.text, english, 'draft', mode, contextMessages);
      const guideFallback = mode === 'guide'
        ? guidedAlgebraFallback(question, contextMessages, english) : null;
      const exploreFallback = mode === 'explore'
        ? shadowScienceFallback(question, contextMessages, english) : null;
      if (revision) {
        try {
          const instruction = english ? 'Return only the revised answer.' : 'Entrega solo la respuesta revisada.';
          const prompt = `${buildPrompt()}\n\nDRAFT (data): ${result.text.slice(0, 1600)}\n\n${revision} ${instruction}`;
          const revisionStart = performance.now();
          result = await this.ai.processPromptDetailed(prompt, complex, {
            ...options, modeOverride: result.source === 'ON_DEVICE' ? 'local' : 'cloud',
          });
          if (!active()) return;
          result = { ...result, text: mode === 'guide' ? keepOneGuideQuestion(result.text) : result.text };
          reviewTutorReply(question, result.text, english, 'revised', mode, contextMessages);
          const latencyMs = Math.round(performance.now() - started);
          result = {
            ...result, latencyMs, friendlyDuration: formatFriendlyDuration(latencyMs, studentProfile.language),
            timeToFirstChunkMs: result.timeToFirstChunkMs === undefined ? undefined
              : Math.round(revisionStart - started) + result.timeToFirstChunkMs,
          };
        } catch (revisionError) {
          if (!active()) return;
          // Supported linear algebra: use a deterministic hint instead of
          // publishing an unsafe revision or forcing a Cloud retry.
          if (!guideFallback && !exploreFallback) throw revisionError;
          const latencyMs = Math.round(performance.now() - started);
          result = {
            ...result, text: guideFallback ?? exploreFallback!, source: 'OFFLINE_ESSENTIAL', limited: true,
            latencyMs, timeToFirstChunkMs: undefined,
            friendlyDuration: formatFriendlyDuration(latencyMs, studentProfile.language),
          };
        }
      }
      // A last deterministic guard also applies if the AI draft needed no
      // revision according to other checks. Never label this fallback ON_DEVICE.
      if (mode === 'guide') {
        const inspection = inspectGuidedAlgebra(question, result.text, contextMessages, english);
        if (inspection) {
          const latencyMs = Math.round(performance.now() - started);
          result = {
            ...result, text: inspection.fallback, source: 'OFFLINE_ESSENTIAL', limited: true,
            latencyMs, timeToFirstChunkMs: undefined,
            friendlyDuration: formatFriendlyDuration(latencyMs, studentProfile.language),
          };
        }
      }
      inferenceTurnId = null;

      // MATH-02: guardia determinista antes de persistir o mostrar una correccion matematica.
      // Solo reconoce operaciones acotadas. No certifica el resto de respuestas de Gemini.
      const guardLanguage: 'es' | 'en' = english ? 'en' : 'es';
      let arithmeticCheck = verifyIntegerFeedback(question, result.text, guardLanguage);
      if (arithmeticCheck.status === 'not-applicable' && mode === 'practice') {
        const previousQuestion = contextMessages.at(-1)?.role === 'assistant' ? contextMessages.at(-1)?.text : undefined;
        if (previousQuestion) arithmeticCheck = verifyIntegerFeedback(previousQuestion, result.text, guardLanguage);
      }
      // MATH-03: evaluar la respuesta numerica usando SOLO el ultimo enunciado del Tutor.
      // No confundir una respuesta que repite la pregunta con una correccion matematica.
      const previousTutorTurn = contextMessages.at(-1);
      const practiceFeedback = mode === 'practice' && previousTutorTurn?.role === 'assistant'
        ? gradeSimplePracticeAnswer(previousTutorTurn.text, question, guardLanguage)
        : null;
      const arithmeticBlocked = arithmeticCheck.status === 'blocked';
      const localMathApplied = practiceFeedback !== null || arithmeticBlocked;
      const safeTutorText = practiceFeedback?.feedback ?? (arithmeticBlocked
        ? `${english ? 'Automatic arithmetic check (not AI-generated).' : 'Comprobación aritmética automática (no generada por IA).'}\n\n${arithmeticCheck.deterministicCorrection}`
        : result.text);
      const safeTutorSource = localMathApplied ? 'OFFLINE_ESSENTIAL' : result.source;
      const safeTutorLimited = localMathApplied ? true : result.limited;
      // EDU-GUARD-01: corrección curricular limitada, sin atribución falsa a Nano.
      const academicReview = localMathApplied ? null : reviewEducationalAnswer(question, result.text, guardLanguage);
      const finalTutorText = academicReview?.text ?? safeTutorText;
      const finalTutorSource = academicReview ? 'OFFLINE_ESSENTIAL' : safeTutorSource;
      const finalTutorLimited = academicReview ? true : safeTutorLimited;
      // EXPLORE-SCIENCE-01: fail closed for the bounded solar-shadow experiment.
      // Guard also executes after a successful revision; never mislabel fallback as AI.
      const shadowInspection = mode === 'explore'
        ? inspectExploreShadow(question, finalTutorText, contextMessages, english) : null;
      const publishedTutorText = shadowInspection?.fallback ?? finalTutorText;
      const publishedTutorSource = shadowInspection ? 'OFFLINE_ESSENTIAL' : finalTutorSource;
      const publishedTutorLimited = shadowInspection ? true : finalTutorLimited;
      // QUECHUA-01: same audited publishing path for all four modes.
      const quechuaPublished = prepareQuechuaTutorReply(publishedTutorText, studentProfile.language, mode, question);
      const displayTutorSource = quechuaPublished.replaced ? 'OFFLINE_ESSENTIAL' : publishedTutorSource;
      const displayTutorLimited = quechuaPublished.replaced ? true : publishedTutorLimited;

      await this.chats.appendAssistant(current.id, {
        text: quechuaPublished.text,
        source: displayTutorSource,
        latencyMs: result.latencyMs,
        limited: displayTutorLimited,
        timeToFirstChunkMs: result.timeToFirstChunkMs,
        friendlyDuration: result.friendlyDuration,
        originalLanguage: studentProfile.language === 'en' ? 'en' : 'es',
      });

      if (!active()) return;
      this.notice.set(
        displayTutorSource === 'ON_DEVICE'
          ? this.t('tutorSourceLocal')
          : displayTutorSource === 'IN_CLOUD'
            ? this.t('tutorSourceCloud')
            : this.t('tutorSourceEssential')
      );
    } catch (error: unknown) {
      if (!active()) return;
      // QUECHUA-01: reliable Spanish fallback, not a fabricated ON_DEVICE answer.
      if (isQuechuaLanguage(studentProfile.language) && this.currentOwner()) {
        const threadId = this.selectedThreadId();
        const thread = this.chats.get(threadId);
        const last = thread?.messages.at(-1);
        if (threadId && last?.role === 'user' && last.text === question) {
          try {
            const fallback = prepareQuechuaTutorReply('', 'qu', this.mode(), question);
            await this.chats.appendAssistant(threadId, {
              text: fallback.text, source: 'OFFLINE_ESSENTIAL', limited: true,
              latencyMs: Math.max(0, Math.round(performance.now() - (this.requestStartTime() ?? performance.now()))),
              originalLanguage: 'es',
            });
            this.failedTurnId.set(null);
            this.notice.set('La inferencia no pudo completarse. Se ofrece un respaldo seguro en español, no una traducción al quechua.');
            this.error.set('');
            return;
          } catch { /* Preserve the original error below. */ }
        }
      }
      if (this.generating && inferenceTurnId) this.failedTurnId.set(inferenceTurnId);
      this.error.set(this.message(error));
    } finally {
      if (version === this.requestVersion) {
        this.generating = false;
        this.busy.set(false);
        this.requestStartTime.set(null);
      }
    }
  }

  async useEssentialGuide(): Promise<void> {
    const thread = this.thread();
    const question = thread?.messages.at(-1);
    const session = this.session();
    if (!this.canUseEssential() || this.busy() || this.saving() || !thread || !session || question?.role !== 'user') return;
    const sameSession = this.ai.sessionGuard();
    const started = performance.now();
    const lang = this.settings.profile().language;
    const essentialText = buildEssentialTutorGuide(question.text, this.mode(), session, lang === 'en');
    const text = prepareQuechuaTutorReply(essentialText, lang, this.mode(), question.text).text;
    this.saving.set(true);
    try {
      await this.chats.appendAssistant(thread.id, {
        text, source: 'OFFLINE_ESSENTIAL', limited: true, latencyMs: Math.round(performance.now() - started),
        originalLanguage: lang === 'en' ? 'en' : 'es',
      });
      if (!sameSession()) return;
      this.failedTurnId.set(null);
      this.error.set('');
      this.notice.set(this.t('tutorSourceEssential'));
    } catch (error) {
      if (sameSession()) this.error.set(this.message(error));
    } finally {
      this.saving.set(false);
    }
  }

  async prepareNano(): Promise<void> {
    this.preparing.set(true);
    this.error.set('');
    try {
      await this.ai.prepareLocalModel();
      await this.device.checkNano();
      this.notice.set(
        this.device.nano() === 'available'
          ? 'Gemini Nano preparado; verifica ahora una respuesta ON_DEVICE.'
          : `Estado de Gemini Nano: ${this.device.nano()}.`
      );
    } catch (e: unknown) {
      this.error.set(this.message(e));
    } finally {
      this.preparing.set(false);
    }
  }

  async translate(message: TutorMessage): Promise<void> {
    const allowCloud = this.settings.profile().allowCloudEnrichment && !this.settings.profile().offlineOnly;
    if (!allowCloud) {
      this.error.set('Debes autorizar el uso de Gemini Cloud en Configuración para traducir párrafos completos.');
      return;
    }
    if (!this.device.online()) { this.error.set('Necesitas conexión para traducir un texto nuevo.'); return; }
    const id = this.selectedThreadId();
    if (!id || message.role !== 'assistant') return;
    this.error.set('');
    this.translatingId.set(message.id);
    try {
      const text = await this.translator.spanishToQuechua(originalSpanishForTranslation(message.text), allowCloud);
      if (this.selectedThreadId() !== id || !this.currentOwner()) return;
      if (!acceptAutomaticQuechuaTranslation(text, originalSpanishForTranslation(message.text))) {
        this.notice.set('Traducción al quechua rechazada por controles básicos; se conserva el original en español.');
        return;
      }
      await this.chats.storeTranslation(id, message.id, labelUnverifiedQuechuaTranslation(text));
      this.notice.set('Traducción automática al quechua general (qu) guardada para consulta offline. No validada lingüísticamente.');
    } catch (e: unknown) {
      this.error.set(this.message(e));
    } finally {
      this.translatingId.set(null);
    }
  }

  async startRecommendedStep(step: LearningStep): Promise<void> {
    if (step !== this.recommendation() || this.busy() || this.saving() || !this.canPersonalize()) return;
    const session = this.stepSession();
    if (!session) return;
    this.newThread();
    this.mode.set('practice');
    this.selectedSessionId.set(session.id);
    this.hiddenStep.set(step);
    this.busy.set(true);
    const version = ++this.requestVersion;
    try {
      const exam = await this.exams.createFocusedExam(session, step.focus, step.question);
      if (!this.canPersonalize() || version !== this.requestVersion) return;
      if (exam) {
        this.activityId = crypto.randomUUID();
        this.activityStarted = performance.now();
        this.activityResult.set(null);
        this.activity.set(exam);
      } else {
        this.showReadingStep(session, step.focus);
      }
    } catch (error) {
      if (this.canPersonalize() && version === this.requestVersion) {
        this.showReadingStep(session, step.focus);
        this.error.set(this.message(error));
      }
    } finally {
      if (version === this.requestVersion) this.busy.set(false);
    }
  }

  private showReadingStep(session: StudySession, focus: string): void {
    const en = this.settings.profile().language === 'en';
    const question = /[?？]\s*$/.test(focus) ? focus
      : en ? `How would you explain “${focus}” with an example?` : `¿Cómo explicarías «${focus}» con un ejemplo?`;
    this.readingStep.set(question + '\n\n' + buildEssentialTutorGuide(focus, 'practice', session, en));
    this.notice.set(en ? 'Self-study activity from your journal. You can ask the tutor for help.'
      : 'Actividad de autoestudio con tu Diario. Puedes pedir ayuda al Tutor.');
  }

  reasonText(reason: LearningStep['reason']): string {
    const labels = {
      due: ['Fecha de repaso programada', 'Scheduled review date'],
      missedDoubt: ['Duda pendiente con respuesta incorrecta registrada', 'Pending question with a recorded incorrect answer'],
      doubt: ['Duda pendiente en tu Diario', 'Pending question in your journal'],
      repeated: ['Respuestas incorrectas repetidas a la misma pregunta', 'Repeated incorrect answers to the same question'],
    };
    return labels[reason][this.settings.profile().language === 'en' ? 1 : 0];
  }

  async answerStep(index: number): Promise<void> {
    const exam = this.activity();
    const q = exam?.questions[0];
    if (!this.canPersonalize() || !exam || !q || this.saving() || this.activityResult() || !q.options[index]) return;
    this.saving.set(true);
    try {
      const attempt = await this.exams.createAndSaveAttempt(exam, { [q.id]: index },
        Math.round((performance.now() - this.activityStarted) / 1000), this.activityId);
      if (!this.canPersonalize() || this.activity() !== exam) return;
      this.activityResult.set(attempt);
      this.attempts.update(items => [attempt, ...items.filter(a => a.id !== attempt.id)]);
      this.practiceSaved.emit(attempt);
    } catch (error) {
      if (this.canPersonalize()) this.error.set(this.message(error));
    } finally { this.saving.set(false); }
  }

  beginSave(message: TutorMessage, kind: SaveKind): void {
    const thread = this.thread();
    const owner = this.identity.student();
    if (!owner || !thread?.messages.some(m => m.id === message.id && m.role === 'assistant')) return;
    this.saveOrigin = { owner, threadId: thread.id };
    this.saveDestination.set(thread.sessionId ?? '');
    this.saveMessageId.set(message.id);
    this.saveKind.set(kind);
    this.saveDraft = prepareTutorSaveDraft(kind, this.questionFor(message.id), message.text);
    this.error.set('');
  }

  private questionFor(messageId: string): string {
    const messages = this.thread()?.messages ?? [];
    const index = messages.findIndex(m => m.id === messageId && m.role === 'assistant');
    return index < 0 ? '' : messages.slice(0, index).reverse().find(m => m.role === 'user')?.text ?? '';
  }

  cancelSave(): void {
    this.saveOrigin = undefined;
    this.saveDestination.set('');
    this.saveKind.set(null);
    this.saveMessageId.set(null);
    this.saveDraft = '';
  }

  async confirmSave(): Promise<void> {
    const origin = this.saveOrigin;
    const destination = this.saveDestination();
    const kind = this.saveKind();
    const content = this.saveDraft.trim();
    if (!origin || origin.owner !== this.identity.student() || !destination || !kind || this.saving()) return;
    if (!content) { this.error.set('Escribe algo para guardar.'); return; }
    if (kind !== 'notes' && content.length > 400) { this.error.set('Máximo 400 caracteres para conceptos.'); return; }

    this.saving.set(true);
    this.error.set('');
    try {
      const [thread, stored] = await Promise.all([
        this.identity.read<TutorThread>('tutor', origin.threadId),
        this.identity.read<StudySession>('diary', destination),
      ]);
      const assertOwner = () => {
        if (this.identity.student() !== origin.owner || this.saveOrigin !== origin || this.selectedThreadId() !== origin.threadId)
          throw new Error('La sesión cambió.');
      };
      assertOwner();
      const s = stored && migrateSessionIfNeeded(stored);
      const msgObj = thread?.messages.find(m => m.id === this.saveMessageId() && m.role === 'assistant');
      if (!msgObj || !s || (thread?.sessionId && thread.sessionId !== s.id)) throw new Error('Destino de guardado no disponible.');
      const source = msgObj?.source === 'ON_DEVICE' || msgObj?.source === 'IN_CLOUD'
        ? msgObj.source : msgObj?.source === 'OFFLINE_ESSENTIAL' ? 'CURRICULUM_OFFLINE' : null;

      if (kind === 'notes') {
        const existing = s.notes.trimEnd();
        const expanded = appendTutorNoteAsSingleEntry(existing, content);
        if (expanded.length > 20000) throw new Error('Los apuntes superarían el máximo. Acorta el texto.');
        await this.diary.update(s.id, { notes: expanded }, stored?.updatedAt);
        assertOwner();

        // Enlazar la explicación a los conceptos/dudas de la sesión en Memoria de Aprendizaje Real
        for (const concept of this.memory.concepts().filter(c => c.sessionId === s.id && c.conceptText === this.questionFor(msgObj?.id ?? ''))) {
          assertOwner();
          if (source) await this.memory.recordExplanation(concept.id, content.slice(0, 1200), source);
        }
      } else if (kind === 'review') {
        await this.reviews.add(s.id, s.course, content);
        assertOwner();
        await this.memory.registerDoubt(s.id, s.course, s.topic, content);
      } else {
        await this.diary.addConcept(s.id, kind, content);
        assertOwner();
        if (kind === 'doubts') {
          await this.reviews.add(s.id, s.course, content);
          assertOwner();
          await this.memory.registerDoubt(s.id, s.course, s.topic, content);
        }
      }
      assertOwner();
      this.notice.set(`Guardado en ${kind === 'notes' ? 'Apuntes y Memoria' : kind === 'doubts' ? 'Dudas y Repaso SM-2' : kind === 'eureka' ? 'Eureka' : 'Repaso SM-2'}.`);
      this.cancelSave();
    } catch (e: unknown) {
      this.error.set(this.message(e));
    } finally {
      this.saving.set(false);
    }
  }

  async deleteThread(id: string): Promise<void> {
    if (this.busy() || !window.confirm('¿Eliminar esta conversación de este dispositivo?')) return;
    this.error.set('');
    try {
      await this.chats.remove(id);
      if (this.selectedThreadId() === id) this.newThread();
    } catch (e: unknown) {
      this.error.set(this.message(e));
    }
  }

  sourceLabel(source: TutorMessage['source']): string {
    if (source === 'ON_DEVICE') return this.t('tutorSourceLocal');
    if (source === 'IN_CLOUD') return this.t('tutorSourceCloud');
    if (source === 'OFFLINE_ESSENTIAL') return this.t('tutorSourceEssential');
    return this.settings.profile().language === 'en' ? 'Source unverified' : 'Origen sin verificar';
  }

  trackMessage(_index: number, message: TutorMessage): string { return message.id; }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'No se pudo completar la operación.';
  }
}
