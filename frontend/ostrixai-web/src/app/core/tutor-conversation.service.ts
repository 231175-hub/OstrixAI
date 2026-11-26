import { Injectable, inject, signal } from '@angular/core';
import { LocalIdentityService } from './local-identity.service';
import type { InferenceSource } from './sync.service';

export type TutorMode = 'explain' | 'guide' | 'practice' | 'explore';
export type TutorRole = 'user' | 'assistant';

export interface TutorMessage {
  readonly id: string;
  readonly role: TutorRole;
  readonly text: string;
  readonly createdAt: string;
  readonly source?: InferenceSource;
  readonly latencyMs?: number;
  readonly timeToFirstChunkMs?: number;
  readonly friendlyDuration?: string;
  readonly originalLanguage?: string;
  readonly translatedText?: string;
  readonly translatedLang?: string;
  readonly limited?: boolean;
}

export interface TutorThread {
  readonly id: string;
  readonly title: string;
  readonly sessionId: string | null;
  readonly mode: TutorMode;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly messages: readonly TutorMessage[];
}

/**
 * Private chat history per local account. Uses the same authenticated (unlocked)
 * AES-GCM store as the diary. No history is sent to AWS in this milestone.
 */
@Injectable({ providedIn: 'root' })
export class TutorConversationService {
  private readonly identity = inject(LocalIdentityService);
  readonly threads = signal<readonly TutorThread[]>([]);
  private writeTail: Promise<void> = Promise.resolve();

  async load(): Promise<void> {
    await this.writeTail;
    const owner = this.identity.student()?.id;
    if (!owner) { this.clear(); return; }
    const stored = await this.identity.list<TutorThread>('tutor');
    if (this.identity.student()?.id === owner) {
      this.threads.set(this.order(stored));
    }
  }

  async lock(): Promise<void> {
    await this.writeTail;
    this.clear();
  }

  clear(): void { this.threads.set([]); }

  get(id: string | null): TutorThread | undefined {
    return this.threads().find(thread => thread.id === id);
  }

  async create(sessionId: string | null, mode: TutorMode, title: string): Promise<TutorThread> {
    const now = new Date().toISOString();
    const thread: TutorThread = {
      id: crypto.randomUUID(), title: title.trim().slice(0, 90) || 'Nueva conversación',
      sessionId, mode, createdAt: now, updatedAt: now, messages: [],
    };
    await this.queue(async assertOwner => {
      await this.identity.save('tutor', thread.id, thread);
      assertOwner();
      this.upsert(thread);
    });
    return thread;
  }

  async appendUser(id: string, text: string): Promise<TutorMessage> {
    const value = text.trim();
    if (!value || value.length > 4000) throw new Error('Escribe una pregunta de 1 a 4000 caracteres.');
    const message: TutorMessage = { id: crypto.randomUUID(), role: 'user', text: value, createdAt: new Date().toISOString() };
    await this.mutate(id, thread => ({ ...thread, messages: [...thread.messages, message] }));
    return message;
  }

  async appendAssistant(id: string, content: {
    text: string; source: InferenceSource; latencyMs: number; limited: boolean; timeToFirstChunkMs?: number; friendlyDuration?: string; originalLanguage?: string;
  }): Promise<TutorMessage> {
    const text = content.text.trim();
    if (!text || text.length > 20000) throw new Error('La respuesta recibida no tiene un formato válido.');
    const message: TutorMessage = {
      id: crypto.randomUUID(), role: 'assistant', text, source: content.source,
      latencyMs: content.latencyMs, timeToFirstChunkMs: content.timeToFirstChunkMs,
      friendlyDuration: content.friendlyDuration, originalLanguage: content.originalLanguage,
      limited: content.limited, createdAt: new Date().toISOString(),
    };
    await this.mutate(id, thread => ({ ...thread, messages: [...thread.messages, message] }));
    return message;
  }

  async storeTranslation(threadId: string, messageId: string, text: string, translatedLang = 'qu'): Promise<void> {
    if (!text.trim() || text.length > 20000) throw new Error('Traducción inválida.');
    await this.mutate(threadId, thread => {
      if (!thread.messages.some(m => m.id === messageId && m.role === 'assistant')) {
        throw new Error('Respuesta no encontrada.');
      }
      return { ...thread, messages: thread.messages.map(m =>
        m.id === messageId ? { ...m, translatedText: text, translatedLang } : m) };
    });
  }

  async remove(id: string): Promise<void> {
    await this.queue(async assertOwner => {
      await this.identity.delete('tutor', id);
      assertOwner();
      this.threads.update(items => items.filter(item => item.id !== id));
    });
  }

  private async mutate(id: string, change: (thread: TutorThread) => TutorThread): Promise<void> {
    await this.queue(async assertOwner => {
      const existing = await this.identity.read<TutorThread>('tutor', id);
      assertOwner();
      if (!existing) throw new Error('Conversación no encontrada.');
      const changed = { ...change(existing), updatedAt: new Date().toISOString() };
      await this.identity.save('tutor', id, changed);
      assertOwner();
      this.upsert(changed);
    });
  }

  private queue<T>(operation: (assertOwner: () => void) => Promise<T>): Promise<T> {
    const owner = this.identity.student()?.id;
    const assertOwner = () => {
      if (!owner || this.identity.student()?.id !== owner) throw new DOMException('Sesión cerrada.', 'AbortError');
    };
    const next = this.writeTail.then(() => {
      assertOwner();
      return operation(assertOwner);
    });
    this.writeTail = next.then(() => undefined, () => undefined);
    return next;
  }

  private upsert(thread: TutorThread): void {
    this.threads.update(items => this.order([...items.filter(t => t.id !== thread.id), thread]));
  }

  private order(items: readonly TutorThread[]): TutorThread[] {
    return [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}
