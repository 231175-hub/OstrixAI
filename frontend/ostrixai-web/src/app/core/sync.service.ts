import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { getToken } from 'firebase/app-check';
import { browserPopupRedirectResolver, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { firstValueFrom, Subject, takeUntil, timeout } from 'rxjs';
import { environment } from './environment';
import { firebaseAuth, firebaseAppCheck, isAppCheckConfigured, isFirebaseConfigured } from './firebase-runtime';
import { LocalIdentityService } from './local-identity.service';
import { mayRetrySchoolSync, schoolSyncBackoffMs } from './async-work-policy';
import { StudySession } from './learning-diary.service';
import { ConceptMemory } from './learning-memory.service';

export type InferenceSource = 'ON_DEVICE' | 'IN_CLOUD' | 'OFFLINE_ESSENTIAL';

export interface SyncEvent {
  readonly id: string;
  readonly note: string;
  readonly answer: string;
  readonly inference_source: InferenceSource;
  readonly is_complex: boolean;
  readonly occurred_at: string;
}

export interface DiarySyncPayload {
  readonly sessions: readonly StudySession[];
  readonly memory_items: readonly ConceptMemory[];
  readonly review_results: readonly unknown[];
}

export interface LinkedServerIdentity {
  readonly localStudentId: string;
  readonly firebaseUid: string;
  readonly linkedAt: string;
}

type DiaryRow = StudySession | ConceptMemory;
type JournalField = 'sessions' | 'memory_items';
interface RevisionReceipt {
  readonly key: string;
  readonly nonce: string;
  readonly hash: string | null;
  readonly pending?: DiaryRow;
}
type Post = <T>(path: string, data: unknown) => Promise<T>;

async function sendInBatches<T>(rows: readonly T[], limit: number, send: (batch: readonly T[]) => Promise<void>): Promise<void> {
  for (let start = 0; start < rows.length; start += limit) {
    const batch = rows.slice(start, start + limit);
    try {
      await send(batch);
    } catch (error) {
      // Flask can reject a batch by byte size even when each row fits on its own.
      if (!(error instanceof HttpErrorResponse) || error.status !== 413 || batch.length === 1) throw error;
      await sendInBatches(batch, Math.ceil(batch.length / 2), send);
    }
  }
}

/**
 * Servicio de sincronización offline-first e idempotente.
 *
 * REGLA DE SEGURIDAD MULTIESTUDIANTE (Fase G):
 * Jamás se utiliza una identidad Firebase anónima compartida (`signInAnonymously`)
 * para sincronizar cuadernos de distintos estudiantes en una computadora escolar compartida.
 * La sincronización remota permanece protegida/deshabilitada hasta que el estudiante
 * vincule una cuenta individual no anónima verificada por el servidor.
 */
@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly http = inject(HttpClient);
  private readonly identity = inject(LocalIdentityService);
  private readonly auth = firebaseAuth;

  readonly pendingCount = signal(0);
  readonly pendingCountKnown = signal(false);
  readonly lastSyncError = signal<string | null>(null);
  readonly lastSyncSuccess = signal<string | null>(null);
  readonly isSyncing = signal(false);
  readonly serverIdentityLinked = signal(false);

  readonly isLinking = signal(false);
  private get syncConsent(): boolean { return this.identity.hasSchoolSyncConsent(); }
  private generation = 0;
  private readonly stop = new Subject<void>();
  private countRequest = 0;

  constructor() {
    // The encrypted outbox and revision receipts remain the source of truth. No duplicated queue.
    let failures = 0;
    let nextAttemptAt = 0;
    const resume = async (force = false): Promise<void> => {
      if (!mayRetrySchoolSync({
        hasStudent: !!this.identity.student(), authorized: this.syncConsent,
        linked: this.serverIdentityLinked(), online: navigator.onLine,
        pending: this.pendingCount(), busy: this.isSyncing(), linking: this.isLinking(),
      })) return;
      if (!force && Date.now() < nextAttemptAt) return;
      try {
        await this.flush();
        failures = 0;
        nextAttemptAt = 0;
      } catch {
        failures++;
        nextAttemptAt = Date.now() + schoolSyncBackoffMs(failures);
        // Errors are visible in lastSyncError; all unacknowledged records remain encrypted.
      }
    };
    const onReconnect = () => { void this.refreshCount().then(() => resume(true)).catch(() => {}); };
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        // Resuming a tab must respect backoff after a server failure.
        void this.refreshCount().then(() => resume()).catch(() => {});
      }
    };
    // Periodic retries only while the tab is visible, authorized and linked.
    const retryInterval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void resume();
    }, 45_000);
    // The online event can precede restoration of the Firebase credential in this tab.
    const auth = this.auth;
    const stopAuth = onAuthStateChanged(auth, async () => {
      if (this.auth !== auth) return;
      this.serverIdentityLinked.set(false);
      if (!this.identity.student()) return;
      await this.refreshCount();
      if (navigator.onLine && this.pendingCount() > 0 && !this.isLinking()) onReconnect();
    });
    window.addEventListener('online', onReconnect);
    document.addEventListener('visibilitychange', onVisible);
    // Debounce many local diary writes into one authorized sync attempt.
    let changeRetryTimer: ReturnType<typeof setTimeout> | null = null;
    const changes = this.identity.journalChanged.subscribe(() => {
      void this.refreshCount();
      if (changeRetryTimer) clearTimeout(changeRetryTimer);
      changeRetryTimer = setTimeout(() => { changeRetryTimer = null; void resume(); }, 12_000);
    });
    inject(DestroyRef).onDestroy(() => {
      stopAuth();
      changes.unsubscribe();
      if (changeRetryTimer) clearTimeout(changeRetryTimer);
      window.clearInterval(retryInterval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onReconnect);
    });
  }

  /** Called only from the user's Link school account button. */
  async linkSchoolAccount(): Promise<void> {
    const owner = this.identity.student();
    if (!owner || !navigator.onLine) throw new Error('Inicia sesión local y conéctate para vincular tu cuenta escolar.');
    if (!isFirebaseConfigured()) throw new Error('La escuela debe configurar Firebase Authentication y habilitar Google para vincular cuentas.');
    if (this.isLinking() || this.isSyncing()) throw new Error('Espera a que finalice la operación en curso.');
    this.isLinking.set(true);
    let signedInUid: string | undefined;
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const { user } = await signInWithPopup(this.auth, provider, browserPopupRedirectResolver);
      signedInUid = user.uid;
      if (owner !== this.identity.student() || this.auth.currentUser?.uid !== user.uid || user.isAnonymous || !user.emailVerified) {
        throw new Error('Se requiere una cuenta escolar individual verificada.');
      }
      await this.identity.linkServerAccount(user.uid);
      if (owner !== this.identity.student()) throw new Error('La sesión cambió.');
      this.serverIdentityLinked.set(true);
      await this.refreshCount();
    } catch (error) {
      if (signedInUid && this.auth.currentUser?.uid === signedInUid) await signOut(this.auth);
      await this.refreshCount();
      throw error;
    } finally {
      this.isLinking.set(false);
    }
  }

  getSyncConsent(): boolean {
    return this.syncConsent;
  }

  setSyncConsent(allowed: boolean): void {
    if (this.syncConsent === allowed) return;
    this.identity.setSchoolSyncConsent(allowed);
    this.generation++;
    this.stop.next();
    this.isSyncing.set(false);
    if (!allowed) {
      this.lastSyncError.set(null);
    }
    void this.refreshCount();
  }

  async saveDraft(note: string): Promise<void> {
    if (note.length > 25_000) throw new Error('Borrador demasiado largo.');
    await this.identity.save('drafts', 'current', { note, updated_at: new Date().toISOString() });
  }

  async loadDraft(): Promise<string> {
    return (await this.identity.read<{ note: string }>('drafts', 'current'))?.note ?? '';
  }

  async enqueueInteraction(
    note: string,
    answer: string,
    source: InferenceSource,
    isComplex: boolean
  ): Promise<string> {
    if (!note.trim() || !answer.trim() || note.length > 25_000 || answer.length > 25_000) {
      throw new Error('Interacción inválida.');
    }
    if (!this.identity.student()) {
      return '';
    }
    // Solo encolar para sincronización remota si el estudiante autorizó la sincronización escolar
    if (!this.syncConsent) {
      return '';
    }
    const id = crypto.randomUUID();
    await this.identity.save<SyncEvent>('outbox', id, {
      id,
      note,
      answer,
      inference_source: source,
      is_complex: isComplex,
      occurred_at: new Date().toISOString(),
    });
    await this.refreshCount();
    return id;
  }

  async refreshCount(): Promise<void> {
    const request = ++this.countRequest;
    const student = this.identity.student();
    const generation = this.generation;
    if (!student) {
      this.pendingCount.set(0);
      this.serverIdentityLinked.set(false);
      return;
    }
    try {
      const [inventory, receipts, link] = await Promise.all([
        this.identity.syncInventory(),
        this.identity.list<RevisionReceipt>('syncreceipts'),
        this.identity.read<LinkedServerIdentity>('settings', 'server_identity'),
      ]);
      if (student !== this.identity.student() || generation !== this.generation || request !== this.countRequest) return;
      const acknowledged = new Map(receipts.filter(r => !r.pending && r.hash).map(r => [r.key, r.nonce]));
      this.pendingCount.set(inventory.filter(r => r.category === 'outbox' ||
        acknowledged.get(`${r.category}-${r.id}`) !== r.nonce).length);
      this.pendingCountKnown.set(true);
      const currentUser = this.auth.currentUser;
      this.serverIdentityLinked.set(
        Boolean(link && currentUser && !currentUser.isAnonymous && currentUser.emailVerified &&
          link.localStudentId === student.id && link.firebaseUid === currentUser.uid)
      );
    } catch {
      if (student !== this.identity.student() || generation !== this.generation || request !== this.countRequest) return;
      this.lastSyncError.set('No se pudo comprobar la cola cifrada.');
      this.pendingCountKnown.set(false);
      this.serverIdentityLinked.set(false);
    }
  }

  private async appCheckToken(): Promise<string> {
    if (!firebaseAppCheck || !isAppCheckConfigured()) throw new Error('App Check no está configurado.');
    const attestation = await getToken(firebaseAppCheck);
    if (!attestation.token) throw new Error('Se requiere una atestación App Check válida.');
    return attestation.token;
  }

  /**
   * Sincronización completa e idempotente del diario académico con Flask/MySQL.
   * Bloquea cualquier envío si no existe una identidad de servidor individual vinculada
   * (nunca usa Firebase Anonymous Auth compartido).
   */
  async flush(): Promise<void> {
    const student = this.identity.student();
    if (!student) {
      throw new Error('Inicia sesión con tu cuenta local antes de sincronizar.');
    }
    if (!this.syncConsent) {
      throw new Error('Debes activar la autorización explícita para sincronizar con el servidor escolar.');
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('Sin conexión a internet. Tus datos siguen protegidos y cifrados en este equipo.');
    }

    // Guardia estricta de aislamiento entre estudiantes en equipos compartidos
    if (this.isSyncing()) throw new Error('Ya hay una sincronización en curso.');
    const generation = this.generation;
    const user = this.auth.currentUser;
    const checkOwner = (): void => {
      if (!this.syncConsent || generation !== this.generation || student !== this.identity.student() ||
          !user || !user.emailVerified || user.isAnonymous || user !== this.auth.currentUser) {
        throw new Error('La sincronización requiere la cuenta individual vinculada y autorización vigente.');
      }
    };

    this.isSyncing.set(true);
    this.lastSyncError.set(null);
    try {
      const link = await this.identity.read<LinkedServerIdentity>('settings', 'server_identity');
      checkOwner();
      if (!link || link.localStudentId !== student.id || link.firebaseUid !== user!.uid) {
        throw new Error('Vincula una identidad individual del servidor antes de sincronizar.');
      }
      const [idToken, attestation] = await Promise.all([user!.getIdToken(), this.appCheckToken()]);
      const headers = new HttpHeaders({ Authorization: `Bearer ${idToken}`, 'X-Firebase-AppCheck': attestation });
      const post = <T>(path: string, data: unknown): Promise<T> => {
        checkOwner();
        return firstValueFrom(this.http.post<T>(`${environment.apiBaseUrl}/api/v1/${path}`, data, { headers })
          .pipe(timeout(30_000), takeUntil(this.stop)));
      };

      const events = await this.identity.list<SyncEvent>('outbox');
      await sendInBatches(events, 25, async batch => {
        const res = await post<{ ids: string[] }>('sync', { events: batch });
        const ids = new Set(batch.map(e => e.id));
        if (!Array.isArray(res?.ids) || res.ids.length !== ids.size || new Set(res.ids).size !== ids.size ||
            res.ids.some(id => !ids.has(id))) throw new Error('El servidor no confirmó el lote completo.');
        for (const id of res.ids) {
          checkOwner();
          await this.identity.delete('outbox', id);
        }
      });

      const inventory = await this.identity.syncInventory();
      for (const category of ['diary', 'memory'] as const) {
        const ids = inventory.filter(r => r.category === category).map(r => r.id);
        await this.sendOwnedRevisions(category, ids, post, checkOwner);
      }
      checkOwner();
      await this.refreshCount();
      checkOwner();
      this.lastSyncSuccess.set(this.pendingCount() > 0 ? 'Hay nuevos cambios locales por sincronizar.' :
        `Sincronización completada (${new Date().toLocaleTimeString()}).`);
    } catch (err: unknown) {
      const msg = err instanceof HttpErrorResponse ? `El servidor escolar respondió HTTP ${err.status}.` :
        err instanceof Error ? err.message : 'Error al comunicarse con el servidor escolar.';
      if (student === this.identity.student() && generation === this.generation) await this.refreshCount();
      if (student === this.identity.student() && generation === this.generation) this.lastSyncError.set(msg);
      throw new Error(`Fallo de sincronización: ${msg}`);
    } finally {
      if (generation === this.generation) this.isSyncing.set(false);
    }
  }

  private async sendOwnedRevisions(category: 'diary' | 'memory', ids: readonly string[], post: Post,
                                   checkOwner: () => void): Promise<void> {
    const field: JournalField = category === 'diary' ? 'sessions' : 'memory_items';
    // Finish a possibly committed request first, then deliver any edits made since that request.
    let remaining = ids;
    for (let pass = 0; pass < 2 && remaining.length; pass++) {
      const work: { receipt: RevisionReceipt; recordNonce: string; row: DiaryRow }[] = [];
      const newer: string[] = [];
      for (const id of remaining) {
        checkOwner();
        const key = `${category}-${id}`;
        const [local, state] = await Promise.all([
          this.identity.readVersion<DiaryRow>(category, id),
          this.identity.readVersion<RevisionReceipt>('syncreceipts', key),
        ]);
        checkOwner();
        if (!local) continue;
        const previous = state?.value;
        if (local.value.id !== id || (previous && previous.key !== key) ||
            (previous?.pending && previous.pending.id !== id)) throw new Error('La revisión local no corresponde a este registro.');
        if (state && previous?.pending) {
          work.push({ receipt: previous, recordNonce: state.nonce, row: previous.pending });
          if (previous.nonce !== local.nonce) newer.push(id);
          continue;
        }
        if (previous?.hash && previous.nonce === local.nonce) continue;
        // Old releases kept only the server hash. Reconfirm the owned row once on upgrade.
        const hash = previous ? previous.hash :
          await this.identity.read<string>('settings', `revision-${field}-${id}`) ?? null;
        checkOwner();
        const receipt: RevisionReceipt = { key, hash, nonce: local.nonce, pending: local.value };
        const recordNonce = await this.identity.saveVersion('syncreceipts', key, receipt, state?.nonce ?? null);
        work.push({ receipt, recordNonce, row: local.value });
      }
      await sendInBatches(work, 50, async batch => {
        const base = Object.fromEntries(batch.map(({ row, receipt }) => [row.id, receipt.hash]));
        let response: { hashes: Record<string, Record<string, string>> };
        try {
          response = await post('diary/sync', { [field]: batch.map(w => w.row), base_hashes: { [field]: base } });
        } catch (error) {
          // Flask rolled this transaction back. Allow a corrected local revision to replace the rejected request.
          if (error instanceof HttpErrorResponse &&
              ([400, 409].includes(error.status) || (error.status === 413 && batch.length === 1))) {
            for (const { receipt, recordNonce } of batch) {
              checkOwner();
              await this.identity.save<RevisionReceipt>('syncreceipts', receipt.key,
                { key: receipt.key, nonce: '', hash: receipt.hash }, recordNonce);
            }
          }
          throw error;
        }
        const hashes = response?.hashes?.[field];
        if (!hashes || Object.keys(hashes).length !== batch.length ||
            batch.some(w => typeof hashes[w.row.id] !== 'string' || !/^[a-f0-9]{64}$/.test(hashes[w.row.id]))) {
          throw new Error('El servidor no confirmó la revisión del diario.');
        }
        if (category === 'memory') {
          await this.sendReviews(batch.map(w => w.row as ConceptMemory), post);
        }
        for (const { receipt, recordNonce, row } of batch) {
          checkOwner();
          await this.identity.save<RevisionReceipt>('syncreceipts', receipt.key, {
            key: receipt.key, nonce: receipt.nonce, hash: hashes[row.id],
          }, recordNonce);
        }
      });
      remaining = newer;
    }
  }

  private async sendReviews(concepts: readonly ConceptMemory[], post: Post): Promise<void> {
    const reviews = [];
    for (const concept of concepts) {
      for (const [index, entry] of concept.history.entries()) {
        let id = entry.id;
        if (!id) {
          // Preserve the immutable ID used by earlier clients for this append-only history.
          const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256',
            new TextEncoder().encode(`review:${concept.id}:${index}`))).slice(0, 16);
          bytes[6] = (bytes[6] & 0x0f) | 0x40;
          bytes[8] = (bytes[8] & 0x3f) | 0x80;
          const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
          id = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
        }
        reviews.push({ id, conceptId: concept.id, exerciseId: entry.exerciseId, score: entry.score,
          isCorrect: entry.isCorrect, date: entry.date });
      }
    }
    await sendInBatches(reviews, 50, async batch => {
      const response = await post<{ accepted_results: number }>('diary/sync', { review_results: batch });
      if (response?.accepted_results !== batch.length) throw new Error('El servidor no confirmó todas las evaluaciones.');
    });
  }

  /**
   * Read-only, authenticated verification of owner-scoped Flask/MySQL persistence.
   * Returns identifiers only: never log student notes, Firebase tokens or App Check tokens.
   * Useful for a two-student acceptance test with *real* school identities.
   */
  async verifyRemoteSessionIds(): Promise<{ sessionIds: string[]; count: number }> {
    const student = this.identity.student();
    const user = this.auth.currentUser;
    const generation = this.generation;
    if (!student || !this.syncConsent || !this.serverIdentityLinked() || !user ||
        user.isAnonymous || !user.emailVerified) {
      throw new Error('Vincula tu cuenta escolar individual y autoriza la sincronización.');
    }
    const linked = await this.identity.read<LinkedServerIdentity>('settings', 'server_identity');
    if (!linked || linked.localStudentId !== student.id || linked.firebaseUid !== user.uid) {
      throw new Error('La cuenta escolar no corresponde al estudiante actual.');
    }
    const [idToken, attestation] = await Promise.all([user.getIdToken(), this.appCheckToken()]);
    if (!this.syncConsent || generation !== this.generation ||
        student !== this.identity.student() || user !== this.auth.currentUser) {
      throw new Error('La sesión o la autorización cambiaron.');
    }
    const headers = new HttpHeaders({
      Authorization: `Bearer ${idToken}`, 'X-Firebase-AppCheck': attestation,
    });
    const response = await firstValueFrom(this.http.get<{ sessions: { id: string }[] }>(
      `${environment.apiBaseUrl}/api/v1/diary/sessions?limit=100`, { headers },
    ).pipe(timeout(30_000), takeUntil(this.stop)));
    if (!this.syncConsent || generation !== this.generation || student !== this.identity.student() ||
        user !== this.auth.currentUser) throw new Error('La sesión cambió antes de recibir la respuesta.');
    if (!Array.isArray(response?.sessions) ||
        response.sessions.some(row => !row || typeof row.id !== 'string')) {
      throw new Error('El servidor devolvió una respuesta inválida.');
    }
    return { sessionIds: response.sessions.map(row => row.id), count: response.sessions.length };
  }

  clear(): void {
    // signOut also waits for an in-flight Firebase restore when currentUser is still null.
    void signOut(this.auth).catch(() => { /* Local identity and consent are already locked. */ });
    this.generation++;
    this.stop.next();
    this.isSyncing.set(false);
    this.pendingCount.set(0);
    this.pendingCountKnown.set(false);
    this.lastSyncError.set(null);
    this.lastSyncSuccess.set(null);
    this.serverIdentityLinked.set(false);
    this.identity.setSchoolSyncConsent(false);
  }
}
