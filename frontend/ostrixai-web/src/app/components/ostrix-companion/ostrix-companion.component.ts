import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { companionMessage, type CompanionArea, type CompanionLocale, type CompanionMode } from '../../core/companion-content';
import { companionIntent, perchOnCard, type CompanionDestination, type PerchPoint } from '../../core/companion-navigation';
import { companionPanelPosition, type CompanionPanelPosition } from '../../core/companion-panel-position';
import { companionFacts } from '../../core/companion-facts';
import { companionMotion } from '../../core/companion-motion';
import { assessStudyPreview, canSaveJourney, journeyTutorPrompt, needsStudyContext, studyClarificationQuestion } from '../../core/companion-journey';
import { offlineStudyPreview, parseSmartStudyResponse, studyCapturePrompt } from '../../core/companion-smart-capture';
import { clarifyDoubtContext, isIncompleteDoubt } from '../../core/companion-doubt-context';
import { OstrixAiService } from '../../core/ostrix-ai.service';

export interface CompanionLaunch {
  readonly mode: CompanionMode;
  readonly prompt: string;
  readonly includeCurrentSession: boolean;
}

type PrimaryTask = 'learn' | 'save' | 'doubt' | 'practice' | 'explore';
export type CompanionCaptureKind = 'note' | 'doubt' | 'eureka';
export interface CompanionSessionChoice { readonly id: string; readonly label: string; }
export interface CompanionCapture { readonly sessionId: string; readonly kind: CompanionCaptureKind; readonly content: string; }
export interface CompanionCaptureBatch { readonly requestId: number; readonly sessionId: string; readonly note?: string; readonly doubt?: string; }
export interface CompanionBatchResult { readonly requestId: number; readonly noteSaved: boolean; readonly doubtSaved: boolean; readonly message: string; }

/** COMPANION-03: mascot with stronger presence, guided shortcuts and contextual landing. */
@Component({
  selector: 'app-ostrix-companion',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ostrix-companion.component.html',
  styleUrl: './ostrix-companion.component.css',
})
export class OstrixCompanionComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input({ required: true }) view: CompanionArea = 'inicio';
  @Input() language: CompanionLocale = 'es';
  @Input() hasCurrentSession = false;
  @Input() sessionContextAllowed = false;
  @Input() sessions: readonly CompanionSessionChoice[] = [];
  @Input() captureBusy = false;
  @Input() captureFeedback = '';
  @Input() batchResult: CompanionBatchResult | null = null;
  readonly capture = output<CompanionCapture>();
  readonly captureBatch = output<CompanionCaptureBatch>();
  readonly launch = output<CompanionLaunch>();
  readonly navigate = output<CompanionDestination>();
  readonly expanded = signal(false);
  readonly includeCurrentSession = signal(false);
  readonly requestText = signal('');
  readonly perch = signal<PerchPoint | null>(null);
  readonly perchEnabled = signal(true);
  readonly travelling = signal(false);
  readonly curious = signal(false);
  readonly walking = signal(false);
  readonly talking = signal(true);
  readonly factText = signal('');
  readonly factsMuted = signal(false);
  readonly captureText = signal('');
  readonly captureKind = signal<CompanionCaptureKind>('note');
  readonly captureSessionId = signal('');
  /** Single-entry journey: draft -> review -> optional save -> Tutor -> practice. */
  readonly journeyText = signal('');
  readonly journeyNote = signal('');
  readonly journeyDoubt = signal('');
  readonly journeyContextAdded = signal(false);
  readonly journeySessionId = signal('');
  readonly journeyShareWithTutor = signal(false);
  readonly journeySavedNote = signal(false);
  readonly journeySavedDoubt = signal(false);
  /** Do not save a dangling question without a clear subject. */
  readonly journeyNeedsClarification = () => isIncompleteDoubt(this.journeyDoubt());
  readonly journeyEditOpen = signal(false);
  readonly journeyPending = signal<'note' | 'doubt' | null>(null);
  readonly journeyFeedback = signal('');
  readonly journeyOrganizing = signal(false);
  readonly journeyOrganized = signal(false);
  readonly journeyStrategy = signal<'ON_DEVICE' | 'OFFLINE_ESSENTIAL' | null>(null);
  /** En modo esencial no se guarda una frase cuya intención es incierta. */
  readonly journeyReviewNeeded = signal(false);
  readonly journeyUnclassifiedText = signal('');
  readonly journeyClarificationText = signal('');
  readonly journeyNeedsContext = () => this.journeyReviewNeeded() && needsStudyContext(this.journeyUnclassifiedText());
  readonly journeyClarificationPrompt = () => studyClarificationQuestion(this.journeyText(), this.isEnglish);
  readonly journeyBatchPending = signal(false);
  private journeyRun = 0;
  private journeyBatchCounter = 0;
  private activeBatchId: number | null = null;
  readonly saveFlowOpen = signal(false);
  readonly learnerFlowOpen = signal(true);
  readonly panelLocation = signal<CompanionPanelPosition | null>(null);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly localAi = inject(OstrixAiService);
  private mouseOnAvatar = false;
  private lastFactIndex = -1;
  private previousFacts: string[] = [];
  private factTimer: ReturnType<typeof setInterval> | null = null;
  private walkOffset = 0;

  private frame: number | null = null;
  private refreshTimeout: ReturnType<typeof setTimeout> | null = null;
  private travelTimeout: ReturnType<typeof setTimeout> | null = null;
  private gestureTimeout: ReturnType<typeof setTimeout> | null = null;
  private motionInterval: ReturnType<typeof setInterval> | null = null;
  private firstMotionTimeout: ReturnType<typeof setTimeout> | null = null;
  private speechTimeout: ReturnType<typeof setTimeout> | null = null;
  private panelTimer: ReturnType<typeof setTimeout> | null = null;
  private motionStep = 0;
  private readonly onViewportChange = () => this.schedulePerch();

  get message() { return companionMessage(this.view, this.language); }
  get isEnglish() { return this.language === 'en'; }
  get isQuechuaFallback() { return this.language === 'qu-chanka'; }
  get canAttachSession() { return this.view === 'libro' && this.hasCurrentSession && this.sessionContextAllowed; }
  get mood(): string { return this.view === 'eureka' ? 'celebrate' : this.view === 'dudas' || this.view === 'repaso' ? 'think' : 'idle'; }

  get primaryCards() {
    return this.isEnglish
      ? [
          { key: 'learn' as PrimaryTask, title: 'Learn something', detail: 'Go straight to a clear explanation.' },
          { key: 'save' as PrimaryTask, title: 'Save something', detail: 'Notes, doubts, Eureka or review.' },
          { key: 'doubt' as PrimaryTask, title: 'I have a doubt', detail: 'Start with a hint, not the answer.' },
          { key: 'practice' as PrimaryTask, title: 'Practice now', detail: 'A small challenge to keep going.' },
        ]
      : [
          { key: 'learn' as PrimaryTask, title: 'Quiero aprender', detail: 'Ir directo a una explicación clara.' },
          { key: 'save' as PrimaryTask, title: 'Quiero guardar algo', detail: 'Apunte, duda, Eureka o repaso.' },
          { key: 'doubt' as PrimaryTask, title: 'Tengo una duda', detail: 'Empezar con una pista, no con la respuesta.' },
          { key: 'practice' as PrimaryTask, title: 'Quiero practicar', detail: 'Un reto corto para seguir avanzando.' },
        ];
  }

  get saveCards() {
    return this.isEnglish
      ? [
          { destination: 'diario' as CompanionDestination, title: 'Diary', detail: 'Save a class record or create a session.' },
          { destination: 'apuntes' as CompanionDestination, title: 'Notes', detail: 'Keep an idea or summary.' },
          { destination: 'dudas' as CompanionDestination, title: 'Doubts', detail: 'Register a question to solve later.' },
          { destination: 'repaso' as CompanionDestination, title: 'Review', detail: 'Create a quick review task.' },
        ]
      : [
          { destination: 'diario' as CompanionDestination, title: 'Diario', detail: 'Guardar una clase o crear una sesión.' },
          { destination: 'apuntes' as CompanionDestination, title: 'Apuntes', detail: 'Guardar una idea o un resumen.' },
          { destination: 'dudas' as CompanionDestination, title: 'Dudas', detail: 'Registrar una pregunta para resolverla.' },
          { destination: 'repaso' as CompanionDestination, title: 'Repaso', detail: 'Crear una tarea corta de repaso.' },
        ];
  }

  ngAfterViewInit(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('scroll', this.onViewportChange, true);
    window.addEventListener('resize', this.onViewportChange, { passive: true });
    this.schedulePerch();
    // Deliberate, infrequent actions; no constant page roaming or background AI.
    this.motionInterval = setInterval(() => this.playCompanionGesture(), 6000);
    this.factTimer = setInterval(() => { if (!this.expanded() && !this.factsMuted() && !document.hidden) this.showFact(); }, 13500);
    this.firstMotionTimeout = setTimeout(() => this.playCompanionGesture(), 2800);
    this.showFact();
  }
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['batchResult'] && this.batchResult && this.batchResult.requestId === this.activeBatchId) {
      if (this.batchResult.noteSaved) this.journeySavedNote.set(true);
      if (this.batchResult.doubtSaved) this.journeySavedDoubt.set(true);
      this.journeyFeedback.set(this.batchResult.message);
      this.journeyBatchPending.set(false);
      this.activeBatchId = null;
    }
    if (changes['captureFeedback'] && this.captureFeedback && this.journeyPending()) {
      const pending = this.journeyPending();
      if (this.captureFeedback.startsWith('OK:')) {
        if (pending === 'note') this.journeySavedNote.set(true);
        if (pending === 'doubt') this.journeySavedDoubt.set(true);
        this.journeyFeedback.set(this.isEnglish ? 'Saved to your encrypted notebook.' : 'Guardado en tu cuaderno cifrado.');
      } else {
        this.journeyFeedback.set(this.captureFeedback);
      }
      this.journeyPending.set(null);
    }
    if (changes['captureFeedback'] && this.captureFeedback.startsWith('OK:')) {
      this.captureText.set('');
    }
    if (!changes['view'] && !changes['language'] && !changes['hasCurrentSession']) return;
    this.includeCurrentSession.set(false);
    this.expanded.set(false);
    this.requestText.set('');
    this.saveFlowOpen.set(false);
    this.learnerFlowOpen.set(true);
    this.curious.set(false);
    this.walking.set(false);
    this.walkOffset = 0;
    this.talking.set(true);
    this.showFact();
    if (typeof window !== 'undefined') {
      if (this.refreshTimeout !== null) clearTimeout(this.refreshTimeout);
      this.refreshTimeout = setTimeout(() => this.schedulePerch(), 120);
    }
  }
  ngOnDestroy(): void {
    this.journeyRun++;
    if (typeof window !== 'undefined') {
      window.removeEventListener('scroll', this.onViewportChange, true);
      window.removeEventListener('resize', this.onViewportChange);
      if (this.frame !== null) window.cancelAnimationFrame(this.frame);
    }
    if (this.refreshTimeout !== null) clearTimeout(this.refreshTimeout);
    if (this.travelTimeout !== null) clearTimeout(this.travelTimeout);
    if (this.gestureTimeout !== null) clearTimeout(this.gestureTimeout);
    if (this.motionInterval !== null) clearInterval(this.motionInterval);
    if (this.factTimer !== null) clearInterval(this.factTimer);
    if (this.firstMotionTimeout !== null) clearTimeout(this.firstMotionTimeout);
    if (this.speechTimeout !== null) clearTimeout(this.speechTimeout);
    if (this.panelTimer !== null) clearTimeout(this.panelTimer);
  }
  private schedulePerch(): void {
    if (typeof window === 'undefined' || this.frame !== null) return;
    this.frame = window.requestAnimationFrame(() => { this.frame = null; this.refreshPerch(); this.refreshPanelPosition(); });
  }
  private setPerch(next: PerchPoint | null): void {
    const previous = this.perch();
    const moved = !!next && !!previous && (Math.abs(next.left - previous.left) > 5 || Math.abs(next.top - previous.top) > 5);
    this.perch.set(next);
    if (moved && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.travelling.set(true);
      if (this.travelTimeout !== null) clearTimeout(this.travelTimeout);
      this.travelTimeout = setTimeout(() => { this.travelling.set(false); this.refreshPanelPosition(); }, 760);
    } else if (!next) {
      this.travelling.set(false);
    }
  }
  private visiblePerches(): PerchPoint[] {
    if (typeof document === 'undefined' || typeof window === 'undefined') return [];
    // All visible study cards (including the three dashboard statistics), not only a single hero card.
    const selectors = 'main.content .card, main.content article.card, main.content .course-card-editorial';
    const elements = Array.from(document.querySelectorAll<HTMLElement>(selectors))
      .filter(el => !el.closest('form, [role="dialog"], [aria-modal="true"]'));
    const result: PerchPoint[] = [];
    for (const element of elements) {
      const r = element.getBoundingClientRect();
      const point = perchOnCard([r], window.innerWidth, window.innerHeight);
      if (!point) continue;
      // Avoid duplicate anchors on nested cards or cards with the same corner.
      if (result.some(p => Math.hypot(p.left - point.left, p.top - point.top) < 100)) continue;
      result.push(point);
      if (result.length >= 12) break;
    }
    return result;
  }
  private refreshPerch(): void {
    if (!this.perchEnabled() || typeof window === 'undefined' || typeof document === 'undefined' ||
        document.querySelector('[role="dialog"][aria-modal="true"]')) {
      this.setPerch(null); return;
    }
    if (this.expanded() || this.walking() || this.travelling()) return;
    const points = this.visiblePerches();
    const current = this.perch();
    if (current && points.some(point => Math.hypot(point.left - current.left, point.top - current.top) < 70)) return;
    this.setPerch(points[0] ?? null);
  }
  private showFact(): void {
    const entries = companionFacts(this.view, this.language);
    if (!entries.length) return;
    if (this.factsMuted() || this.expanded()) return;
    const candidates = entries.filter(item => !this.previousFacts.includes(item));
    const pool = candidates.length ? candidates : entries;
    const selected = pool[Math.floor(Math.random() * pool.length)];
    this.previousFacts = [...this.previousFacts.slice(-24), selected];
    this.factText.set(selected);
    this.talking.set(true);
    if (this.speechTimeout !== null) clearTimeout(this.speechTimeout);
    this.speechTimeout = setTimeout(() => this.talking.set(false), 7900);
  }
  /** Position visibly changes: steps along a card, or a short flight between safe perches. */
  private playCompanionGesture(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined' ||
        document.hidden || this.expanded() || this.mouseOnAvatar || this.travelling() || this.walking() ||
        document.querySelector('[role="dialog"][aria-modal="true"]') ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const spots = this.visiblePerches();
    const here = this.perch();
    if (!here) { this.refreshPerch(); return; }
    // Walk on four out of five cycles; fly only when changing to a different card.
    const gesture = companionMotion(++this.motionStep, spots.length);
    this.curious.set(false);
    if (this.gestureTimeout !== null) clearTimeout(this.gestureTimeout);
    if (gesture === 'curious') {
      this.curious.set(true);
      this.showFact();
      this.gestureTimeout = setTimeout(() => this.curious.set(false), 2300);
      return;
    }
    // Treat a single card as a real perch: walk back and forth across its edge.
    const nearest = [...spots].sort((a, b) =>
      Math.hypot(a.left - here.left, a.top - here.top) - Math.hypot(b.left - here.left, b.top - here.top))[0];
    if (gesture === 'walk') {
      const base = nearest ?? here;
      this.walkOffset = this.walkOffset === 0 ? -54 : 0;
      const left = Math.max(12, Math.min(window.innerWidth - 130, base.left + this.walkOffset));
      this.moveOwl({ left, top: base.top }, 'walk');
      return;
    }
    // Prefer another card: if there is only one, fly to its opposite edge and land.
    const distant = spots.filter(p => Math.hypot(p.left - here.left, p.top - here.top) > 115);
    const target = distant.length ? distant[this.motionStep % distant.length] : {
      left: Math.max(12, Math.min(window.innerWidth - 130,
        (nearest ?? here).left - (this.walkOffset === -52 ? 18 : 94))),
      top: (nearest ?? here).top,
    };
    this.walkOffset = 0;
    if (Math.hypot(target.left - here.left, target.top - here.top) > 12) this.moveOwl(target, 'fly');
    else this.curious.set(true);
  }
  private moveOwl(target: PerchPoint, type: 'walk' | 'fly'): void {
    if (this.travelTimeout !== null) clearTimeout(this.travelTimeout);
    this.walking.set(type === 'walk');
    this.travelling.set(type === 'fly');
    this.talking.set(false);
    this.perch.set(target);
    this.travelTimeout = setTimeout(() => {
      this.walking.set(false);
      this.travelling.set(false);
      this.refreshPanelPosition();
    }, type === 'walk' ? 1700 : 1500);
  }
  toggleFacts(): void {
    this.factsMuted.update((muted: boolean) => !muted);
    if (this.factsMuted()) { this.talking.set(false); }
    else if (!this.expanded()) this.showFact();
  }
  updateJourneyText(value: string): void {
    if (this.journeyBatchPending() || this.captureBusy || this.journeyOrganizing()) return;
    this.journeyRun++;
    this.journeyText.set(value);
    this.journeyClarificationText.set('');
    const fallback = assessStudyPreview(value);
    this.journeyReviewNeeded.set(fallback.needsReview);
    this.journeyUnclassifiedText.set(fallback.needsReview ? value.trim() : '');
    this.journeyNote.set(fallback.note);
    const clarified = clarifyDoubtContext(fallback.note, fallback.doubt);
    this.journeyDoubt.set(clarified.text);
    this.journeyContextAdded.set(clarified.addedContext);
    this.journeyEditOpen.set(fallback.needsReview || isIncompleteDoubt(clarified.text));
    this.journeyOrganized.set(false);
    this.journeyStrategy.set(null);
    this.journeySavedNote.set(false);
    this.journeySavedDoubt.set(false);
    this.journeyFeedback.set('');
    this.journeyShareWithTutor.set(false);
  }
  /** Strict Gemini Nano only. Fall back to transparent deterministic extraction, never Cloud. */
  async organizeJourney(): Promise<void> {
    const story = this.journeyText().trim();
    if (!story || story.length > 1800 || this.journeyOrganizing() || this.journeyBatchPending() || this.captureBusy) return;
    // Un relato sin referente no debe entrar a Nano ni guardarse solo por elegir categoría.
    // Primero pedimos UNA aclaración y conservamos el borrador original.
    if (needsStudyContext(story)) {
      this.journeyRun++;
      this.journeyReviewNeeded.set(true);
      this.journeyUnclassifiedText.set(story);
      this.journeyNote.set('');
      this.journeyDoubt.set('');
      this.journeyEditOpen.set(false);
      this.journeyOrganized.set(true);
      this.journeyStrategy.set('OFFLINE_ESSENTIAL');
      this.journeyFeedback.set(this.journeyClarificationPrompt());
      return;
    }
    const token = ++this.journeyRun;
    const guard = this.localAi.sessionGuard();
    this.journeyOrganizing.set(true);
    this.journeyOrganized.set(false);
    this.journeyFeedback.set(this.isEnglish ? 'Trying local Gemini Nano...' : 'Ostrix está organizando con Gemini Nano local…');
    let suggestion = offlineStudyPreview(story);
    try {
      const generated = await this.localAi.generateStrictLocal(studyCapturePrompt(story), false, {
        rawPrompt: true,
        saveInOutbox: false,
        cloudConsent: false,
        allowEssentialFallback: false,
        timeoutMs: 60000,
      });
      if (generated.source === 'ON_DEVICE') {
        const verified = parseSmartStudyResponse(generated.text, story);
        if (verified) suggestion = { ...verified, strategy: 'ON_DEVICE' };
      }
    } catch {
      // No model, model busy or no strict source proof: retain offline keyword fallback.
    } finally {
      if (token === this.journeyRun && guard() && this.journeyText().trim() === story) {
        const needsReview = !!suggestion.needsReview;
        this.journeyReviewNeeded.set(needsReview);
        this.journeyUnclassifiedText.set(needsReview ? story : '');
        this.journeyNote.set(suggestion.note);
        const clarified = clarifyDoubtContext(suggestion.note, suggestion.doubt);
        this.journeyDoubt.set(clarified.text);
        this.journeyContextAdded.set(clarified.addedContext);
        this.journeyEditOpen.set(needsReview || isIncompleteDoubt(clarified.text));
        this.journeyStrategy.set(suggestion.strategy);
        this.journeyOrganized.set(true);
        this.journeyFeedback.set(needsReview
          ? (this.isEnglish ? 'I cannot classify this reliably offline. Choose note or question before saving.' : 'No puedo clasificar esto con seguridad sin IA. Elige apunte o duda antes de guardar.')
          : suggestion.strategy === 'ON_DEVICE'
            ? (this.isEnglish ? 'Organized with Gemini Nano on this device. Check before saving.' : 'Organizado con Gemini Nano en este dispositivo. Comprueba antes de guardar.')
            : (this.isEnglish ? 'Organized with offline rules (not generative AI). Check before saving.' : 'Organizado con reglas offline, sin IA generativa. Comprueba antes de guardar.'));
      }
      if (token === this.journeyRun) this.journeyOrganizing.set(false);
    }
  }
  /** La respuesta del estudiante es la única fuente del nuevo relato; nunca la inventamos. */
  applyJourneyClarification(): void {
    if (!this.journeyNeedsContext() || this.journeyBatchPending() || this.captureBusy || this.journeyOrganizing()) return;
    const corrected = this.journeyClarificationText().trim();
    if (!corrected || corrected.length > 1800 || needsStudyContext(corrected)) {
      this.journeyFeedback.set(this.isEnglish
        ? 'Please name the topic and explain your learning or question in one complete sentence.'
        : 'Necesito una frase más concreta: indica el tema y lo que aprendiste o no entiendes.');
      return;
    }
    this.updateJourneyText(corrected);
    void this.organizeJourney();
  }
  /** El estudiante asigna explícitamente el relato no clasificable; no se adivina su intención. */
  resolveJourneyCategory(kind: 'note' | 'doubt'): void {
    if (!this.journeyReviewNeeded() || this.journeyBatchPending() || this.captureBusy) return;
    const text = this.journeyUnclassifiedText().trim();
    if (needsStudyContext(text)) {
      this.journeyFeedback.set(this.journeyClarificationPrompt());
      return;
    }
    const max = kind === 'note' ? 2000 : 400;
    if (!canSaveJourney(text, max)) {
      this.journeyFeedback.set(this.isEnglish ? 'Shorten your text before categorizing it.' : 'Reduce la longitud del relato antes de clasificarlo.');
      return;
    }
    this.journeyNote.set(kind === 'note' ? text : '');
    this.journeyDoubt.set(kind === 'doubt' ? text : '');
    this.journeyContextAdded.set(false);
    this.journeyReviewNeeded.set(false);
    this.journeyUnclassifiedText.set('');
    this.journeyEditOpen.set(kind === 'doubt' && isIncompleteDoubt(text));
    this.journeySavedNote.set(false);
    this.journeySavedDoubt.set(false);
    this.journeyFeedback.set(this.isEnglish ? 'Category confirmed. Review before saving.' : 'Categoría confirmada. Revisa antes de guardar.');
  }

  updateJourneyNote(value: string): void {
    if (this.journeyBatchPending() || this.captureBusy) return;
    this.journeyNote.set(value);
    this.journeySavedNote.set(false);
  }
  updateJourneyDoubt(value: string): void {
    if (this.journeyBatchPending() || this.captureBusy) return;
    this.journeyDoubt.set(value);
    this.journeyContextAdded.set(false);
    this.journeySavedDoubt.set(false);
  }
  updateJourneySession(id: string): void {
    if (this.journeyBatchPending() || this.captureBusy) return;
    this.journeySessionId.set(id);
    this.journeySavedNote.set(false);
    this.journeySavedDoubt.set(false);
  }
  /** A single consent click saves all remaining entries via existing encrypted diary. */
  saveJourneyBatch(): void {
    if (!this.journeyOrganized() || this.journeyReviewNeeded() || this.journeyBatchPending() || this.journeyOrganizing() || this.captureBusy) return;
    const sessionId = this.journeySessionId() || this.sessions[0]?.id || '';
    const note = this.journeySavedNote() ? '' : this.journeyNote().trim();
    const doubt = this.journeySavedDoubt() ? '' : this.journeyDoubt().trim();
    if ((note && needsStudyContext(note)) || (doubt && needsStudyContext(doubt))) {
      this.journeyUnclassifiedText.set(note && needsStudyContext(note) ? note : doubt);
      this.journeyReviewNeeded.set(true);
      this.journeyFeedback.set(this.isEnglish ? 'Please explain the topic more clearly before saving.' : 'Antes de guardar, completa la idea con un tema concreto.');
      return;
    }
    if (doubt && isIncompleteDoubt(doubt)) {
      this.journeyFeedback.set(this.isEnglish ? 'Please specify what your question refers to before saving.' : 'No pude identificar el tema de la duda. Aclara de qué hablas antes de guardar.');
      return;
    }
    if (!this.sessions.some(session => session.id === sessionId) ||
        (!!note && !canSaveJourney(note, 2000)) || (!!doubt && !canSaveJourney(doubt, 400)) || (!note && !doubt)) {
      this.journeyFeedback.set(this.isEnglish ? 'Check the class session and note lengths.' : 'Revisa la sesión y la longitud del apunte o de la duda.');
      return;
    }
    const requestId = ++this.journeyBatchCounter;
    this.activeBatchId = requestId;
    this.journeyBatchPending.set(true);
    this.journeyFeedback.set(this.isEnglish ? 'Saving in the background. You can continue.' : 'Guardando en segundo plano. Puedes continuar aprendiendo.');
    this.captureBatch.emit({ requestId, sessionId, ...(note ? { note } : {}), ...(doubt ? { doubt } : {}) });
    // The parent App retains the save task and retry payload even if this panel closes.
    this.close();
  }
  startJourneyTutor(mode: 'explain' | 'guide' | 'practice'): void {
    const text = [this.journeyNote().trim(), this.journeyDoubt().trim()].filter(Boolean).join('\n');
    const prompt = journeyTutorPrompt(mode, text, this.journeyShareWithTutor(), this.isEnglish);
    // Explicitly entered text is shared only after checking the authorization box.
    // Never implicitly attach the current private session to the Tutor.
    this.launch.emit({ mode, prompt, includeCurrentSession: false });
    this.close();
  }
  saveCapture(): void {
    const content = this.captureText().trim();
    const sessionId = this.captureSessionId() || this.sessions[0]?.id || '';
    const max = this.captureKind() === 'note' ? 2000 : 400;
    if (!content || content.length > max || this.captureBusy || !this.sessions.some(s => s.id === sessionId)) return;
    this.capture.emit({ sessionId, kind: this.captureKind(), content });
  }
  avatarEnter(): void { this.mouseOnAvatar = true; }
  avatarLeave(): void { this.mouseOnAvatar = false; }
  /** Position panel near the owl, but clamp it inside the viewport. */
  private refreshPanelPosition(): void {
    if (!this.expanded() || typeof window === 'undefined') {
      this.panelLocation.set(null);
      return;
    }
    const root = this.host.nativeElement as HTMLElement;
    const avatar = root.querySelector<HTMLElement>('.companion-avatar');
    const panel = root.querySelector<HTMLElement>('.companion-panel');
    if (!avatar || !panel) return;
    const a = avatar.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    this.panelLocation.set(companionPanelPosition(
      { left: a.left, top: a.top, right: a.right, width: a.width, height: a.height },
      { width: p.width, height: p.height },
      { width: window.innerWidth, height: window.innerHeight },
    ));
  }
  toggle(): void {
    this.expanded.update((open: boolean) => !open);
    if (this.expanded()) {
      this.curious.set(false);
      this.talking.set(false);
      this.walking.set(false);
      this.travelling.set(false);
      if (this.travelTimeout !== null) clearTimeout(this.travelTimeout);
      if (this.panelTimer !== null) clearTimeout(this.panelTimer);
      // Wait until the *ngIf panel actually exists before measuring its size.
      this.panelTimer = setTimeout(() => this.refreshPanelPosition(), 30);
    } else this.panelLocation.set(null);
  }
  close(): void { this.expanded.set(false); this.panelLocation.set(null); if (this.panelTimer !== null) clearTimeout(this.panelTimer); }
  togglePerching(): void { this.perchEnabled.update((value: boolean) => !value); this.schedulePerch(); }
  quickNavigate(destination: CompanionDestination): void { this.navigate.emit(destination); this.close(); }
  sendRequest(): void {
    const prompt = this.requestText().trim().slice(0, 500);
    if (!prompt) return;
    this.choose(companionIntent(prompt), prompt);
    this.requestText.set('');
  }
  choose(mode: CompanionMode, prompt: string): void {
    this.launch.emit({
      mode,
      prompt,
      includeCurrentSession: this.canAttachSession && this.includeCurrentSession(),
    });
    this.close();
  }
  activatePrimary(task: PrimaryTask): void {
    if (task === 'save') {
      this.saveFlowOpen.update((open: boolean) => !open);
      return;
    }
    if (task === 'learn') {
      this.choose('explain', this.isEnglish
        ? 'I want to understand a topic from school. First ask me what exact topic I want to learn, then explain it clearly.'
        : 'Quiero aprender un tema de clase. Primero pregúntame qué tema exacto quiero entender y luego explícamelo con claridad.');
      return;
    }
    if (task === 'doubt') {
      this.choose('guide', this.isEnglish
        ? 'I have a question from class. Guide me with one hint at a time and do not reveal the answer immediately.'
        : 'Tengo una duda de clase. Guíame con una sola pista a la vez y no me des la respuesta de inmediato.');
      return;
    }
    if (task === 'practice') {
      this.choose('practice', this.isEnglish
        ? 'Give me one short practice question related to a secondary-school topic. Wait for my answer before solving it.'
        : 'Dame un ejercicio corto relacionado con un tema de secundaria. Espera mi respuesta antes de resolverlo.');
      return;
    }
    this.choose('explore', this.isEnglish
      ? 'Help me explore a science or social-studies topic with a simple mini-investigation. Start by asking what materials I have.'
      : 'Ayúdame a explorar un tema de ciencia o sociales con una mini investigación sencilla. Empieza preguntando qué materiales tengo.');
  }
}
