import { Injectable, inject } from '@angular/core';
import { LocalIdentityService } from './local-identity.service';
import { StudySession } from './session-migration';
import { OstrixAiService } from './ostrix-ai.service';
import { DeviceCapabilitiesService } from './device-capabilities.service';
import { StudentSettingsService } from './student-settings.service';
import { LearningMemoryService } from './learning-memory.service';
import { findMatchingExercises } from './exercise-catalog';
import { cleanMarkdownToText } from './markdown-cleaner';
import { isIndependentlyVerifiableQuestion } from './practice-question-verifier';
import { directCalculation } from './tutor-calculation';

export type QuestionType = 'MULTIPLE_CHOICE' | 'TRUE_FALSE';
export type PracticeDifficulty = 'BASIC' | 'INTERMEDIATE' | 'ADVANCED';
export type PracticeTypeConfig = 'MIXED' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE';
type QuestionSource = 'ON_DEVICE' | 'IN_CLOUD' | 'CURRICULUM_OFFLINE';

function questionKey(text: string): string {
  const calculation = directCalculation(text);
  if (calculation) return 'math:' + calculation.expression.replace(/\s+/g, '').replace(/−/g, '-').replace(/×/g, '*');
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s*¿es correcta la respuesta «[^»]+»\?$/, '')
    .replace(/[¿?¡!.,:;"«»]/g, ' ').replace(/\s+/g, ' ').trim();
}

export interface PracticeQuestion {
  id: string;
  type: QuestionType;
  questionText: string;
  options: string[]; // 4 items for MULTIPLE_CHOICE, 2 items ["Verdadero", "Falso"] for TRUE_FALSE
  correctAnswerIndex: number;
  explanation: string;
  topicName?: string;
  source?: QuestionSource;
  difficulty: PracticeDifficulty;
}

export interface PracticeExam {
  practiceFocus?: string;
  id: string;
  sessionId: string;
  course: string;
  sessionTitle: string;
  createdAt: string;
  difficulty: PracticeDifficulty;
  questionCount: number;
  contentStamp?: string;
  fromCache?: boolean;
  curriculumSupplement?: number;
  practiceType: PracticeTypeConfig;
  questions: PracticeQuestion[];
  inferenceSource: 'ON_DEVICE' | 'IN_CLOUD' | 'CURRICULUM_OFFLINE' | 'SAVED_CACHE';
}

export interface PracticeAttempt {
  practiceFocus?: string;
  id: string;
  examId: string;
  sessionId: string;
  course: string;
  sessionTitle: string;
  completedAt: string;
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  scorePercentage: number;
  timeSpentSeconds: number;
  reviewIds?: Record<string, string>;
  userAnswers: Record<string, number>; // questionId -> selectedOptionIndex
  questions: PracticeQuestion[];
}

export interface ExamGenerationConfig {
  count: 5 | 10;
  difficulty: PracticeDifficulty;
  type: PracticeTypeConfig;
  allowCloud?: boolean;
  forceFresh?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class PracticeExamService {
  private readonly identity = inject(LocalIdentityService);
  private readonly ai = inject(OstrixAiService);
  private readonly device = inject(DeviceCapabilitiesService);
  private readonly settings = inject(StudentSettingsService);
  private readonly memory = inject(LearningMemoryService);

  /**
   * Genera o recupera un examen formativo adaptado al contenido real del estudiante.
   */
  async generateExam(session: StudySession, config: ExamGenerationConfig): Promise<PracticeExam> {
    const student = this.identity.student();
    if (!student) {
      throw new Error('Debes iniciar sesión para practicar para exámenes.');
    }

    const contentStamp = JSON.stringify([session.course, session.topic, session.notes, session.doubts, session.topics.map(t => [t.name, t.originalNotesText])]);
    // 1. Verificar si existe un examen en caché válido para esta sesión si no se fuerza uno nuevo
    if (!config.forceFresh) {
      const cached = await this.getCachedExam(session.id);
      if (this.identity.student() !== student) throw new Error('La sesión cambió.');
      if (
        cached && cached.contentStamp === contentStamp &&
        cached.questions.length >= config.count &&
        cached.questions.every(isIndependentlyVerifiableQuestion) &&
        new Set(cached.questions.map(q => questionKey(q.questionText))).size === cached.questions.length &&
        cached.difficulty === config.difficulty &&
        (config.type === 'MIXED' || cached.practiceType === config.type)
      ) {
        const questions = cached.questions.slice(0, config.count);
        const offlineCount = questions.filter(q => q.source === 'CURRICULUM_OFFLINE').length;
        return {
          ...cached,
          questionCount: config.count,
          fromCache: true,
          questions,
          inferenceSource: offlineCount === questions.length ? 'CURRICULUM_OFFLINE' : cached.inferenceSource,
          curriculumSupplement: offlineCount < questions.length ? offlineCount : 0,
        };
      }
    }

    // 2. Extraer y validar el contenido académico real de la sesión
    const academicNotes = this.extractAcademicContent(session);
    const hasEnoughContent = academicNotes.totalWords >= 12;

    await this.device.checkNano();
    if (this.identity.student() !== student) throw new Error('La sesión cambió.');
    const isNanoReady =
      this.device.nano() === 'available' ||
      this.device.engineState() === 'ready' ||
      this.device.engineState() === 'available';

    const profile = this.settings.profile();
    const cloudAllowed = Boolean(
      config.allowCloud !== false && profile.allowCloudEnrichment && !profile.offlineOnly
    );

    // 3. Fallback a ejercicios curriculares offline si no hay IA generativa disponible
    if (!isNanoReady && !cloudAllowed) {
      const offlineExam = this.generateFromCurriculumExercises(session, config);
      if (offlineExam) {
        offlineExam.contentStamp = contentStamp;
        await this.identity.save('exams', offlineExam.id, offlineExam);
        return offlineExam;
      }
      if (!hasEnoughContent) {
        throw new Error(
          'La sesión no tiene suficientes notas guardadas (mínimo 12 palabras) y no hay motor de IA local activo. ' +
          'Anota conceptos clave en la Pizarra antes de generar un examen.'
        );
      }
      throw new Error(
        'Gemini Nano no está listo en este navegador y el procesamiento Cloud no ha sido autorizado en Configuración. ' +
        'Puedes preparar la IA local en Configuración o habilitar Gemini Cloud para practicar.'
      );
    }

    // Si hay IA pero no hay contenido mínimo
    if (!hasEnoughContent) {
      const offlineExam = this.generateFromCurriculumExercises(session, config);
      if (offlineExam) {
        offlineExam.contentStamp = contentStamp;
        await this.identity.save('exams', offlineExam.id, offlineExam);
        return offlineExam;
      }
      throw new Error(
        'Esta sesión aún no tiene apuntes suficientes (mínimo 12 palabras). ' +
        'Escribe al menos dos o tres ideas en la Pizarra Académica para que Ostrix pueda evaluarte.'
      );
    }

    // 4. Generación híbrida con IA (Gemini Nano prioritario)
    const mode = isNanoReady ? 'local' : 'cloud';
    const prompt = this.buildExamPrompt(session, academicNotes.text, academicNotes.doubts, config);

    try {
      const source = mode === 'local' ? 'ON_DEVICE' : 'IN_CLOUD';
      const seen = new Set<string>();
      const parsedQuestions: PracticeQuestion[] = [];
      let curriculumSupplement = 0;
      const generate = async (request: string) => {
        if (this.identity.student() !== student) throw new Error('La sesión cambió.');
        const response = await this.ai.processPromptDetailed(request, false, {
          rawPrompt: true, modeOverride: mode, cloudConsent: cloudAllowed ? 'profile' : false,
          allowEssentialFallback: false, saveInOutbox: false,
        });
        if (this.identity.student() !== student) throw new Error('La sesión cambió.');
        if (response.source !== source) throw new Error('No se obtuvo una respuesta de IA verificable.');
        const valid = this.parseAndValidateQuestions(response.text, config.count - parsedQuestions.length,
          config.difficulty, config.type, seen);
        for (const q of valid ?? []) parsedQuestions.push({ ...q, source });
      };
      await generate(prompt);
      if (parsedQuestions.length < config.count) {
        const library = this.generateFromCurriculumExercises(session, config);
        for (const q of library?.questions ?? []) {
          const key = questionKey(q.questionText);
          if (seen.has(key)) continue;
          seen.add(key);
          parsedQuestions.push(q);
          curriculumSupplement++;
          if (parsedQuestions.length === config.count) break;
        }
      }
      if (parsedQuestions.length < config.count) {
        const covered = parsedQuestions.map(q => q.questionText.slice(0, 180)).join('\n');
        try {
          await generate(prompt + '\nGenera ahora solo ' + (config.count - parsedQuestions.length)
            + ' preguntas adicionales diferentes, con solución verificable. Omite las preguntas ya cubiertas:\n' + covered);
        } catch (error) {
          if (!parsedQuestions.length || this.identity.student() !== student ||
            (error instanceof Error && (error.name === 'AbortError' || /cancelad/i.test(error.message)))) throw error;
        }
      }
      if (!parsedQuestions.length) {
        throw new Error('La IA no generó preguntas con respuesta verificable. Para proteger tu progreso, ninguna se calificará automáticamente. Usa el banco offline o continúa con el Tutor.');
      }

      const exam: PracticeExam = {
        id: crypto.randomUUID ? crypto.randomUUID() : `exam-${Date.now()}`,
        sessionId: session.id,
        course: session.course,
        sessionTitle: session.topic || 'General',
        createdAt: new Date().toISOString(),
        difficulty: config.difficulty,
        questionCount: parsedQuestions.length,
        contentStamp,
        practiceType: config.type,
        questions: parsedQuestions,
        inferenceSource: curriculumSupplement === parsedQuestions.length ? 'CURRICULUM_OFFLINE' : source,
        curriculumSupplement: curriculumSupplement < parsedQuestions.length ? curriculumSupplement : 0,
      };

      // Persistir examen cifrado en IndexedDB
      await this.identity.save('exams', exam.id, exam);
      return exam;
    } catch (err: unknown) {
      if (this.identity.student() !== student || (err instanceof Error && (err.name === 'AbortError' || /cancelad/i.test(err.message)))) throw err;
      // Intento de rescate con ejercicios curriculares offline si la IA falla
      const offlineFallback = this.generateFromCurriculumExercises(session, config);
      if (offlineFallback) {
        offlineFallback.contentStamp = contentStamp;
        await this.identity.save('exams', offlineFallback.id, offlineFallback);
        return offlineFallback;
      }
      throw err instanceof Error ? err : new Error('No se pudo generar el examen de práctica.');
    }
  }

  /**
   * Evalúa y guarda un intento de examen completado, calculando aciertos e integrando con SM-2.
   */
  async createFocusedExam(session: StudySession, focus: string, previous?: PracticeQuestion): Promise<PracticeExam | null> {
    const owner = this.identity.student();
    if (!owner || !this.settings.profile().autoInjectSessionContext) return null;
    // Nunca reutilizar una pregunta antigua cuya clave no pueda comprobarse.
    let question = previous && isIndependentlyVerifiableQuestion(previous) ? previous : undefined;
    let source: PracticeExam['inferenceSource'] = 'SAVED_CACHE';
    if (!question) {
      const exercise = findMatchingExercises(session.course, focus, session.grade, 1, true)[0];
      if (exercise?.options && typeof exercise.correctAnswer === 'number') {
        question = { id: exercise.id, type: 'MULTIPLE_CHOICE', questionText: exercise.question,
          options: [...exercise.options], explanation: exercise.explanation, topicName: exercise.topic,
          correctAnswerIndex: exercise.correctAnswer, difficulty: 'BASIC', source: 'CURRICULUM_OFFLINE' };
        source = 'CURRICULUM_OFFLINE';
      }
    }
    if (!question && this.device.nano() === 'available') {
      const english = this.settings.profile().language === 'en';
      const prompt = (english ? 'Write one secondary-school multiple-choice practice question about the stated focus.' :
        'Escribe una pregunta de opción múltiple de secundaria sobre el concepto indicado.') +
        '\nReturn a JSON array of one object: {type:"MULTIPLE_CHOICE",questionText,options:[four distinct strings],correctAnswerIndex:0..3,explanation}.\n' +
        JSON.stringify({ course: session.course, focus });
      const result = await this.ai.processPromptDetailed(prompt, false, {
        modeOverride: 'local', cloudConsent: false, rawPrompt: true, saveInOutbox: false, allowEssentialFallback: false,
      });
      if (owner !== this.identity.student() || !this.settings.profile().autoInjectSessionContext) return null;
      if (result.source === 'ON_DEVICE') {
        const verified = this.parseAndValidateQuestions(result.text, 1, 'BASIC')?.[0];
        question = verified ? { ...verified, source: 'ON_DEVICE' } : undefined;
        source = 'ON_DEVICE';
      }
    }
    if (!question || !isIndependentlyVerifiableQuestion(question)) return null;
    return { id: crypto.randomUUID(), practiceFocus: focus, sessionId: session.id, course: session.course,
      sessionTitle: session.topic, createdAt: new Date().toISOString(), difficulty: question.difficulty,
      questionCount: 1, practiceType: question.type, questions: [question], inferenceSource: source };
  }

  async createAndSaveAttempt(
    exam: PracticeExam,
    userAnswers: Record<string, number>,
    timeSpentSeconds: number,
    attemptId: string = crypto.randomUUID()
  ): Promise<PracticeAttempt> {
    // Bloqueo también en la entrada de calificación: protege exámenes ya
    // guardados antes de instalar este parche o leídos de caché.
    if (!exam.questions.length || !exam.questions.every(isIndependentlyVerifiableQuestion)) {
      throw new Error('Esta pregunta no tiene una respuesta comprobada de forma independiente. No se guardará una nota ni se modificará tu progreso.');
    }
    const owner = this.identity.student();
    const existing = await this.identity.read<PracticeAttempt>('attempts', attemptId);
    if (!owner || owner !== this.identity.student()) throw new Error('La sesión cambió.');
    if (existing) {
      await this.integrateAttemptWithLearningMemory(existing);
      return existing;
    }
    let correct = 0;
    let incorrect = 0;
    let unanswered = 0;

    for (const q of exam.questions) {
      const ans = userAnswers[q.id];
      if (ans === undefined) {
        unanswered++;
      } else if (ans === q.correctAnswerIndex) {
        correct++;
      } else {
        incorrect++;
      }
    }

    const total = exam.questions.length;
    const scorePercentage = total > 0 ? Math.round((correct / total) * 100) : 0;

    const attempt: PracticeAttempt = {
      id: attemptId,
      reviewIds: Object.fromEntries(exam.questions.map(q => [q.id, crypto.randomUUID()])),
      examId: exam.id,
      practiceFocus: exam.practiceFocus,
      sessionId: exam.sessionId,
      course: exam.course,
      sessionTitle: exam.sessionTitle,
      completedAt: new Date().toISOString(),
      totalQuestions: total,
      correctCount: correct,
      incorrectCount: incorrect,
      unansweredCount: unanswered,
      scorePercentage,
      timeSpentSeconds,
      userAnswers,
      questions: exam.questions,
    };

    await this.saveAttempt(attempt);
    return attempt;
  }

  /**
   * Guarda un intento de examen completado e integra los resultados con la memoria SM-2.
   */
  async saveAttempt(attempt: PracticeAttempt): Promise<void> {
    if (!attempt.questions.length || !attempt.questions.every(isIndependentlyVerifiableQuestion)) {
      throw new Error('No se guardan calificaciones de preguntas sin respuesta verificada.');
    }
    const student = this.identity.student();
    if (!student) return;

    // Persistir el intento cifrado en IndexedDB
    await this.identity.save('attempts', attempt.id, attempt);
    if (student !== this.identity.student()) throw new Error('La sesión cambió.');

    // Integración pedagógica con Memoria y Repetición Espaciada (SM-2)
    await this.integrateAttemptWithLearningMemory(attempt);
  }

  /**
   * Obtiene el historial de intentos guardados para una sesión específica o para todas.
   */
  async getExamHistory(sessionId?: string): Promise<PracticeAttempt[]> {
    try {
      const all = await this.identity.list<PracticeAttempt>('attempts');
      if (!sessionId) return all.sort((a, b) => b.completedAt.localeCompare(a.completedAt));
      return all
        .filter(a => a.sessionId === sessionId)
        .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
    } catch {
      return [];
    }
  }

  /**
   * Recupera el examen guardado más reciente para una sesión.
   */
  async getCachedExam(sessionId: string): Promise<PracticeExam | null> {
    try {
      const all = await this.identity.list<PracticeExam>('exams');
      const forSession = all.filter(e => e.sessionId === sessionId);
      if (forSession.length === 0) return null;
      forSession.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return forSession[0];
    } catch {
      return null;
    }
  }

  // ===========================================================================
  // MÉTODOS PRIVADOS DE EXTRACCIÓN Y VALIDACIÓN
  // ===========================================================================

  private extractAcademicContent(session: StudySession): { text: string; doubts: string[]; totalWords: number } {
    const parts: string[] = [];
    let wordCount = 0;

    if (session.topics && session.topics.length > 0) {
      for (const t of session.topics) {
        const notesStr = t.originalNotesText.trim() || t.notes.join('. ');
        if (!notesStr) continue;
        parts.push(`Tema: ${t.name}. ${notesStr}`);
        wordCount += notesStr.split(/\s+/).filter(Boolean).length;
      }
    } else if (session.notes) {
      parts.push(`Apuntes generales: ${session.notes}`);
      wordCount += session.notes.split(/\s+/).filter(Boolean).length;
    }

    const doubts: string[] = [];
    if (session.doubts && session.doubts.length > 0) {
      doubts.push(...session.doubts);
    }

    return {
      text: parts.join('\n'),
      doubts,
      totalWords: wordCount,
    };
  }

  private buildExamPrompt(
    session: StudySession,
    academicContent: string,
    doubts: string[],
    config: ExamGenerationConfig
  ): string {
    const diffMap: Record<PracticeDifficulty, string> = {
      BASIC: 'Básica (conceptos directos, definiciones y reconocimiento)',
      INTERMEDIATE: 'Intermedia (aplicación, análisis y relaciones de causa-efecto)',
      ADVANCED: 'Avanzada (resolución de problemas, síntesis y casos prácticos)',
    };

    const typeInstruction =
      config.type === 'TRUE_FALSE'
        ? 'Todas las preguntas deben ser de tipo TRUE_FALSE (Verdadero o Falso con 2 opciones: ["Verdadero", "Falso"]).'
        : config.type === 'MULTIPLE_CHOICE'
        ? 'Todas las preguntas deben ser de tipo MULTIPLE_CHOICE con exactamente 4 alternativas.'
        : 'Mezcla preguntas de MULTIPLE_CHOICE (4 alternativas) y TRUE_FALSE (2 alternativas: ["Verdadero", "Falso"]).';

    const doubtsSection =
      doubts.length > 0
        ? `IMPORTANTE: El estudiante registró estas dudas/dificultades durante la clase: "${doubts.join(
            '", "'
          )}". Formula al menos una pregunta orientada a resolver y reforzar estas dificultades específicas.`
        : '';

    return (
      `Actúa como evaluador pedagógico para educación secundaria.\n` +
      `Genera un cuestionario de práctica para el curso "${session.course}", clase "${session.topic || 'General'}".\n\n` +
      `Dificultad requerida: ${diffMap[config.difficulty]}.\n` +
      `Cantidad exacta de preguntas: ${config.count}.\n` +
      `Formato: ${typeInstruction}\n\n` +
      `${doubtsSection}\n\n` +
      `Contenido académico de estudio provisto por el estudiante:\n"""\n${academicContent.slice(0, 2200)}\n"""\n\n` +
      `REGLAS OBLIGATORIAS:\n` +
      `1. Las preguntas deben formularse ÚNICAMENTE a partir del contenido académico provisto arriba.\n` +
      `2. No inventes hechos ni fórmulas no mencionadas en los apuntes.\n` +
      `3. PRECISIÓN PEDAGÓGICA ESTRICTA: Verifica que correctAnswerIndex sea 100% indiscutible. En gramática, 'El perro ladra' es intransitivo y no tiene objeto directo. En ciencias y matemática, comprueba definiciones y cálculos paso a paso.\n` +
      `4. Responde EXCLUSIVAMENTE con un array JSON sin texto conversacional ni markdown adicional.\n` +
      `5. Estructura exacta de cada objeto en el array JSON:\n` +
      `[\n` +
      `  {\n` +
      `    "type": "MULTIPLE_CHOICE" o "TRUE_FALSE",\n` +
      `    "questionText": "¿Enunciado claro de la pregunta?",\n` +
      `    "options": ["Opción A", "Opción B", "Opción C", "Opción D"],\n` +
      `    "correctAnswerIndex": 0,\n` +
      `    "explanation": "Breve explicación pedagógica (20 a 40 palabras) de por qué esta es la respuesta correcta.",\n` +
      `    "topicName": "Nombre del tema relacionado"\n` +
      `  }\n` +
      `]\n`
    );
  }

  private parseAndValidateQuestions(
    rawText: string,
    expectedCount: number,
    difficulty: PracticeDifficulty,
    type: PracticeTypeConfig = 'MIXED',
    seen = new Set<string>()
  ): PracticeQuestion[] | null {
    if (!rawText) return null;

    let jsonStr = rawText.trim();
    // Remover posibles bloques markdown ```json ... ```
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
    }

    // Extraer array JSON si hay texto adicional alrededor
    const firstBracket = jsonStr.indexOf('[');
    const lastBracket = jsonStr.lastIndexOf(']');
    if (firstBracket >= 0 && lastBracket > firstBracket) {
      jsonStr = jsonStr.substring(firstBracket, lastBracket + 1);
    }

    // Limpieza de comas finales (trailing commas) que invalidan JSON.parse estándar
    jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1');

    try {
      const parsed = JSON.parse(jsonStr);
      if (!Array.isArray(parsed) || parsed.length === 0) return null;

      const validList: PracticeQuestion[] = [];
      for (let i = 0; i < parsed.length; i++) {
        const item = parsed[i];
        if (!item || typeof item.questionText !== 'string' || item.questionText.trim().length < 6) {
          continue;
        }

        const isTF = item.type === 'TRUE_FALSE';
        if (!isTF && item.type !== 'MULTIPLE_CHOICE') continue;
        if (type !== 'MIXED' && item.type !== type) continue;
        if (!Array.isArray(item.options) || item.options.length !== (isTF ? 2 : 4)) continue;
        if (!item.options.every((opt: unknown) => typeof opt === 'string' && opt.trim())) continue;
        const options: string[] = item.options.map((opt: string) => opt.trim());
        if (new Set(options.map(opt => opt.toLowerCase())).size !== options.length) continue;
        if (isTF && !['falso,verdadero', 'false,true'].includes(options.map(opt => opt.toLowerCase()).sort().join(','))) continue;
        const correctIdx = item.correctAnswerIndex;
        if (!Number.isInteger(correctIdx) || correctIdx < 0 || correctIdx >= options.length) continue;
        if (typeof item.explanation !== 'string' || !item.explanation.trim()) continue;
        const questionText = cleanMarkdownToText(item.questionText.trim());
        const explanation = cleanMarkdownToText(item.explanation.trim());
        const key = questionKey(questionText);
        if (key.length < 4 || !explanation || seen.has(key) || /^opci[oó]n [a-d]$/i.test(options[correctIdx])) continue;
        const candidate: PracticeQuestion = {
          id: crypto.randomUUID(),
          type: isTF ? 'TRUE_FALSE' : 'MULTIPLE_CHOICE',
          questionText,
          options,
          correctAnswerIndex: correctIdx,
          explanation,
          topicName: typeof item.topicName === 'string' ? item.topicName.trim() : undefined,
          difficulty,
        };
        if (!isIndependentlyVerifiableQuestion(candidate)) continue;
        seen.add(key);
        validList.push(candidate);

        if (validList.length >= expectedCount) break;
      }

      return validList.length > 0 ? validList : null;
    } catch {
      return null;
    }
  }

  private generateFromCurriculumExercises(
    session: StudySession,
    config: ExamGenerationConfig
  ): PracticeExam | null {
    const course = session.course;
    const topic = session.topic || session.topics?.[0]?.name || 'General';

    const studyText = [topic, ...session.topics.map(t => t.name), session.notes, ...session.doubts].join(' ');
    const exercises = findMatchingExercises(course, studyText, undefined, config.count * 2, true);
    if (!exercises || exercises.length === 0) return null;

    const questions: PracticeQuestion[] = [];
    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];
      const isTF = config.type === 'TRUE_FALSE' || (config.type === 'MIXED' && i % 2 === 1);

      if (!ex.options || typeof ex.correctAnswer !== 'number' || !ex.options[ex.correctAnswer]) continue;
      const trueFalseIndex = config.type === 'MIXED' ? Math.floor(i / 2) : i;
      const proposedIndex = trueFalseIndex % 2 === 0 ? ex.correctAnswer : (ex.correctAnswer + 1) % ex.options.length;
      const candidate: PracticeQuestion = {
        id: `curr-${ex.id}-${i}`,
        source: 'CURRICULUM_OFFLINE',
        type: isTF ? 'TRUE_FALSE' : 'MULTIPLE_CHOICE',
        questionText: isTF ? `${ex.question} ¿Es correcta la respuesta «${ex.options[proposedIndex]}»?` : ex.question,
        options: isTF ? ['Verdadero', 'Falso'] : [...ex.options],
        correctAnswerIndex: isTF ? (proposedIndex === ex.correctAnswer ? 0 : 1) : ex.correctAnswer,
        explanation: ex.explanation,
        topicName: ex.topic,
        difficulty: config.difficulty,
      };
      if (!isIndependentlyVerifiableQuestion(candidate)) continue;
      questions.push(candidate);

      if (questions.length >= config.count) break;
    }

    if (questions.length === 0) return null;

    return {
      id: crypto.randomUUID ? crypto.randomUUID() : `exam-curriculum-${Date.now()}`,
      sessionId: session.id,
      course: session.course,
      sessionTitle: session.topic || 'General',
      createdAt: new Date().toISOString(),
      difficulty: config.difficulty,
      questionCount: questions.length,
      practiceType: config.type,
      questions,
      inferenceSource: 'CURRICULUM_OFFLINE',
    };
  }

  private async integrateAttemptWithLearningMemory(attempt: PracticeAttempt): Promise<void> {
    const owner = this.identity.student();
    for (const q of attempt.questions) {
      if (!owner || owner !== this.identity.student()) throw new Error('La sesión cambió.');
      const answer = attempt.userAnswers[q.id];
      if (answer === undefined) continue;
      const concept = await this.memory.registerDoubt(attempt.sessionId, attempt.course,
        q.topicName || attempt.sessionTitle, (attempt.practiceFocus ?? q.questionText).slice(0, 500));
      if (owner !== this.identity.student()) throw new Error('La sesión cambió.');
      await this.memory.recordGradedAnswer(concept.id, q.id, answer, answer === q.correctAnswerIndex,
        q.explanation, attempt.reviewIds?.[q.id], !attempt.practiceFocus && Object.keys(attempt.userAnswers).length >= 3);
    }
  }
}
