import { Injectable, inject, signal, computed } from '@angular/core';
import { LocalIdentityService } from './local-identity.service';
import { CurriculumExercise, findMatchingExercises, EXERCISE_CATALOG } from './exercise-catalog';

export type ConceptStatus = 'PENDING' | 'EXPLAINED' | 'TESTED' | 'MASTERED' | 'REINFORCING';

export interface ConceptHistoryEntry {
  readonly id?: string; // Earlier journals did not assign review IDs.
  readonly date: string;
  readonly exerciseId?: string;
  readonly selectedAnswer: string | number;
  readonly isCorrect: boolean;
  readonly score: number; // 0 a 5
}

export interface ConceptMemory {
  readonly id: string;
  readonly sessionId: string;
  readonly course: string;
  readonly topic: string;
  readonly conceptText: string;
  readonly status: ConceptStatus;
  readonly explanation?: string;
  readonly explanationSource?: 'ON_DEVICE' | 'IN_CLOUD' | 'CURRICULUM_OFFLINE';
  readonly repetitions: number;
  readonly streak: number;
  readonly intervalDays: number;
  readonly easeFactor: number; // Factor SM-2 (inicial 2.5)
  readonly nextReviewDate: string; // YYYY-MM-DD
  readonly lastReviewedDate?: string;
  readonly history: readonly ConceptHistoryEntry[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface LearningProgressSummary {
  readonly totalConcepts: number;
  readonly pendingCount: number;
  readonly explainedCount: number;
  readonly reinforcingCount: number;
  readonly masteredCount: number;
  readonly dueTodayCount: number;
  readonly masteryPercentage: number;
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(baseDateStr: string, days: number): string {
  const d = new Date(`${baseDateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

/**
 * Servicio de Memoria de Aprendizaje Real de OstrixAi.
 * Implementa el ciclo pedagógico determinista:
 * APUNTES → DUDAS → EXPLICACIÓN → EVALUACIÓN → REPASO → PROGRESO.
 *
 * Utiliza el algoritmo determinista SuperMemo SM-2 para la repetición espaciada.
 */
@Injectable({ providedIn: 'root' })
export class LearningMemoryService {
  private readonly identity = inject(LocalIdentityService);

  readonly concepts = signal<readonly ConceptMemory[]>([]);

  readonly progress = computed<LearningProgressSummary>(() => {
    const list = this.concepts();
    const today = formatDate(new Date());
    const total = list.length;
    if (total === 0) {
      return {
        totalConcepts: 0,
        pendingCount: 0,
        explainedCount: 0,
        reinforcingCount: 0,
        masteredCount: 0,
        dueTodayCount: 0,
        masteryPercentage: 0,
      };
    }

    const pendingCount = list.filter(c => c.status === 'PENDING').length;
    const explainedCount = list.filter(c => c.status === 'EXPLAINED').length;
    const reinforcingCount = list.filter(c => c.status === 'REINFORCING').length;
    const masteredCount = list.filter(c => c.status === 'MASTERED').length;
    const dueTodayCount = list.filter(c => c.nextReviewDate <= today).length;
    const masteryPercentage = Math.round((masteredCount / total) * 100);

    return {
      totalConcepts: total,
      pendingCount,
      explainedCount,
      reinforcingCount,
      masteredCount,
      dueTodayCount,
      masteryPercentage,
    };
  });

  async load(): Promise<void> {
    const owner = this.identity.student()?.id;
    if (!owner) {
      this.clear();
      return;
    }
    const all = await this.identity.list<ConceptMemory>('memory');
    if (this.identity.student()?.id === owner) {
      this.concepts.set(all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    }
  }

  clear(): void {
    this.concepts.set([]);
  }

  /**
   * 1. PASO DUDAS: Registra una duda escolar como concepto pendiente de aprendizaje.
   */
  async registerDoubt(sessionId: string, course: string, topic: string, conceptText: string): Promise<ConceptMemory> {
    const owner = this.identity.student();
    const cleanText = conceptText.trim();
    if (!cleanText || cleanText.length > 500) {
      throw new Error('El concepto o duda debe tener entre 1 y 500 caracteres.');
    }

    // Evitar duplicados exactos en la misma sesión
    const existing = this.concepts().find(c => c.sessionId === sessionId && c.conceptText.toLowerCase() === cleanText.toLowerCase());
    if (existing) return existing;

    const today = formatDate(new Date());
    const now = new Date().toISOString();

    const concept: ConceptMemory = {
      id: crypto.randomUUID(),
      sessionId,
      course: course.trim(),
      topic: topic.trim(),
      conceptText: cleanText,
      status: 'PENDING',
      repetitions: 0,
      streak: 0,
      intervalDays: 1,
      easeFactor: 2.5,
      nextReviewDate: today,
      history: [],
      createdAt: now,
      updatedAt: now,
    };

    await this.identity.save('memory', concept.id, concept);
    if (this.identity.student() !== owner) throw new Error('La sesión cambió.');
    this.concepts.update(prev => [concept, ...prev]);
    return concept;
  }

  /**
   * 2. PASO EXPLICACIÓN: Asocia una explicación (IA local, nube o catálogo offline) a la duda.
   */
  async recordExplanation(
    conceptId: string,
    explanation: string,
    source: 'ON_DEVICE' | 'IN_CLOUD' | 'CURRICULUM_OFFLINE'
  ): Promise<void> {
    const concept = this.concepts().find(c => c.id === conceptId);
    if (!concept) throw new Error('Concepto no encontrado en la memoria.');

    const updated: ConceptMemory = {
      ...concept,
      explanation: explanation.trim(),
      explanationSource: source,
      status: concept.status === 'PENDING' ? 'EXPLAINED' : concept.status,
      updatedAt: new Date().toISOString(),
    };

    await this.identity.save('memory', updated.id, updated);
    this.concepts.update(prev => prev.map(c => c.id === conceptId ? updated : c));
  }

  /**
   * 3. PASO EVALUACIÓN Y REPASO DETERMINISTA (Algoritmo SM-2):
   * Evalúa la respuesta del estudiante a un ejercicio y recalcula el intervalo de repetición espaciada.
   */
  async submitAnswer(
    conceptId: string,
    exerciseId: string,
    selectedAnswerIndex: number,
    gradeStudent?: (1 | 2 | 3 | 4 | 5) | null
  ): Promise<{ isCorrect: boolean; explanation: string; nextReviewDate: string; newStatus: ConceptStatus }> {
    const exercise = EXERCISE_CATALOG.find(e => e.id === exerciseId);
    if (!exercise) throw new Error('Ejercicio no encontrado en el catálogo.');
    const concept = this.concepts().find(c => c.id === conceptId);
    if (concept?.conceptText !== exercise.question || !Number.isInteger(selectedAnswerIndex) || !exercise.options?.[selectedAnswerIndex]) {
      throw new Error('El ejercicio o la opción no corresponde a este concepto.');
    }
    const correct = exercise.type === 'true_false' ? (exercise.correctAnswer ? 0 : 1) : exercise.correctAnswer;
    return this.recordGradedAnswer(conceptId, exerciseId, selectedAnswerIndex,
      correct === selectedAnswerIndex, exercise.explanation);
  }

  async recordGradedAnswer(conceptId: string, exerciseId: string, selectedAnswerIndex: number,
    isCorrect: boolean, explanation: string, eventId: string = crypto.randomUUID(), allowMastery = true) {
    const owner = this.identity.student();
    const snapshot = await this.identity.readVersion<ConceptMemory>('memory', conceptId);
    if (!owner || owner !== this.identity.student() || !snapshot) throw new Error('Concepto no encontrado.');
    const concept = snapshot.value;
    if (concept.history.some(h => h.id === eventId)) {
      return { isCorrect, explanation, nextReviewDate: concept.nextReviewDate, newStatus: concept.status };
    }
    const score = isCorrect ? 5 : 1; // 5 para acierto, 1 para fallo en escala SM-2

    // Algoritmo de Repetición Espaciada SM-2 determinista
    let newRepetitions = concept.repetitions;
    let newStreak = concept.streak;
    let newInterval = concept.intervalDays;
    let newEaseFactor = concept.easeFactor;
    let newStatus: ConceptStatus;

    if (isCorrect) {
      newStreak += 1;
      if (newRepetitions === 0) {
        newInterval = 1;
      } else if (newRepetitions === 1) {
        newInterval = 3;
      } else {
        newInterval = Math.round(newInterval * newEaseFactor);
      }
      newRepetitions += 1;
      // Ajuste del factor de facilidad (Ease Factor) de SM-2
      newEaseFactor = Math.max(1.3, newEaseFactor + (0.1 - (5 - score) * (0.08 + (5 - score) * 0.02)));
      newStatus = concept.status === 'MASTERED' || (allowMastery && newStreak >= 2) ? 'MASTERED' : 'TESTED';
    } else {
      newRepetitions = 0;
      newStreak = 0;
      newInterval = 1; // Repasar al día siguiente
      newEaseFactor = Math.max(1.3, newEaseFactor - 0.2);
      newStatus = 'REINFORCING';
    }

    const today = formatDate(new Date());
    const nextReviewDate = addDays(today, newInterval);

    const historyEntry: ConceptHistoryEntry = {
      id: eventId,
      date: today,
      exerciseId,
      selectedAnswer: selectedAnswerIndex,
      isCorrect,
      score,
    };

    const updated: ConceptMemory = {
      ...concept,
      repetitions: newRepetitions,
      streak: newStreak,
      intervalDays: newInterval,
      easeFactor: Number(newEaseFactor.toFixed(2)),
      lastReviewedDate: today,
      nextReviewDate,
      status: newStatus,
      history: [...concept.history, historyEntry],
      updatedAt: new Date().toISOString(),
    };

    await this.identity.save('memory', updated.id, updated, snapshot.nonce);
    if (this.identity.student() !== owner) throw new Error('La sesión cambió.');
    this.concepts.update(prev => prev.map(c => c.id === conceptId ? updated : c));

    return {
      isCorrect,
      explanation,
      nextReviewDate,
      newStatus,
    };
  }

  /**
   * Obtiene los conceptos que tienen repaso programado para hoy o pendientes.
   */
  getDueConcepts(course?: string): readonly ConceptMemory[] {
    const today = formatDate(new Date());
    return this.concepts()
      .filter(c => c.nextReviewDate <= today && (!course || c.course === course))
      .sort((a, b) => a.nextReviewDate.localeCompare(b.nextReviewDate));
  }

  /**
   * Encuentra ejercicios alineados para un concepto en memoria.
   */
  getExercisesForConcept(concept: ConceptMemory, grade?: number): readonly CurriculumExercise[] {
    return findMatchingExercises(concept.course, `${concept.topic} ${concept.conceptText}`, grade);
  }

  /**
   * Genera el contexto pedagógico estructurado para la IA a partir de la memoria.
   * Recupera dudas previas y conceptos reforzados sin simular reentrenamiento del modelo.
   */
  buildContextForPrompt(currentCourse: string, currentTopic: string): string {
    const related = this.concepts().filter(c =>
      c.course.toLowerCase() === currentCourse.toLowerCase()
    );

    const reinforcing = related.filter(c => c.status === 'REINFORCING').map(c => c.conceptText);
    const mastered = related.filter(c => c.status === 'MASTERED').map(c => c.conceptText);

    let context = '';
    if (reinforcing.length > 0) {
      context += `\nCONCEPTOS PREVIOS EN REFUERZO (El estudiante tuvo dudas recientemente): ${reinforcing.slice(0, 4).join('; ')}.`;
    }
    if (mastered.length > 0) {
      context += `\nCONCEPTOS YA COMPRENDIDOS: ${mastered.slice(0, 4).join('; ')}.`;
    }
    return context;
  }
}
