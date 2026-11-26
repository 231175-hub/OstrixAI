import { isTutorStructuredNote, visibleTutorNoteText, editedTutorNoteText } from './core/tutor-note-entry';
import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { InvalidLocalCredentials, LocalIdentityService } from './core/local-identity.service';
import { LearningDiaryService, StudySession, Topic, EnrichedDoubtItem, EnrichedEurekaItem, computeSimpleHash } from './core/learning-diary.service';
import { LearningMemoryService, type ConceptMemory, type ConceptStatus } from './core/learning-memory.service';
import { StudentSettingsService, Grade, LearningLanguage } from './core/student-settings.service';
import { OstrixAiService } from './core/ostrix-ai.service';
import { unsavedCompanionEntries } from './core/companion-background-save';
import { mayAutoEnrichNotes } from './core/async-work-policy';
import { suggestedTopicTitle } from './core/companion-doubt-context';
import { TranslationService } from './core/translation.service';
import { SyncService } from './core/sync.service';
import { DeviceCapabilitiesService } from './core/device-capabilities.service';
import { ReviewSchedulerService, type ReviewCard } from './core/review-scheduler.service';
import { TutorConversationService, type TutorMode } from './core/tutor-conversation.service';
import { TutorComponent } from './features/tutor/tutor.component';
import { OstrixCompanionComponent, type CompanionLaunch, type CompanionCapture, type CompanionCaptureBatch, type CompanionBatchResult } from './components/ostrix-companion/ostrix-companion.component';
import { AiProgressComponent } from './components/ai-progress/ai-progress.component';
import { CurriculumExercise, EXERCISE_CATALOG, findMatchingExercises } from './core/exercise-catalog';
import { courseOptions } from './core/school-catalog';
import { interfaceText, type InterfaceKey } from './core/interface-language';
import { splitSummaryIntoParagraphsAndPoints, cleanMarkdownToText } from './core/markdown-cleaner';
import { StudentCoursesService, type StudentCourse } from './core/student-courses.service';
import { COURSE_COVERS, matchCourseCover, type CourseCover } from './core/course-covers';
import { TopicEnrichmentService } from './core/topic-enrichment.service';
import { classifyEurekaDiscovery } from './core/pedagogical-rules';
import {
  PracticeExamService,
  PracticeExam,
  PracticeQuestion,
  PracticeAttempt,
  ExamGenerationConfig,
} from './core/practice-exam.service';

export type AppView =
  | 'bienvenida'
  | 'acceso'
  | 'registro'
  | 'perfil'
  | 'inicio'
  | 'diario'
  | 'apuntes'
  | 'dudas'
  | 'eureka'
  | 'repaso'
  | 'progreso'
  | 'configuracion'
  | 'libro'
  | 'tutor'
  | 'practica';

export type BookTab = 'apuntes' | 'resumen' | 'dudas' | 'eureka' | 'repaso';

export interface FlatDoubt {
  id: string;
  t: string;
  st: number;
  session: StudySession;
}

export interface FlatEureka {
  id: string;
  t: string;
  session: StudySession;
}

export interface FlatReview {
  id: string;
  q: string;
  opts: string[];
  ok: number;
  next?: string;
  done: boolean | null;
  explanation: string;
  session: StudySession;
}

interface BlackboardDraft {
  timestamp: number;
  topics: Topic[];
  doubts: { text: string; topicId?: string }[];
  eureka: { text: string; topicId?: string }[];
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, A11yModule, FormsModule, TutorComponent, AiProgressComponent, OstrixCompanionComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})

export class App implements OnInit, OnDestroy {
  readonly identity = inject(LocalIdentityService);
  readonly diary = inject(LearningDiaryService);
  readonly memory = inject(LearningMemoryService);
  readonly settings = inject(StudentSettingsService);
  readonly ai = inject(OstrixAiService);
  readonly translator = inject(TranslationService);
  readonly sync = inject(SyncService);
  readonly device = inject(DeviceCapabilitiesService);
  readonly scheduler = inject(ReviewSchedulerService);
  readonly chats = inject(TutorConversationService);
  readonly coursesService = inject(StudentCoursesService);
  readonly topicEnrichment = inject(TopicEnrichmentService);
  readonly sanitizer = inject(DomSanitizer);

  // SVG Paths
  readonly P: Record<string, string> = {
    home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    book: 'M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z M4 19.5V4.5',
    notes: 'M6 3h9l4 4v14H6z M14 3v5h5 M9 13h7 M9 17h7',
    help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7 M12 17h.01',
    bulb: 'M9 18h6 M10 21h4 M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
    refresh: 'M20 11a8 8 0 0 0-14.5-4.5L4 8 M4 4v4h4 M4 13a8 8 0 0 0 14.5 4.5L20 16 M20 20v-4h-4',
    chart: 'M4 20V10 M10 20V4 M16 20v-7 M22 20H2',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M12 2v3 M12 19v3 M4.9 4.9 7 7 M17 17l2.1 2.1 M2 12h3 M19 12h3 M4.9 19.1 7 17 M17 7l2.1-2.1',
    plus: 'M12 5v14M5 12h14',
    search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M21 21l-4.3-4.3',
    trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
    edit: 'M4 20h4L19 9l-4-4L4 16z',
    check: 'M5 12.5l4.5 4.5L19 7',
    arrow: 'M5 12h14M13 6l6 6-6 6',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    cloud: 'M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1 0 9z',
    chip: 'M7 7h10v10H7z M9 2v3 M15 2v3 M9 19v3 M15 19v3 M2 9h3 M2 15h3 M19 9h3 M19 15h3',
    wifi: 'M2 9a15 15 0 0 1 20 0 M5.5 12.5a10 10 0 0 1 13 0 M9 16a5 5 0 0 1 6 0 M12 20h.01',
    wifioff: 'M3 3l18 18 M2 9a15 15 0 0 1 5-3 M16 6a15 15 0 0 1 6 3 M5.5 12.5a10 10 0 0 1 3-2 M15 10.5a10 10 0 0 1 3.5 2 M12 20h.01',
    layers: 'M12 3 3 8l9 5 9-5z M3 13l9 5 9-5',
    back: 'M19 12H5M11 18l-6-6 6-6',
    x: 'M6 6l12 12M18 6 6 18',
    eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
    eyeOff: 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94 M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19 M1 1l22 22',
    palette: 'M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4.35 19.4c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l1.9-1.9C9.23 19.64 10.57 20 12 20c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-4.5 9c-.83 0-1.5-.67-1.5-1.5S6.67 9 7.5 9s1.5.67 1.5 1.5S8.33 12 7.5 12zm3-4c-.83 0-1.5-.67-1.5-1.5S9.67 5 10.5 5s1.5.67 1.5 1.5S11.33 8 10.5 8zm3 0c-.83 0-1.5-.67-1.5-1.5S12.67 5 13.5 5s1.5.67 1.5 1.5S14.33 8 13.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S15.67 9 16.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
  };

  readonly TODAY = this.todayLocal();

  // Public pre-login UI language (synced with StudentSettings once authenticated)
  readonly publicLanguage = signal<LearningLanguage>('es');
  readonly activeLanguage = computed<LearningLanguage>(() =>
    this.identity.student() ? this.settings.profile().language : this.publicLanguage()
  );

  t(key: InterfaceKey): string {
    return interfaceText(key, this.activeLanguage());
  }

  /** Visible fallback notices; content and prompts are never translated implicitly. */
  private ui(es: string, en: string): string {
    return this.activeLanguage() === 'en' ? en : es;
  }

  readonly DST = computed(() =>
    this.activeLanguage() === 'en'
      ? ['Pending', 'Reviewing', 'Explained', 'Understood']
      : ['Pendiente', 'En análisis', 'Explicada', 'Comprendida']
  );

  isPending = (d: FlatDoubt) => d.st === 0;
  isMastered = (d: FlatDoubt) => d.st === 3;
  isNanoAvailable(): boolean {
    return this.device.nano() === 'available';
  }
  connectionLabel(): string {
    if (this.device.online()) return this.t('online');
    if (this.device.connectionStatus() === 'unverified') return this.activeLanguage() === 'en' ? 'Connection unverified' : 'Conexión sin verificar';
    if (this.device.connectionStatus() === 'local_only') return this.t('localNetworkNoWan');
    return this.t('offline');
  }
  isCorrectOption(ex: CurriculumExercise, index: number): boolean {
    return ex.correctAnswer === index;
  }
  getDoubtsByState(idx: number): FlatDoubt[] {
    return this.allDoubts().filter(d => d.st === idx);
  }

  // Navigation State
  readonly view = signal<AppView>('bienvenida');
  readonly bookId = signal<string | null>(null);
  readonly tutorSessionId = signal<string | null>(null);
  readonly tutorInitialQuestion = signal<string | null>(null);
  readonly tutorMode = signal<TutorMode>('explain');
  readonly tab = signal<BookTab>('apuntes');
  readonly moreOpen = signal(false);

  // Search & Filters
  readonly query = signal('');
  readonly filterCourse = signal('all');
  readonly filterDate = signal('');

  // Toast
  readonly toastMessage = signal('');
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  // Auth Form State
  authUsername = '';
  authPassword = '';
  authConfirmPassword = '';
  readonly showLoginPassword = signal(false);
  readonly showRegPassword = signal(false);
  readonly showRegConfirm = signal(false);
  readonly authError = signal('');
  readonly authBusy = signal(false);

  // Custom Course Modal State
  readonly dlgCourseOpen = signal(false);
  editingCourseId: string | null = null;
  courseInputName = '';
  readonly courseError = signal('');

  // Session Modal State
  readonly dlgSessionOpen = signal(false);
  editingSessionId: string | null = null;
  sessCourse = '';
  sessTitle = '';
  sessDate = this.todayLocal();
  readonly sessError = signal('');

  // Delete Modal State
  readonly dlgDeleteOpen = signal(false);
  deletingSessionId: string | null = null;

  // Book & Blackboard Multi-Topic State
  bookMode = signal<'enriquecido' | 'pizarra'>('enriquecido');
  intelTab = signal<'enriquecidos' | 'dudas' | 'eureka'>('enriquecidos');
  activeTopicId = signal<string | null>(null);
  topicNotesLines = signal<string[]>(['']);
  topicSaveStatus = signal('Guardado');
  topicNotesMap = signal<Record<string, string[]>>({});
  topicSaveStatusMap = signal<Record<string, string>>({});
  dlgAddTopicOpen = signal(false);
  newTopicInputName = '';
  dlgCoverOpen = signal(false);
  targetCourseForCover = signal<StudentCourse | null>(null);
  readonly courseCoversList = COURSE_COVERS;
  private topicDebounceTimers = new Map<string, any>();

  // Injected Core Services
  readonly practiceExam = inject(PracticeExamService);

  // Practice Exam State (Misión B)
  readonly practiceSession = signal<StudySession | null>(null);
  readonly practiceConfig = signal<ExamGenerationConfig>({
    count: 5,
    difficulty: 'INTERMEDIATE',
    type: 'MIXED',
  });
  readonly practiceState = signal<'CONFIG' | 'GENERATING' | 'ACTIVE' | 'RESULTS'>('CONFIG');
  readonly currentExam = signal<PracticeExam | null>(null);
  readonly currentQuestionIndex = signal(0);
  readonly userAnswers = signal<Record<string, number>>({});
  readonly examStartTime = signal<number>(0);
  readonly currentAttempt = signal<PracticeAttempt | null>(null);
  readonly practiceErrorMessage = signal<string | null>(null);
  readonly confirmFinishModalOpen = signal(false);
  readonly confirmExitPracticeOpen = signal(false);

  readonly currentPracticeQuestion = computed<PracticeQuestion | null>(() => {
    const exam = this.currentExam();
    if (!exam || !exam.questions || exam.questions.length === 0) return null;
    const idx = this.currentQuestionIndex();
    return exam.questions[idx] ?? null;
  });

  readonly examUnansweredCount = computed<number>(() => {
    const exam = this.currentExam();
    if (!exam || !exam.questions) return 0;
    const ans = this.userAnswers();
    return exam.questions.filter(q => ans[q.id] === undefined).length;
  });

  readonly examProgressPercentage = computed<number>(() => {
    const exam = this.currentExam();
    if (!exam || !exam.questions || exam.questions.length === 0) return 0;
    const answered = Object.keys(this.userAnswers()).length;
    return Math.round((answered / exam.questions.length) * 100);
  });

  // Blackboard Save & Draft State (Rediseño Definitivo)
  readonly blackboardSaveState = signal<'saved' | 'unsaved' | 'saving' | 'enriching' | 'updated' | 'error'>('saved');
  readonly hasUnsavedChanges = computed(() => ['unsaved', 'error'].includes(this.blackboardSaveState()));
  readonly draftTopics = signal<Topic[]>([]);
  readonly draftDoubts = signal<{ text: string; topicId?: string }[]>([]);
  readonly draftEureka = signal<{ text: string; topicId?: string }[]>([]);
  readonly draftRecoveryAvailable = signal(false);
  readonly dlgUnsavedNavigationOpen = signal(false);
  readonly confirmLeaveModalOpen = this.dlgUnsavedNavigationOpen;
  pendingNavigationTarget: { view: AppView; id?: string } | null = null;
  private draftWrites: Promise<void> = Promise.resolve();
  private draftRevision = 0;
  private practiceGeneration = 0;
  private stopWatchingSession?: () => void;
  private attemptId = '';
  private finishingAttempt = false;

  constructor() {
    effect(() => { document.documentElement.lang = this.activeLanguage() === 'qu-chanka' ? 'qu' : this.activeLanguage(); });
  }

  // Book Editor Legacy Fallback State
  editorNotes = '';
  readonly saveStatus = signal('Guardado');
  private noteDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Blackboard Zona B & Zona C State
  newDoubtText = '';
  newDoubtTopicId = '';
  editingDoubtIdx: number | null = null;
  editingDoubtText = '';

  newEurekaText = '';
  newEurekaTopicId = '';
  editingEurekaIdx: number | null = null;
  editingEurekaText = '';

  // Settings State for Auto-Enrichment, Context and Cloud
  setupAutoEnrichNotes = true;
  setupAllowCloudEnrichment = false;
  setupAutoInjectSessionContext = true;

  // Derived Translation State for Blackboard Notes (Preserving Original Notes)
  readonly topicDerivedTranslation = signal<Record<string, string>>({});
  readonly showTopicTranslation = signal<Record<string, boolean>>({});
  readonly practiceStartTime = signal<number | null>(null);

  // AI Summary State
  readonly aiBusy = signal(false);
  /** Diagnóstico manual, sin envío a la nube ni guardado de apuntes. */
  readonly nanoTestBusy = signal(false);
  private nanoDiagnosticIndex = 0;
  readonly nanoTestMessage = signal('');
  cloudSummaryConsent = false;
  readonly aiSummary = signal<{
    src: string;
    pts: string[];
    paragraphs: string[];
    keyPoints: string[];
    rawText: string;
    latencyMs?: number;
    timeToFirstChunkMs?: number;
  } | null>(null);
  readonly summaryQuechua = signal<string | null>(null);

  // Exercises State (persisted via LearningMemoryService history and hydrated on load)

  // Linguistic Correction State
  corrTermEs = '';
  corrTransQu = '';
  corrSugChanka = '';
  corrContext = '';
  readonly corrSuccess = signal(false);

  // Settings Temp State
  setupGrade: Grade | null = null;
  setupLanguage: LearningLanguage = 'es';
  setupSeparateScience = false;
  setupOfflineOnly = false;
  syncConsentChecked = false;

  // Catalogs & Options
  readonly courseList = computed<{ id?: string; name: string }[]>(() => {
    const custom = this.coursesService.courses().map(c => ({ id: c.id, name: c.name }));
    const customNames = new Set(custom.map(c => c.name.toLowerCase()));
    const fromSessions: { id?: string; name: string }[] = [];
    for (const s of this.diary.sessions()) {
      if (s.course && !customNames.has(s.course.toLowerCase())) {
        customNames.add(s.course.toLowerCase());
        fromSessions.push({ name: s.course });
      }
    }
    return [...custom, ...fromSessions].sort((a, b) => a.name.localeCompare(b.name));
  });

  getCourseColor(courseIdOrName: string): string {
    const c = courseIdOrName.toLowerCase();
    if (c.includes('mat')) return 'var(--blue)';
    if (c.includes('com') || c.includes('art')) return 'var(--red)';
    if (c.includes('cien') || c.includes('cyt') || c.includes('fís') || c.includes('quím') || c.includes('biol') || c.includes('ef')) return 'var(--green)';
    if (c.includes('soc') || c.includes('ingl') || c.includes('dpcc')) return 'var(--yellow)';
    return 'var(--blue)';
  }

  // Active Session for Book View
  readonly activeSession = computed<StudySession | null>(() => {
    const id = this.bookId();
    if (!id) return null;
    return this.diary.sessions().find(s => s.id === id) ?? null;
  });

  // Active Topic for Blackboard & Enriched View
  readonly activeTopic = computed<Topic | null>(() => {
    const s = this.activeSession();
    if (!s || !s.topics || s.topics.length === 0) return null;
    const tid = this.activeTopicId();
    if (tid) {
      const found = s.topics.find(t => t.id === tid);
      if (found) return found;
    }
    return s.topics[0];
  });

  // Filtered Sessions for Journal
  readonly filteredSessions = computed<StudySession[]>(() => {
    let list = this.diary.sessions();
    const fCourse = this.filterCourse();
    if (fCourse !== 'all') {
      list = list.filter(s => s.course === fCourse);
    }
    const fDate = this.filterDate();
    if (fDate) {
      list = list.filter(s => s.date === fDate);
    }
    const q = this.query().trim().toLowerCase();
    if (q) {
      list = list.filter(s =>
        (s.topic + ' ' + s.course + ' ' + s.notes + ' ' + s.doubts.join(' ') + ' ' + s.eureka.join(' ')).toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => b.date.localeCompare(a.date));
  });

  // Grouped by date for Journal view
  readonly sessionsByDate = computed<{ date: string; sessions: StudySession[] }[]>(() => {
    const map = new Map<string, StudySession[]>();
    for (const s of this.filteredSessions()) {
      if (!map.has(s.date)) map.set(s.date, []);
      map.get(s.date)!.push(s);
    }
    return [...map.entries()].map(([date, sessions]) => ({ date, sessions }));
  });

  // All Doubts flattened with persisted LearningMemory status
  readonly allDoubts = computed(() => {
    const list: FlatDoubt[] = [];
    for (const s of this.diary.sessions()) {
      for (let i = 0; i < s.doubts.length; i++) {
        const text = s.doubts[i];
        const mem = this.memory.concepts().find(c => c.sessionId === s.id && c.conceptText === text);
        const st = mem
          ? (mem.status === 'MASTERED' ? 3 : mem.status === 'TESTED' ? 2 : mem.status === 'EXPLAINED' ? 1 : 0)
          : 0;
        list.push({ id: `${s.id}-d-${i}`, t: text, st, session: s });
      }
    }
    return list;
  });

  // All Eureka flattened
  readonly allEureka = computed(() => {
    const list: FlatEureka[] = [];
    for (const s of this.diary.sessions()) {
      for (let i = 0; i < s.eureka.length; i++) {
        list.push({ id: `${s.id}-e-${i}`, t: s.eureka[i], session: s });
      }
    }
    return list;
  });

  // All curriculum reviews flattened
  readonly allReviews = computed<FlatReview[]>(() => {
    const list: FlatReview[] = [];
    for (const s of this.diary.sessions()) {
      const exercises = findMatchingExercises(s.course, [s.topic, s.notes].join(' '), this.settings.profile().grade ?? undefined, 2, true);
      const candidates = new Map(exercises.map(ex => [ex.id, ex]));
      const scheduled = new Map<string, { next: string; correct: boolean }>();
      for (const concept of this.memory.concepts()) {
        if (concept.sessionId !== s.id || !/^\d{4}-\d\d-\d\d$/.test(concept.nextReviewDate)) continue;
        const entry = concept.history.at(-1);
        const ex = entry && EXERCISE_CATALOG.find(item => item.id === entry.exerciseId && item.question === concept.conceptText);
        if (!ex || !entry || typeof entry.selectedAnswer !== 'number' || !ex.options?.[entry.selectedAnswer]
          || entry.isCorrect !== (entry.selectedAnswer === ex.correctAnswer)) continue;
        candidates.set(ex.id, ex);
        scheduled.set(ex.id, { next: concept.nextReviewDate, correct: entry.isCorrect });
      }
      for (const ex of candidates.values()) {
        const record = scheduled.get(ex.id);
        list.push({
          id: ex.id,
          q: ex.question,
          opts: [...(ex.options ?? [])],
          ok: typeof ex.correctAnswer === 'number' ? ex.correctAnswer : 0,
          next: record?.next,
          done: record && record.next > this.TODAY ? record.correct : null,
          explanation: ex.explanation,
          session: s,
        });
      }
    }
    return list;
  });

  readonly dueReviews = computed<FlatReview[]>(() => {
    return this.allReviews().filter(r => r.next && r.next <= this.TODAY && r.done === null);
  });

  readonly reviewCards = computed(() => {
    const sessions = new Set(this.diary.sessions().map(s => s.id));
    return this.scheduler.cards().filter(c => sessions.has(c.sourceSessionId) && /^\d{4}-\d\d-\d\d$/.test(c.dueDate));
  });
  readonly dueReviewCards = computed(() => this.reviewCards().filter(c => c.dueDate <= this.TODAY));

  // Exercises for active session in Book
  readonly currentBookExercises = computed<readonly CurriculumExercise[]>(() => {
    const s = this.activeSession();
    if (!s) return [];
    return findMatchingExercises(s.course, `${s.topic} ${s.doubts.join(' ')}`, this.settings.profile().grade ?? undefined, 3, true);
  });

  // Dynamic calendar matrix for current month (P1.12: Formato riguroso "Noviembre de 2026")
  readonly currentMonthLabel = computed(() => {
    const d = new Date(`${this.TODAY}T12:00:00`);
    const raw = d.toLocaleDateString(this.activeLanguage() === 'en' ? 'en-US' : 'es-PE', {
      month: 'long',
      year: 'numeric',
    });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  });

  readonly calendarOffset = computed<number[]>(() => {
    const [year, month] = this.TODAY.split('-').map(Number);
    const firstDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const mondayOffset = (firstDay + 6) % 7;
    return Array.from({ length: mondayOffset }, (_, i) => i);
  });

  readonly calendarCells = computed<{ day: number; count: number; level: string }[]>(() => {
    const [year, month] = this.TODAY.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const cells: { day: number; count: number; level: string }[] = [];
    const all = this.diary.sessions();
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${prefix}-${String(d).padStart(2, '0')}`;
      const cnt = all.filter(s => s.date === ds).length;
      const level = cnt >= 3 ? 'l3' : cnt === 2 ? 'l2' : cnt === 1 ? 'l1' : '';
      cells.push({ day: d, count: cnt, level });
    }
    return cells;
  });

  // Actionable pedagogical recommendations (P1.12)
  readonly actionableRecommendations = computed<Array<{ text: string; actionView?: AppView; actionLabel?: string }>>(() => {
    const list: Array<{ text: string; actionView?: AppView; actionLabel?: string }> = [];
    const isEn = this.activeLanguage() === 'en';
    const due = this.dueReviews().length + this.dueReviewCards().length;
    if (due > 0) {
      list.push({
        text: isEn
          ? `You have ${due} adaptive review items scheduled for today.`
          : `Tienes ${due} ${due === 1 ? 'elemento' : 'elementos'} de repaso adaptativo programados para hoy.`,
        actionView: 'repaso',
        actionLabel: isEn ? 'Review now' : 'Repasar ahora',
      });
    }
    const pend = this.allDoubts().filter(d => d.st === 0);
    if (pend.length > 0) {
      list.push({
        text: isEn
          ? `Your oldest pending doubt in ${pend[0].session.course}: "${pend[0].t}".`
          : `Tu duda pendiente más antigua es de ${pend[0].session.course}: "${pend[0].t}".`,
        actionView: 'dudas',
        actionLabel: isEn ? 'Resolve doubt' : 'Resolver duda',
      });
    }
    const lastSession = this.diary.sessions()[0];
    if (lastSession && (lastSession.notes || (lastSession.topics && lastSession.topics.length > 0))) {
      list.push({
        text: isEn
          ? `Test your understanding of "${lastSession.topic || lastSession.course}" with a quick practice exam.`
          : `Evalúa tu comprensión de "${lastSession.topic || lastSession.course}" con una práctica rápida para examen.`,
        actionView: 'practica',
        actionLabel: isEn ? 'Start practice' : 'Iniciar práctica',
      });
    }
    return list;
  });

  // Pedagogical recommendations (for compatibility)
  readonly recommendations = computed<string[]>(() => {
    return this.actionableRecommendations().map(r => r.text);
  });

  // Evolution by course table
  readonly courseEvolution = computed<{ name: string; sessions: number; doubts: number; understood: number; eureka: number }[]>(() => {
    const courses = [...new Set(this.diary.sessions().map(s => s.course))];
    return courses.map(c => {
      const ss = this.diary.sessions().filter(s => s.course === c);
      const doubts = ss.flatMap(s => s.doubts);
      const eureka = ss.flatMap(s => s.eureka);
      const understood = this.allDoubts().filter(d => d.session.course === c && d.st === 3).length;
      return {
        name: c,
        sessions: ss.length,
        doubts: doubts.length,
        understood,
        eureka: eureka.length,
      };
    });
  });

  // Helper de pluralización correcta (P1.5.4)
  plural(count: number, singularKey: InterfaceKey, pluralKey: InterfaceKey): string {
    const word = count === 1 ? this.t(singularKey) : this.t(pluralKey);
    return `${count} ${word}`;
  }

  // Métodos de clasificación de Eureka (P0.4)
  isAmbiguousEureka(text: string): boolean {
    return classifyEurekaDiscovery(text).isClarificationNeeded;
  }

  getEurekaClarification(text: string): string {
    return classifyEurekaDiscovery(text).suggestedClarification || '';
  }

  // Explorador Académico de Apuntes (P1.9)
  readonly notesFilterCourse = signal<string>('all');
  readonly notesFilterDate = signal<'all' | 'week' | 'month'>('all');
  readonly notesSearchQuery = signal<string>('');

  readonly academicSearchResults = computed(() => {
    const sessions = this.diary.sessions();
    const courseFilter = this.notesFilterCourse();
    const dateFilter = this.notesFilterDate();
    const rawQuery = this.notesSearchQuery().trim().toLowerCase();

    const now = new Date(`${this.TODAY}T12:00:00`).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    const results: Array<{
      session: StudySession;
      topic: Topic;
      snippet: string;
      matchedText?: string;
    }> = [];

    for (const s of sessions) {
      if (courseFilter !== 'all' && s.course.toLowerCase() !== courseFilter.toLowerCase()) {
        continue;
      }

      if (dateFilter !== 'all') {
        const sessionDate = new Date(`${s.date}T12:00:00`).getTime();
        const diff = now - sessionDate;
        if (dateFilter === 'week' && diff > sevenDaysMs) continue;
        if (dateFilter === 'month' && diff > thirtyDaysMs) continue;
      }

      const topics: readonly Topic[] = (s.topics && s.topics.length > 0)
        ? s.topics
        : [{
            id: 't-default',
            name: s.topic || 'General',
            order: 1,
            notes: s.notes ? s.notes.split('\n') : [''],
            originalNotesText: s.notes || '',
            enrichedExplanation: '',
            enrichedExamples: [],
            keyIdeas: [],
            commonMistakes: [],
            enrichmentStatus: 'UP_TO_DATE' as const,
            contentVersion: 1,
            enrichedVersion: 1,
            contentHash: '',
            doubts: [],
            eureka: [],
            updatedAt: s.date,
          }];

      for (const t of topics) {
        const notesStr = (t.notes || []).join(' ') + ' ' + (t.originalNotesText || '');
        const fullText = `${t.name} ${s.course} ${notesStr} ${t.enrichedExplanation || ''}`.toLowerCase();

        if (!rawQuery || fullText.includes(rawQuery)) {
          let snippet = '';
          if (rawQuery && notesStr.toLowerCase().includes(rawQuery)) {
            const idx = notesStr.toLowerCase().indexOf(rawQuery);
            const start = Math.max(0, idx - 40);
            const end = Math.min(notesStr.length, idx + rawQuery.length + 80);
            snippet = (start > 0 ? '...' : '') + notesStr.slice(start, end).trim() + (end < notesStr.length ? '...' : '');
          } else if (t.notes && t.notes.length > 0 && t.notes[0].trim().length > 0) {
            snippet = t.notes.slice(0, 2).join(' · ');
          } else if (t.enrichedExplanation) {
            snippet = t.enrichedExplanation.slice(0, 140) + '...';
          } else {
            snippet = s.notes ? s.notes.slice(0, 120) : 'Sin apuntes detallados aún.';
          }

          results.push({
            session: s,
            topic: t,
            snippet,
          });
        }
      }
    }

    return results;
  });

  goToTopicOnBlackboard(sessionId: string, topicId: string): void {
    this.activeTopicId.set(topicId);
    this.bookMode.set('pizarra');
    this.go('libro', sessionId);
  }

  // Acciones pedagógicas para Dudas (P1.10)
  handleDoubtAction(d: FlatDoubt, action: 'analyze' | 'explain' | 'test' | 'master'): void {
    if (action === 'analyze') {
      this.openTutor(d.session.id, `Ayúdame a comprender esta duda de clase: "${d.t}".`);
    } else if (action === 'explain') {
      this.bookMode.set('enriquecido');
      this.intelTab.set('dudas');
      this.go('libro', d.session.id);
    } else if (action === 'test') {
      this.openTutor(d.session.id, `Practiquemos un ejercicio para comprobar si ya comprendí: "${d.t}".`, 'practice');
    } else if (action === 'master') {
      this.masterDoubt(d);
    }
  }

  async masterDoubt(doubt: FlatDoubt): Promise<void> {
    await this.markDoubtUnderstood(doubt.session, doubt.t);
  }

  // Filtros y modal de detalle para Biblioteca Eureka (P1.11)
  readonly eurekaFilterCourse = signal<string>('all');
  readonly selectedEurekaDetail = signal<{ session: StudySession; text: string; enriched?: EnrichedEurekaItem } | null>(null);

  readonly filteredGlobalEureka = computed(() => {
    const all = this.allEureka();
    const filter = this.eurekaFilterCourse();
    if (filter === 'all') return all;
    return all.filter(e => e.session.course.toLowerCase() === filter.toLowerCase());
  });

  openEurekaDetail(item: { session: StudySession; t: string }): void {
    const enriched = this.getEnrichedEureka(item.session, item.t);
    this.selectedEurekaDetail.set({
      session: item.session,
      text: item.t,
      enriched: enriched || undefined,
    });
  }

  closeEurekaDetail(): void {
    this.selectedEurekaDetail.set(null);
  }

  // Historial y métricas de exámenes de práctica (P1.12)
  readonly practiceAttemptsList = signal<PracticeAttempt[]>([]);

  readonly totalPracticeExams = computed(() => this.practiceAttemptsList().length);
  readonly averagePracticeScore = computed(() => {
    const list = this.practiceAttemptsList();
    if (list.length === 0) return 0;
    return Math.round(list.reduce((acc, a) => acc + a.scorePercentage, 0) / list.length);
  });
  readonly practiceQuestionShortage = computed(() => {
    const actual = this.currentExam()?.questions.length ?? 0;
    const requested = this.practiceConfig().count;
    if (!actual || actual >= requested) return '';
    return this.activeLanguage() === 'en'
      ? `You requested ${requested} questions, but only ${actual} were generated. You can add more notes or try again.`
      : `Solicitaste ${requested} preguntas, pero solo se generaron ${actual}. Puedes ampliar tus apuntes o intentarlo otra vez.`;
  });
  readonly totalCorrectPracticeAnswers = computed(() => {
    return this.practiceAttemptsList().reduce((acc, a) => acc + (a.correctCount || 0), 0);
  });

  async loadPracticeAttempts(): Promise<void> {
    const owner = this.identity.student();
    try {
      const attempts = await this.practiceExam.getExamHistory();
      if (owner === this.identity.student()) this.practiceAttemptsList.set(attempts);
    } catch {
      this.practiceAttemptsList.set([]);
    }
  }

  /** Recover up to three saved but unfinished enrichments, without blocking navigation. */
  private resumePendingLearningTasks(): void {
    if (!this.identity.student()) return;
    const profile = this.settings.profile();
    if (!mayAutoEnrichNotes(profile.autoEnrichNotes, this.isNanoAvailable(), profile.allowCloudEnrichment, profile.offlineOnly)) return;
    if (this.topicEnrichment.isQueueActive() || this.topicEnrichment.isEnriching()) return;
    let recovered = 0;
    for (const session of this.diary.sessions()) {
      for (const topic of session.topics) {
        if (!topic.originalNotesText?.trim()) continue;
        if (topic.enrichmentStatus !== 'PENDING' && topic.enrichmentStatus !== 'OUTDATED' &&
            topic.enrichmentStatus !== 'ERROR' && topic.enrichmentStatus !== 'GENERATING') continue;
        this.topicEnrichment.enqueueTopic(session.id, topic.id);
        if (++recovered >= 3) return; // Avoid saturating Gemini Nano at login.
      }
    }
  }

  async ngOnInit(): Promise<void> {
    window.addEventListener('hashchange', this.handleHashChange);
    this.stopWatchingSession = this.identity.watchSessionRevocation(() => window.location.reload());
    // 1. Restaurar sesión autenticada activa (si existe en IndexedDB)
    await this.identity.restoreSession();

    // 2. Si el estudiante está autenticado, cargar todos sus datos antes de evaluar la ruta
    if (this.identity.student()) {
      await this.settings.load();
      this.syncSetupState();
      await this.diary.load();
      await this.migrateLegacyDrafts();
      await this.coursesService.load(this.diary.sessions().map(s => s.course));
      await this.memory.load();
      await this.scheduler.load();
      await this.chats.load();
      await this.sync.refreshCount();
      await this.loadPracticeAttempts();
    }

    // 3. Evaluar la ruta actual con los datos ya disponibles en memoria
    this.parseHash();

    // 4. Comprobar capacidades locales
    await this.device.checkNano();
    this.resumePendingLearningTasks();
  }

  ngOnDestroy(): void {
    window.removeEventListener('hashchange', this.handleHashChange);
    this.stopWatchingSession?.();
    this.ai.cancelActiveRequest();
  }

  private handleHashChange = () => {
    this.parseHash();
  };

  private parseHash(): void {
    let rawHash = (window.location.hash || '#bienvenida').slice(1);
    if (this.identity.student() && (rawHash === 'acceso' || rawHash === 'registro')) {
      rawHash = 'inicio';
      window.history.replaceState(window.history.state, '', '#inicio');
    }
    const publicViews: AppView[] = ['bienvenida', 'acceso', 'registro'];

    if (rawHash.startsWith('libro-')) {
      if (!this.identity.student()) {
        this.view.set('acceso');
        return;
      }
      const id = rawHash.slice(6);
      this.bookId.set(id);
      this.view.set('libro');
      this.loadBookSession(id);
    } else if (rawHash.startsWith('practica-')) {
      if (!this.identity.student()) {
        this.view.set('acceso');
        return;
      }
      const id = rawHash.slice(9);
      this.bookId.set(id);
      this.view.set('practica');
      const s = this.diary.sessions().find(item => item.id === id);
      if (s) {
        this.practiceSession.set(s);
      }
    } else {
      const validViews: AppView[] = [
        'bienvenida', 'acceso', 'registro', 'perfil', 'inicio', 'diario',
        'apuntes', 'dudas', 'eureka', 'repaso', 'progreso', 'configuracion', 'tutor', 'practica'
      ];
      if (validViews.includes(rawHash as AppView)) {
        if (!publicViews.includes(rawHash as AppView) && !this.identity.student()) {
          this.view.set('acceso');
        } else {
          this.view.set(rawHash as AppView);
          if (rawHash === 'practica') {
            // Si la ruta es #practica pero no hay sesión en memoria, intentar recuperar por bookId previo
            if (!this.practiceSession() && this.bookId()) {
              const s = this.diary.sessions().find(item => item.id === this.bookId());
              if (s) {
                this.practiceSession.set(s);
              }
            }
          }
        }
      } else {
        this.view.set('bienvenida');
      }

      if (rawHash !== 'practica') {
        this.bookId.set(null);
      }
    }
    this.moreOpen.set(false);
    window.scrollTo(0, 0);
  }

  go(v: AppView, id?: string): void {
    if (this.view() === 'libro' && this.hasUnsavedChanges()) {
      if (v === 'libro' && id === this.bookId()) {
        return;
      }
      this.pendingNavigationTarget = { view: v, id };
      this.dlgUnsavedNavigationOpen.set(true);
      return;
    }
    this.executeNavigation(v, id);
  }

  executeNavigation(v: AppView, id?: string): void {
    if (v === 'libro' && id) {
      window.location.hash = `#libro-${id}`;
    } else if (v === 'practica' && id) {
      window.location.hash = `#practica-${id}`;
    } else {
      window.location.hash = `#${v}`;
    }
  }

  keepEditing(): void {
    this.dlgUnsavedNavigationOpen.set(false);
    this.pendingNavigationTarget = null;
  }

  async saveAndExit(): Promise<void> {
    await this.saveBlackboardExplicit();
    if (this.hasUnsavedChanges() || this.blackboardSaveState() === 'saving') return;
    const target = this.pendingNavigationTarget;
    this.dlgUnsavedNavigationOpen.set(false);
    this.pendingNavigationTarget = null;
    if (target) {
      this.executeNavigation(target.view, target.id);
    }
  }

  async exitWithoutSaving(): Promise<void> {
    const sessionId = this.bookId();
    if (sessionId) {
      await this.clearEmergencyDraft(sessionId);
      this.loadBookSession(sessionId);
    }
    this.blackboardSaveState.set('saved');
    const target = this.pendingNavigationTarget;
    this.dlgUnsavedNavigationOpen.set(false);
    this.pendingNavigationTarget = null;
    if (target) {
      this.executeNavigation(target.view, target.id);
    }
  }

  /** Cambia el idioma desde pantallas públicas o autenticado. */
  async changeLanguage(lang: LearningLanguage): Promise<void> {
    this.publicLanguage.set(lang);
    this.setupLanguage = lang;
    if (this.identity.student()) {
      await this.saveSettings();
    }
  }

  /** Abre Tutor Ostrix con el contexto de la sesión y opcionalmente una duda precargada. */
  openTutor(sessionId: string | null = null, prefillQuestion: string | null = null, mode: TutorMode = 'explain'): void {
    if (!this.identity.student()) {
      this.go('acceso');
      return;
    }
    const valid = sessionId && this.diary.sessions().some(s => s.id === sessionId);
    this.tutorSessionId.set(valid ? sessionId : null);
    this.tutorInitialQuestion.set(prefillQuestion);
    this.tutorMode.set(mode);
    this.go('tutor');
  }

  // COMPANION-05: recent session labels only, never expose note contents to the mascot.
  readonly companionSessionChoices = computed(() => this.diary.sessions().slice(0, 25).map(s => ({
    id: s.id, label: `${s.course} · ${s.date}`,
  })));
  readonly companionCaptureBusy = signal(false);
  readonly companionCaptureFeedback = signal('');
  readonly companionBatchResult = signal<CompanionBatchResult | null>(null);
  /** UI status only; the actual encrypted write remains in LearningDiaryService. */
  readonly companionBackgroundSave = signal<{
    ownerId: string; destination: string; state: 'saving' | 'saved' | 'error'; message: string;
  } | null>(null);
  private companionRetryPayload: { ownerId: string; request: CompanionCaptureBatch } | null = null;
  private companionRetryId = 100000;
  /** If a topic was created but its text write failed, reuse it on retry. */
  private companionIncompleteTopic: {ownerId: string; sessionId: string; topicId: string; note: string} | null = null;

  /** Retrying is deliberate; only the still-unsaved part is retried for the same account. */
  retryCompanionBackgroundSave(): void {
    const pending = this.companionRetryPayload;
    if (!pending || this.companionCaptureBusy() || this.identity.student()?.id !== pending.ownerId) return;
    void this.saveCompanionBatch({ ...pending.request, requestId: ++this.companionRetryId });
  }
  dismissCompanionBackgroundSave(): void {
    if (this.companionBackgroundSave()?.state === 'saved') this.companionBackgroundSave.set(null);
  }

  /** Quick capture reuses the existing encrypted diary. No AI, Cloud or alternate database. */
  async saveCompanionCapture(request: CompanionCapture): Promise<void> {
    if (this.companionCaptureBusy() || !this.identity.student()) return;
    const content = request.content.trim();
    const session = this.diary.sessions().find(s => s.id === request.sessionId);
    if (!session || !content || content.length > (request.kind === 'note' ? 2000 : 400)) {
      this.companionCaptureFeedback.set('Selecciona una sesión válida y escribe contenido.');
      return;
    }
    this.companionCaptureBusy.set(true);
    this.companionCaptureFeedback.set('');
    const studentId = this.identity.student()?.id;
    try {
      if (request.kind === 'note') {
        const title = suggestedTopicTitle(content) ?? `Nota rápida: ${content.split('\n')[0].slice(0, 48)}`;
        const newTopic = await this.diary.addTopic(session.id, title);
        await this.diary.updateTopic(session.id, newTopic.id, {
          originalNotesText: content,
          notes: content.split('\n'),
        });
        if (this.identity.student()?.id === studentId) {
          const profile = this.settings.profile();
          if (mayAutoEnrichNotes(profile.autoEnrichNotes, this.isNanoAvailable(), profile.allowCloudEnrichment, profile.offlineOnly)) {
            const freshSession = this.diary.sessions().find(s => s.id === session.id);
            if (freshSession) this.topicEnrichment.scheduleTopicEnrichment(freshSession, newTopic.id, 5000);
          }
        }
      } else if (request.kind === 'doubt') {
        await this.diary.addConcept(session.id, 'doubts', content);
        // Scheduling is best effort; content remains safely saved if it fails.
        try {
          await this.memory.registerDoubt(session.id, session.course, session.topic, content);
          await this.scheduler.add(session.id, session.course, content);
        } catch { this.showToast('Duda guardada; revisa su programación de repaso.'); }
      } else if (request.kind === 'eureka') {
        await this.diary.addConcept(session.id, 'eureka', content);
      } else {
        throw new Error('Tipo de registro inválido.');
      }
      if (this.identity.student()?.id !== studentId) throw new Error('La cuenta cambió durante el guardado.');
      this.companionCaptureFeedback.set('OK:Guardado en el cuaderno cifrado.');
      this.showToast('Contenido guardado en tu Diario.');
    } catch (error: unknown) {
      this.companionCaptureFeedback.set(error instanceof Error ? error.message : 'No se pudo completar el guardado.');
    } finally {
      this.companionCaptureBusy.set(false);
    }
  }

  /** AUTO-02: non-blocking same-tab save, owned by App so it continues after navigation. */
  async saveCompanionBatch(request: CompanionCaptureBatch): Promise<void> {
    if (this.companionCaptureBusy()) {
      this.companionBatchResult.set({ requestId: request.requestId, noteSaved: false, doubtSaved: false,
        message: 'Ya hay un guardado en curso. Espera el aviso para enviar otro.' });
      return;
    }
    const student = this.identity.student();
    const owner = student?.id ?? '';
    const session = this.diary.sessions().find(s => s.id === request.sessionId);
    const note = request.note?.trim() ?? '';
    const doubt = request.doubt?.trim() ?? '';
    const owned = () => !!owner && this.identity.student()?.id === owner;
    if (!owned() || !session || (!note && !doubt) || note.length > 2000 || doubt.length > 400) {
      this.companionBatchResult.set({ requestId: request.requestId, noteSaved: false, doubtSaved: false,
        message: 'Elige una sesión válida y revisa la longitud de tus textos.' });
      return;
    }
    const destination = `${session.course} · ${session.date}`;
    // A private snapshot is retained in the parent App until this task succeeds.
    const snapshot: CompanionCaptureBatch = { requestId: request.requestId, sessionId: session.id,
      ...(note ? { note } : {}), ...(doubt ? { doubt } : {}) };
    this.companionRetryPayload = { ownerId: owner, request: snapshot };
    this.companionCaptureBusy.set(true);
    this.companionBatchResult.set(null);
    this.companionBackgroundSave.set({ ownerId: owner, destination, state: 'saving',
      message: 'Guardando en segundo plano… Puedes seguir usando OstrixAi.' });
    this.showToast('Ostrix está guardando. Puedes seguir aprendiendo.');
    // A browser may warn on closing the tab while a local write is still pending.
    const warnOnClose = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    if (typeof window !== 'undefined') window.addEventListener('beforeunload', warnOnClose);
    let noteSaved = false;
    let doubtSaved = false;
    let topicForThisDoubt: string | undefined;
    let problem = '';
    try {
      if (!owned()) throw new Error('La cuenta cambió durante el guardado.');
      if (note) {
        const incomplete = this.companionIncompleteTopic;
        const existing = incomplete && incomplete.ownerId === owner && incomplete.sessionId === session.id
          && incomplete.note === note && this.diary.sessions().some(s => s.id === session.id && s.topics.some(t => t.id === incomplete.topicId));
        let topicId: string;
        if (existing && incomplete) {
          topicId = incomplete.topicId;
        } else {
          const title = suggestedTopicTitle(note) ?? `Nota rápida: ${note.split('\n')[0].slice(0, 48)}`;
          const topic = await this.diary.addTopic(session.id, title);
          topicId = topic.id;
          this.companionIncompleteTopic = { ownerId: owner, sessionId: session.id, topicId, note };
        }
        if (!owned()) throw new Error('La cuenta cambió durante el guardado.');
        await this.diary.updateTopic(session.id, topicId, { originalNotesText: note, notes: note.split('\n') });
        noteSaved = true;
        topicForThisDoubt = topicId;
        this.companionIncompleteTopic = null;
        // Schedule educational enrichment only AFTER encrypted local persistence succeeded.
        // The existing queue serializes model requests, and enforces the student's Cloud preference.
        if (owned()) {
          const profile = this.settings.profile();
          if (mayAutoEnrichNotes(profile.autoEnrichNotes, this.isNanoAvailable(), profile.allowCloudEnrichment, profile.offlineOnly)) {
            const freshSession = this.diary.sessions().find(s => s.id === session.id);
            if (freshSession) this.topicEnrichment.scheduleTopicEnrichment(freshSession, topicId, 5000);
          }
        }
      }
      if (doubt) {
        if (!owned()) throw new Error('La cuenta cambió durante el guardado.');
        // Vincula la duda al mismo tema del apunte si ambos se guardaron juntos.
        // La sesión puede contener múltiples temas; nunca se vincula al azar.
        await this.diary.addConcept(session.id, 'doubts', doubt, topicForThisDoubt);
        doubtSaved = true;
        try {
          await this.memory.registerDoubt(session.id, session.course, session.topic, doubt);
          await this.scheduler.add(session.id, session.course, doubt);
        } catch { if (owned()) this.showToast('Duda guardada; revisa su programación de repaso.'); }
      }
    } catch (error: unknown) {
      problem = error instanceof Error ? error.message : 'Error durante el guardado.';
    } finally {
      if (typeof window !== 'undefined') window.removeEventListener('beforeunload', warnOnClose);
      const count = Number(noteSaved) + Number(doubtSaved);
      const message = problem
        ? `${count ? 'Guardado parcial. ' : ''}${problem} ${count ? 'Solo se reintentará lo pendiente.' : 'Puedes reintentar.'}`.trim()
        : `Guardado confirmado: ${count} registro${count === 1 ? '' : 's'} en tu Diario cifrado.`;
      this.companionBatchResult.set({ requestId: request.requestId, noteSaved, doubtSaved, message });
      if (problem) {
        this.companionRetryPayload = { ownerId: owner,
          request: { requestId: request.requestId,
            ...unsavedCompanionEntries({ sessionId: session.id, ...(note ? { note } : {}), ...(doubt ? { doubt } : {}) }, noteSaved, doubtSaved) } };
      } else {
        this.companionRetryPayload = null;
      }
      this.companionBackgroundSave.set({ ownerId: owner, destination,
        state: problem ? 'error' : 'saved', message });
      this.companionCaptureBusy.set(false);
      if (owned()) this.showToast(problem ? 'Ostrix no pudo terminar de guardar: revisa el aviso.' : 'Ostrix terminó de guardar en el Diario.');
    }
  }

  /** COMPANION-02: quick routes reuse existing navigation and keep diary safeguards. */
  openCompanionSection(section: 'diario' | 'apuntes' | 'dudas' | 'repaso'): void {
    if (!this.identity.student()) return;
    this.go(section);
  }

  /** COMPANION-01: reuse the Tutor's existing modes, history and Cloud consent flow. */
  openCompanionAction(action: CompanionLaunch): void {
    if (!this.identity.student()) return;
    const currentId = action.includeCurrentSession && this.view() === 'libro'
      && this.settings.profile().autoInjectSessionContext ? this.activeSession()?.id ?? null : null;
    this.openTutor(currentId, action.prompt, action.mode);
  }

  showToast(msg: string): void {
    this.toastMessage.set(msg);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastMessage.set(''), 3200);
  }

  async handleLogin(): Promise<void> {
    if (this.authBusy() || this.identity.student()) return;
    const u = this.authUsername.trim();
    const p = this.authPassword;
    this.authError.set('');
    if (u.length < 3) {
      this.authError.set(
        this.activeLanguage() === 'en'
          ? 'Username must be at least 3 characters.'
          : 'Escribe un nombre de usuario de al menos 3 caracteres.'
      );
      return;
    }
    if (p.length < 10) {
      this.authError.set(
        this.activeLanguage() === 'en'
          ? 'Password must be at least 10 characters.'
          : 'La contraseña debe tener al menos 10 caracteres.'
      );
      return;
    }
    this.authBusy.set(true);
    try {
      await this.identity.login(u, p);
      this.authPassword = '';
      this.showLoginPassword.set(false);
      await this.settings.load();
      this.syncSetupState();
      await this.diary.load();
      await this.migrateLegacyDrafts();
      await this.coursesService.load(this.diary.sessions().map(s => s.course));
      await this.memory.load();
      await this.scheduler.load();
      await this.chats.load();
      await this.sync.refreshCount();
      await this.loadPracticeAttempts();
      // Local work resumes only after the encrypted diary is unlocked for this student.
      void this.device.checkNano().then(() => this.resumePendingLearningTasks()).catch(() => {});
      this.showToast(
        this.activeLanguage() === 'en'
          ? 'Welcome back! Encrypted notebook unlocked.'
          : '¡Bienvenido/a! Tu cuaderno ha sido descifrado.'
      );
      this.go('inicio');
    } catch (e: unknown) {
      if (this.identity.student()) {
        await this.logout('acceso');
      }
      this.authError.set(e instanceof InvalidLocalCredentials
        ? this.t('invalidCredentials')
        : e instanceof Error ? e.message : this.ui('Error al verificar credenciales.', 'Could not verify the login.'));
    } finally {
      this.authBusy.set(false);
    }
  }

  async handleRegister(): Promise<void> {
    if (this.authBusy() || this.identity.student()) return;
    const u = this.authUsername.trim();
    const p = this.authPassword;
    const p2 = this.authConfirmPassword;
    this.authError.set('');
    if (u.length < 3) {
      this.authError.set(
        this.activeLanguage() === 'en'
          ? 'Username must be at least 3 characters.'
          : 'Escribe un nombre de usuario de al menos 3 caracteres.'
      );
      return;
    }
    if (p.length < 10) {
      this.authError.set(
        this.activeLanguage() === 'en'
          ? 'Password must be at least 10 characters.'
          : 'La contraseña debe tener al menos 10 caracteres.'
      );
      return;
    }
    if (p !== p2) {
      this.authError.set(
        this.activeLanguage() === 'en'
          ? 'Passwords do not match.'
          : 'Las contraseñas no coinciden.'
      );
      return;
    }
    this.authBusy.set(true);
    try {
      await this.identity.register(u, p);
      this.authPassword = '';
      this.authConfirmPassword = '';
      this.showRegPassword.set(false);
      this.showRegConfirm.set(false);
      // Persist language choice with optional grade: null (simplifying registration)
      await this.settings.save(null, this.publicLanguage(), false, false);
      this.syncSetupState();
      await this.diary.load();
      await this.migrateLegacyDrafts();
      await this.coursesService.load();
      await this.memory.load();
      await this.scheduler.load();
      await this.chats.load();
      await this.sync.refreshCount();
      await this.loadPracticeAttempts();
      // Local work resumes only after the encrypted diary is unlocked for this student.
      void this.device.checkNano().then(() => this.resumePendingLearningTasks()).catch(() => {});
      this.showToast(
        this.activeLanguage() === 'en'
          ? 'Local account created and encrypted with AES-GCM-256!'
          : '¡Cuenta local creada y protegida con Web Crypto (AES-GCM-256)!'
      );
      this.go('inicio');
    } catch (e: unknown) {
      if (this.identity.student()) {
        await this.logout('registro');
      }
      this.authError.set(e instanceof Error ? e.message : 'Error al crear la cuenta individual.');
    } finally {
      this.authBusy.set(false);
    }
  }

  async logout(destination: 'bienvenida' | 'acceso' | 'registro' = 'bienvenida'): Promise<void> {
    // 1. Cancelar cualquier llamada de IA en curso para prevenir filtración cruzada entre cuentas
    this.topicEnrichment.resetSession();
    this.ai.resetLocalSession();
    this.translator.cancelPending();
    this.sync.clear();
    ++this.practiceGeneration;
    await this.draftWrites;

    // 2. Guardar cualquier edición de notas pendiente antes de bloquear el perfil
    if (this.noteDebounceTimer) {
      clearTimeout(this.noteDebounceTimer);
      this.noteDebounceTimer = null;
      const pendingSessionId = this.bookId();
      if (pendingSessionId && this.identity.student()) {
        await this.diary.update(pendingSessionId, { notes: this.editorNotes }).catch(() => undefined);
      }
    }

    // 3. Limpiar memoria reactiva y cifrar/bloquear estado local
    await this.chats.lock();
    await this.diary.lock();
    this.coursesService.clear();
    this.memory.clear();
    this.scheduler.clear();
    this.settings.clear();
    this.aiSummary.set(null);
    this.summaryQuechua.set(null);
    this.editorNotes = '';
    this.draftTopics.set([]);
    this.draftDoubts.set([]);
    this.draftEureka.set([]);
    this.draftRecoveryAvailable.set(false);
    this.blackboardSaveState.set('saved');
    this.dlgUnsavedNavigationOpen.set(false);
    this.pendingNavigationTarget = null;
    this.activeTopicId.set(null);
    this.topicNotesMap.set({});
    this.topicNotesLines.set(['']);
    this.topicDerivedTranslation.set({});
    this.showTopicTranslation.set({});
    this.selectedEurekaDetail.set(null);
    this.practiceSession.set(null);
    this.currentExam.set(null);
    this.currentAttempt.set(null);
    this.practiceAttemptsList.set([]);
    this.practiceState.set('CONFIG');
    this.practiceErrorMessage.set(null);
    this.userAnswers.set({});
    this.confirmFinishModalOpen.set(false);
    this.confirmExitPracticeOpen.set(false);
    this.dlgAddTopicOpen.set(false);
    this.dlgCourseOpen.set(false);
    this.dlgSessionOpen.set(false);
    this.dlgDeleteOpen.set(false);
    this.dlgCoverOpen.set(false);
    this.targetCourseForCover.set(null);
    this.notesSearchQuery.set('');
    this.filterCourse.set('all');
    this.filterDate.set('');
    this.notesFilterCourse.set('all');
    this.notesFilterDate.set('all');
    this.eurekaFilterCourse.set('all');
    this.editingDoubtText = this.editingEurekaText = this.newTopicInputName = '';
    this.editingDoubtIdx = this.editingEurekaIdx = null;
    this.corrTermEs = this.corrTransQu = this.corrSugChanka = this.corrContext = '';
    this.sessTitle = this.sessCourse = this.courseInputName = '';
    this.nanoTestMessage.set('');
    this.aiBusy.set(false);
    this.bookId.set(null);
    this.tutorSessionId.set(null);
    this.tutorInitialQuestion.set(null);
    this.newDoubtText = '';
    this.newEurekaText = '';
    this.query.set('');
    this.cloudSummaryConsent = false;
    this.syncConsentChecked = false;
    this.identity.logout();
    this.authUsername = '';
    this.authPassword = '';
    this.authConfirmPassword = '';
    this.showLoginPassword.set(false);
    this.showRegPassword.set(false);
    this.showRegConfirm.set(false);
    this.showToast(
      this.activeLanguage() === 'en'
        ? 'Signed out safely. Private data cleared from memory.'
        : 'Sesión cerrada. Datos privados retirados de memoria.'
    );
    this.go(destination);
  }

  /** Carga opcional y explícitamente etiquetada de una sesión de ejemplo para demostración. */
  async loadSampleSession(): Promise<void> {
    if (!this.identity.student()) return;
    try {
      const s = await this.diary.create(
        this.TODAY,
        'Matemática',
        '[Ejemplo] Ecuaciones de primer grado con una incógnita'
      );
      await this.diary.update(s.id, {
        notes: 'Una ecuación es una igualdad entre dos expresiones algebraicas que contiene una incógnita (por ejemplo: 2x + 4 = 10). Para despejar x, aplicamos la operación inversa en ambos miembros manteniendo el equilibrio.',
      });
      const doubt = '¿Por qué al pasar un número sumando al otro lado pasa restando?';
      await this.diary.addConcept(s.id, 'doubts', doubt);
      await this.memory.registerDoubt(s.id, s.course, s.topic, doubt);
      await this.scheduler.add(s.id, s.course, doubt);
      await this.diary.addConcept(
        s.id,
        'eureka',
        'La ecuación funciona como una balanza en equilibrio: si resto lo mismo en ambos lados, la igualdad se conserva.'
      );
      this.showToast('Sesión de ejemplo creada en tu diario.');
      this.go('libro', s.id);
    } catch (e: unknown) {
      this.showToast(e instanceof Error ? e.message : 'No se pudo crear la sesión de ejemplo.');
    }
  }

  openNewSessionModal(): void {
    this.editingSessionId = null;
    const courses = this.courseList();
    this.sessCourse = courses[0]?.name || '';
    this.sessTitle = '';
    this.sessDate = this.todayLocal();
    this.sessError.set('');
    this.dlgSessionOpen.set(true);
  }

  openEditSessionModal(s: StudySession): void {
    this.editingSessionId = s.id;
    this.sessCourse = s.course;
    this.sessTitle = s.topic;
    this.sessDate = s.date;
    this.sessError.set('');
    this.dlgSessionOpen.set(true);
  }

  closeSessionModal(): void {
    this.dlgSessionOpen.set(false);
    this.editingSessionId = null;
  }

  async saveSessionModal(): Promise<void> {
    const course = this.sessCourse.trim();
    if (!course) {
      this.sessError.set(
        this.activeLanguage() === 'en' ? 'Please select or add a course.' : 'Selecciona o añade un curso.'
      );
      return;
    }
    const date = this.sessDate || this.todayLocal();

    try {
      if (this.editingSessionId) {
        await this.diary.update(this.editingSessionId, { course, date });
        this.showToast(this.activeLanguage() === 'en' ? 'Session updated.' : 'Sesión escolar actualizada.');
      } else {
        const created = await this.diary.create(date, course);
        this.showToast(
          this.activeLanguage() === 'en'
            ? 'New session created. Write your class notes!'
            : 'Nueva sesión creada. ¡Escribe tus apuntes de clase!'
        );
        this.closeSessionModal();
        this.bookMode.set('pizarra');
        this.go('libro', created.id);
        return;
      }
      this.closeSessionModal();
    } catch (e: unknown) {
      this.sessError.set(e instanceof Error ? e.message : 'Error al guardar la sesión.');
    }
  }

  // Custom Course Modal & Actions
  openNewCourseModal(): void {
    this.editingCourseId = null;
    this.courseInputName = '';
    this.courseError.set('');
    this.dlgCourseOpen.set(true);
  }

  openEditCourseModal(course: { id?: string; name: string }): void {
    this.editingCourseId = course.id ?? null;
    this.courseInputName = course.name;
    this.courseError.set('');
    this.dlgCourseOpen.set(true);
  }

  closeCourseModal(): void {
    this.dlgCourseOpen.set(false);
    this.editingCourseId = null;
    this.courseInputName = '';
    this.courseError.set('');
  }

  async saveCourseModal(): Promise<void> {
    const name = this.courseInputName.trim();
    if (!name) {
      this.courseError.set(this.t('courseEmptyError'));
      return;
    }
    try {
      if (this.editingCourseId) {
        await this.coursesService.update(this.editingCourseId, name);
        this.showToast(this.activeLanguage() === 'en' ? 'Course updated.' : 'Curso actualizado.');
      } else {
        const newCourse = await this.coursesService.add(name);
        this.sessCourse = newCourse.name;
        this.showToast(
          this.activeLanguage() === 'en'
            ? `Course "${newCourse.name}" added.`
            : `Curso "${newCourse.name}" añadido.`
        );
      }
      this.closeCourseModal();
    } catch (e: unknown) {
      this.courseError.set(e instanceof Error ? e.message : 'Error al guardar el curso.');
    }
  }

  countSessionsForCourse(courseName: string): number {
    const clean = courseName.toLowerCase();
    return this.diary.sessions().filter(s => s.course.toLowerCase() === clean).length;
  }

  filterByCourseAndGoDiario(courseName: string): void {
    this.filterCourse.set(courseName);
    this.go('diario');
  }

  openNewSessionForCourse(courseName: string): void {
    this.editingSessionId = null;
    this.sessCourse = courseName;
    this.sessTitle = '';
    this.sessDate = this.todayLocal();
    this.sessError.set('');
    this.dlgSessionOpen.set(true);
  }

  confirmDeleteSession(id: string): void {
    this.deletingSessionId = id;
    this.dlgDeleteOpen.set(true);
  }

  closeDeleteModal(): void {
    this.dlgDeleteOpen.set(false);
    this.deletingSessionId = null;
  }

  async executeDeleteSession(): Promise<void> {
    const id = this.deletingSessionId;
    if (!id) return;
    try {
      await this.diary.remove(id);
      this.showToast(this.activeLanguage() === 'en' ? 'Session deleted.' : 'Sesión eliminada de tu biblioteca.');
      this.closeDeleteModal();
      this.go('diario');
    } catch {
      this.showToast('No se pudo eliminar la sesión.');
    }
  }

  private loadBookSession(id: string): void {
    const s = this.diary.sessions().find(item => item.id === id);
    if (s) {
      const notesMap: Record<string, string[]> = {};
      const statusMap: Record<string, string> = {};

      if (s.topics && s.topics.length > 0) {
        for (const t of s.topics) {
          const lines =
            t.notes && t.notes.length > 0
              ? [...t.notes]
              : t.originalNotesText
                ? t.originalNotesText.split('\n')
                : [''];
          notesMap[t.id] = lines.length > 0 ? lines : [''];
          statusMap[t.id] = this.t('savingStatusLocal');
        }
        const currentActive = this.activeTopicId();
        const activeT = s.topics.find(t => t.id === currentActive) || s.topics[0];
        this.activeTopicId.set(activeT.id);
        this.topicNotesLines.set(notesMap[activeT.id] || ['']);
        this.draftTopics.set(s.topics.map(t => ({ ...t })));
      } else {
        this.activeTopicId.set(null);
        this.topicNotesLines.set(['']);
        this.draftTopics.set([]);
      }

      this.topicNotesMap.set(notesMap);
      this.topicSaveStatusMap.set(statusMap);
      this.editorNotes = s.notes;
      this.topicSaveStatus.set(this.t('savingStatusLocal'));

      // Cargar dudas y eureka al borrador de la sesión
      const doubts = (s.doubts || []).map(d => ({
        text: d,
        topicId: this.getLinkedTopicId(s, 'doubts', d) || undefined,
      }));
      this.draftDoubts.set(doubts);

      const eureka = (s.eureka || []).map(e => ({
        text: e,
        topicId: this.getLinkedTopicId(s, 'eureka', e) || undefined,
      }));
      this.draftEureka.set(eureka);

      // Estado inicial confirmado
      this.blackboardSaveState.set('saved');

      // Comprobar borrador de emergencia local (crash guard)
      this.checkEmergencyDraft(id, s);

      // Pre-calentamiento no bloqueante de Gemini Nano al abrir la sesión
      if (this.device.nano() === 'available' && !this.ai.isWarm()) {
        this.ai.warmUpLocalModel().catch(() => {});
      }

      if (s.summary) {
        const structured = splitSummaryIntoParagraphsAndPoints(s.summary);
        this.aiSummary.set({
          src: this.sourceLabel(s.summarySource),
          pts: structured.paragraphs.concat(structured.keyPoints),
          paragraphs: structured.paragraphs.length > 0 ? structured.paragraphs : [cleanMarkdownToText(s.summary)],
          keyPoints: structured.keyPoints,
          rawText: s.summary,
        });
      } else {
        this.aiSummary.set(null);
      }
      this.summaryQuechua.set(s.summaryQuechua || null);
    }
  }

  sourceLabel(source?: string | null): string {
    if (source === 'ON_DEVICE') return this.t('tutorSourceLocal');
    if (source === 'IN_CLOUD') return this.t('tutorSourceCloud');
    if (source === 'ESSENTIAL' || source === 'OFFLINE_ESSENTIAL' || source === 'CURRICULUM_OFFLINE') return this.t('tutorSourceEssential');
    return this.activeLanguage() === 'en' ? 'Source unrecorded' : 'Origen sin registrar';
  }

  getTopicNotesLines(topicId: string): string[] {
    const map = this.topicNotesMap();
    if (map[topicId] && map[topicId].length > 0) {
      return map[topicId];
    }
    const s = this.activeSession();
    const t = s?.topics?.find(item => item.id === topicId);
    if (t) {
      const lines =
        t.notes && t.notes.length > 0
          ? [...t.notes]
          : t.originalNotesText
            ? t.originalNotesText.split('\n')
            : [''];
      const cached = lines.length > 0 ? lines : [''];
      map[topicId] = cached;
      return cached;
    }
    if (!map[topicId]) {
      map[topicId] = [''];
    }
    return map[topicId];
  }

  /** APUNTES-IA-VISUAL-02 */
  isTutorNoteLine(line: string): boolean {
    return isTutorStructuredNote(line);
  }

  tutorNoteEditorText(line: string): string {
    return visibleTutorNoteText(line);
  }

  onTutorNoteEditorInput(
    topicId: string,
    lineIndex: number,
    value: string,
    event: Event
  ): void {
    this.onTopicNoteLineInput(
      topicId,
      lineIndex,
      editedTutorNoteText(value),
      event
    );
  }
  getTopicSaveStatus(topicId: string): string {
    return this.topicSaveStatusMap()[topicId] || this.t('savingStatusLocal');
  }

  blackboardStatusLabel(): string {
    switch (this.blackboardSaveState()) {
      case 'unsaved':
        return this.t('statusUnsaved');
      case 'saving':
        return this.t('statusSaving');
      case 'saved':
        return this.t('statusSavedSuccessfully');
      case 'enriching':
        return this.t('statusOstrixEnriching');
      case 'updated':
        return this.t('statusLearningUpdated');
      case 'error':
        return this.t('statusSaveErrorRetry');
      default:
        return this.t('statusSavedSuccessfully');
    }
  }

  trackByTopicId(index: number, topic: Topic): string {
    return topic.id;
  }

  trackByIndex(index: number): number {
    return index;
  }

  autoExpandTextarea(event: Event): void {
    const el = event.target as HTMLTextAreaElement | null;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }

  onTopicNoteLineInput(topicId: string, index: number, val: string, event?: Event): void {
    const map = this.topicNotesMap();
    if (!map[topicId]) {
      map[topicId] = [''];
    }
    map[topicId][index] = val;

    if (!this.hasUnsavedChanges()) {
      this.blackboardSaveState.set('unsaved');
    }
    if (event) {
      this.autoExpandTextarea(event);
    }
    this.debouncedSaveEmergencyDraft();
  }

  onTopicNoteEnter(topicId: string, event: Event, index: number): void {
    const kEvent = event as KeyboardEvent;
    if (kEvent.shiftKey) {
      setTimeout(() => this.autoExpandTextarea(event), 10);
      return;
    }
    kEvent.preventDefault();
    const map = { ...this.topicNotesMap() };
    const list = [...this.getTopicNotesLines(topicId)];
    list.splice(index + 1, 0, '');
    map[topicId] = list;
    this.topicNotesMap.set(map);

    if (this.activeTopicId() === topicId) {
      this.topicNotesLines.set(list);
    }

    this.blackboardSaveState.set('unsaved');
    this.debouncedSaveEmergencyDraft();

    setTimeout(() => {
      const inputs = document.querySelectorAll(`[data-topic-id="${topicId}"] .pizarra-textarea-auto`);
      const nextInput = inputs[index + 1] as HTMLElement | null;
      nextInput?.focus();
    }, 40);
  }

  onTopicNoteBackspace(topicId: string, event: Event, index: number): void {
    const kEvent = event as KeyboardEvent;
    const map = { ...this.topicNotesMap() };
    const list = [...this.getTopicNotesLines(topicId)];
    if (list.length > 1 && (list[index] === '' || list[index] === undefined)) {
      kEvent.preventDefault();
      list.splice(index, 1);
      map[topicId] = list;
      this.topicNotesMap.set(map);

      if (this.activeTopicId() === topicId) {
        this.topicNotesLines.set(list);
      }

      this.blackboardSaveState.set('unsaved');
      this.debouncedSaveEmergencyDraft();

      setTimeout(() => {
        const inputs = document.querySelectorAll(`[data-topic-id="${topicId}"] .pizarra-textarea-auto`);
        const prevInput = inputs[Math.max(0, index - 1)] as HTMLElement | null;
        prevInput?.focus();
      }, 40);
    }
  }

  onTopicTitleChange(topicId: string, newTitle: string): void {
    const topic = this.draftTopics().find(t => t.id === topicId);
    if (topic) {
      (topic as any).name = newTitle;
    }
    if (!this.hasUnsavedChanges()) {
      this.blackboardSaveState.set('unsaved');
    }
    this.debouncedSaveEmergencyDraft();
  }

  selectTopic(topic: Topic): void {
    this.activeTopicId.set(topic.id);
    const lines = this.getTopicNotesLines(topic.id);
    this.topicNotesLines.set(lines.length > 0 ? lines : ['']);
    this.topicSaveStatus.set(this.getTopicSaveStatus(topic.id));
  }

  openAddTopicDialog(): void {
    this.addAnotherTopic();
  }

  addAnotherTopic(): void {
    const currentTopics = [...this.draftTopics()];
    const newNum = currentTopics.length + 1;
    const newTopic: Topic = {
      id: `topic-${crypto.randomUUID()}`,
      name: `Tema ${newNum}`,
      order: currentTopics.length,
      notes: [''],
      originalNotesText: '',
      enrichedExplanation: '',
      enrichedExamples: [],
      keyIdeas: [],
      commonMistakes: [],
      enrichmentStatus: 'PENDING',
      inferenceSource: null,
      contentVersion: 1,
      enrichedVersion: 0,
      contentHash: '',
      doubts: [],
      eureka: [],
      updatedAt: new Date().toISOString(),
    };

    const map = { ...this.topicNotesMap() };
    map[newTopic.id] = [''];
    this.topicNotesMap.set(map);

    this.draftTopics.set([...currentTopics, newTopic]);
    this.selectTopic(newTopic);
    this.blackboardSaveState.set('unsaved');
    this.debouncedSaveEmergencyDraft();

    setTimeout(() => {
      const titleInput = document.querySelector(`[data-topic-id="${newTopic.id}"] .pizarra-topic-input-title`) as HTMLInputElement | null;
      titleInput?.focus();
      titleInput?.select();
    }, 50);
  }

  closeAddTopicDialog(): void {
    this.dlgAddTopicOpen.set(false);
    this.newTopicInputName = '';
  }

  async saveNewTopic(): Promise<void> {
    this.addAnotherTopic();
  }

  async deleteTopic(topicId: string): Promise<void> {
    const currentTopics = this.draftTopics();
    if (currentTopics.length <= 1) {
      this.showToast(
        this.activeLanguage() === 'en'
          ? 'A session must have at least one topic.'
          : 'Una sesión debe conservar al menos un tema.'
      );
      return;
    }
    const confirmed = confirm('¿Eliminar este tema y sus apuntes de la sesión?');
    if (!confirmed) return;

    const filtered = currentTopics.filter(t => t.id !== topicId);
    this.draftTopics.set(filtered);

    const map = { ...this.topicNotesMap() };
    delete map[topicId];
    this.topicNotesMap.set(map);

    if (this.activeTopicId() === topicId && filtered.length > 0) {
      this.selectTopic(filtered[0]);
    }

    this.blackboardSaveState.set('unsaved');
    this.debouncedSaveEmergencyDraft();
    this.showToast(this.activeLanguage() === 'en' ? 'Topic removed.' : 'Tema eliminado.');
  }

  onNoteLineInput(index: number, val: string): void {
    const tid = this.activeTopicId() || (this.activeSession()?.topics[0]?.id);
    if (tid) {
      this.onTopicNoteLineInput(tid, index, val);
    }
  }

  onNoteEnter(event: Event, index: number): void {
    const tid = this.activeTopicId() || (this.activeSession()?.topics[0]?.id);
    if (tid) {
      this.onTopicNoteEnter(tid, event, index);
    }
  }

  onNoteBackspace(event: Event, index: number): void {
    const tid = this.activeTopicId() || (this.activeSession()?.topics[0]?.id);
    if (tid) {
      this.onTopicNoteBackspace(tid, event, index);
    }
  }

  onNoteKeydown(event: KeyboardEvent, index: number, topicId?: string): void {
    if (event.key === 'Enter') {
      const tid = topicId || this.activeTopicId() || (this.activeSession()?.topics[0]?.id);
      if (tid) this.onTopicNoteEnter(tid, event, index);
    } else if (event.key === 'Backspace') {
      const tid = topicId || this.activeTopicId() || (this.activeSession()?.topics[0]?.id);
      if (tid) this.onTopicNoteBackspace(tid, event, index);
    }
  }

  triggerTopicAutoSave(topicId?: string): void {
    this.blackboardSaveState.set('unsaved');
    this.debouncedSaveEmergencyDraft();
  }

  toggleBookMode(): void {
    const s = this.activeSession();
    const nextMode = this.bookMode() === 'pizarra' ? 'enriquecido' : 'pizarra';
    if (nextMode === 'enriquecido' && s) {
      this.topicEnrichment.flushPendingEnrichments(s);
    }
    this.bookMode.set(nextMode);
  }

  // Blackboard Zona B: Cosas que no entiendo (Borrador)
  addDraftDoubt(): void {
    const text = this.newDoubtText.trim();
    if (!text) return;
    const doubts = [...this.draftDoubts(), { text, topicId: this.newDoubtTopicId || undefined }];
    this.draftDoubts.set(doubts);
    this.newDoubtText = '';
    this.blackboardSaveState.set('unsaved');
    this.debouncedSaveEmergencyDraft();
    this.showToast(this.activeLanguage() === 'en' ? 'Doubt added to draft.' : 'Duda agregada a la pizarra.');
  }

  removeDraftDoubt(index: number): void {
    const doubts = this.draftDoubts().filter((_, i) => i !== index);
    this.draftDoubts.set(doubts);
    this.blackboardSaveState.set('unsaved');
    this.debouncedSaveEmergencyDraft();
  }

  startEditDoubt(index: number, text: string): void {
    this.editingDoubtIdx = index;
    this.editingDoubtText = text;
  }

  saveEditDoubt(index: number): void {
    const text = this.editingDoubtText.trim();
    if (!text) return;
    const doubts = this.draftDoubts().map((d, i) => (i === index ? { ...d, text } : d));
    this.draftDoubts.set(doubts);
    this.editingDoubtIdx = null;
    this.editingDoubtText = '';
    this.blackboardSaveState.set('unsaved');
    this.debouncedSaveEmergencyDraft();
  }

  cancelEditDoubt(): void {
    this.editingDoubtIdx = null;
    this.editingDoubtText = '';
  }

  addBlackboardDoubt(session?: StudySession): void {
    this.addDraftDoubt();
  }

  removeBlackboardDoubt(session: StudySession, index: number): void {
    this.removeDraftDoubt(index);
  }

  // Blackboard Zona C: Eureka (Borrador)
  addDraftEureka(): void {
    const text = this.newEurekaText.trim();
    if (!text) return;
    const eureka = [...this.draftEureka(), { text, topicId: this.newEurekaTopicId || undefined }];
    this.draftEureka.set(eureka);
    this.newEurekaText = '';
    this.blackboardSaveState.set('unsaved');
    this.debouncedSaveEmergencyDraft();
    this.showToast(this.activeLanguage() === 'en' ? 'Eureka breakthrough added!' : '¡Descubrimiento Eureka agregado!');
  }

  removeDraftEureka(index: number): void {
    const eureka = this.draftEureka().filter((_, i) => i !== index);
    this.draftEureka.set(eureka);
    this.blackboardSaveState.set('unsaved');
    this.debouncedSaveEmergencyDraft();
  }

  startEditEureka(index: number, text: string): void {
    this.editingEurekaIdx = index;
    this.editingEurekaText = text;
  }

  saveEditEureka(index: number): void {
    const text = this.editingEurekaText.trim();
    if (!text) return;
    const eureka = this.draftEureka().map((e, i) => (i === index ? { ...e, text } : e));
    this.draftEureka.set(eureka);
    this.editingEurekaIdx = null;
    this.editingEurekaText = '';
    this.blackboardSaveState.set('unsaved');
    this.debouncedSaveEmergencyDraft();
  }

  cancelEditEureka(): void {
    this.editingEurekaIdx = null;
    this.editingEurekaText = '';
  }

  addBlackboardEureka(session?: StudySession): void {
    this.addDraftEureka();
  }

  removeBlackboardEureka(session: StudySession, index: number): void {
    this.removeDraftEureka(index);
  }

  // GUARDADO EXPLÍCITO PRINCIPAL
  async saveBlackboardExplicit(): Promise<void> {
    const sessionId = this.bookId();
    const session = this.activeSession();
    if (!sessionId || !session) return;

    if (!this.hasUnsavedChanges()) {
      this.showToast(this.activeLanguage() === 'en' ? 'All changes are already saved.' : 'Todo el contenido ya está guardado.');
      return;
    }

    const revision = this.draftRevision;
    const owner = this.identity.student();
    this.blackboardSaveState.set('saving');

    try {
      const changedTopicIds: string[] = [];
      const draftTopicsList = this.draftTopics();

      const updatedTopics: Topic[] = draftTopicsList.map((dt, idx) => {
        const orig = session.topics.find(t => t.id === dt.id);
        const rawLines = this.getTopicNotesLines(dt.id);
        const joinedNotes = rawLines.join('\n');
        const hash = computeSimpleHash(joinedNotes);

        if (!orig) {
          if (joinedNotes.trim().length > 0) {
            changedTopicIds.push(dt.id);
          }
          return {
            ...dt,
            order: idx,
            notes: rawLines,
            originalNotesText: joinedNotes,
            contentHash: hash,
            contentVersion: 1,
            enrichmentStatus: 'PENDING',
            updatedAt: new Date().toISOString(),
          };
        }

        const textChanged = joinedNotes !== orig.originalNotesText;
        const nameChanged = dt.name !== orig.name;

        if (textChanged || nameChanged) {
          if (joinedNotes.trim().length > 0) {
            changedTopicIds.push(dt.id);
          }
          return {
            ...orig,
            name: dt.name,
            order: idx,
            notes: rawLines,
            originalNotesText: joinedNotes,
            contentHash: hash,
            contentVersion: orig.contentVersion + 1,
            enrichmentStatus: 'OUTDATED',
            updatedAt: new Date().toISOString(),
          };
        }

        return {
          ...orig,
          order: idx,
        };
      });

      const doubtsStrings = this.draftDoubts().map(d => d.text);
      const eurekaStrings = this.draftEureka().map(e => e.text);

      const saved = await this.diary.saveFullSession(sessionId, {
        topics: updatedTopics,
        doubts: doubtsStrings,
        eureka: eurekaStrings,
      });

      if (owner !== this.identity.student() || sessionId !== this.bookId() || revision !== this.draftRevision) return;
      await this.clearEmergencyDraft(sessionId);
      if (revision !== this.draftRevision || owner !== this.identity.student() || sessionId !== this.bookId()) return;
      this.blackboardSaveState.set('saved');
      this.showToast(this.t('statusSavedSuccessfully'));

      const doubtsOrEurekaChanged =
        JSON.stringify(doubtsStrings) !== JSON.stringify(session.doubts || []) ||
        JSON.stringify(eurekaStrings) !== JSON.stringify(session.eureka || []);

      // Iniciar enriquecimiento automático para temas modificados y/o dudas y descubrimientos
      if (changedTopicIds.length > 0 || doubtsOrEurekaChanged) {
        const studentProfile = this.settings.profile();
        const nanoReady = this.isNanoAvailable();
        const cloudAllowed = studentProfile.allowCloudEnrichment && !studentProfile.offlineOnly;

        if (studentProfile.autoEnrichNotes && (nanoReady || cloudAllowed)) {
          this.blackboardSaveState.set('enriching');
          await this.topicEnrichment.triggerSaveEnrichment(saved, changedTopicIds);

          const checkDoneInterval = setInterval(() => {
            if (!this.topicEnrichment.isQueueActive() && !this.topicEnrichment.isEnriching()) {
              clearInterval(checkDoneInterval);
              if (this.blackboardSaveState() === 'enriching') {
                this.blackboardSaveState.set('updated');
                setTimeout(() => {
                  if (this.blackboardSaveState() === 'updated') {
                    this.blackboardSaveState.set('saved');
                  }
                }, 3500);
              }
            }
          }, 400);
        } else if (!nanoReady && !cloudAllowed) {
          this.showToast(
            this.activeLanguage() === 'en'
              ? 'Notes saved. Enrichment pending (no AI engine available).'
              : 'Apuntes guardados. Enriquecimiento pendiente (sin motor de IA disponible).'
          );
        }
      }
    } catch {
      this.blackboardSaveState.set('error');
      this.showToast(this.t('statusSaveErrorRetry'));
    }
  }

  private async migrateLegacyDrafts(): Promise<void> {
    const student = this.identity.student();
    if (!student) return;
    const prefix = 'ostrix_draft_' + student.id + '_';
    for (const key of Object.keys(localStorage).filter(k => k.startsWith(prefix))) {
      if (this.identity.student() !== student) return;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const id = key.slice(prefix.length);
        const legacy: BlackboardDraft = JSON.parse(raw);
        const encrypted = await this.identity.read<BlackboardDraft>('editdrafts', id);
        if (this.identity.student() !== student) return;
        if (!encrypted || encrypted.timestamp < legacy.timestamp) {
          await this.identity.save('editdrafts', id, legacy);
        }
        if (localStorage.getItem(key) === raw) localStorage.removeItem(key);
      } catch {
        this.showToast(this.activeLanguage() === 'en' ? 'An older draft could not be secured. Unlock again to retry.' : 'Un borrador antiguo sigue pendiente de cifrado. Vuelve a iniciar sesión para reintentar.');
      }
    }
  }

  private async checkEmergencyDraft(sessionId: string, session: StudySession): Promise<void> {
    const owner = this.identity.student();
    this.draftRecoveryAvailable.set(false);
    await this.draftWrites;
    if (owner !== this.identity.student() || !owner) return;
    const draft = await this.identity.read<BlackboardDraft>('editdrafts', sessionId).catch(() => undefined);
    if (owner === this.identity.student() && sessionId === this.bookId() && !this.hasUnsavedChanges()) {
      this.draftRecoveryAvailable.set(!!draft && draft.timestamp > Date.parse(session.updatedAt));
    }
  }

  async recoverEmergencyDraft(): Promise<void> {
    const id = this.bookId();
    const owner = this.identity.student();
    if (!id || !owner) return;
    const draft = await this.identity.read<BlackboardDraft>('editdrafts', id);
    if (!draft || owner !== this.identity.student() || id !== this.bookId()) return;
    this.draftTopics.set(draft.topics);
    this.topicNotesMap.set(Object.fromEntries(draft.topics.map(t => [t.id, [...t.notes]])));
    this.draftDoubts.set(draft.doubts);
    this.draftEureka.set(draft.eureka);
    this.blackboardSaveState.set('unsaved');
    this.draftRecoveryAvailable.set(false);
  }

  async discardEmergencyDraft(): Promise<void> {
    const id = this.bookId();
    if (id) await this.clearEmergencyDraft(id);
    this.draftRecoveryAvailable.set(false);
  }

  private debouncedSaveEmergencyDraft(): void {
    const id = this.bookId();
    const owner = this.identity.student();
    if (!id || !owner) return;
    const revision = ++this.draftRevision;
    const draft: BlackboardDraft = {
      timestamp: Date.now(),
      topics: this.draftTopics().map(t => ({ ...t, notes: [...this.getTopicNotesLines(t.id)] })),
      doubts: [...this.draftDoubts()],
      eureka: [...this.draftEureka()],
    };
    this.draftWrites = this.draftWrites.then(async () => {
      if (owner === this.identity.student()) await this.identity.save('editdrafts', id, draft);
    }).catch(() => {
      if (revision === this.draftRevision && owner === this.identity.student() && id === this.bookId()) {
        this.blackboardSaveState.set('error');
        this.showToast(this.t('statusSaveErrorRetry'));
      }
    });
  }

  private clearEmergencyDraft(sessionId: string): Promise<void> {
    const owner = this.identity.student();
    const deletion = this.draftWrites.then(async () => {
      if (owner && owner === this.identity.student()) await this.identity.delete('editdrafts', sessionId);
    });
    this.draftWrites = deletion.catch(() => {});
    return deletion;
  }

  getLinkedTopicName(session: StudySession, collection: 'doubts' | 'eureka', text: string): string | null {
    if (!session || !session.topics) return null;
    const match = session.topics.find(t => (t[collection] || []).includes(text));
    if (!match) return null;
    // Existing quick-note titles can be long and unclear. Compact display only; stored title unchanged.
    if (/^Nota rápida:/iu.test(match.name)) {
      return suggestedTopicTitle(match.name.replace(/^Nota rápida:\s*/iu, '')) ?? match.name;
    }
    return match.name;
  }

  getLinkedTopicId(session: StudySession, collection: 'doubts' | 'eureka', text: string): string | null {
    if (!session || !session.topics) return null;
    const match = session.topics.find(t => (t[collection] || []).includes(text));
    return match ? match.id : null;
  }

  async enrichTopicAction(topic: Topic, forceLocalNano = false): Promise<void> {
    const s = this.activeSession();
    if (!s) return;
    try {
      this.showToast(
        this.activeLanguage() === 'en'
          ? 'Enriching topic with AI...'
          : 'Generando contenido enriquecido con IA...'
      );
      const ok = await this.topicEnrichment.enrichTopic(s, topic, {
        useCloud: this.cloudSummaryConsent && !this.settings.profile().offlineOnly,
        forceLocalNano,
      });
      if (ok) {
        this.showToast(this.activeLanguage() === 'en' ? 'Topic enriched!' : '¡Tema enriquecido con éxito!');
      } else {
        this.showToast(
          this.activeLanguage() === 'en'
            ? 'Enrichment postponed (notes were modified).'
            : 'Enriquecimiento pospuesto (se detectaron cambios en apuntes).'
        );
      }
    } catch (e: unknown) {
      this.showToast(e instanceof Error ? e.message : 'Error al procesar el enriquecimiento.');
    }
  }

  openCoverModal(course: StudentCourse): void {
    this.targetCourseForCover.set(course);
    this.dlgCoverOpen.set(true);
  }

  closeCoverModal(): void {
    this.dlgCoverOpen.set(false);
    this.targetCourseForCover.set(null);
  }

  async selectCourseCover(coverId: string): Promise<void> {
    const target = this.targetCourseForCover();
    if (!target) return;
    try {
      await this.coursesService.setCover(target.id, coverId);
      this.closeCoverModal();
      this.showToast(
        this.activeLanguage() === 'en' ? 'Course cover updated.' : 'Portada del curso actualizada.'
      );
    } catch (e: unknown) {
      this.showToast(e instanceof Error ? e.message : 'Error al cambiar portada.');
    }
  }

  getCourseCoverObj(courseName: string, coverId?: string): CourseCover {
    return matchCourseCover(courseName, coverId);
  }

  safeSvg(svgMarkup: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(svgMarkup);
  }

  onNotesInput(val: string): void {
    this.editorNotes = val;
    this.saveStatus.set(this.activeLanguage() === 'en' ? 'Saving...' : 'Guardando...');
    if (this.noteDebounceTimer) clearTimeout(this.noteDebounceTimer);
    const editSessionId = this.bookId();
    const ownerStudentId = this.identity.student()?.id;
    this.noteDebounceTimer = setTimeout(async () => {
      if (editSessionId && this.identity.student()?.id === ownerStudentId) {
        await this.diary.update(editSessionId, { notes: this.editorNotes });
        this.saveStatus.set(
          this.activeLanguage() === 'en' ? 'Saved in encrypted notebook' : 'Guardado en tu cuaderno cifrado'
        );
      }
    }, 600);
  }

  formatEditor(cmd: string): void {
    document.execCommand(cmd, false);
  }

  async addBookDoubt(): Promise<void> {
    const s = this.activeSession();
    const text = this.newDoubtText.trim();
    if (!s || !text) return;
    try {
      await this.diary.addConcept(s.id, 'doubts', text);
      await this.memory.registerDoubt(s.id, s.course, s.topic, text);
      await this.scheduler.add(s.id, s.course, text);
      this.newDoubtText = '';
      this.showToast(
        this.activeLanguage() === 'en'
          ? 'Doubt saved and scheduled for SM-2 review.'
          : 'Duda guardada. Programada para repaso adaptativo SM-2.'
      );
    } catch {
      this.showToast('Error al registrar la duda.');
    }
  }

  async addBookEureka(): Promise<void> {
    const s = this.activeSession();
    const text = this.newEurekaText.trim();
    if (!s || !text) return;
    try {
      await this.diary.addConcept(s.id, 'eureka', text);
      this.newEurekaText = '';
      this.showToast(this.activeLanguage() === 'en' ? 'Eureka moment saved!' : '¡Descubrimiento Eureka guardado!');
    } catch {
      this.showToast('Error al registrar Eureka.');
    }
  }

  goToBlackboardTopic(topicId?: string): void {
    this.bookMode.set('pizarra');
    if (topicId) {
      setTimeout(() => {
        const el = document.querySelector(`[data-topic-id="${topicId}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
  }

  goToBlackboardDoubts(): void {
    this.bookMode.set('pizarra');
    setTimeout(() => {
      const el = document.querySelector('.pizarra-dudas-col');
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const inp = document.querySelector('.pizarra-dudas-col input') as HTMLInputElement | null;
      inp?.focus();
    }, 50);
  }

  goToBlackboardEureka(): void {
    this.bookMode.set('pizarra');
    setTimeout(() => {
      const el = document.querySelector('.pizarra-eureka-full');
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const inp = document.querySelector('.pizarra-eureka-full input') as HTMLInputElement | null;
      inp?.focus();
    }, 50);
  }

  getEnrichedDoubt(session: StudySession, doubtText: string): EnrichedDoubtItem | undefined {
    if (session.enrichedDoubts && session.enrichedDoubts.length > 0) {
      const found = session.enrichedDoubts.find(
        d => d.doubtText.trim().toLowerCase() === doubtText.trim().toLowerCase()
      );
      if (found) return found;
    }
    const mem = this.memory.concepts().find(
      c => c.sessionId === session.id && c.conceptText.trim().toLowerCase() === doubtText.trim().toLowerCase()
    );
    if (mem && mem.explanation) {
      return {
        doubtText,
        explanation: mem.explanation,
        status: 'UP_TO_DATE',
        inferenceSource: mem.explanationSource === 'CURRICULUM_OFFLINE' ? 'OFFLINE_ESSENTIAL' : (mem.explanationSource as any),
      };
    }
    return undefined;
  }

  getEnrichedEureka(session: StudySession, eurekaText: string): EnrichedEurekaItem | undefined {
    if (session.enrichedEureka && session.enrichedEureka.length > 0) {
      return session.enrichedEureka.find(
        e => e.eurekaText.trim().toLowerCase() === eurekaText.trim().toLowerCase()
      );
    }
    return undefined;
  }

  async markDoubtUnderstood(session: StudySession, doubtText: string): Promise<void> {
    await this.saveDoubtStatus(session, doubtText, 'MASTERED', this.DST()[3]);
  }

  private async saveDoubtStatus(session: StudySession, text: string, status: ConceptStatus, feedback: string): Promise<void> {
    const owner = this.identity.student();
    if (!owner) return;
    try {
      const concept = await this.memory.registerDoubt(session.id, session.course, session.topic, text);
      if (this.identity.student() !== owner) return;
      const record = await this.identity.readVersion<ConceptMemory>('memory', concept.id);
      if (this.identity.student() !== owner) return;
      if (!record) throw new Error('Concepto no encontrado.');
      const updated = { ...record.value, status, updatedAt: new Date().toISOString() };
      await this.identity.save('memory', concept.id, updated, record.nonce);
      if (this.identity.student() !== owner) return;
      this.memory.concepts.update(items => items.map(c => c.id === concept.id ? updated : c));
      this.showToast(feedback);
    } catch {
      if (this.identity.student() === owner) this.showToast(this.t('statusSaveErrorRetry'));
    }
  }

  hasMatchingExercise(doubtText: string): boolean {
    const s = this.activeSession();
    const course = s?.course || 'General';
    const exercises = findMatchingExercises(course, doubtText, undefined, 3, true);
    return exercises.length > 0;
  }

  practiceDoubt(doubtText: string): void {
    const s = this.activeSession();
    this.openTutor(s?.id || null, `Practiquemos ejercicios sobre: ${doubtText}`, 'practice');
  }

  async advanceDoubtStatus(doubt: FlatDoubt): Promise<void> {
    const nextSt = (doubt.st + 1) % 4;
    const statuses = ['PENDING', 'EXPLAINED', 'TESTED', 'MASTERED'] as const;
    await this.saveDoubtStatus(doubt.session, doubt.t, statuses[nextSt], this.DST()[nextSt]);
  }

  async rateReviewCard(card: ReviewCard, rating: 0 | 1 | 2): Promise<void> {
    if (!this.identity.student() || !this.reviewCards().includes(card)) return;
    try {
      await this.scheduler.rate(card.id, rating);
      this.showToast(
        this.activeLanguage() === 'en'
          ? 'Review interval updated!'
          : '¡Intervalo de repaso actualizado!'
      );
    } catch (e: unknown) {
      this.showToast(e instanceof Error ? e.message : 'Error al evaluar repaso.');
    }
  }

  private readonly gradingReviews = new Set<string>();
  async answerReview(review: FlatReview, optionIndex: number): Promise<void> {
    const ex = EXERCISE_CATALOG.find(item => item.id === review.id);
    const s = this.diary.sessions().find(item => item === review.session);
    if (!s || !ex || !this.allReviews().some(r => r.session.id === s.id && r.id === ex.id && r.done === null)) return;
    const key = s.id + ':' + ex.id;
    if (this.gradingReviews.has(key)) return;
    this.gradingReviews.add(key);
    const owner = this.identity.student();
    try {
      await this.submitReviewOption(ex, optionIndex, s);
    } catch {
      if (owner === this.identity.student()) this.showToast(this.t('statusSaveErrorRetry'));
    } finally { this.gradingReviews.delete(key); }
  }

  async submitReviewOption(ex: CurriculumExercise, optionIndex: number, s = this.activeSession()): Promise<void> {
    const owner = this.identity.student();
    if (!owner || !s || !this.diary.sessions().includes(s) || !ex.options?.[optionIndex]) return;
    const grade = this.settings.profile().grade;

    const linkedConcept = await this.memory.registerDoubt(s.id, s.course, ex.topic, ex.question);
    if (owner !== this.identity.student()) return;
    const evalResult = await this.memory.submitAnswer(linkedConcept.id, ex.id, optionIndex, grade);
    if (owner !== this.identity.student()) return;

    if (evalResult.isCorrect) {
      this.showToast(
        this.activeLanguage() === 'en'
          ? `Correct! Next SM-2 review scheduled for ${evalResult.nextReviewDate}.`
          : `¡Correcto! Próximo repaso SM-2 programado para el ${evalResult.nextReviewDate}.`
      );
    } else {
      this.showToast(
        this.activeLanguage() === 'en'
          ? `Needs reinforcement. Scheduled for ${evalResult.nextReviewDate}.`
          : `Respuesta para reforzar. Se repasará el ${evalResult.nextReviewDate}.`
      );
    }
  }

  async generateAiSummary(forceStrictLocal = false): Promise<void> {
    const s = this.activeSession();
    const ownerStudentId = this.identity.student()?.id;
    if (!s || !ownerStudentId) return;

    this.aiBusy.set(true);
    try {
      const memoryContext = this.memory.buildContextForPrompt(s.course, s.topic);
      const isEn = this.activeLanguage() === 'en';
      const prompt = isEn
        ? `SUBJECT: ${s.course}. TOPIC: ${s.topic}.\n` +
          `Write a faithful, high-quality study summary for a secondary school student based ONLY on the notes below.\n` +
          `STRICT FORMAT AND LENGTH RULES:\n` +
          `1. Length: between 60 and 100 words in one cohesive paragraph or two short paragraphs.\n` +
          `2. Do NOT use markdown headings (no '##').\n` +
          `3. Do NOT use bold asterisks ('**').\n` +
          `4. Do NOT format every sentence as a bullet point.\n` +
          `5. Rely strictly on facts in notes; do not fabricate facts.\n\n` +
          `STUDENT NOTES:\n${this.editorNotes.slice(0, 4000)}\n${memoryContext}`
        : `CURSO: ${s.course}. TEMA: ${s.topic}.\n` +
          `Redacta un resumen escolar riguroso y claro para secundaria rural basado ÚNICAMENTE en los siguientes apuntes.\n` +
          `REGLAS ESTRICTAS DE FORMATO Y EXTENSIÓN:\n` +
          `1. Longitud: exactamente entre 60 y 100 palabras en un texto continuo o dos párrafos breves.\n` +
          `2. No uses títulos ni encabezados con numerales (nada de '##').\n` +
          `3. No uses asteriscos dobles ('**') para negrita.\n` +
          `4. No redactes cada frase como una viñeta separada.\n` +
          `5. No inventes hechos no presentes en los apuntes.\n\n` +
          `APUNTES DEL ESTUDIANTE:\n${this.editorNotes.slice(0, 4000)}\n${memoryContext}`;

      const allowCloud = this.cloudSummaryConsent && !this.settings.profile().offlineOnly;


      const result = forceStrictLocal
        ? await this.ai.generateStrictLocal(prompt, false, { rawPrompt: true, saveInOutbox: false })
        : await this.ai.processPromptDetailed(prompt, false, { rawPrompt: true, allowEssentialFallback: true, saveInOutbox: false, cloudConsent: allowCloud });

      if (this.identity.student()?.id !== ownerStudentId) return;

      const structured = splitSummaryIntoParagraphsAndPoints(result.text);
      this.aiSummary.set({
        src: result.source === 'ON_DEVICE'
          ? this.t('tutorSourceLocal')
          : result.source === 'IN_CLOUD'
            ? this.t('tutorSourceCloud')
            : this.t('tutorSourceEssential'),
        pts: structured.paragraphs.concat(structured.keyPoints),
        paragraphs: structured.paragraphs.length > 0 ? structured.paragraphs : [cleanMarkdownToText(result.text)],
        keyPoints: structured.keyPoints,
        rawText: result.text,
        latencyMs: result.latencyMs,
        timeToFirstChunkMs: result.timeToFirstChunkMs,
      });

      await this.diary.update(s.id, { summary: result.text, summarySource: result.source });
      this.tab.set('resumen');
      const ttfbInfo = result.timeToFirstChunkMs ? ` · TTFB: ${result.timeToFirstChunkMs} ms` : '';
      this.showToast(`${result.source} (${result.latencyMs} ms${ttfbInfo})`);
    } catch (e: unknown) {
      if (this.identity.student()?.id !== ownerStudentId) return;
      this.showToast(e instanceof Error ? e.message : this.ui('Error en la generación de IA.', 'AI generation failed.'));
    } finally {
      this.aiBusy.set(false);
    }
  }

  async translateSummaryToQuechua(): Promise<void> {
    const summ = this.aiSummary();
    const s = this.activeSession();
    if (!summ || !s) return;
    this.aiBusy.set(true);
    try {
      const owner = this.identity.student();
      const qu = await this.translator.spanishToQuechua(summ.rawText, this.settings.profile().allowCloudEnrichment);
      if (!owner || owner !== this.identity.student() || s.id !== this.bookId()) return;
      this.summaryQuechua.set(qu);
      await this.diary.update(s.id, { summaryQuechua: qu });
      this.showToast(this.ui('Traducción al quechua (qu) guardada para lectura offline.', 'Quechua translation saved for offline reading.'));
    } catch (e: unknown) {
      this.showToast(e instanceof Error ? e.message : 'Error en la traducción.');
    } finally {
      this.aiBusy.set(false);
    }
  }

  syncSetupState(): void {
    const p = this.settings.profile();
    this.setupGrade = p.grade;
    this.setupLanguage = p.language;
    this.publicLanguage.set(p.language);
    this.setupSeparateScience = p.scienceSeparate;
    this.setupOfflineOnly = p.offlineOnly ?? false;
    this.setupAutoEnrichNotes = p.autoEnrichNotes ?? true;
    this.setupAllowCloudEnrichment = p.allowCloudEnrichment ?? false;
    this.setupAutoInjectSessionContext = p.autoInjectSessionContext ?? true;
    this.syncConsentChecked = this.sync.getSyncConsent();
  }

  async saveSettings(): Promise<void> {
    try {
      const g = (this.setupGrade === null || this.setupGrade === undefined || (this.setupGrade as any) === 'null' || (this.setupGrade as any) === '')
        ? null
        : (Number(this.setupGrade) as Grade);
      if (this.setupOfflineOnly) this.setupAllowCloudEnrichment = false;
      if (this.setupOfflineOnly || !this.setupAllowCloudEnrichment) {
        this.cloudSummaryConsent = false;
        this.ai.revokeCloudConsent();
        this.translator.cancelPending();
      }
      await this.settings.save(
        g,
        this.setupLanguage,
        this.setupSeparateScience,
        this.setupOfflineOnly,
        this.setupAutoEnrichNotes,
        this.setupAllowCloudEnrichment,
        this.setupAutoInjectSessionContext
      );
      this.publicLanguage.set(this.setupLanguage);
      this.showToast(this.activeLanguage() === 'en' ? 'Settings saved.' : 'Configuración guardada.');
    } catch {
      this.showToast(this.ui('No se pudo guardar la configuración.', 'Could not save settings.'));
    }
  }

  async linkSchoolAccount(): Promise<void> {
    try {
      await this.sync.linkSchoolAccount();
      this.showToast(this.activeLanguage() === 'en' ? 'School account linked.' : 'Cuenta escolar vinculada.');
    } catch (err) {
      this.showToast(err instanceof Error ? err.message : this.t('statusSaveErrorRetry'));
    }
  }

  onSyncConsentChange(val: boolean): void {
    this.syncConsentChecked = val;
    this.sync.setSyncConsent(val);
  }

  async triggerSyncWithFlask(): Promise<void> {
    try {
      await this.sync.flush();
      this.showToast(this.ui('Diario sincronizado con el servidor escolar.', 'Journal synced with the school server.'));
    } catch (e: unknown) {
      this.showToast(e instanceof Error ? e.message : 'Error al sincronizar con el servidor.');
    }
  }

  async exportJsonBackup(): Promise<void> {
    const owner = this.identity.student();
    if (!owner) return;
    try {
      const json = await this.diary.exportJson();
      if (owner !== this.identity.student()) return;
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ostrixai-respaldo-${this.todayLocal()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast(this.activeLanguage() === 'en' ? 'Backup exported.' : 'Copia de seguridad descargada.');
    } catch {
      this.showToast(this.ui('Error al exportar los apuntes.', 'Unable to export notes.'));
    }
  }

  async submitCorrection(): Promise<void> {
    if (!this.corrTermEs || !this.corrSugChanka) {
      this.showToast(this.ui('Completa el término en español y la sugerencia en Quechua.', 'Enter the Spanish term and the Quechua suggestion.'));
      return;
    }
    try {
      await this.translator.submitCorrection(
        this.corrTermEs,
        this.corrTransQu || this.corrTermEs,
        this.corrSugChanka,
        this.corrContext
      );
      this.corrSuccess.set(true);
      this.corrTermEs = '';
      this.corrTransQu = '';
      this.corrSugChanka = '';
      this.corrContext = '';
      this.showToast(this.ui('Sugerencia lingüística registrada para validación docente EIB.', 'Language suggestion submitted for teacher review.'));
    } catch (e: unknown) {
      this.showToast(e instanceof Error ? e.message : 'Error al enviar la sugerencia.');
    }
  }

  /** Prueba real de Gemini Nano por Firebase AI Logic, activada desde Configuración. */
  async probarNano(): Promise<void> {
    if (this.nanoTestBusy() || this.ai.isBusy()) return;
    this.nanoTestBusy.set(true);
    this.nanoTestMessage.set('Inicializando Gemini Nano local...');
    try {
      const prompts = ['¿Cuánto es dos más dos? Responde con un número.',
        '¿Qué número sigue a doce? Responde con un número.', 'Escribe el doble de siete usando un número.'];
      const result = await this.ai.testNanoOnlyOnDevice(prompts[this.nanoDiagnosticIndex++ % prompts.length]);
      if (result.source !== 'ON_DEVICE') {
        throw new Error('Firebase no confirmó el origen ON_DEVICE.');
      }
      this.nanoTestMessage.set(`PRUEBA CORRECTA: ${result.source} en ${result.latencyMs} ms. Respuesta: ${result.text}`);
      console.log('[OSTRIX-NANO] Origen verificado:', result.source);

      console.log('[OSTRIX-NANO] Duración:', result.latencyMs, 'ms');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.nanoTestMessage.set(`PRUEBA FALLIDA: ${message}`);

    } finally {
      this.nanoTestBusy.set(false);
    }
  }

  async prepareNano(): Promise<void> {
    this.aiBusy.set(true);
    try {
      await this.ai.prepareLocalModel();
      await this.device.checkNano();
      this.showToast(
        this.device.nano() === 'available'
          ? 'Gemini Nano preparado. Verifica ahora una respuesta ON_DEVICE.'
          : `Preparación completada; estado actual: ${this.device.nano()}.`
      );
    } catch (e: unknown) {
      this.showToast(e instanceof Error ? e.message : 'No se pudo preparar Gemini Nano.');
    } finally {
      this.aiBusy.set(false);
    }
  }

  displayAcademicText(text: string | null | undefined): string {
    return cleanMarkdownToText(text ?? '');
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    try {
      const d = new Date(`${dateStr}T12:00:00`);
      return d.toLocaleDateString(this.activeLanguage() === 'en' ? 'en-US' : 'es-PE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
    } catch {
      return dateStr;
    }
  }

  // =========================================================================
  // MISIÓN B — PRACTICAR PARA EXAMEN INTERACTIVO
  // =========================================================================

  startExamPractice(session: StudySession): void {
    this.practiceSession.set(session);
    this.bookId.set(session.id);
    this.practiceState.set('CONFIG');
    this.currentExam.set(null);
    this.currentQuestionIndex.set(0);
    this.userAnswers.set({});
    this.currentAttempt.set(null);
    this.practiceErrorMessage.set(null);
    this.confirmFinishModalOpen.set(false);
    this.confirmExitPracticeOpen.set(false);
    this.go('practica', session.id);
  }

  setPracticeCount(count: 5 | 10): void {
    this.practiceConfig.update(c => ({ ...c, count }));
  }

  setPracticeDifficulty(difficulty: 'BASIC' | 'INTERMEDIATE' | 'ADVANCED'): void {
    this.practiceConfig.update(c => ({ ...c, difficulty }));
  }

  setPracticeType(type: 'MIXED' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE'): void {
    this.practiceConfig.update(c => ({ ...c, type }));
  }

  async beginPracticeGeneration(): Promise<void> {
    const session = this.practiceSession();
    if (!session) return;
    const generation = ++this.practiceGeneration;
    const owner = this.identity.student();
    this.practiceState.set('GENERATING');
    this.practiceStartTime.set(performance.now());
    this.practiceErrorMessage.set(null);

    try {
      const allowCloud = Boolean(this.settings.profile().allowCloudEnrichment);
      const exam = await this.practiceExam.generateExam(session, {
        ...this.practiceConfig(),
        allowCloud,
      });
      if (generation !== this.practiceGeneration || owner !== this.identity.student()) return;
      if (!exam || !exam.questions || exam.questions.length === 0) {
        throw new Error(
          this.activeLanguage() === 'en'
            ? 'Could not generate questions for this session.'
            : 'No se pudieron formular preguntas pedagógicas para esta sesión.'
        );
      }
      this.currentExam.set(exam);
      this.currentQuestionIndex.set(0);
      this.userAnswers.set({});
      this.attemptId = crypto.randomUUID();
    this.examStartTime.set(Date.now());
      this.practiceState.set('ACTIVE');
    } catch (e: any) {
      if (generation !== this.practiceGeneration || owner !== this.identity.student()) return;
      this.practiceErrorMessage.set(
        e?.message ||
          (this.activeLanguage() === 'en' ? 'Error generating exam practice.' : 'Error al generar la práctica.')
      );
      this.practiceState.set('CONFIG');
    } finally {
      this.practiceStartTime.set(null);
    }
  }

  cancelPracticeExamGeneration(): void {
    ++this.practiceGeneration;
    this.ai.cancelActiveRequest();
    this.practiceState.set('CONFIG');
    this.practiceStartTime.set(null);
    this.showToast(this.activeLanguage() === 'en' ? 'Generation cancelled.' : 'Generación cancelada.');
  }

  async toggleTopicDerivedTranslation(topicId: string): Promise<void> {
    const owner = this.identity.student();
    const session = this.bookId();
    if (!owner || !session) return;
    const curShow = { ...this.showTopicTranslation() };
    curShow[topicId] = !curShow[topicId];
    this.showTopicTranslation.set(curShow);

    if (curShow[topicId] && !this.topicDerivedTranslation()[topicId]) {
      const lines = this.getTopicNotesLines(topicId);
      const fullText = lines.join('\n');
      if (!fullText.trim()) return;
      try {
        const derived = await this.translator.translateDerivedText(
          topicId,
          fullText,
          'es',
          this.activeLanguage(),
          this.setupAllowCloudEnrichment && !this.setupOfflineOnly
        );
        if (owner !== this.identity.student() || session !== this.bookId()) return;
        this.topicDerivedTranslation.update(map => ({
          ...map,
          [topicId]: derived.translatedText,
        }));
      } catch (e: any) {
        if (owner !== this.identity.student() || session !== this.bookId()) return;
        this.showToast(e?.message || 'Error al traducir apunte.');
      }
    }
  }

  selectExamAnswer(questionId: string, optionIndex: number): void {
    this.userAnswers.update(curr => ({
      ...curr,
      [questionId]: optionIndex,
    }));
  }

  nextExamQuestion(): void {
    const exam = this.currentExam();
    if (!exam) return;
    if (this.currentQuestionIndex() < exam.questions.length - 1) {
      this.currentQuestionIndex.update(i => i + 1);
    }
  }

  prevExamQuestion(): void {
    if (this.currentQuestionIndex() > 0) {
      this.currentQuestionIndex.update(i => i - 1);
    }
  }

  goToExamQuestion(index: number): void {
    const exam = this.currentExam();
    if (!exam || index < 0 || index >= exam.questions.length) return;
    this.currentQuestionIndex.set(index);
  }

  requestFinishExam(): void {
    if (this.examUnansweredCount() > 0) {
      this.confirmFinishModalOpen.set(true);
    } else {
      this.completeExam();
    }
  }

  confirmFinishNow(): void {
    this.confirmFinishModalOpen.set(false);
    this.completeExam();
  }

  cancelFinishModal(): void {
    this.confirmFinishModalOpen.set(false);
  }

  async completeExam(): Promise<void> {
    const exam = this.currentExam();
    const owner = this.identity.student();
    if (!exam || !owner || this.finishingAttempt || this.practiceState() !== 'ACTIVE') return;
    this.finishingAttempt = true;
    const seconds = Math.max(1, Math.round((Date.now() - this.examStartTime()) / 1000));
    try {
      const attempt = await this.practiceExam.createAndSaveAttempt(exam, this.userAnswers(), seconds, this.attemptId);
      if (this.identity.student() !== owner || this.currentExam() !== exam) return;
      this.currentAttempt.set(attempt);
      this.practiceState.set('RESULTS');
      await this.loadPracticeAttempts();
    } catch {
      if (this.identity.student() === owner) this.showToast(this.activeLanguage() === 'en' ? 'Could not save results. Try again.' : 'No se pudo registrar el resultado. Reintenta.');
    } finally {
      this.finishingAttempt = false;
    }
  }

  restartPractice(): void {
    const exam = this.currentExam();
    if (!exam) {
      this.beginPracticeGeneration();
      return;
    }
    this.currentQuestionIndex.set(0);
    this.userAnswers.set({});
    this.attemptId = crypto.randomUUID();
    this.examStartTime.set(Date.now());
    this.practiceState.set('ACTIVE');
  }

  reconfigurePractice(): void {
    this.practiceState.set('CONFIG');
  }

  exitPractice(): void {
    const originSessionId = this.practiceSession()?.id || this.bookId();
    if (originSessionId) {
      this.go('libro', originSessionId);
    } else {
      this.go('diario');
    }
  }

  reviewWeakTopics(): void {
    const attempt = this.currentAttempt();
    const sessionId = attempt?.sessionId || this.practiceSession()?.id || this.bookId();
    if (sessionId) {
      this.go('libro', sessionId);
      this.showToast(
        this.activeLanguage() === 'en'
          ? 'Reviewing session notes to reinforce weak topics.'
          : 'Revisando los apuntes de la sesión para reforzar temas con fallos.'
      );
    } else {
      this.go('diario');
    }
  }

  formatTimeSpent(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  }

  getSessionSnippet(session: StudySession): string {
    if (session.topics && session.topics.length > 0) {
      for (const t of session.topics) {
        if (t.enrichedExplanation && t.enrichedExplanation.trim().length > 0) {
          const preview = this.cleanOstrixSessionPreview(t.enrichedExplanation);
          if (preview) return preview;
        }
        if (t.notes && t.notes.length > 0) {
          const joined = t.notes.filter(n => n.trim().length > 0).join(' ');
          const preview = this.cleanOstrixSessionPreview(joined);
          if (preview) return preview;
        }
      }
    }
    if (session.notes && session.notes.trim().length > 0) {
      return this.cleanOstrixSessionPreview(session.notes);
    }
    if (session.summary && session.summary.trim().length > 0) {
      return this.cleanOstrixSessionPreview(session.summary);
    }
    return 'Sin apuntes registrados aún. Pulsa para comenzar.';
  }

  private cleanOstrixSessionPreview(text: string): string {
    return cleanMarkdownToText(text)
      .replace(/\[Explicación de Tutor Ostrix\]/g, ' ')
      .replace(/\u2028/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[\s·•:—–-]+/, '')
      .trim()
      .slice(0, 160);
  }

  isSessionEnriched(session: StudySession): boolean {
    if (!session || !session.topics) return false;
    return session.topics.some(
      t => t.enrichmentStatus === 'UP_TO_DATE' || t.enrichmentStatus === 'ACTUALIZADO'
    );
  }

  private todayLocal(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
}
