import { Injectable, computed, inject, signal } from '@angular/core';
import { LocalIdentityService } from './local-identity.service';

export type LearningLanguage = 'es' | 'qu-chanka' | 'en';
export type Grade = 1 | 2 | 3 | 4 | 5;

export interface StudentSettings {
  readonly configured: boolean;
  /** Grado de secundaria opcional (1 a 5) o null si no se ha configurado aún. */
  readonly grade: Grade | null;
  readonly language: LearningLanguage;
  readonly scienceSeparate: boolean;
  readonly offlineOnly: boolean;
  /** Si está activo, OstrixAi enriquece automáticamente los apuntes con IA sin requerir botón manual. */
  readonly autoEnrichNotes: boolean;
  /** Autorización específica e informada para permitir inferencia Cloud cuando Nano no esté disponible. */
  readonly allowCloudEnrichment: boolean;
  /** Usar por defecto el contexto de los apuntes para personalizar el Tutor localmente. */
  readonly autoInjectSessionContext: boolean;
  /** Mostrar automáticamente traducciones derivadas disponibles al idioma de la interfaz. */
  readonly autoTranslateDerived: boolean;
}

const DEFAULTS: StudentSettings = {
  configured: false,
  grade: null,
  language: 'es',
  scienceSeparate: false,
  offlineOnly: false,
  autoEnrichNotes: true,
  allowCloudEnrichment: false,
  autoInjectSessionContext: true,
  autoTranslateDerived: false,
};

@Injectable({ providedIn: 'root' })
export class StudentSettingsService {
  private readonly identity = inject(LocalIdentityService);
  private readonly saved = signal<{ owner: string; value: StudentSettings } | null>(null);
  readonly profile = computed(() => {
    const saved = this.saved();
    return saved && saved.owner === this.identity.student()?.id ? saved.value : DEFAULTS;
  });

  async load(): Promise<void> {
    const owner = this.identity.student()?.id;
    if (!owner) { this.clear(); return; }
    const settings = await this.identity.read<Partial<StudentSettings>>('settings', 'profile');
    if (owner !== this.identity.student()?.id) return;
    if (!settings) {
      this.clear();
      return;
    }

    const grade = [1, 2, 3, 4, 5].includes(settings.grade as number) ? (settings.grade as Grade) : null;
    const language = ['es', 'qu-chanka', 'en'].includes(settings.language as string)
      ? (settings.language as LearningLanguage)
      : 'es';

    this.saved.set({ owner, value: {
      configured: Boolean(settings.configured),
      grade,
      language,
      scienceSeparate: Boolean(settings.scienceSeparate),
      offlineOnly: Boolean(settings.offlineOnly),
      autoEnrichNotes: settings.autoEnrichNotes !== undefined ? Boolean(settings.autoEnrichNotes) : true,
      allowCloudEnrichment: settings.allowCloudEnrichment === true,
      autoInjectSessionContext: settings.autoInjectSessionContext !== undefined ? Boolean(settings.autoInjectSessionContext) : true,
      autoTranslateDerived: Boolean(settings.autoTranslateDerived),
    } });
  }

  async save(
    grade: Grade | null,
    language: LearningLanguage,
    scienceSeparate: boolean,
    offlineOnly = false,
    autoEnrichNotes = true,
    allowCloudEnrichment = false,
    autoInjectSessionContext = true,
    autoTranslateDerived = false
  ): Promise<void> {
    if ((grade !== null && ![1, 2, 3, 4, 5].includes(grade)) || !['es', 'qu-chanka', 'en'].includes(language)) {
      throw new Error('Grado o idioma inválido.');
    }
    const settings: StudentSettings = {
      configured: true,
      grade,
      language,
      scienceSeparate,
      offlineOnly,
      autoEnrichNotes,
      allowCloudEnrichment,
      autoInjectSessionContext,
      autoTranslateDerived,
    };
    const owner = this.identity.student()?.id;
    if (!owner) throw new Error('Debes iniciar sesión.');
    await this.identity.save('settings', 'profile', settings);
    if (owner === this.identity.student()?.id) this.saved.set({ owner, value: settings });
  }

  async setAutoEnrichNotes(enabled: boolean): Promise<void> {
    const cur = this.profile();
    await this.save(cur.grade, cur.language, cur.scienceSeparate, cur.offlineOnly, enabled, cur.allowCloudEnrichment, cur.autoInjectSessionContext, cur.autoTranslateDerived);
  }

  async setAllowCloudEnrichment(enabled: boolean): Promise<void> {
    const cur = this.profile();
    await this.save(cur.grade, cur.language, cur.scienceSeparate, cur.offlineOnly, cur.autoEnrichNotes, enabled, cur.autoInjectSessionContext, cur.autoTranslateDerived);
  }

  async setAutoInjectSessionContext(enabled: boolean): Promise<void> {
    const cur = this.profile();
    await this.save(cur.grade, cur.language, cur.scienceSeparate, cur.offlineOnly, cur.autoEnrichNotes, cur.allowCloudEnrichment, enabled, cur.autoTranslateDerived);
  }

  async setAutoTranslateDerived(enabled: boolean): Promise<void> {
    const cur = this.profile();
    await this.save(cur.grade, cur.language, cur.scienceSeparate, cur.offlineOnly, cur.autoEnrichNotes, cur.allowCloudEnrichment, cur.autoInjectSessionContext, enabled);
  }

  clear(): void {
    this.saved.set(null);
  }
}
