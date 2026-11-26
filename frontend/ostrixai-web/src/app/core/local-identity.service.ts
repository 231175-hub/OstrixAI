import { Injectable, signal } from '@angular/core';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { Subject } from 'rxjs';

/** Identity is LOCAL to this browser profile. It is not a Firebase/AWS account. */
export interface LocalStudent { readonly id: string; readonly username: string; }
export class InvalidLocalCredentials extends Error {
  constructor() { super('Usuario o contraseña incorrectos.'); }
}
interface ProfileRow {
  id: string; username: string; salt: string; nonce: string; check: string; createdAt: string; serverAccountHash?: string;
}
interface SecretRow {
  id: string; ownerId: string; category: string; nonce: string; ciphertext: string;
}
interface SessionRow {
  id: string; student: LocalStudent; nonce: string; ciphertext: string; expires: number;
}
interface IdentityDB extends DBSchema {
  profiles: { key: string; value: ProfileRow; indexes: { 'username': string; 'serverAccountHash': string } };
  secrets: { key: string; value: SecretRow; indexes: { 'owner': string } };
  session: { key: string; value: SessionRow };
}
const DB_NAME = 'ostrixai-private-v1';
const TAB_SESSION = 'ostrixai-unlock';
const TAB_SYNC_CONSENT = 'ostrixai-school-sync-consent';
const REVOKED_SESSION = 'ostrixai-session-closed';
const SESSION_LIFETIME = 8 * 60 * 60 * 1000;
const CHECK = 'OSTRIXAI_PROFILE_UNLOCK_V1';
const ITERATIONS = 310_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const b64 = (bytes: Uint8Array): string => {
  let encoded = ''; for (const byte of bytes) encoded += String.fromCharCode(byte);
  return btoa(encoded);
};
const unb64 = (text: string): Uint8Array => Uint8Array.from(atob(text), c => c.charCodeAt(0));
const random = (size: number): Uint8Array => crypto.getRandomValues(new Uint8Array(size));
const buffer = (value: Uint8Array): ArrayBuffer => Uint8Array.from(value).buffer;

@Injectable({ providedIn: 'root' })
export class LocalIdentityService {
  readonly student = signal<LocalStudent | null>(null);
  readonly journalChanged = new Subject<void>();
  private key: CryptoKey | null = null;
  private unlockId?: string;
  private generation = 0;
  private readonly db: Promise<IDBPDatabase<IdentityDB>> = openDB<IdentityDB>(DB_NAME, 4, {
    upgrade(db, oldVersion, _newVersion, transaction): void {
      if (oldVersion < 1) {
        const profiles = db.createObjectStore('profiles', { keyPath: 'id' });
        profiles.createIndex('username', 'username', { unique: true });
        const secrets = db.createObjectStore('secrets', { keyPath: 'id' });
        secrets.createIndex('owner', 'ownerId');
      }
      if (oldVersion < 3) {
        // Remove only obsolete unlock keys. Student profiles and notebooks remain intact.
        if (db.objectStoreNames.contains('session')) db.deleteObjectStore('session');
        db.createObjectStore('session', { keyPath: 'id' });
      }
      if (oldVersion < 4) {
        transaction.objectStore('profiles').createIndex('serverAccountHash', 'serverAccountHash', { unique: true });
      }
    },
  });

  // Only this tab holds the wrapping secret. A fresh browser session requires the password.
  private async persistActiveSession(student: LocalStudent, raw: Uint8Array, key: CryptoKey, generation: number): Promise<void> {
    const id = crypto.randomUUID();
    const secret = random(32);
    const wrapper = await this.importKey(secret);
    const sealed = await this.encryptWith(wrapper, b64(raw), `unlock:${id}:${student.id}`);
    raw.fill(0);
    const db = await this.db;
    const tx = db.transaction('session', 'readwrite');
    let cursor = await tx.store.openCursor();
    while (cursor) {
      if (cursor.value.expires <= Date.now()) await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.store.put({ id, student, ...sealed, expires: Date.now() + SESSION_LIFETIME });
    await tx.done;
    if (generation !== this.generation) throw new Error('La sesión cambió.');
    sessionStorage.setItem(TAB_SESSION, JSON.stringify({ id, secret: b64(secret) }));
    this.unlockId = id;
    this.key = key;
    this.student.set(student);
  }

  async restoreSession(): Promise<LocalStudent | null> {
    // Opening v3 also invalidates global v2 unlock keys on machines already shared.
    const generation = this.generation;
    const saved = sessionStorage.getItem(TAB_SESSION);
    if (!saved) return null;
    try {
      const db = await this.db;
      const { id, secret } = JSON.parse(saved);
      const row = await db.get('session', id);
      if (row && row.expires > Date.now()) {
        const wrapper = await this.importKey(unb64(secret));
        const raw = await this.decryptWith(wrapper, row.nonce, row.ciphertext, `unlock:${id}:${row.student.id}`);
        const key = await this.importKey(unb64(raw));
        if (generation !== this.generation || sessionStorage.getItem(TAB_SESSION) !== saved) return null;
        this.unlockId = id;
        this.key = key;
        this.student.set(row.student);
        return row.student;
      }
    } catch { /* Missing, expired or invalid tab state requires signing in again. */ }
    if (generation === this.generation && sessionStorage.getItem(TAB_SESSION) === saved) sessionStorage.removeItem(TAB_SESSION);
    return null;
  }

  private importKey(raw: Uint8Array): Promise<CryptoKey> {
    return crypto.subtle.importKey('raw', buffer(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);
  }

  private username(value: string): string {
    const normalized = value.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,24}$/.test(normalized)) {
      throw new Error('Usa entre 3 y 24 caracteres: letras sin tildes, números, punto, guion o guion bajo.');
    }
    return normalized;
  }

  private async derive(passphrase: string, salt: Uint8Array): Promise<Uint8Array> {
    if (passphrase.length < 10 || passphrase.length > 128) {
      throw new Error('La contraseña debe contener entre 10 y 128 caracteres.');
    }
    const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: buffer(salt), iterations: ITERATIONS },
      material, 256,
    ));
  }

  private async encryptWith(key: CryptoKey, text: string, context: string): Promise<{nonce: string; ciphertext: string}> {
    const nonce = random(12);
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: buffer(nonce), additionalData: encoder.encode(context) }, key, encoder.encode(text),
    );
    return { nonce: b64(nonce), ciphertext: b64(new Uint8Array(ciphertext)) };
  }

  private async decryptWith(key: CryptoKey, nonce: string, ciphertext: string, context: string): Promise<string> {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: buffer(unb64(nonce)), additionalData: encoder.encode(context) },
      key, buffer(unb64(ciphertext)),
    );
    return decoder.decode(plaintext);
  }

  async register(name: string, passphrase: string): Promise<void> {
    if (this.student()) throw new Error('Cierra la sesión anterior antes de registrar otra.');
    const generation = ++this.generation;
    const username = this.username(name);
    const db = await this.db;
    if (await db.getFromIndex('profiles', 'username', username)) throw new Error('Ese usuario ya existe en esta computadora.');
    const salt = random(16);
    const raw = await this.derive(passphrase, salt);
    const key = await this.importKey(raw);
    const id = crypto.randomUUID();
    const proof = await this.encryptWith(key, CHECK, `profile:${id}`);
    const tx = db.transaction('profiles', 'readwrite');
    try {
      await tx.store.add({ id, username, salt: b64(salt), nonce: proof.nonce, check: proof.ciphertext, createdAt: new Date().toISOString() });
      await tx.done;
    } catch { throw new Error('No se pudo crear el usuario. Comprueba si ya existe.'); }
    await this.persistActiveSession({ id, username }, raw, key, generation);
  }

  async login(name: string, passphrase: string): Promise<void> {
    if (this.student()) throw new Error('Cierra la sesión anterior.');
    const generation = ++this.generation;
    const username = this.username(name);
    const profile = await (await this.db).getFromIndex('profiles', 'username', username);
    // Same message for unknown user and incorrect password (no account enumeration).
    if (!profile) throw new InvalidLocalCredentials();
    try {
      const raw = await this.derive(passphrase, unb64(profile.salt));
      const key = await this.importKey(raw);
      const result = await this.decryptWith(key, profile.nonce, profile.check, `profile:${profile.id}`);
      if (result !== CHECK) throw new Error('Invalid password');
      await this.persistActiveSession({ id: profile.id, username: profile.username }, raw, key, generation);
    } catch { throw new InvalidLocalCredentials(); }
  }

  private lock(): void {
    this.generation++;
    this.unlockId = undefined;
    sessionStorage.removeItem(TAB_SYNC_CONSENT);
    this.key = null; // Decrypted data must also be purged by the diary/root component.
    this.student.set(null);
    sessionStorage.removeItem(TAB_SESSION);
  }

  // Consent follows this specific unlocked tab across reloads and ends at logout.
  hasSchoolSyncConsent(): boolean {
    return !!this.unlockId && sessionStorage.getItem(TAB_SYNC_CONSENT) === this.unlockId;
  }

  setSchoolSyncConsent(allowed: boolean): void {
    if (allowed && this.unlockId) sessionStorage.setItem(TAB_SYNC_CONSENT, this.unlockId);
    else sessionStorage.removeItem(TAB_SYNC_CONSENT);
  }

  logout(): void {
    const saved = sessionStorage.getItem(TAB_SESSION);
    this.lock();
    if (saved) {
      const { id } = JSON.parse(saved);
      void this.db.then(db => db.delete('session', id));
      // A duplicated tab may have inherited the same wrapping secret.
      localStorage.setItem(REVOKED_SESSION, id);
    }
  }

  watchSessionRevocation(onLock: () => void): () => void {
    const lockIfCurrent = (id: string): void => {
      const saved = sessionStorage.getItem(TAB_SESSION);
      if (saved && JSON.parse(saved).id === id) {
        this.lock();
        onLock();
      }
    };
    const onStorage = (event: StorageEvent): void => {
      if (event.storageArea === localStorage && event.key === REVOKED_SESSION && event.newValue) {
        lockIfCurrent(event.newValue);
      }
    };
    const onPageShow = async (event: PageTransitionEvent): Promise<void> => {
      const saved = sessionStorage.getItem(TAB_SESSION);
      if (!event.persisted || !saved) return;
      const { id } = JSON.parse(saved);
      const row = await (await this.db).get('session', id);
      if (!row || row.expires <= Date.now()) lockIfCurrent(id);
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pageshow', onPageShow);
    };
  }

  private unlocked(): { key: CryptoKey; student: LocalStudent } {
    const student = this.student();
    if (!this.key || !student) throw new Error('Debes iniciar sesión.');
    return { key: this.key, student };
  }

  async linkServerAccount(firebaseUid: string): Promise<void> {
    const { student, key } = this.unlocked();
    const existing = await this.read<{ firebaseUid: string }>('settings', 'server_identity');
    if (existing && existing.firebaseUid !== firebaseUid) throw new Error('Este cuaderno ya está vinculado a otra cuenta escolar.');
    const hash = b64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(firebaseUid))));
    const id = `${student.id}:settings:server_identity`;
    const value = { localStudentId: student.id, firebaseUid, linkedAt: new Date().toISOString() };
    const sealed = await this.encryptWith(key, JSON.stringify(value), id);
    const db = await this.db;
    if (student !== this.student() || key !== this.key) throw new Error('La sesión cambió.');
    const tx = db.transaction(['profiles', 'secrets'], 'readwrite');
    const profiles = tx.objectStore('profiles');
    const [profile, claimed] = await Promise.all([
      profiles.get(student.id), profiles.index('serverAccountHash').getKey(hash),
    ]);
    if (!profile || (claimed && claimed !== student.id) || (profile.serverAccountHash && profile.serverAccountHash !== hash)) {
      throw new Error('La vinculación escolar no coincide con este perfil local.');
    }
    await profiles.put({ ...profile, serverAccountHash: hash });
    await tx.objectStore('secrets').put({ id, ownerId: student.id, category: 'settings', ...sealed });
    await tx.done;
  }

  /** save(category, id, value) - Persiste en IndexedDB cifrado */
  async save<T>(category: string, id: string, value: T, expectedNonce?: string | null): Promise<void> {
    await this.saveVersion(category, id, value, expectedNonce);
  }

  async saveVersion<T>(category: string, id: string, value: T, expectedNonce?: string | null): Promise<string> {
    const { key, student } = this.unlocked();
    if (!/^[a-z]{2,30}$/.test(category) || !id || id.length > 100) throw new Error('Registro inválido.');
    const recordId = `${student.id}:${category}:${id}`;
    const encrypted = await this.encryptWith(key, JSON.stringify(value), recordId);
    if (this.student()?.id !== student.id || this.key !== key) throw new Error('La sesión cambió durante el guardado.');
    const db = await this.db;
    const tx = db.transaction('secrets', 'readwrite');
    if (expectedNonce !== undefined && ((await tx.store.get(recordId))?.nonce ?? null) !== expectedNonce) {
      throw new Error('Otra pestaña modificó la sesión. Conserva tu borrador y recarga antes de combinar cambios.');
    }
    await tx.store.put({
      id: recordId, ownerId: student.id, category, nonce: encrypted.nonce, ciphertext: encrypted.ciphertext,
    });
    await tx.done;
    if (this.student()?.id !== student.id || this.key !== key) throw new Error('La sesión cambió durante el guardado.');
    if (category === 'diary' || category === 'memory') this.journalChanged.next();
    return encrypted.nonce;
  }

  /** The ciphertext nonce changes atomically with every saved version, even across tabs. */
  async syncInventory(): Promise<{ id: string; category: string; nonce: string }[]> {
    const { key, student } = this.unlocked();
    const records = await (await this.db).getAllFromIndex('secrets', 'owner', student.id);
    if (student !== this.student() || key !== this.key) throw new Error('La sesión cambió.');
    return records.filter(r => ['diary', 'memory', 'outbox'].includes(r.category))
      .map(r => ({ category: r.category, id: r.id.slice(student.id.length + r.category.length + 2), nonce: r.nonce }));
  }

  /** list(category) - Recupera registros desde IndexedDB cifrado */
  async list<T>(category: string): Promise<T[]> {
    const { key, student } = this.unlocked();
    const records = await (await this.db).getAllFromIndex('secrets', 'owner', student.id);
    const chosen = records.filter(r => r.category === category);
    const decoded = await Promise.all(chosen.map(async r =>
      JSON.parse(await this.decryptWith(key, r.nonce, r.ciphertext, r.id)) as T));
    if (this.student()?.id !== student.id || this.key !== key) throw new Error('La sesión cambió.');
    return decoded;
  }

  async read<T>(category: string, id: string): Promise<T | undefined> {
    return (await this.readVersion<T>(category, id))?.value;
  }

  async readVersion<T>(category: string, id: string): Promise<{ value: T; nonce: string } | undefined> {
    const { key, student } = this.unlocked();
    const recordId = `${student.id}:${category}:${id}`;
    const record = await (await this.db).get('secrets', recordId);
    if (!record) {
      if (this.student()?.id !== student.id || this.key !== key) throw new Error('La sesión cambió.');
      return undefined;
    }
    const decoded = JSON.parse(await this.decryptWith(key, record.nonce, record.ciphertext, recordId)) as T;
    if (this.student()?.id !== student.id || this.key !== key) throw new Error('La sesión cambió.');
    return { value: decoded, nonce: record.nonce };
  }

  async delete(category: string, id: string): Promise<void> {
    const { student } = this.unlocked();
    await (await this.db).delete('secrets', `${student.id}:${category}:${id}`);
    if (category === 'diary' || category === 'memory') this.journalChanged.next();
  }
}
