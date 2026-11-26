import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StudentSettingsService } from '../../core/student-settings.service';

export type AiProgressPhase =
  | 'idle'
  | 'preparing'
  | 'analyzing'
  | 'generating'
  | 'validating'
  | 'saving'
  | 'complete'
  | 'error';

@Component({
  selector: 'app-ai-progress',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ai-progress.component.html',
  styleUrls: ['./ai-progress.component.css'],
})
export class AiProgressComponent implements OnInit, OnDestroy {
  private readonly settings = inject(StudentSettingsService);

  @Input() phase: AiProgressPhase = 'generating';
  @Input() downloadFraction: number | null = null;
  @Input() customStatus = '';
  @Input() startTime: number | null = null;
  @Input() canCancel = true;
  @Input() streamingPreview = '';
  @Input() compact = false;

  @Output() cancel = new EventEmitter<void>();

  readonly elapsedSeconds = signal<number>(0);
  private timerHandle: ReturnType<typeof setInterval> | null = null;
  private internalStart = performance.now();

  ngOnInit(): void {
    this.internalStart = this.startTime ?? performance.now();
    this.updateElapsed();
    this.timerHandle = setInterval(() => {
      this.updateElapsed();
    }, 500);
  }

  ngOnDestroy(): void {
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
  }

  private updateElapsed(): void {
    if (this.phase === 'complete' || this.phase === 'error' || this.phase === 'idle') {
      return;
    }
    const now = performance.now();
    const elapsed = Math.max(0, Math.floor((now - this.internalStart) / 1000));
    this.elapsedSeconds.set(elapsed);
  }

  get downloadPercent(): number {
    if (this.downloadFraction == null) return 0;
    const val = this.downloadFraction <= 1 ? this.downloadFraction * 100 : this.downloadFraction;
    return Math.max(0, Math.min(100, Math.round(val)));
  }

  get hasRealPercentage(): boolean {
    return this.downloadFraction != null && this.phase === 'preparing';
  }

  get statusMessage(): string {
    if (this.customStatus) return this.customStatus;
    const lang = this.settings.profile().language;

    switch (this.phase) {
      case 'preparing':
        return lang === 'en'
          ? 'Preparing on-device model...'
          : lang === 'qu-chanka'
          ? 'Kaypi IA modelota wakichichkan...'
          : 'Preparando el modelo local...';
      case 'analyzing':
        return lang === 'en'
          ? 'Analyzing your study notes...'
          : lang === 'qu-chanka'
          ? 'Qillqasqaykikunata qawachkan...'
          : 'Analizando tus apuntes...';
      case 'generating':
        return lang === 'en'
          ? 'Generating pedagogical explanation...'
          : lang === 'qu-chanka'
          ? 'Kutichiyta rurachkan...'
          : 'Generando respuesta...';
      case 'validating':
        return lang === 'en'
          ? 'Validating academic accuracy...'
          : lang === 'qu-chanka'
          ? 'Allin kasqanta qawachkan...'
          : 'Validando contenido pedagógico...';
      case 'saving':
        return lang === 'en'
          ? 'Saving to encrypted diary...'
          : lang === 'qu-chanka'
          ? 'Allichachkan...'
          : 'Guardando en tu diario...';
      case 'complete':
        return lang === 'en'
          ? 'Content ready.'
          : lang === 'qu-chanka'
          ? 'Tukupusqaña.'
          : 'Contenido listo.';
      case 'error':
        return lang === 'en'
          ? 'Inference stopped.'
          : lang === 'qu-chanka'
          ? 'Mana tukukunchu.'
          : 'Inferencia detenida.';
      case 'idle':
      default:
        return lang === 'en' ? 'Starting...' : 'Iniciando...';
    }
  }

  get timerLabel(): string {
    const lang = this.settings.profile().language;
    return lang === 'en' ? 'Elapsed time' : lang === 'qu-chanka' ? 'Mit\'a risqan' : 'Tiempo transcurrido';
  }

  get cancelLabel(): string {
    const lang = this.settings.profile().language;
    return lang === 'en' ? 'Cancel' : lang === 'qu-chanka' ? 'Tatichiy' : 'Cancelar';
  }

  onCancel(): void {
    this.cancel.emit();
  }
}
