import { Injectable, inject, signal } from '@angular/core';
import {
  getAI, getGenerativeModel, GoogleAIBackend, InferenceMode,
  InferenceSource as FirebaseInferenceSource,
  ThinkingLevel,
  type GenerativeModel,
} from 'firebase/ai';
import { firebaseApp, firebaseAppCheck, isAppCheckConfigured } from './firebase-runtime';
import { SyncService, type InferenceSource } from './sync.service';
import { LocalIdentityService } from './local-identity.service';
import { StudentSettingsService } from './student-settings.service';
import { DeviceCapabilitiesService } from './device-capabilities.service';
import { classifyAiError } from './ai-errors';
export { classifyAiError, type AiErrorCategory, type ClassifiedAiError } from './ai-errors';
import { sanitizeStudentNotesFromPrompt } from './markdown-cleaner';

export type AiInferencePhase = 'idle' | 'preparing' | 'waiting' | 'streaming' | 'complete';

export interface InferenceTelemetry {
  readonly t0_userActionMs: number;
  readonly t1_contextMs?: number;
  readonly t2_engineSelectionMs?: number;
  readonly t3_inferenceStartMs: number;
  readonly t4_ttfbMs?: number;
  readonly t5_inferenceEndMs: number;
  readonly t6_validationMs?: number;
  readonly t7_persistenceMs?: number;
  readonly t8_visibleMs: number;
  readonly preInferenceWaitMs: number;
  readonly timeToFirstChunkMs?: number;
  readonly generationMs: number;
  readonly postProcessingMs: number;
  readonly totalLatencyMs: number;
  readonly friendlyDuration: string;
}

export interface InferenceResult {
  readonly text: string;
  readonly source: InferenceSource;
  readonly latencyMs: number;
  readonly timeToFirstChunkMs?: number;
  readonly preparationMs?: number;
  /** True when a complex request could only be answered by the limited local model or offline heuristics. */
  readonly limited: boolean;
  readonly modelUsed?: string;
  readonly telemetry?: InferenceTelemetry;
  readonly retries?: number;
  readonly friendlyDuration?: string;
}

export interface InferenceCallOptions {
  readonly saveInOutbox?: boolean;
  /** Scope permission to this request. 'profile' rechecks the current student's saved choice. */
  readonly cloudConsent?: boolean | 'profile';
  /** When true, sends prompt directly without wrapping in duplicate summary/tutor boilerplate. */
  readonly rawPrompt?: boolean;
  /** Optional compact grounded prompt for raw tutor calls using a device-capable route. */
  readonly localPrompt?: string;
  /** When false (e.g. Tutor Ostrix), never substitutes a deterministic template for generative AI. */
  readonly allowEssentialFallback?: boolean;
  readonly modeOverride?: 'hybrid' | 'cloud' | 'local';
  readonly timeoutMs?: number;
  readonly onChunk?: (accumulatedText: string, chunk: string) => void;
  readonly onPhaseChange?: (phase: AiInferencePhase) => void;
}

/**
 * Convierte una duración en milisegundos a formato legible y amigable para el estudiante rural.
 * Ejemplos:
 *   350 ms -> "menos de 1 s"
 *   12300 ms -> "12 s"
 *   118566 ms -> "1 min 59 s"
 */
export function formatFriendlyDuration(ms: number, lang: 'es' | 'en' | 'qu-chanka' = 'es'): string {
  if (ms == null || isNaN(ms) || ms < 0) ms = 0;
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 1) {
    if (lang === 'en') return 'under 1 s';
    if (lang === 'qu-chanka') return '1 s ukhupi';
    return 'menos de 1 s';
  }
  if (totalSeconds < 60) {
    return `${totalSeconds} s`;
  }
  const mins = Math.floor(totalSeconds / 60);
  const remainingSecs = totalSeconds % 60;
  if (remainingSecs === 0) {
    return `${mins} min`;
  }
  return `${mins} min ${remainingSecs} s`;
}

class SourceVerificationError extends Error {}

/**
 * Servicio de Inferencia Híbrida de OstrixAi.
 * Gestiona Firebase AI Logic con Gemini Nano (local) y Gemini Cloud.
 *
 * Reglas de integridad:
 * 1. Jamás realizar llamadas Cloud sin autorización explícita del estudiante.
 * 2. Jamás afirmar que una respuesta es ON_DEVICE sin evidencia directa del SDK de Firebase.
 * 3. En pruebas estrictamente locales (ONLY_ON_DEVICE), impedir cualquier fallback silencioso a la nube.
 * 4. Permitir cancelación inmediata (AbortSignal) y prevenir solicitudes duplicadas.
 * 5. En Modo Esencial offline, identificar explícitamente OFFLINE_ESSENTIAL (nunca como IA generativa)
 *    y eliminar rigurosamente cualquier fuga de instrucciones de prompt.
 * 6. Gestionar el arranque en frío de Gemini Nano con un timeout adaptativo.
 */
@Injectable({ providedIn: 'root' })
export class OstrixAiService {
  private readonly sync = inject(SyncService);
  private readonly device = inject(DeviceCapabilitiesService);
  private readonly identity = inject(LocalIdentityService);
  private readonly settings = inject(StudentSettingsService);
  private readonly ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });

  private readonly primaryCloudModelName = 'gemini-3.5-flash-lite';
  private readonly fallbackCloudModelName = 'gemini-3.1-flash-lite';

  private cloudConfigured(): boolean {
    return isAppCheckConfigured() && firebaseAppCheck !== null;
  }

  private modelForRequest(mode: InferenceMode, name: string, signal: AbortSignal): GenerativeModel {
    // Firebase v13 forwards request.signal to fetch. Chrome's on-device session has
    // its own lifetime and also needs the signal in LanguageModel.create().
    return getGenerativeModel(this.ai, {
      mode,
      onDeviceParams: {
        createOptions: {
          signal,
          expectedInputs: [{ type: 'text', languages: ['es', 'en'] }],
          expectedOutputs: [{ type: 'text', languages: ['es', 'en'] }],
        },
      },
      inCloudParams: {
        model: name,
        generationConfig: {
          maxOutputTokens: 4096, temperature: 0.4,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW, includeThoughts: false },
        },
      },
    });
  }

  readonly lastResult = signal<InferenceResult | null>(null);
  readonly lastLatencyMs = signal<number | null>(null);
  readonly lastError = signal<string | null>(null);
  readonly isBusy = signal(false);
  readonly modelDownloadProgress = signal(0);

  /** Fase actual de inferencia: idle, preparing, waiting, streaming, complete */
  readonly inferencePhase = signal<AiInferencePhase>('idle');
  /** Texto acumulado en streaming en tiempo real */
  readonly streamingText = signal<string>('');
  /** Latencia hasta el primer fragmento de texto emitido (TTFB) */
  readonly timeToFirstChunkMs = signal<number | null>(null);

  private activeMayUseCloud = false;
  private isLocalModelWarm = false;
  private activeAbortController: AbortController | null = null;
  private activeRequestId = 0;
  private sessionVersion = 0;
  private preparation: { controller: AbortController; done: Promise<void> } | null = null;

  sessionGuard(): () => boolean {
    const version = this.sessionVersion;
    const owner = this.identity.student()?.id;
    return () => version === this.sessionVersion && owner === this.identity.student()?.id;
  }

  /** Inicialización explícita del modelo local Gemini Nano por interacción del usuario. */
  async prepareLocalModel(): Promise<void> {
    if (this.preparation) return this.preparation.done;
    if (this.isBusy()) throw new Error('Ya hay una consulta en curso.');
    const controller = new AbortController();
    const { signal } = controller;
    const model = this.modelForRequest(InferenceMode.ONLY_ON_DEVICE, this.primaryCloudModelName, signal);
    this.inferencePhase.set('preparing');
    this.device.setEnginePreparing(true);
    this.modelDownloadProgress.set(0);
    const prepare = model.initializeDeviceModel((fraction: number) => {
      if (signal.aborted) return;
      const pct = Math.max(0, Math.min(100, Math.round(fraction * 100)));
      this.modelDownloadProgress.set(pct);
      this.device.setEngineDownloading(pct);
    });
    const aborted = new Promise<never>((_, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    const done = Promise.race([prepare, aborted]).then(() => {
      signal.throwIfAborted();
      this.modelDownloadProgress.set(100);
      this.device.setEngineReady();
    }).catch(() => {
      signal.throwIfAborted();
      this.device.setEngineError('Falló la inicialización de Gemini Nano.');
      throw new Error('Gemini Nano no está disponible o falló su descarga en este navegador.');
    }).finally(() => {
      if (this.preparation?.controller === controller) {
        this.preparation = null;
        if (!this.isBusy()) this.inferencePhase.set('idle');
      }
    });
    this.preparation = { controller, done };
    return done;
  }

  /**
   * Diagnóstico manual de Firebase AI Logic ON_DEVICE.
   * Invocar desde un click real, no al crear el servicio ni en ngOnInit.
   * No persiste la pregunta ni permite fallback local/esencial/nube.
   * Nota: ON_DEVICE demuestra la ruta local, NO certifica por sí solo la versión Nano 4.
   */
  async testNanoOnlyOnDevice(prompt = '¿Cuánto es dos más dos? Responde con un número.'): Promise<InferenceResult> {
    const requestId = this.activeRequestId;
    await this.prepareLocalModel();
    if (requestId !== this.activeRequestId) throw new DOMException('Solicitud cancelada.', 'AbortError');
    return this.generateStrictLocal(
      prompt,
      false,
      {
        rawPrompt: true,
        saveInOutbox: false,
        allowEssentialFallback: false,
      }
    );
  }

  /**
   * Pre-calentamiento no bloqueante de Gemini Nano al abrir la pizarra o iniciar sesión.
   * Carga el modelo en memoria de fondo para reducir la latencia de primer uso.
   */
  async warmUpLocalModel(): Promise<boolean> {
    if (this.isLocalModelWarm) return true;
    if (typeof window === 'undefined' || this.device.nano() !== 'available' || this.isBusy()) return false;
    try {
      await this.prepareLocalModel();
      return true;
    } catch {
      return false;
    }
  }

  isWarm(): boolean {
    return this.isLocalModelWarm;
  }

  resetLocalSession(): void {
    ++this.sessionVersion;
    this.cancelActiveRequest();
    this.isLocalModelWarm = false;
    this.lastResult.set(null);
    this.lastError.set(null);
    this.lastLatencyMs.set(null);
    this.timeToFirstChunkMs.set(null);
  }

  revokeCloudConsent(): void {
    if (this.activeMayUseCloud) this.cancelActiveRequest();
  }

  isOnline(): boolean {
    return this.device.online();
  }

  /** Cancela cualquier inferencia activa (p. ej. al pulsar Cancelar o al cerrar sesión). */
  cancelActiveRequest(): void {
    ++this.activeRequestId;
    if (this.preparation) {
      this.preparation.controller.abort();
      this.preparation = null;
      void this.device.checkNano();
    }
    this.activeMayUseCloud = false;
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }
    this.isBusy.set(false);
    this.device.setEngineBusy(false);
    this.inferencePhase.set('idle');
    this.streamingText.set('');
  }

  /**
   * Alias de inferencia directa con Gemini Nano on-device sin latencia añadida.
   */
  async generateSummaryNanoDirect(
    prompt: string,
    isComplex = false,
    options: InferenceCallOptions = {}
  ): Promise<InferenceResult> {
    return this.generateStrictLocal(prompt, isComplex, { ...options, rawPrompt: true });
  }

  /**
   * Inferencia estrictamente local (ONLY_ON_DEVICE).
   * Falla de inmediato si Gemini Nano no está listo; prohíbe cualquier fallback silencioso a Cloud.
   * Maneja el arranque en frío (timeout adaptativo) y streaming reactivo con telemetría T0-T8.
   */
  async generateStrictLocal(
    prompt: string,
    isComplex: boolean,
    options: InferenceCallOptions = {}
  ): Promise<InferenceResult> {
    return this.processPromptDetailed(prompt, isComplex, {
      ...options, modeOverride: 'local', allowEssentialFallback: false,
    });
  }

  /**
   * Inferencia explícita en la nube (ONLY_IN_CLOUD) sujeta a consentimiento y conectividad real.
   */
  async generateCloudOnly(
    prompt: string,
    isComplex: boolean,
    options: InferenceCallOptions = {}
  ): Promise<InferenceResult> {
    return this.processPromptDetailed(prompt, isComplex, {
      ...options,
      modeOverride: 'cloud',
      allowEssentialFallback: false,
    });
  }

  /**
   * Modo Esencial Offline (sin modelo generativo neuronal).
   * Genera una síntesis estructurada determinista a partir de los apuntes reales.
   * Elimina cualquier instrucción interna de prompt para garantizar privacidad pedagógica.
   * Nunca se etiqueta como IA generativa local ni Cloud.
   */
  generateOfflineEssential(
    notesOrPrompt: string,
    course: string,
    topic: string,
    kind: 'summary' | 'review'
  ): InferenceResult {
    const started = performance.now();
    const sanitizedNotes = sanitizeStudentNotesFromPrompt(notesOrPrompt);
    const cleanCourse = course && course !== 'Curso' ? course : 'General';
    const cleanTopic = topic && topic !== 'Tema' ? topic : 'Apuntes';

    const lines = sanitizedNotes
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    const points: string[] = [];
    for (const line of lines) {
      const cleanLine = line.replace(/^[•\-*]\s*/, '').trim();
      if (cleanLine.length > 3 && !points.includes(cleanLine)) {
        points.push(cleanLine);
        if (points.length >= 5) break;
      }
    }

    let generatedText = '';
    if (kind === 'summary') {
      const mainPoints = points.length > 0
        ? points.map(p => `• ${p}`).join('\n')
        : '• El estudiante aún no ha redactado apuntes detallados para esta lección.';

      generatedText = `[MODO ESENCIAL OFFLINE — ${cleanCourse.toUpperCase()}: ${cleanTopic}]\n\n` +
        `Puntos clave extraídos de tus apuntes:\n${mainPoints}\n\n` +
        `(Organizado localmente sin modelo neuronal. No requiere internet ni descarga de Gemini Nano).`;
    } else {
      generatedText = `[PREGUNTAS DEL MODO ESENCIAL OFFLINE — ${cleanTopic}]\n\n` +
        `1. ¿Cuál es la idea principal que anotaste sobre ${cleanTopic}?\n` +
        `2. Explica con tus propias palabras un ejemplo cotidiano de este tema.\n` +
        `3. Revisa tus dudas registradas en el Libro de Dudas y practica los ejercicios curriculares.\n\n` +
        `(Guía determinista del Modo Esencial Offline).`;
    }

    const latencyMs = Math.round(performance.now() - started);
    const result: InferenceResult = {
      text: generatedText,
      source: 'OFFLINE_ESSENTIAL',
      latencyMs,
      limited: true,
      modelUsed: 'offline-essential-deterministic',
      friendlyDuration: formatFriendlyDuration(latencyMs),
    };

    this.lastResult.set(result);
    this.lastLatencyMs.set(latencyMs);
    return result;
  }

  /**
   * Orquestación híbrida real (PREFER_ON_DEVICE / ONLY_ON_DEVICE / ONLY_IN_CLOUD)
   * con telemetría integral T0-T8, streaming, timeout adaptativo, cancelación, prevención de duplicados y origen verificado.
   */
  async processPromptDetailed(
    prompt: string,
    isComplex: boolean,
    options: InferenceCallOptions = {}
  ): Promise<InferenceResult> {
    const t0 = performance.now();
    const clean = prompt.trim();
    if (!clean || clean.length > 20_000) {
      throw new Error('El texto debe contener entre 1 y 20 000 caracteres.');
    }
    if (this.isBusy()) {
      throw new Error('Ya existe una consulta en curso. Espera la respuesta o cancélala.');
    }

    const owner = this.identity.student()?.id;
    const consent = options.cloudConsent;
    const cloudAllowed = () => Boolean(owner && owner === this.identity.student()?.id
      && !this.settings.profile().offlineOnly
      && (consent === true || (consent === 'profile' && this.settings.profile().allowCloudEnrichment)));
    const mode = options.modeOverride ?? 'hybrid';
    if (mode === 'cloud' && !cloudAllowed()) throw new Error('Se requiere autorización explícita para Gemini Cloud.');
    if (mode === 'cloud' && !this.isOnline()) throw new Error('Sin conexión para Gemini Cloud.');
    if (mode === 'cloud' && !this.cloudConfigured()) throw new Error('Configura Firebase y App Check para habilitar Gemini Cloud.');

    const route = mode === 'local' || !cloudAllowed() || !this.isOnline() || !this.cloudConfigured() ? InferenceMode.ONLY_ON_DEVICE
      : mode === 'cloud' || isComplex ? InferenceMode.ONLY_IN_CLOUD : InferenceMode.PREFER_ON_DEVICE;
    const requestId = ++this.activeRequestId;
    const allowEssential = options.allowEssentialFallback !== false;
    const defaultLocalTimeout = isComplex
      ? (this.isLocalModelWarm ? 120_000 : 180_000)
      : (this.isLocalModelWarm ? 60_000 : 120_000);
    const timeoutMs = options.timeoutMs ?? (route === InferenceMode.ONLY_IN_CLOUD ? 45_000 : defaultLocalTimeout);
    const t1 = performance.now(); // Context preparation
    // Cloud-only always receives the original prompt. The SDK may still use Cloud
    // on PREFER_ON_DEVICE only when consent is active, as before.
    const localCandidate = options.rawPrompt && route !== InferenceMode.ONLY_IN_CLOUD
      ? options.localPrompt?.trim() : undefined;
    const rawTask = localCandidate && localCandidate.length <= 20_000 ? localCandidate : clean;
    const task = options.rawPrompt
      ? rawTask
      : isComplex
        ? `Actúa como tutor educativo para secundaria rural. Explica paso a paso, da ejemplos claros y orienta al estudiante.\n\nApuntes:\n${clean}`
        : `Resume en español estos apuntes escolares de forma fiel, estructurada y clara para secundaria rural.\n` +
          `REGLAS OBLIGATORIAS:\n` +
          `1. Extensión: exactamente entre 60 y 100 palabras.\n` +
          `2. Formato: un párrafo continuo o dos párrafos breves. Sin títulos con almohadillas (##) ni negrita con asteriscos (**).\n` +
          `3. No inventes hechos no presentes en los apuntes.\n\n` +
          `APUNTES DEL ESTUDIANTE:\n${clean}`;

    const t2 = performance.now(); // Engine selection
    this.isBusy.set(true);
    if (route !== InferenceMode.ONLY_IN_CLOUD) this.device.setEngineBusy(true);
    this.lastResult.set(null);
    this.lastError.set(null);
    this.streamingText.set('');
    this.timeToFirstChunkMs.set(null);
    const controller = new AbortController();
    this.activeAbortController = controller;
    this.activeMayUseCloud = route !== InferenceMode.ONLY_ON_DEVICE;
    const assertActive = () => {
      if (owner !== this.identity.student()?.id || (this.activeMayUseCloud && !cloudAllowed())) {
        controller.abort();
      }
      controller.signal.throwIfAborted();
    };
    let retries = 0;
    let visibleChunk = false;
    const onChunkCallback = (acc: string, chunk: string) => {
      assertActive();
      visibleChunk = true;
      this.streamingText.set(acc);
      options.onChunk?.(acc, chunk);
    };
    try {
      this.inferencePhase.set(route === InferenceMode.ONLY_ON_DEVICE && !this.isLocalModelWarm ? 'preparing' : 'waiting');
      options.onPhaseChange?.(this.inferencePhase());
      const attempt = (target: InferenceMode, modelName: string) => {
        assertActive();
        if (target !== InferenceMode.ONLY_ON_DEVICE && !this.isOnline()) throw new Error('Sin conexión.');
        return this.runModelStream(target, modelName, task, controller.signal, timeoutMs, onChunkCallback);
      };

      let output;
      try {
        try {
          output = await attempt(route, this.primaryCloudModelName);
        } catch (error) {
          assertActive();
          const classified = classifyAiError(error);
          // The SDK already routes PREFER_ON_DEVICE. Retry only a confirmed Cloud HTTP
          // failure before the first text. Never replay a partial stream or an ambiguous timeout.
          if (route === InferenceMode.ONLY_ON_DEVICE || visibleChunk ||
            !['SERVER_TRANSIENT', 'MODEL_NOT_FOUND'].includes(classified.category)) throw error;
          if (classified.category === 'SERVER_TRANSIENT') await this.delayWithAbort(1200, controller.signal);
          ++retries;
          output = await attempt(InferenceMode.ONLY_IN_CLOUD,
            classified.category === 'MODEL_NOT_FOUND' ? this.fallbackCloudModelName : this.primaryCloudModelName);
        }
      } catch (error) {
        assertActive();
        const classified = classifyAiError(error);
        this.streamingText.set('');
        if (error instanceof SourceVerificationError || classified.category === 'ABORTED' || !allowEssential) throw error;
        const essential = this.generateOfflineEssential(clean, 'Curso', 'Tema', isComplex ? 'review' : 'summary');
        output = { ...essential, t3: t2, t5: performance.now(), t4: undefined, timeToFirstChunkMs: undefined };
      }
      assertActive();
      if (output.source === 'ON_DEVICE') {
        this.isLocalModelWarm = true;
        this.device.setEngineReady();
      }
      const t6 = performance.now(); // Validation
      if (options.saveInOutbox !== false && output.source !== 'OFFLINE_ESSENTIAL') {
        await this.sync.enqueueInteraction(clean, output.text, output.source, isComplex);
      }
      assertActive();
      const t7 = performance.now(); // Persistence
      const t8 = performance.now(); // Result ready for UI rendering

      const totalLatencyMs = Math.round(t8 - t0);
      const friendlyDuration = formatFriendlyDuration(totalLatencyMs);

      const telemetry: InferenceTelemetry = {
        t0_userActionMs: Math.round(t0),
        t1_contextMs: Math.round(t1),
        t2_engineSelectionMs: Math.round(t2),
        t3_inferenceStartMs: Math.round(output.t3),
        t4_ttfbMs: output.t4 ? Math.round(output.t4) : undefined,
        t5_inferenceEndMs: Math.round(output.t5),
        t6_validationMs: Math.round(t6),
        t7_persistenceMs: Math.round(t7),
        t8_visibleMs: Math.round(t8),
        preInferenceWaitMs: Math.round(output.t3 - t0),
        timeToFirstChunkMs: output.timeToFirstChunkMs,
        generationMs: Math.round(output.t5 - (output.t4 ?? output.t3)),
        postProcessingMs: Math.round(t8 - output.t5),
        totalLatencyMs,
        friendlyDuration,
      };

      const result: InferenceResult = {
        text: output.text,
        source: output.source,
        latencyMs: totalLatencyMs,
        timeToFirstChunkMs: output.timeToFirstChunkMs,
        preparationMs: telemetry.preInferenceWaitMs,
        limited: (isComplex && output.source === 'ON_DEVICE') || output.source === 'OFFLINE_ESSENTIAL',
        retries,
        modelUsed: output.modelUsed,
        telemetry,
        friendlyDuration,
      };

      if (this.activeRequestId === requestId) {
        this.lastResult.set(result);
        this.lastLatencyMs.set(totalLatencyMs);
        this.inferencePhase.set('complete');
        options.onPhaseChange?.('complete');
      }
      return result;
    } catch (err: unknown) {
      const msg = err instanceof SourceVerificationError ? err.message : classifyAiError(err).message;
      if (this.activeRequestId === requestId) {
        this.lastError.set(msg);
        this.inferencePhase.set('idle');
      }
      if (controller.signal.aborted) throw controller.signal.reason;
      throw new Error(msg);
    } finally {
      if (this.activeAbortController === controller) {
        this.activeMayUseCloud = false;
        this.activeAbortController = null;
      }
      if (this.activeRequestId === requestId) {
        this.isBusy.set(false);
        this.device.setEngineBusy(false);
      }
    }
  }

  private async runModelStream(
    mode: InferenceMode, modelName: string, prompt: string, parent: AbortSignal, timeoutMs: number,
    onChunk: (accumulatedText: string, chunk: string) => void
  ) {
    parent.throwIfAborted();
    const t3 = performance.now();
    const controller = new AbortController();
    const signal = controller.signal;
    const abort = () => controller.abort(parent.reason);
    parent.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(() => controller.abort(new DOMException(
      mode === InferenceMode.ONLY_ON_DEVICE ? 'Local inference timeout' : 'Inference timeout', 'TimeoutError'
    )), timeoutMs);
    const deadline = new Promise<never>((_, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    try {
      const model = this.modelForRequest(mode, modelName, signal);
      this.inferencePhase.set('waiting');
      const read = async () => {
        const result = await model.generateContentStream(prompt, { signal, timeout: timeoutMs });
        // The SDK aggregates a second branch in parallel. Observe both promises even
        // when a stalled reader is cancelled, so a rejection cannot escape unhandled.
        const consume = async () => {
          let t4: number | undefined;
          let accumulated = '';
          let firstSource: InferenceSource | undefined;
          for await (const chunk of result.stream) {
            signal.throwIfAborted();
            const source = this.verifySource(chunk.inferenceSource, mode, firstSource);
            firstSource = source;
            const piece = chunk.text();
            if (!piece) continue;
            if (t4 === undefined) {
              t4 = performance.now();
              this.timeToFirstChunkMs.set(Math.round(t4 - t3));
              this.inferencePhase.set('streaming');
            }
            accumulated += piece;
            onChunk(accumulated, piece);
          }
          return { t4, firstSource };
        };
        const [final, { t4, firstSource }] = await Promise.all([result.response, consume()]);
        signal.throwIfAborted();
        const source = this.verifySource(final.inferenceSource, mode, firstSource);
        if (source === 'IN_CLOUD') {
  const reason = final.candidates?.[0]?.finishReason;
  console.info('[OSTRIX CLOUD]', {
    finishReason: reason,
    usage: final.usageMetadata
  });
  if (reason === 'MAX_TOKENS') {
    throw new Error('Gemini Cloud alcanzo el limite de tokens.');
  }
}
const text = final.text().trim();
        if (!text) throw new Error('Respuesta del modelo vacía.');
        return { text, source, t3, t4, t5: performance.now(),
          modelUsed: source === 'ON_DEVICE' ? 'gemini-nano (on-device)' : modelName,
          timeToFirstChunkMs: t4 === undefined ? undefined : Math.round(t4 - t3) };
      };
      return await Promise.race([read(), deadline]);
    } finally {
      clearTimeout(timeout);
      parent.removeEventListener('abort', abort);
      controller.abort();
    }
  }

  private verifySource(raw: unknown, mode: InferenceMode, first?: InferenceSource): 'ON_DEVICE' | 'IN_CLOUD' {
    const source = raw === FirebaseInferenceSource.ON_DEVICE ? 'ON_DEVICE'
      : raw === FirebaseInferenceSource.IN_CLOUD ? 'IN_CLOUD' : null;
    if (!source || (mode === InferenceMode.ONLY_ON_DEVICE && source !== 'ON_DEVICE')
      || (mode === InferenceMode.ONLY_IN_CLOUD && source !== 'IN_CLOUD')
      || (first !== undefined && source !== first)) {
      throw new SourceVerificationError('Firebase AI Logic no confirmó un inferenceSource válido para esta ruta.');
    }
    return source;
  }

  private delayWithAbort(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        const err = new Error('Solicitud cancelada.');
        err.name = 'AbortError';
        reject(err);
        return;
      }
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        const err = new Error('Solicitud cancelada.');
        err.name = 'AbortError';
        reject(err);
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

}
