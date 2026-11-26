import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import {
  LearningDiaryService, type ConceptCollection, type StudySession,
} from '../../core/learning-diary.service';
import { OstrixAiService } from '../../core/ostrix-ai.service';
import { SyncService } from '../../core/sync.service';
import { StudentSettingsService, type Grade, type LearningLanguage } from '../../core/student-settings.service';
import { interfaceText, type InterfaceKey } from '../../core/interface-language';
import { courseOptions } from '../../core/school-catalog';
import { TranslationService } from '../../core/translation.service';
import { DeviceCapabilitiesService } from '../../core/device-capabilities.service';
import { ReviewSchedulerService } from '../../core/review-scheduler.service';
import { LearningMemoryService, type ConceptMemory } from '../../core/learning-memory.service';
import { CurriculumExercise, findMatchingExercises } from '../../core/exercise-catalog';

type Tab = 'notes' | 'summary' | 'doubts' | 'eureka' | 'review' | 'progress' | 'corrections';

interface DayGroup {
  date: string;
  courses: { name: string; sessions: StudySession[] }[];
  doubts: number;
  eureka: number;
}

@Component({
  selector: 'app-diario',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, CardModule],
  templateUrl: './diario.component.html',
  styleUrl: './diario.component.css',
})
export class DiarioComponent {
  readonly diary = inject(LearningDiaryService);
  readonly memory = inject(LearningMemoryService);
  readonly device = inject(DeviceCapabilitiesService);
  readonly scheduler = inject(ReviewSchedulerService);
  readonly ai = inject(OstrixAiService);
  readonly sync = inject(SyncService);
  readonly settings = inject(StudentSettingsService);
  readonly translator = inject(TranslationService);

  readonly options = computed(() => courseOptions(this.settings.profile().scienceSeparate));
  readonly editingSettings = signal(false);

  setupGrade: Grade | null = this.settings.profile().grade;
  setupLanguage: LearningLanguage = this.settings.profile().language;
  setupSeparateScience = this.settings.profile().scienceSeparate;

  t(key: InterfaceKey): string {
    return interfaceText(key, this.settings.profile().language);
  }

  /** Human-facing notifications follow the student's selected interface language. */
  private ui(es: string, en: string): string {
    return this.settings.profile().language === 'en' ? en : es;
  }

  async saveStudentSettings(): Promise<void> {
    try {
      const g = (this.setupGrade === null || this.setupGrade === undefined || (this.setupGrade as any) === 'null' || (this.setupGrade as any) === '')
        ? null
        : (Number(this.setupGrade) as Grade);
      await this.settings.save(g, this.setupLanguage, this.setupSeparateScience);
      this.editingSettings.set(false);
      if (!this.options().some(c => c.name === this.newCourse) && this.newCourse !== '__custom') {
        this.newCourse = 'Matemática';
      }
      this.newSubtopic = '';
    } catch (error: unknown) {
      this.handleError(error);
    }
  }

  showStudentSettings(): void {
    const p = this.settings.profile();
    this.setupGrade = p.grade;
    this.setupLanguage = p.language;
    this.setupSeparateScience = p.scienceSeparate;
    this.editingSettings.set(true);
  }

  readonly selectedId = signal<string | null>(null);
  readonly selected = computed(() => this.diary.sessions().find(s => s.id === this.selectedId()) ?? null);
  readonly tab = signal<Tab>('notes');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly feedback = signal('');

  // Ejercicios interactivos alineados a la sesión actual
  readonly currentExercises = computed<readonly CurriculumExercise[]>(() => {
    const s = this.selected();
    if (!s) return [];
    return findMatchingExercises(s.course, `${s.topic} ${s.doubts.join(' ')}`, this.settings.profile().grade ?? undefined, 4, true);
  });

  // Estado de respuestas del estudiante en la sesión activa
  readonly userSelectedAnswers = signal<Record<string, number>>({});
  readonly exerciseResults = signal<Record<string, { isCorrect: boolean; explanation: string; nextReview?: string }>>({});

  // Formulario de correcciones lingüísticas
  correctionTermEs = '';
  correctionTranslatedQu = '';
  correctionSuggestedChanka = '';
  correctionContext = '';
  readonly correctionSuccess = signal(false);

  readonly groups = computed<DayGroup[]>(() => {
    const days = new Map<string, Map<string, StudySession[]>>();
    for (const s of this.diary.sessions()) {
      if (!days.has(s.date)) days.set(s.date, new Map());
      const courses = days.get(s.date)!;
      courses.set(s.course, [...(courses.get(s.course) ?? []), s]);
    }
    return [...days.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([date, courses]) => {
      const entries = [...courses.values()].flat();
      return {
        date,
        courses: [...courses.entries()].map(([name, sessions]) => ({ name, sessions })),
        doubts: entries.reduce((total, item) => total + item.doubts.length, 0),
        eureka: entries.reduce((total, item) => total + item.eureka.length, 0),
      };
    });
  });

  newDate = this.todayLocal();
  newCourse = 'Matemática';
  newSubtopic = '';
  customCourse = '';
  translationConsent = false;
  newTopic = '';
  notesDraft = '';
  conceptDraft = '';
  cloudConsent = false;
  syncConsent = this.sync.getSyncConsent();

  constructor() {
    void this.initAll();
  }

  private async initAll(): Promise<void> {
    try {
      await this.diary.load();
      await this.memory.load();
      await this.scheduler.load();
      await this.device.checkNano();
    } catch {
      this.error.set('No se pudo inicializar el almacenamiento local.');
    }
  }

  async createSession(): Promise<void> {
    this.error.set('');
    try {
      const course = this.newCourse === '__custom' ? this.customCourse.trim() : this.newCourse;
      const topic = this.newSubtopic && this.newCourse !== '__custom'
        ? `${this.newSubtopic} — ${this.newTopic.trim()}`
        : this.newTopic.trim();
      const session = await this.diary.create(this.newDate, course, topic);
      this.select(session);
      this.newTopic = '';
      this.customCourse = '';
      this.feedback.set(this.ui('Sesión escolar creada y protegida en este equipo.', 'Study session created and encrypted on this device.'));
    } catch (error: unknown) {
      this.handleError(error);
    }
  }

  select(session: StudySession): void {
    this.selectedId.set(session.id);
    this.notesDraft = session.notes;
    this.tab.set('notes');
    this.error.set('');
    this.feedback.set('');
    this.userSelectedAnswers.set({});
    this.exerciseResults.set({});
  }

  returnToDays(): void {
    this.selectedId.set(null);
  }

  editNotes(value: string): void {
    this.notesDraft = value;
    const id = this.selectedId();
    if (id) {
      void this.diary.update(id, { notes: value }).catch(e => this.handleError(e));
    }
  }

  async addConcept(collection: ConceptCollection): Promise<void> {
    const id = this.selectedId();
    const session = this.selected();
    if (!id || !session) return;
    this.error.set('');
    try {
      await this.diary.addConcept(id, collection, this.conceptDraft);

      // Si es una DUDA, registrarla en la Memoria de Aprendizaje Real (ciclo determinista)
      if (collection === 'doubts') {
        await this.memory.registerDoubt(id, session.course, session.topic, this.conceptDraft);
        await this.scheduler.add(id, session.course, this.conceptDraft);
      }

      this.conceptDraft = '';
      this.feedback.set(collection === 'doubts'
        ? this.ui('Duda guardada en tu libro. Se ha programado para repaso adaptativo.', 'Question saved. It is now scheduled for adaptive review.')
        : this.ui('¡Descubrimiento Eureka registrado en tu diario!', 'Eureka discovery saved in your journal!'));
    } catch (error: unknown) {
      this.handleError(error);
    }
  }

  async removeConcept(collection: ConceptCollection, index: number): Promise<void> {
    const id = this.selectedId();
    if (id) {
      try {
        await this.diary.removeConcept(id, collection, index);
      } catch (error: unknown) {
        this.handleError(error);
      }
    }
  }

  /**
   * Generación de resumen o repaso con memoria estructurada y recuperación contextual.
   */
  async generate(kind: 'summary' | 'review', forceStrictLocal = false): Promise<void> {
    const session = this.selected();
    if (!session) return;
    this.busy.set(true);
    this.error.set('');
    this.feedback.set('');

    try {
      // 1. Recuperar contexto pedagógico estructurado desde la Memoria Real (sin reentrenamiento ficticio)
      const memoryContext = this.memory.buildContextForPrompt(session.course, session.topic);
      const previous = this.diary.previousSessions(session, 2);
      const pastStudy = previous.map(item =>
        `FECHA ${item.date} / TEMA ${item.topic} / APUNTES ${item.notes.slice(0, 500)} / DUDAS ${item.doubts.join('; ').slice(0, 300)}`
      ).join('\n');

      const prompt = kind === 'summary'
        ? `CURSO: ${session.course}. TEMA: ${session.topic}.\nRedacta un resumen escolar fiel, claro y adecuado para secundaria rural en Perú. No inventes información.\nAPUNTES:\n${this.notesDraft.slice(0, 10000)}\n${memoryContext}`
        : `CURSO: ${session.course}. TEMA: ${session.topic}.\nCrea 3 preguntas de autoevaluación para secundaria con solucionario breve. Da prioridad a las dudas registradas por el estudiante.\nAPUNTES:\n${this.notesDraft.slice(0, 8000)}\nDUDAS:\n${session.doubts.join('; ').slice(0, 1500)}\nEUREKA:\n${session.eureka.join('; ').slice(0, 800)}\n${pastStudy}\n${memoryContext}`;

      let result;
      if (forceStrictLocal) {
        // Exigencia estricta: ONLY_ON_DEVICE sin fallback silencioso
        result = await this.ai.generateStrictLocal(prompt, kind === 'review', { rawPrompt: true });
      } else {
        result = await this.ai.processPromptDetailed(prompt, kind === 'review', { cloudConsent: this.cloudConsent, rawPrompt: true });
      }

      const changes = kind === 'summary' ? { summary: result.text } : { review: result.text };
      await this.diary.update(session.id, changes);

      // Asociar la explicación a las dudas de esta sesión en la Memoria de Aprendizaje
      for (const doubt of session.doubts) {
        const memItem = this.memory.concepts().find(c => c.sessionId === session.id && c.conceptText === doubt);
        if (memItem) {
          const source = result.source === 'ON_DEVICE' ? 'ON_DEVICE' : result.source === 'IN_CLOUD' ? 'IN_CLOUD' : 'CURRICULUM_OFFLINE';
          await this.memory.recordExplanation(memItem.id, result.text.slice(0, 600), source);
        }
      }

      const sourceLabel = result.source === 'ON_DEVICE'
        ? 'Gemini Nano (En tu dispositivo)'
        : result.source === 'IN_CLOUD'
          ? 'Gemini Cloud (En la nube con autorización)'
          : 'Modo Esencial Offline (Algoritmo local)';

      this.feedback.set(`Generado con éxito. Origen verificado: ${sourceLabel}. Latencia: ${result.latencyMs} ms.`);

      // Traducción opcional a Quechua Chanka
      if (this.settings.profile().language === 'qu-chanka' && this.translationConsent) {
        try {
          const quechua = await this.translator.spanishToQuechua(result.text, this.translationConsent);
          const translatedChanges = kind === 'summary'
            ? { summaryQuechua: quechua }
            : { reviewQuechua: quechua };
          await this.diary.update(session.id, translatedChanges);
          this.feedback.set(`Respuesta generada y traducida al quechua. Origen: ${sourceLabel}.`);
        } catch (translationError: unknown) {
          const detail = translationError instanceof Error ? translationError.message : 'Error desconocido';
          this.feedback.set(`Respuesta guardada en español. Traducción: ${detail}`);
        }
      }
    } catch (error: unknown) {
      this.handleError(error);
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Resuelve interactivamente un ejercicio curricular offline determinista.
   */
  async submitExerciseAnswer(exercise: CurriculumExercise, optionIndex: number): Promise<void> {
    const session = this.selected();
    if (!session || !exercise.options?.[optionIndex]) return;
    const active = this.ai.sessionGuard();
    const linkedConcept = await this.memory.registerDoubt(session.id, session.course, exercise.topic, exercise.question);
    if (!active() || this.selected() !== session) return;

    const grade = this.settings.profile().grade;
    const evalResult = await this.memory.submitAnswer(linkedConcept.id, exercise.id, optionIndex, grade);
    if (!active() || this.selected() !== session) return;
    this.userSelectedAnswers.update(prev => ({ ...prev, [exercise.id]: optionIndex }));

    this.exerciseResults.update(prev => ({
      ...prev,
      [exercise.id]: {
        isCorrect: evalResult.isCorrect,
        explanation: evalResult.explanation,
        nextReview: evalResult.nextReviewDate,
      }
    }));

    if (evalResult.isCorrect) {
      this.feedback.set(`¡Excelente! Respuesta correcta. Próximo repaso programado para el ${evalResult.nextReviewDate}.`);
    } else {
      this.feedback.set(`Respuesta incorrecta. Concepto marcado para refuerzo mañana (${evalResult.nextReviewDate}).`);
    }
  }

  setSyncConsent(value: boolean): void {
    this.syncConsent = value;
    this.sync.setSyncConsent(value);
  }

  async syncNow(): Promise<void> {
    this.error.set('');
    try {
      await this.sync.flush();
      this.feedback.set(this.ui('Diario académico y memoria de aprendizaje sincronizados con el servidor escolar.', 'Journal and learning memory synced with the school server.'));
    } catch (error: unknown) {
      this.handleError(error);
    }
  }

  async prepareLocalModel(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.ai.prepareLocalModel();
      this.feedback.set(this.ui('Gemini Nano preparado correctamente para inferencia sin internet.', 'Gemini Nano is ready for offline inference.'));
    } catch (error: unknown) {
      this.handleError(error);
    } finally {
      this.busy.set(false);
    }
  }

  async sendLinguisticCorrection(): Promise<void> {
    if (!this.correctionTermEs || !this.correctionSuggestedChanka) {
      this.error.set(this.ui('Por favor completa el término en español y la sugerencia en Quechua Chanka.', 'Enter the Spanish term and your Chanka Quechua suggestion.'));
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      await this.translator.submitCorrection(
        this.correctionTermEs,
        this.correctionTranslatedQu || this.correctionTermEs,
        this.correctionSuggestedChanka,
        this.correctionContext
      );
      this.correctionSuccess.set(true);
      this.feedback.set(this.ui('Sugerencia lingüística enviada para revisión con docentes EIB.', 'Language suggestion submitted for bilingual-teacher review.'));
      this.correctionTermEs = '';
      this.correctionTranslatedQu = '';
      this.correctionSuggestedChanka = '';
      this.correctionContext = '';
    } catch (err: unknown) {
      this.handleError(err);
    } finally {
      this.busy.set(false);
    }
  }

  async exportNotebook(): Promise<void> {
    try {
      const json = await this.diary.exportJson();
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `ostrixai-diario-${this.todayLocal()}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      this.feedback.set(this.ui('Copia de seguridad del diario exportada en formato JSON.', 'Journal backup exported as JSON.'));
    } catch (error: unknown) {
      this.handleError(error);
    }
  }

  dateLabel(value: string): string {
    return new Date(`${value}T12:00:00`).toLocaleDateString(
      this.settings.profile().language === 'en' ? 'en-US' : 'es-PE',
      { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
    );
  }

  private todayLocal(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  private handleError(error: unknown): void {
    this.error.set(error instanceof Error ? error.message : this.ui('Ocurrió un error inesperado.', 'An unexpected error occurred.'));
  }
}
