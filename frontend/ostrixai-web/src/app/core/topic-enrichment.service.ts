import { Injectable, inject, signal } from '@angular/core';
import {
  LearningDiaryService,
  Topic,
  StudySession,
  EnrichedDoubtItem,
  EnrichedEurekaItem,
  EnrichmentStatus,
} from './learning-diary.service';
import { OstrixAiService, InferenceResult } from './ostrix-ai.service';
import { DeviceCapabilitiesService } from './device-capabilities.service';
import { StudentSettingsService } from './student-settings.service';
import { cleanMarkdownToText } from './markdown-cleaner';
import { LocalIdentityService } from './local-identity.service';
import { LearningMemoryService } from './learning-memory.service';
import {
  buildPedagogicalPrompt,
  validateAndSanitizeEnrichment,
  classifyEurekaDiscovery,
} from './pedagogical-rules';

export interface EnrichmentQueueItem {
  sessionId: string;
  topicId: string;
}

export interface EnrichmentTelemetry {
  readonly topicId: string;
  readonly topicName: string;
  readonly mode: 'local' | 'cloud' | 'hybrid';
  readonly source: 'ON_DEVICE' | 'IN_CLOUD' | 'OFFLINE_ESSENTIAL' | 'PENDING';
  readonly modelUsed: string;
  readonly inputChars: number;
  readonly outputChars: number;
  readonly t_saveLocalMs: number;
  readonly t_prepareMs: number;
  readonly t_ttfbMs?: number;
  readonly t_inferenceMs: number;
  readonly t_processResponseMs: number;
  readonly t_persistEnrichedMs: number;
  readonly t_totalMs: number;
  readonly retries: number;
  readonly wasPrewarmed: boolean;
  readonly status: EnrichmentStatus;
}

@Injectable({ providedIn: 'root' })
export class TopicEnrichmentService {
  private readonly diary = inject(LearningDiaryService);
  private readonly ai = inject(OstrixAiService);
  private readonly device = inject(DeviceCapabilitiesService);
  private readonly settings = inject(StudentSettingsService);
  private readonly memory = inject(LearningMemoryService);
  private readonly identity = inject(LocalIdentityService);
  private sessionVersion = 0;

  readonly isEnriching = signal(false);
  readonly isQueueActive = signal(false);
  readonly currentProcessingTopicId = signal<string | null>(null);
  readonly lastCompletedSessionId = signal<string | null>(null);
  readonly lastError = signal<string | null>(null);
  readonly queueLength = signal(0);

  /** Métricas de rendimiento con performance.now() para auditoría en tiempo real */
  readonly lastTelemetry = signal<EnrichmentTelemetry | null>(null);
  readonly telemetryHistory = signal<readonly EnrichmentTelemetry[]>([]);

  private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly queue: EnrichmentQueueItem[] = [];
  private isProcessingQueue = false;
  /** Do not compete with an active Tutor inference for the same device model. */
  private modelBusyRetryTimer: ReturnType<typeof setTimeout> | null = null;

  resetSession(): void {
    ++this.sessionVersion;
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    this.debounceTimers.clear();
    if (this.modelBusyRetryTimer) clearTimeout(this.modelBusyRetryTimer);
    this.modelBusyRetryTimer = null;
    this.queue.length = 0;
    this.isProcessingQueue = false;
    this.isQueueActive.set(false);
    this.isEnriching.set(false);
    this.queueLength.set(0);
    this.lastTelemetry.set(null);
    this.telemetryHistory.set([]);
    this.lastError.set(null);
    this.currentProcessingTopicId.set(null);
    this.lastCompletedSessionId.set(null);
  }

  private sessionGuard(): () => boolean {
    const version = this.sessionVersion;
    const owner = this.identity.student()?.id;
    return () => !!owner && this.sessionVersion === version && this.identity.student()?.id === owner;
  }

  async prewarm(): Promise<boolean> {
    return this.ai.warmUpLocalModel();
  }

  /**
   * Programa el enriquecimiento automático con debounce (por defecto 6 segundos).
   * Si el estudiante continúa escribiendo dentro del intervalo, el temporizador se reinicia.
   */
  scheduleTopicEnrichment(session: StudySession, topicId: string, delayMs = 6000): void {
    const key = `${session.id}:${topicId}`;

    if (this.debounceTimers.has(key)) {
      clearTimeout(this.debounceTimers.get(key));
      this.debounceTimers.delete(key);
    }

    const active = this.sessionGuard();
    const timer = setTimeout(() => {
      if (!active()) return;
      this.debounceTimers.delete(key);
      this.enqueueTopic(session.id, topicId);
    }, delayMs);

    this.debounceTimers.set(key, timer);
  }

  /**
   * Fuerza el procesamiento inmediato de temas pendientes al cambiar de pantalla o vista.
   */
  flushPendingEnrichments(session: StudySession): void {
    for (const [key, timer] of this.debounceTimers.entries()) {
      const [sessId, topId] = key.split(':');
      if (sessId === session.id) {
        clearTimeout(timer);
        this.debounceTimers.delete(key);
        this.enqueueTopic(sessId, topId);
      }
    }

    for (const t of session.topics) {
      if (
        t.originalNotesText &&
        t.originalNotesText.trim().length > 0 &&
        (t.enrichmentStatus === 'PENDING' || t.enrichmentStatus === 'OUTDATED')
      ) {
        this.enqueueTopic(session.id, t.id);
      }
    }
  }

  /**
   * Dispara el enriquecimiento automático para temas, dudas y eureka tras guardar.
   * Sin necesidad de un segundo clic por parte del estudiante.
   */
  async triggerSaveEnrichment(
    session: StudySession,
    changedTopicIds: string[]
  ): Promise<boolean> {
    const studentProfile = this.settings.profile();
    if (!studentProfile.autoEnrichNotes) {
      return false;
    }

    const nanoAvailable =
      this.device.nano() === 'available' ||
      this.device.engineState() === 'ready' ||
      this.device.engineState() === 'available';
    const cloudAllowed = studentProfile.allowCloudEnrichment && !studentProfile.offlineOnly;

    // Disparar precalentamiento no bloqueante si Nano está listo
    if (nanoAvailable && !this.ai.isWarm()) {
      this.ai.warmUpLocalModel().catch(() => {});
    }

    if (!nanoAvailable && !cloudAllowed) {
      // Inferencia no disponible ni consentida: marcar PENDING sin filtrar nada a la red
      if (changedTopicIds && changedTopicIds.length > 0) {
        for (const tid of changedTopicIds) {
          await this.diary.updateTopic(session.id, tid, {
            enrichmentStatus: 'PENDING',
          });
        }
      }
      return false;
    }

    // 1. Encolar los temas modificados
    if (changedTopicIds && changedTopicIds.length > 0) {
      for (const tid of changedTopicIds) {
        this.enqueueTopic(session.id, tid);
      }
    }

    // 2. Procesar ampliaciones pedagógicas para dudas y eureka de fondo
    this.enrichDoubtsAndEureka(session, nanoAvailable, cloudAllowed).catch(() => {});

    return true;
  }

  /**
   * Añade un tema a la cola de enriquecimiento en segundo plano.
   */
  enqueueTopic(sessionId: string, topicId: string): void {
    const alreadyInQueue = this.queue.some(q => q.sessionId === sessionId && q.topicId === topicId);
    if (!alreadyInQueue) {
      this.queue.push({ sessionId, topicId });
      this.queueLength.set(this.queue.length);
    }
    this.processQueue();
  }

  /**
   * Procesa la cola secuencialmente para no competir por recursos locales de Gemini Nano.
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.isEnriching() || this.queue.length === 0) {
      return;
    }
    // Yield the local model to interactive Tutor requests. Existing queue remains intact.
    if (this.ai.isBusy()) {
      if (!this.modelBusyRetryTimer) {
        const guard = this.sessionGuard();
        this.modelBusyRetryTimer = setTimeout(() => {
          this.modelBusyRetryTimer = null;
          if (guard()) void this.processQueue();
        }, 3000);
      }
      return;
    }

    const active = this.sessionGuard();
    this.isProcessingQueue = true;
    this.isQueueActive.set(true);
    const item = this.queue.shift()!;
    this.queueLength.set(this.queue.length);

    try {
      if (!active()) return;
      const session = this.diary.sessions().find(s => s.id === item.sessionId);
      if (!session) return;
      const topic = session.topics.find(t => t.id === item.topicId);
      if (!topic || !topic.originalNotesText || topic.originalNotesText.trim().length === 0) return;

      if (topic.enrichmentStatus === 'UP_TO_DATE' && topic.contentVersion === topic.enrichedVersion) {
        return;
      }

      const studentProfile = this.settings.profile();
      if (!studentProfile.autoEnrichNotes) {
        return;
      }

      const nanoAvailable =
      this.device.nano() === 'available' ||
      this.device.engineState() === 'ready' ||
      this.device.engineState() === 'available';
      const cloudAllowed = studentProfile.allowCloudEnrichment && !studentProfile.offlineOnly;

      if (!nanoAvailable && !cloudAllowed) {
        await this.diary.updateTopic(session.id, topic.id, {
          enrichmentStatus: 'PENDING',
        });
        return;
      }

      await this.enrichTopic(session, topic, {
        useCloud: !nanoAvailable && cloudAllowed,
        profileConsent: true,
        forceLocalNano: nanoAvailable,
      });
    } catch {
      // Los errores individuales ya se manejan en enrichTopic
    } finally {
      if (!active()) return;
      this.isProcessingQueue = false;
      if (this.queue.length > 0) {
        this.processQueue();
      } else {
        this.isQueueActive.set(false);
        this.lastCompletedSessionId.set(item.sessionId);
      }
    }
  }

  /**
   * Enriquece un tema específico de forma controlada y con protección contra condiciones de carrera.
   * Instrumentado con performance.now() para diagnósticos exactos de latencia.
   */
  async enrichTopic(
    session: StudySession,
    topic: Topic,
    options: {
      useCloud?: boolean;
      profileConsent?: boolean;
      forceLocalNano?: boolean;
    } = {}
  ): Promise<boolean> {
    if (!topic.originalNotesText || topic.originalNotesText.trim().length === 0) {
      throw new Error('Escribe algunos apuntes antes de generar el enriquecimiento pedagógico.');
    }

    if (this.isEnriching()) {
      this.enqueueTopic(session.id, topic.id);
      return false;
    }

    const active = this.sessionGuard();
    if (!active()) return false;
    const tStart = performance.now();
    const wasPrewarmed = this.ai.isWarm();
    const targetVersion = topic.contentVersion;
    const sessionId = session.id;
    const topicId = topic.id;

    this.isEnriching.set(true);
    this.currentProcessingTopicId.set(topicId);
    this.lastError.set(null);

    try {
      const tSave = performance.now();
      await this.diary.updateTopic(sessionId, topicId, { enrichmentStatus: 'GENERATING' });
      if (!active()) return false;
      const t_saveLocalMs = Math.round(performance.now() - tSave);
      const mode: 'local' | 'cloud' | 'hybrid' = options.useCloud ? 'cloud' : options.forceLocalNano ? 'local' : 'hybrid';

      // PROMPT DISCIPLINAR PEDAGÓGICO: Rigor educativo por materia, sin doble envoltura
      const tPrepStart = performance.now();
      const rawNotes = topic.originalNotesText.trim();
      const noteSnippet = rawNotes.length > 600 ? rawNotes.slice(0, 600) + '...' : rawNotes;
      const prompt = buildPedagogicalPrompt(session.course, topic.name, noteSnippet);
      const t_prepareMs = Math.round(performance.now() - tPrepStart);

      // Inferencia real con rawPrompt: true para evitar doble envoltura
      const tInferStart = performance.now();
      const result: InferenceResult = await this.ai.processPromptDetailed(prompt, true, {
        modeOverride: mode,
        cloudConsent: options.profileConsent ? 'profile' : options.useCloud === true,
        allowEssentialFallback: true,
        rawPrompt: true,
      });
      if (!active()) return false;
      const t_inferenceMs = Math.round(performance.now() - tInferStart);

      // Procesamiento y validación pedagógica estricta de la respuesta
      const tProcStart = performance.now();
      const cleaned = cleanMarkdownToText(result.text);
      const validated = validateAndSanitizeEnrichment(cleaned, session.course, topic.name);

      const explanation = validated.explanation;
      const examples = [...validated.examples];
      const keyIdeas = [...validated.keyIdeas];
      const commonMistakes = [...validated.commonMistakes];
      const t_processResponseMs = Math.round(performance.now() - tProcStart);

      // GUARD DE CONDICIÓN DE CARRERA: Verificar si el estudiante siguió escribiendo durante la inferencia
      const freshSession = this.diary.sessions().find(s => s.id === sessionId);
      const freshTopic = freshSession?.topics.find(t => t.id === topicId);

      if (!freshTopic) {
        return false;
      }

      if (freshTopic.contentVersion !== targetVersion) {
        await this.diary.updateTopic(sessionId, topicId, {
          enrichmentStatus: 'OUTDATED',
        });
        if (freshSession) {
          this.scheduleTopicEnrichment(freshSession, topicId, 3000);
        }
        return false;
      }

      // Persistencia del enriquecimiento
      const tPersistStart = performance.now();
      await this.diary.updateTopic(sessionId, topicId, {
        enrichedExplanation: explanation,
        enrichedExamples: examples,
        keyIdeas,
        commonMistakes,
        enrichmentStatus: 'UP_TO_DATE',
        inferenceSource: result.source,
        enrichedVersion: targetVersion,
      });
      if (!active()) return false;
      const t_persistEnrichedMs = Math.round(performance.now() - tPersistStart);

      const t_totalMs = Math.round(performance.now() - tStart);

      // Registrar telemetría exacta
      const telemetry: EnrichmentTelemetry = {
        topicId,
        topicName: topic.name,
        mode,
        source: result.source,
        modelUsed: result.modelUsed ?? 'unknown',
        inputChars: prompt.length,
        outputChars: result.text.length,
        t_saveLocalMs,
        t_prepareMs,
        t_ttfbMs: result.timeToFirstChunkMs,
        t_inferenceMs,
        t_processResponseMs,
        t_persistEnrichedMs,
        t_totalMs,
        retries: result.retries ?? 0,
        wasPrewarmed,
        status: 'UP_TO_DATE',
      };

      this.lastTelemetry.set(telemetry);
      this.telemetryHistory.update(prev => [telemetry, ...prev.slice(0, 19)]);

      return true;
    } catch (err: any) {
      if (!active()) return false;
      const msg = err?.message || 'Error al enriquecer el tema.';
      this.lastError.set(msg);
      await this.diary.updateTopic(sessionId, topicId, {
        enrichmentStatus: 'ERROR',
      });
      throw err;
    } finally {
      if (active()) {
        this.isEnriching.set(false);
        this.currentProcessingTopicId.set(null);
        void this.processQueue();
      }
    }
  }

  /**
   * Enriquece de forma automática las dudas (Zona B) y descubrimientos Eureka (Zona C)
   * para que las vistas 2 y 3 ofrezcan explicaciones pedagógicas ricas sin formularios duplicados.
   */
  async enrichDoubtsAndEureka(
    session: StudySession,
    nanoAvailable?: boolean,
    cloudAllowed?: boolean
  ): Promise<void> {
    const active = this.sessionGuard();
    if (!active()) return;
    const isNano = nanoAvailable ?? (this.device.nano() === 'available');
    const isCloud = cloudAllowed ?? (this.settings.profile().allowCloudEnrichment && !this.settings.profile().offlineOnly);
    if (!isNano && !isCloud) return;

    const mode = isNano ? 'local' : 'cloud';

    // 1. Enriquecer dudas pendientes
    if (session.doubts && session.doubts.length > 0) {
      const existingEnriched = [...(session.enrichedDoubts || [])];
      let doubtsChanged = false;

      for (const d of session.doubts) {
        if (!active()) return;
        const found = existingEnriched.find(ed => ed.doubtText.trim().toLowerCase() === d.trim().toLowerCase());
        if (!found || found.status === 'PENDING') {
          try {
            const prompt =
              `Curso: ${session.course}.\n` +
              `Duda del estudiante: "${d}"\n\n` +
              `Responde a esta duda con una explicación pedagógica clara y breve (40 a 60 palabras) ` +
              `y un ejemplo aclaratorio. Usa texto limpio sin asteriscos ni numerales.`;

            const res = await this.ai.processPromptDetailed(prompt, false, {
              modeOverride: mode,
              cloudConsent: 'profile',
              allowEssentialFallback: true,
              rawPrompt: true,
            });

            if (!active()) return;
            const cleaned = cleanMarkdownToText(res.text);
            const parts = cleaned.split('\n\n').filter(Boolean);
            const explanation = parts[0] || cleaned;
            const example = parts[1] || undefined;

            const enrichedItem: EnrichedDoubtItem = {
              doubtText: d,
              explanation,
              example,
              status: 'UP_TO_DATE',
              inferenceSource: res.source,
              updatedAt: new Date().toISOString(),
            };

            const idx = existingEnriched.findIndex(ed => ed.doubtText.trim().toLowerCase() === d.trim().toLowerCase());
            if (idx >= 0) {
              existingEnriched[idx] = enrichedItem;
            } else {
              existingEnriched.push(enrichedItem);
            }
            doubtsChanged = true;

            // También registrar en la memoria de aprendizaje (ConceptMemory) si aplica
            try {
              const concept = await this.memory.registerDoubt(session.id, session.course, session.topic || 'General', d);
              if (!active()) return;
              await this.memory.recordExplanation(
                concept.id,
                explanation,
                res.source === 'ON_DEVICE' ? 'ON_DEVICE' : res.source === 'IN_CLOUD' ? 'IN_CLOUD' : 'CURRICULUM_OFFLINE'
              );
            } catch {}
          } catch {}
        }
      }

      if (active() && doubtsChanged) {
        await this.diary.saveFullSession(session.id, {
          enrichedDoubts: existingEnriched,
        });
      }
    }

    // 2. Enriquecer Eureka pendientes
    if (session.eureka && session.eureka.length > 0) {
      const existingEnriched = [...(session.enrichedEureka || [])];
      let eurekaChanged = false;

      for (const e of session.eureka) {
        if (!active()) return;
        const found = existingEnriched.find(ee => ee.eurekaText.trim().toLowerCase() === e.trim().toLowerCase());
        if (!found || found.status === 'PENDING') {
          try {
            const eurekaClass = classifyEurekaDiscovery(e);
            let expansion: string;
            let application: string | undefined = undefined;
            let source: any = 'OFFLINE_ESSENTIAL';

            if (eurekaClass.isClarificationNeeded) {
              // Registro ambiguo o palabra suelta (ej: "Verbos"): NO alucinar comprensión ficticia
              expansion = eurekaClass.suggestedClarification || `¿Qué descubriste sobre ${e}?`;
            } else {
              // Descubrimiento concreto: ampliar pedagógicamente con IA
              const prompt =
                `Curso: ${session.course}.\n` +
                `Descubrimiento del estudiante: "${e}"\n\n` +
                `Amplía pedagógicamente este descubrimiento concreto (40 a 60 palabras) e indica una ` +
                `aplicación práctica o conexión interdisciplinaria. No atribuyas logros ni emociones que ` +
                `el estudiante no haya demostrado. Usa texto limpio sin asteriscos ni numerales.`;

              const res = await this.ai.processPromptDetailed(prompt, false, {
                modeOverride: mode,
                cloudConsent: 'profile',
                allowEssentialFallback: true,
                rawPrompt: true,
              });

              if (!active()) return;
              source = res.source;
              const cleaned = cleanMarkdownToText(res.text);
              const parts = cleaned.split('\n\n').filter(Boolean);
              expansion = parts[0] || cleaned;
              application = parts[1] || undefined;
            }

            const enrichedItem: EnrichedEurekaItem = {
              eurekaText: e,
              expansion,
              application,
              practicalApplication: application,
              status: 'UP_TO_DATE',
              inferenceSource: source,
              updatedAt: new Date().toISOString(),
            };

            const idx = existingEnriched.findIndex(ee => ee.eurekaText.trim().toLowerCase() === e.trim().toLowerCase());
            if (idx >= 0) {
              existingEnriched[idx] = enrichedItem;
            } else {
              existingEnriched.push(enrichedItem);
            }
            eurekaChanged = true;
          } catch {}
        }
      }

      if (active() && eurekaChanged) {
        await this.diary.saveFullSession(session.id, {
          enrichedEureka: existingEnriched,
        });
      }
    }
  }
}
