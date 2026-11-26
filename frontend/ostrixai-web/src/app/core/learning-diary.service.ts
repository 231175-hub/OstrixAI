import { Injectable, inject, signal } from '@angular/core';
import { LocalIdentityService } from './local-identity.service';
import { StudentSettingsService } from './student-settings.service';
import {
  type EnrichmentStatus,
  type Topic,
  type StudySession,
  type EditableSession,
  type ConceptCollection,
  type EnrichedDoubtItem,
  type EnrichedEurekaItem,
  computeSimpleHash,
  migrateSessionIfNeeded,
} from './session-migration';

export type {
  EnrichmentStatus,
  Topic,
  StudySession,
  EditableSession,
  ConceptCollection,
  EnrichedDoubtItem,
  EnrichedEurekaItem,
};

export {
  computeSimpleHash,
  migrateSessionIfNeeded,
};

/**
 * All private content is AES-GCM encrypted per local student, never in plaintext IndexedDB.
 */
@Injectable({ providedIn: 'root' })
export class LearningDiaryService {
  readonly sessions = signal<readonly StudySession[]>([]);
  private readonly identity = inject(LocalIdentityService);
  private readonly settings = inject(StudentSettingsService);
  private writeTail: Promise<void> = Promise.resolve();

  async load(): Promise<void> {
    const owner = this.identity.student();
    await this.writeTail;
    if (owner !== this.identity.student()) return;
    if (!owner) {
      this.clear();
      return;
    }
    const all = await this.identity.list<any>('diary');
    const migrated = all.map(s => migrateSessionIfNeeded(s));
    if (this.identity.student() === owner) {
      this.sessions.set(this.sorted(migrated));
    }
  }

  /** Must be awaited before logout; removes decrypted notes from reactive memory. */
  async lock(): Promise<void> {
    await this.writeTail;
    this.clear();
  }

  private clear(): void {
    this.sessions.set([]);
  }

  /**
   * Crea una nueva sesión académica.
   * El modal de creación requiere ÚNICAMENTE curso y fecha (D.1).
   * El tema es opcional y se inicializa con un tema hijo por defecto editable.
   */
  async create(date: string, course: string, initialTopicName?: string): Promise<StudySession> {
    // EDU-DIARY-01: impedir que Date.parse acepte días inexistentes.
    const parsedDay = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T12:00:00Z') : null;
    if (!parsedDay || Number.isNaN(parsedDay.getTime()) || parsedDay.toISOString().slice(0, 10) !== date) {
      throw new Error('Selecciona una fecha válida.');
    }
    const name = course.trim();
    if (name.length < 2 || name.length > 80) {
      throw new Error('Curso fuera del límite permitido (2–80 caracteres).');
    }

    const firstTitle = (initialTopicName && initialTopicName.trim()) || 'Tema 1: Apuntes';
    const now = new Date().toISOString();
    const sessionId = crypto.randomUUID();

    const firstTopic: Topic = {
      id: `topic-${crypto.randomUUID()}`,
      name: firstTitle,
      order: 0,
      notes: [],
      originalNotesText: '',
      enrichedExplanation: '',
      enrichedExamples: [],
      keyIdeas: [],
      commonMistakes: [],
      enrichmentStatus: 'PENDING',
      inferenceSource: null,
      contentVersion: 1,
      enrichedVersion: 0,
      contentHash: '',
      doubts: [],
      eureka: [],
      updatedAt: now,
    };

    const session: StudySession = {
      id: sessionId,
      date,
      grade: this.settings.profile().grade ?? undefined,
      course: name,
      topics: [firstTopic],
      topic: firstTitle,
      notes: '',
      summary: '',
      summaryQuechua: '',
      doubts: [],
      eureka: [],
      review: '',
      reviewQuechua: '',
      createdAt: now,
      updatedAt: now,
    };

    await this.serial(async () => {
      await this.identity.save('diary', session.id, session);
      this.upsert(session);
    });
    return session;
  }

  async update(id: string, changes: Partial<EditableSession>, expectedUpdatedAt?: string): Promise<void> {
    await this.mutate(id, s => {
      if (expectedUpdatedAt && s.updatedAt !== expectedUpdatedAt) throw new Error('La sesión cambió. Revisa el apunte antes de guardarlo.');
      const first = s.topics[0];
      let topics = s.topics;
      if (first && changes.topic !== undefined) topics = [{ ...first, name: changes.topic }, ...topics.slice(1)];
      if (topics.length && changes.notes !== undefined && changes.notes !== s.notes) {
        // Legacy editors append to the flat notebook, while the blackboard owns separate topics.
        const target = topics.length - 1;
        const previous = topics.slice(0, target).map(t => t.originalNotesText).filter(Boolean).join('\n\n');
        const prefix = previous ? previous + '\n\n' : '';
        if (!changes.notes.startsWith(prefix)) throw new Error('Edita los apuntes de cada tema en la pizarra.');
        const notesText = changes.notes.slice(prefix.length);
        topics = topics.map((t, i) => i === target ? {
          ...t, originalNotesText: notesText, notes: notesText.split('\n'), contentVersion: t.contentVersion + 1
        } : t);
      }
      return { ...s, ...changes, topics };
    });
  }

  /**
   * Persiste la sesión completa de forma atómica (temas, dudas, eureka) al pulsar "Guardar".
   */
  async saveFullSession(
    sessionId: string,
    updates: {
      topics?: readonly Topic[];
      doubts?: readonly string[];
      eureka?: readonly string[];
      enrichedDoubts?: readonly EnrichedDoubtItem[];
      enrichedEureka?: readonly EnrichedEurekaItem[];
      updatedAt?: string;
    }
  ): Promise<StudySession> {
    return this.mutate(sessionId, s => ({
        ...s,
        topics: updates.topics ?? s.topics,
        topic: updates.topics?.[0]?.name ?? s.topic,
        notes: updates.topics?.map(t => t.originalNotesText || t.notes.join('\n')).filter(Boolean).join('\n\n') ?? s.notes,
        doubts: updates.doubts ?? s.doubts,
        eureka: updates.eureka ?? s.eureka,
        enrichedDoubts: updates.enrichedDoubts ?? s.enrichedDoubts ?? [],
        enrichedEureka: updates.enrichedEureka ?? s.enrichedEureka ?? [],
        updatedAt: updates.updatedAt ?? new Date().toISOString(),
    }));
  }

  /**
   * Añade un nuevo tema a una sesión existente (D.2 & E.4).
   */
  async addTopic(sessionId: string, topicName: string): Promise<Topic> {
    const clean = topicName.trim();
    if (!clean) throw new Error('El nombre del tema no puede estar vacío.');
    const now = new Date().toISOString();
    let createdTopic: Topic | null = null;

    await this.mutate(sessionId, s => {
      const order = s.topics.length;
      createdTopic = {
        id: `topic-${crypto.randomUUID()}`,
        name: clean,
        order,
        notes: [],
        originalNotesText: '',
        enrichedExplanation: '',
        enrichedExamples: [],
        keyIdeas: [],
        commonMistakes: [],
        enrichmentStatus: 'PENDING',
        inferenceSource: null,
        contentVersion: 1,
        enrichedVersion: 0,
        contentHash: '',
        doubts: [],
        eureka: [],
        updatedAt: now,
      };
      const updatedTopics = [...s.topics, createdTopic];
      return {
        ...s,
        topics: updatedTopics,
        updatedAt: now,
      };
    });

    if (!createdTopic) throw new Error('No se pudo añadir el tema.');
    return createdTopic;
  }

  /**
   * Actualiza los datos de un tema específico (apuntes originales, enriquecimiento, versión).
   */
  async updateTopic(sessionId: string, topicId: string, changes: Partial<Topic>): Promise<void> {
    await this.mutate(sessionId, s => {
      const updatedTopics = s.topics.map(t => {
        if (t.id !== topicId) return t;

        const newNotesText =
          changes.originalNotesText !== undefined
            ? changes.originalNotesText
            : changes.notes !== undefined
              ? changes.notes.join('\n')
              : t.originalNotesText;

        const newNotesList =
          changes.notes !== undefined
            ? changes.notes
            : changes.originalNotesText !== undefined
              ? changes.originalNotesText.split('\n').filter(Boolean)
              : t.notes;

        return {
          ...t,
          ...changes,
          notes: newNotesList,
          originalNotesText: newNotesText,
          updatedAt: new Date().toISOString(),
        };
      });

      const joinedNotes = updatedTopics
        .map(t => t.originalNotesText)
        .filter(Boolean)
        .join('\n\n');

      return {
        ...s,
        topics: updatedTopics,
        topic: updatedTopics[0]?.name || s.topic,
        notes: joinedNotes,
      };
    });
  }

  /**
   * Elimina un tema de la sesión con confirmación.
   */
  async removeTopic(sessionId: string, topicId: string): Promise<void> {
    await this.mutate(sessionId, s => {
      if (s.topics.length <= 1) {
        throw new Error('Una sesión debe conservar al menos un tema.');
      }
      const updatedTopics = s.topics
        .filter(t => t.id !== topicId)
        .map((t, idx) => ({ ...t, order: idx }));
      const joinedNotes = updatedTopics
        .map(t => t.originalNotesText)
        .filter(Boolean)
        .join('\n\n');

      return {
        ...s,
        topics: updatedTopics,
        topic: updatedTopics[0]?.name || s.topic,
        notes: joinedNotes,
      };
    });
  }

  async addConcept(id: string, collection: ConceptCollection, text: string, topicId?: string): Promise<void> {
    const value = text.trim();
    if (!value || value.length > 400) throw new Error('Concepto inválido (1–400 caracteres).');
    await this.mutate(id, s => {
      const updatedCollection = s[collection].includes(value) ? s[collection] : [...s[collection], value];
      let updatedTopics = s.topics;
      if (topicId) {
        updatedTopics = s.topics.map(t => {
          if (t.id !== topicId) return t;
          const topCol = t[collection] || [];
          return {
            ...t,
            [collection]: topCol.includes(value) ? topCol : [...topCol, value],
          };
        });
      }
      return {
        ...s,
        [collection]: updatedCollection,
        topics: updatedTopics,
        updatedAt: new Date().toISOString(),
      };
    });
  }

  async editConcept(id: string, collection: ConceptCollection, index: number, newText: string): Promise<void> {
    const value = newText.trim();
    if (!value || value.length > 400) throw new Error('Concepto inválido (1–400 caracteres).');
    await this.mutate(id, s => {
      if (!Number.isInteger(index) || index < 0 || index >= s[collection].length) {
        throw new Error('Concepto inválido.');
      }
      const oldVal = s[collection][index];
      const updated = s[collection].map((item, i) => (i === index ? value : item));
      const updatedTopics = s.topics.map(t => ({
        ...t,
        [collection]: (t[collection] || []).map(item => (item === oldVal ? value : item)),
      }));
      return {
        ...s,
        [collection]: updated,
        topics: updatedTopics,
        updatedAt: new Date().toISOString(),
      };
    });
  }

  async removeConcept(id: string, collection: ConceptCollection, index: number): Promise<void> {
    await this.mutate(id, s => {
      if (!Number.isInteger(index) || index < 0 || index >= s[collection].length) {
        throw new Error('Concepto inválido.');
      }
      // EDU-DIARY-01: evitar que una duda/Eureka eliminada quede en el tema.
      const removedText = s[collection][index];
      return {
        ...s,
        [collection]: s[collection].filter((_, i) => i !== index),
        topics: s.topics.map(t => ({ ...t, [collection]: (t[collection] || []).filter(v => v !== removedText) })),
      };
    });
  }

  async remove(id: string): Promise<void> {
    await this.serial(async () => {
      await this.identity.delete('diary', id);
      this.sessions.update(a => a.filter(s => s.id !== id));
    });
  }

  previousSessions(current: StudySession, limit = 3): readonly StudySession[] {
    return this.sessions()
      .filter(
        s =>
          s.id !== current.id &&
          s.course.toLowerCase() === current.course.toLowerCase() &&
          (s.date < current.date || (s.date === current.date && s.createdAt < current.createdAt))
      )
      .slice(0, Math.max(0, Math.min(limit, 5)));
  }

  async exportJson(): Promise<string> {
    const owner = this.identity.student();
    if (!owner) throw new Error('Debes iniciar sesión.');
    await this.load();
    if (owner !== this.identity.student()) throw new Error('La sesión cambió.');
    return JSON.stringify(
      {
        format: 'ostrixai-diary-v3',
        exportedAt: new Date().toISOString(),
        note: 'La exportación es texto sin cifrar: guardar en lugar privado.',
        sessions: this.sessions(),
      },
      null,
      2
    );
  }

  private async mutate(id: string, change: (value: StudySession) => StudySession): Promise<StudySession> {
    return this.serial(async () => {
      const snapshot = await this.identity.readVersion<StudySession>('diary', id);
      if (!snapshot) throw new Error('Sesión no encontrada.');
      const old = migrateSessionIfNeeded(snapshot.value);
      const displayed = this.sessions().find(s => s.id === id);
      if (displayed && displayed.updatedAt !== old.updatedAt) {
        throw new Error('Otra pestaña modificó la sesión. Conserva tu borrador y recarga antes de combinar cambios.');
      }
      const previous = Date.parse(old.updatedAt);
      const timestamp = Math.max(Date.now(), Number.isFinite(previous) ? previous + 1 : 0);
      const updated = { ...change(old), updatedAt: new Date(timestamp).toISOString() };
      await this.identity.save('diary', id, updated, snapshot.nonce);
      this.upsert(updated);
      return updated;
    });
  }

  private async serial<T>(op: () => Promise<T>): Promise<T> {
    const owner = this.identity.student();
    const next = this.writeTail.then(() => {
      if (!owner || owner !== this.identity.student()) throw new Error('La sesión cambió.');
      return op();
    });
    this.writeTail = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  private upsert(s: StudySession): void {
    this.sessions.update(a => this.sorted([...a.filter(x => x.id !== s.id), s]));
  }

  private sorted(a: readonly StudySession[]): StudySession[] {
    return [...a].sort(
      (x, y) =>
        y.date.localeCompare(x.date) ||
        x.course.localeCompare(y.course) ||
        x.topic.localeCompare(y.topic)
    );
  }
}
