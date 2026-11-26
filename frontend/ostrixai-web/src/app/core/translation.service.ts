import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { getToken } from 'firebase/app-check';
import { signInAnonymously } from 'firebase/auth';
import { firstValueFrom, Subject, takeUntil, timeout } from 'rxjs';
import { environment } from './environment';
import { firebaseAuth, firebaseAppCheck, isAppCheckConfigured } from './firebase-runtime';
import { lookupGlossary } from './educational-glossary';
import { LocalIdentityService } from './local-identity.service';

import { StudentSettingsService } from './student-settings.service';
import type { LinkedServerIdentity } from './sync.service';

export type TranslationEngine = 'CHROME_BUILTIN_TRANSLATOR' | 'GLOSSARY_OFFLINE' | 'CLOUD_TRANSLATION';

export interface DerivedTranslation {
  readonly id: string;
  readonly contentId: string;
  readonly contentHash: string;
  readonly sourceLang: string;
  readonly targetLang: string;
  readonly originalText: string;
  readonly translatedText: string;
  readonly engine: TranslationEngine;
  readonly quality: string;
  readonly createdAt: string;
}

export interface CachedTranslation {
  readonly id: string;
  readonly textEs: string;
  readonly translatedQu: string;
  readonly source: 'GLOSSARY_OFFLINE' | 'CLOUD_TRANSLATION';
  readonly quality: string;
  readonly createdAt: string;
}

/**
 * Servicio de Traducción Multicapa y Privacidad Pedagógica.
 *
 * Reglas Fundamentales:
 * 1. NUNCA mutar o sobrescribir los apuntes originales del estudiante al traducir.
 * 2. NUNCA mutar el historial original de conversaciones del Tutor.
 * 3. Almacenar traducciones como representaciones derivadas indexadas por (contentId, contentHash, sourceLang, targetLang).
 * 4. Priorizar la API Translator local de Chrome (window.translation / window.ai?.translator) para pares como es <-> en.
 * 5. NUNCA enviar datos a la nube sin consentimiento explícito previo del estudiante.
 */
@Injectable({ providedIn: 'root' })
export class TranslationService {
  private readonly settings = inject(StudentSettingsService);
  private readonly cancelled = new Subject<void>();
  private generation = 0;

  cancelPending(): void {
    this.generation++;
    this.cancelled.next();
  }

  private requireSession(owner: string | undefined, generation: number): void {
    if (!owner || owner !== this.identity.student()?.id || generation !== this.generation) {
      throw new Error('Solicitud cancelada.');
    }
  }

  private readonly http = inject(HttpClient);
  private readonly identity = inject(LocalIdentityService);
  private readonly auth = firebaseAuth;

  /**
   * Traduce un texto derivado preservando intacto el original.
   */
  async translateDerivedText(
    contentId: string,
    text: string,
    sourceLang: string,
    targetLang: string,
    allowCloud = false
  ): Promise<DerivedTranslation> {
    const owner = this.identity.student()?.id;
    const generation = this.generation;
    this.requireSession(owner, generation);
    const clean = text.trim();
    if (!clean) {
      throw new Error('El texto para traducir no puede estar vacío.');
    }
    if (sourceLang === targetLang) {
      return {
        id: `tr-${contentId}-${sourceLang}`,
        contentId,
        contentHash: this.hashText(clean),
        sourceLang,
        targetLang,
        originalText: clean,
        translatedText: clean,
        engine: 'GLOSSARY_OFFLINE',
        quality: 'exact-match',
        createdAt: new Date().toISOString(),
      };
    }

    const contentHash = this.hashText(clean);
    const cacheKey = `tr_${contentId}_${sourceLang}_${targetLang}_${contentHash}`;

    // 1. Revisar caché local en IndexedDB cifrado
    try {
      const cached = await this.identity.read<DerivedTranslation>('translations', cacheKey);
      if (cached?.translatedText && cached.contentHash === contentHash && cached.originalText === clean) {
        return cached;
      }
    } catch {
      // Ignorar fallo de lectura de caché y proceder
    }

    this.requireSession(owner, generation);
    // 2. Par Español -> Quechua Chanka
    if (targetLang === 'qu' || targetLang === 'qu-chanka') {
      const glossaryHit = lookupGlossary(clean);
      if (glossaryHit) {
        const item: DerivedTranslation = {
          id: cacheKey,
          contentId,
          contentHash,
          sourceLang,
          targetLang: 'qu-chanka',
          originalText: clean,
          translatedText: `${glossaryHit.quChanka} (Glosario curricular)`,
          engine: 'GLOSSARY_OFFLINE',
          quality: 'curriculum-glossary',
          createdAt: new Date().toISOString(),
        };
        await this.identity.save('translations', cacheKey, item).catch(() => {});
        return item;
      }

      if (!allowCloud) {
        throw new Error(
          'Quechua Chanka no cuenta con traductor neuronal local en este dispositivo. ' +
          'Para traducir párrafos completos a Quechua se requiere autorizar Gemini Cloud en Configuración.'
        );
      }

      const cloudResult = await this.invokeCloudTranslation(clean, owner, generation);
      this.requireSession(owner, generation);
      const item: DerivedTranslation = {
        id: cacheKey,
        contentId,
        contentHash,
        sourceLang,
        targetLang: 'qu-chanka',
        originalText: clean,
        translatedText: cloudResult.translated,
        engine: 'CLOUD_TRANSLATION',
        quality: cloudResult.quality || 'machine-unverified',
        createdAt: new Date().toISOString(),
      };
      await this.identity.save('translations', cacheKey, item).catch(() => {});
      return item;
    }

    // 3. Par Español <-> Inglés: Intentar API Translator de Chrome en el dispositivo
    const localTranslatorResult = await this.tryChromeTranslatorApi(clean, sourceLang, targetLang);
    if (localTranslatorResult) {
      this.requireSession(owner, generation);
      const item: DerivedTranslation = {
        id: cacheKey,
        contentId,
        contentHash,
        sourceLang,
        targetLang,
        originalText: clean,
        translatedText: localTranslatorResult,
        engine: 'CHROME_BUILTIN_TRANSLATOR',
        quality: 'on-device-chrome-ai',
        createdAt: new Date().toISOString(),
      };
      await this.identity.save('translations', cacheKey, item).catch(() => {});
      return item;
    }

    throw new Error(
      `No hay motor de traducción local disponible en este navegador para el par ${sourceLang} -> ${targetLang}. ` +
      'El apunte original se mantiene intacto.'
    );
  }

  /**
   * Intenta la API Translator experimental de Chrome (window.translation o window.ai?.translator).
   */
  private async tryChromeTranslatorApi(text: string, sourceLang: string, targetLang: string): Promise<string | null> {
    if (typeof window === 'undefined') return null;
    try {
      const w = window as any;
      const pair = { sourceLanguage: sourceLang.split('-')[0], targetLanguage: targetLang.split('-')[0] };
      if (w.Translator) {
        if (await w.Translator.availability(pair) === 'unavailable') return null;
        const translator = await w.Translator.create(pair);
        try { return (await translator.translate(text)).trim() || null; }
        finally { translator.destroy(); }
      }
      const factory = w.translation ?? w.ai?.translator;
      if (factory?.createTranslator && await factory.canTranslate?.(pair) !== 'no') {
        const translator = await factory.createTranslator(pair);
        try { return (await translator.translate(text)).trim() || null; }
        finally { translator.destroy?.(); }
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Invocación controlada del backend de traducción en la nube (con App Check y JWT).
   */
  private async requestHeaders(owner: string | undefined, generation: number, individual = false): Promise<HttpHeaders> {
    await this.auth.authStateReady();
    this.requireSession(owner, generation);
    const user = this.auth.currentUser ?? (!individual ? (await signInAnonymously(this.auth)).user : null);
    if (!user) throw new Error('Se necesita una cuenta Firebase.');
    const link = await this.identity.read<LinkedServerIdentity>('settings', 'server_identity');
    if ((individual && user.isAnonymous) ||
        (!user.isAnonymous && (!user.emailVerified || user.uid !== link?.firebaseUid || owner !== link?.localStudentId))) {
      throw new Error('Se necesita una identidad escolar individual vinculada para enviar contenido.');
    }
    if (!firebaseAppCheck || !isAppCheckConfigured()) throw new Error('App Check no está configurado.');
    const [jwt, attestation] = await Promise.all([user.getIdToken(), getToken(firebaseAppCheck)]);
    this.requireSession(owner, generation);
    if (this.auth.currentUser?.uid !== user.uid || !attestation.token) throw new Error('La identidad escolar cambió.');
    return new HttpHeaders({ Authorization: 'Bearer ' + jwt, 'X-Firebase-AppCheck': attestation.token });
  }

  private async invokeCloudTranslation(text: string, owner: string | undefined, generation: number): Promise<{ translated: string; quality: string }> {
    if (!navigator.onLine || this.settings.profile().offlineOnly || !this.settings.profile().allowCloudEnrichment) {
      throw new Error('La traducción remota requiere conexión y autorización.');
    }
    const headers = await this.requestHeaders(owner, generation);
    this.requireSession(owner, generation);
    if (this.settings.profile().offlineOnly || !this.settings.profile().allowCloudEnrichment) throw new Error('Autorización revocada.');
    const result = await firstValueFrom(this.http.post<{ translated: string; quality: string }>(
      environment.apiBaseUrl + '/api/v1/translate', { text, source: 'es', target: 'qu', cloudConsent: true }, { headers }
    ).pipe(takeUntil(this.cancelled), timeout(20000)));
    this.requireSession(owner, generation);
    if (!result?.translated) throw new Error('No se recibió una respuesta del traductor.');
    return result;
  }

  /**
   * Compatibilidad hacia atrás con el flujo de Quechua existente.
   */
  async spanishToQuechua(text: string, allowCloud = false): Promise<string> {
    const derived = await this.translateDerivedText('general', text, 'es', 'qu-chanka', allowCloud);
    return derived.translatedText;
  }

  async submitCorrection(
    termSpanish: string,
    translatedQuechua: string,
    suggestedChanka: string,
    communityContext?: string
  ): Promise<void> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('Registrar una sugerencia lingüística para docentes requiere conexión.');
    }
    const owner = this.identity.student()?.id;
    const generation = this.generation;
    if (this.settings.profile().offlineOnly) throw new Error('El modo sin conexión está activo.');
    const headers = await this.requestHeaders(owner, generation, true);
    this.requireSession(owner, generation);
    const payload = {
      term_spanish: termSpanish.trim(),
      translated_quechua: translatedQuechua.trim(),
      suggested_chanka: suggestedChanka.trim(),
      community_context: communityContext?.trim(),
    };
    await firstValueFrom(
      this.http.post(`${environment.apiBaseUrl}/api/v1/linguistic-corrections`, payload, { headers }).pipe(takeUntil(this.cancelled), timeout(20000))
    );
  }

  hashText(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash |= 0;
    }
    return `tr-${Math.abs(hash).toString(36)}`;
  }
}
