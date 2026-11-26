import { Injectable, signal } from '@angular/core';
import { isFirebaseConfigured } from './firebase-runtime';

export type NanoStatus = 'comprobando' | 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'no-api';
export type ConnectionStatus = 'checking' | 'unverified' | 'online' | 'local_only' | 'offline';

export type AiEngineState =
  | 'checking'
  | 'not_supported'
  | 'available'
  | 'downloadable'
  | 'downloading'
  | 'preparing'
  | 'ready'
  | 'busy'
  | 'error';

interface PromptApi {
  availability?(): Promise<string>;
  capabilities?(): Promise<{ available: string } | string>;
}

/**
 * Servicio Centralizado de Capacidades del Dispositivo, Conectividad Real y Estado Unificado de Motores de IA.
 * Fuente única de verdad para Tutor Ostrix, Diario, Enriquecimiento, Prácticas, Configuración y Cabecera.
 */
@Injectable({ providedIn: 'root' })
export class DeviceCapabilitiesService {
  /** Indica si hay conectividad real a internet verificada por sonda activa. */
  readonly online = signal<boolean>(false);

  /** Estado detallado: online (WAN), local_only (LAN sin internet), offline (desconectado). */
  readonly connectionStatus = signal<ConnectionStatus>('checking');

  /** Estado unificado del motor de IA local (Single Source of Truth). */
  readonly engineState = signal<AiEngineState>('checking');

  /** Progreso real de descarga reportado por el navegador (0 a 100), o null si no está descargando. */
  readonly downloadProgress = signal<number | null>(null);

  /** Mensaje de error de inicialización o diagnóstico si aplica. */
  readonly lastEngineError = signal<string | null>(null);

  /** Compatibilidad hacia atrás para componentes que leen nano() */
  readonly nano = signal<NanoStatus>('comprobando');
  readonly installed = signal<boolean>(false);

  private beforeBusy: AiEngineState = 'checking';
  private probeInFlight = false;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.installed.set(window.matchMedia?.('(display-mode: standalone)')?.matches ?? false);

      window.addEventListener('online', () => {
        void this.checkTrueOnline();
      });

      window.addEventListener('offline', () => {
        this.online.set(false);
        this.connectionStatus.set('offline');
      });

      // Verificación inicial inmediata
      void this.checkTrueOnline();
      void this.checkNano();

      // Sondeo periódico ligero cada 45 segundos solo cuando la pestaña esté activa
      this.intervalTimer = setInterval(() => {
        if (typeof document !== 'undefined' && !document.hidden) {
          void this.checkTrueOnline(2000);
        }
      }, 45_000);
    }
  }

  /**
   * Sonda activa de conectividad real.
   * Evita el falso positivo de `navigator.onLine` cuando la computadora está conectada
   * a una red escolar local sin enlace WAN a internet.
   */
  async checkTrueOnline(timeoutMs = 2500): Promise<boolean> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.online.set(false);
      this.connectionStatus.set('offline');
      return false;
    }
    // The public, unconfigured build uses local features only. A connectivity
    // probe to a third party would disclose a visit without enabling any service.
    if (!isFirebaseConfigured()) {
      this.online.set(false);
      this.connectionStatus.set('unverified');
      return false;
    }

    if (this.probeInFlight) {
      return this.online();
    }

    this.probeInFlight = true;
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const probe = await fetch('https://www.gstatic.com/generate_204?ngsw-bypass=true', {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!navigator.onLine || (probe.type !== 'opaque' && !probe.ok)) throw new Error('No hay acceso a internet.');
      clearTimeout(timeoutHandle);
      this.online.set(true);
      this.connectionStatus.set('online');
      return true;
    } catch {
      clearTimeout(timeoutHandle);
      const hasLocalInterface = typeof navigator !== 'undefined' && navigator.onLine;
      const status: ConnectionStatus = hasLocalInterface ? 'local_only' : 'offline';
      this.online.set(false);
      this.connectionStatus.set(status);
      return false;
    } finally {
      this.probeInFlight = false;
    }
  }

  /**
   * Detección universal y fidedigna de Chrome Built-in AI / Gemini Nano.
   * Inspecciona:
   * 1. `window.ai?.languageModel` (Estándar Prompt API moderno)
   * 2. `window.LanguageModel` (Global experimental en Chrome 130+)
   * 3. `window.model?.languageModel` (Variante de prefijo preliminar)
   */
  async checkNano(): Promise<AiEngineState> {
    if (typeof window === 'undefined') {
      this.setEngineState('not_supported');
      this.nano.set('no-api');
      return 'not_supported';
    }

    const w = window as any;
    const api: PromptApi | undefined =
      w.ai?.languageModel ?? w.LanguageModel ?? w.model?.languageModel;

    if (!api) {
      // Si la API directa del navegador no está expuesta, no forzar 'unavailable' si Firebase AI Logic
      // pudiera tener su propio soporte embebido, pero reportar 'not_supported' para la API de Chrome.
      this.setEngineState('not_supported');
      this.nano.set('no-api');
      return 'not_supported';
    }

    try {
      let rawAvailability: string | undefined;

      if (typeof api.availability === 'function') {
        rawAvailability = await (api.availability as (options?: {
          expectedInputs: { type: 'text'; languages: string[] }[];
          expectedOutputs: { type: 'text'; languages: string[] }[];
        }) => Promise<string>).call(api, {
          expectedInputs: [{ type: 'text', languages: ['es', 'en'] }],
          expectedOutputs: [{ type: 'text', languages: ['es', 'en'] }],
        });
      } else if (typeof api.capabilities === 'function') {
        const caps = await api.capabilities();
        rawAvailability = typeof caps === 'object' && caps !== null && 'available' in caps
          ? caps.available
          : String(caps);
      }

      if (rawAvailability === 'readily' || rawAvailability === 'available') {
        this.setEngineState('available');
        this.nano.set('available');
        return 'available';
      } else if (rawAvailability === 'after-download' || rawAvailability === 'downloadable') {
        this.setEngineState('downloadable');
        this.nano.set('downloadable');
        return 'downloadable';
      } else if (rawAvailability === 'downloading') {
        this.setEngineState('downloading');
        this.nano.set('downloading');
        return 'downloading';
      } else if (rawAvailability === 'no' || rawAvailability === 'unavailable') {
        this.setEngineState('not_supported');
        this.nano.set('unavailable');
        return 'not_supported';
      } else {
        this.setEngineState('not_supported');
        this.nano.set('unavailable');
        return 'not_supported';
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.lastEngineError.set(msg);
      this.setEngineState('error');
      this.nano.set('unavailable');
      return 'error';
    }
  }

  setEngineBusy(busy: boolean): void {
    if (busy) {
      if (this.engineState() !== 'busy') this.beforeBusy = this.engineState();
      this.engineState.set('busy');
    } else {
      // Restaurar estado base
      const cur = this.engineState();
      if (cur === 'busy') {
        this.engineState.set(this.beforeBusy);
      }
    }
  }

  setEnginePreparing(preparing: boolean): void {
    if (preparing) {
      this.engineState.set('preparing');
    } else {
      this.engineState.set('ready');
    }
  }

  setEngineDownloading(progressPercent: number): void {
    this.engineState.set('downloading');
    this.nano.set('downloading');
    this.downloadProgress.set(Math.max(0, Math.min(100, Math.round(progressPercent))));
  }

  setEngineReady(): void {
    this.engineState.set('ready');
    this.nano.set('available');
    this.downloadProgress.set(null);
    this.lastEngineError.set(null);
  }

  setEngineError(message: string): void {
    this.engineState.set('error');
    this.lastEngineError.set(message);
  }

  private setEngineState(state: AiEngineState): void {
    this.engineState.set(state);
    if (state !== 'downloading') {
      this.downloadProgress.set(null);
    }
  }

  /**
   * Distingue disponibilidad general de capacidad real para una tarea concreta.
   * Evita sobrecargar Gemini Nano con textos de entrada que exceden su ventana de contexto.
   */
  canRunTask(characterLength: number): { canRun: boolean; reason?: string } {
    if (this.engineState() === 'not_supported') {
      return { canRun: false, reason: 'Gemini Nano no está soportado en este navegador.' };
    }
    if (this.engineState() === 'downloadable') {
      return { canRun: false, reason: 'El modelo Gemini Nano requiere descargarse antes de ejecutar esta tarea.' };
    }
    if (this.engineState() === 'busy') {
      return { canRun: false, reason: 'El motor de IA está procesando otra tarea en este momento.' };
    }
    if (characterLength > 20_000) {
      return {
        canRun: false,
        reason: `El texto (${characterLength} caracteres) supera el límite de memoria local (máx. 20 000).`,
      };
    }
    return { canRun: true };
  }
}
