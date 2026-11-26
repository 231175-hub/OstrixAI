/**
 * Core Session and Topic Data Model & Transparent Idempotent Migration
 * OstrixAi — BuildHybridAI 2026
 *
 * Fully decoupled from Angular decorators to allow clean execution in both
 * Angular runtime and standalone test suites (Node.js).
 */
import type { Grade } from './student-settings.service';

export type EnrichmentStatus =
  | 'SIN_CONTENIDO'
  | 'PENDIENTE'
  | 'PREPARANDO_MODELO'
  | 'GENERANDO'
  | 'GENERATING'
  | 'PARCIAL'
  | 'ACTUALIZADO'
  | 'DESACTUALIZADO'
  | 'NO_DISPONIBLE'
  | 'ERROR'
  | 'CANCELADO'
  | 'UP_TO_DATE'
  | 'OUTDATED'
  | 'PENDING';

export interface EnrichedDoubtItem {
  readonly doubtText: string;
  readonly topicId?: string;
  readonly explanation: string;
  readonly example?: string;
  readonly status: EnrichmentStatus;
  readonly inferenceSource?: 'ON_DEVICE' | 'IN_CLOUD' | 'OFFLINE_ESSENTIAL' | 'ESSENTIAL' | null;
  readonly updatedAt?: string;
}

export interface EnrichedEurekaItem {
  readonly eurekaText: string;
  readonly topicId?: string;
  readonly expansion: string;
  readonly application?: string;
  readonly practicalApplication?: string;
  readonly status: EnrichmentStatus;
  readonly inferenceSource?: 'ON_DEVICE' | 'IN_CLOUD' | 'OFFLINE_ESSENTIAL' | 'ESSENTIAL' | null;
  readonly updatedAt?: string;
}

export interface Topic {
  readonly id: string;
  readonly name: string;
  readonly order: number;
  readonly notes: readonly string[];
  readonly originalNotesText: string;
  readonly enrichedExplanation: string;
  readonly enrichedExamples: readonly string[];
  readonly keyIdeas: readonly string[];
  readonly commonMistakes: readonly string[];
  readonly enrichmentStatus: EnrichmentStatus;
  readonly inferenceSource?: 'ON_DEVICE' | 'IN_CLOUD' | 'OFFLINE_ESSENTIAL' | 'ESSENTIAL' | null;
  readonly contentVersion: number;
  readonly enrichedVersion: number;
  readonly contentHash: string;
  readonly doubts: readonly string[];
  readonly eureka: readonly string[];
  readonly updatedAt: string;
}

export interface StudySession {
  readonly id: string;
  readonly date: string;
  readonly grade?: Grade;
  readonly course: string;
  readonly topics: readonly Topic[];
  readonly topic: string;
  readonly notes: string;
  readonly summary: string;
  readonly summarySource?: 'ON_DEVICE' | 'IN_CLOUD' | 'OFFLINE_ESSENTIAL';
  readonly summaryQuechua?: string;
  readonly doubts: readonly string[];
  readonly eureka: readonly string[];
  readonly enrichedDoubts?: readonly EnrichedDoubtItem[];
  readonly enrichedEureka?: readonly EnrichedEurekaItem[];
  readonly review: string;
  readonly reviewQuechua?: string;
  readonly coverId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type EditableSession = Pick<
  StudySession,
  'topic' | 'course' | 'date' | 'notes' | 'summary' | 'summarySource' | 'review' | 'summaryQuechua' | 'reviewQuechua' | 'coverId'
>;
export type ConceptCollection = 'doubts' | 'eureka';

export function computeSimpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}

/**
 * Migra de manera transparente e idempotente sesiones antiguas con tema plano
 * hacia la nueva arquitectura jerárquica con colección de temas individuales.
 */
export function migrateSessionIfNeeded(raw: any): StudySession {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Estructura de sesión inválida.');
  }

  const existingTopics: Topic[] =
    Array.isArray(raw.topics) && raw.topics.length > 0
      ? raw.topics.map((t: any, index: number) => ({
          id: t.id || `topic-${raw.id}-${index}`,
          name: t.name || `Tema ${index + 1}`,
          order: typeof t.order === 'number' ? t.order : index,
          notes: Array.isArray(t.notes)
            ? t.notes
            : typeof t.notes === 'string'
              ? t.notes.split('\n').filter(Boolean)
              : typeof t.originalNotesText === 'string'
                ? t.originalNotesText.split('\n').filter(Boolean)
                : [],
          originalNotesText:
            typeof t.originalNotesText === 'string'
              ? t.originalNotesText
              : Array.isArray(t.notes)
                ? t.notes.join('\n')
                : typeof t.notes === 'string'
                  ? t.notes
                  : '',
          enrichedExplanation: t.enrichedExplanation || t.summary || '',
          enrichedExamples: Array.isArray(t.enrichedExamples) ? t.enrichedExamples : [],
          keyIdeas: Array.isArray(t.keyIdeas) ? t.keyIdeas : [],
          commonMistakes: Array.isArray(t.commonMistakes) ? t.commonMistakes : [],
          enrichmentStatus: (t.enrichmentStatus as EnrichmentStatus) || (t.enrichedExplanation ? 'UP_TO_DATE' : 'PENDING'),
          inferenceSource: t.inferenceSource || null,
          contentVersion: typeof t.contentVersion === 'number' ? t.contentVersion : 1,
          enrichedVersion: typeof t.enrichedVersion === 'number' ? t.enrichedVersion : 1,
          contentHash: t.contentHash || computeSimpleHash(t.originalNotesText || ''),
          doubts: Array.isArray(t.doubts) ? t.doubts : [],
          eureka: Array.isArray(t.eureka) ? t.eureka : [],
          updatedAt: t.updatedAt || raw.updatedAt || raw.createdAt || new Date().toISOString(),
        }))
      : [
          {
            id: `topic-${raw.id}-0`,
            name: raw.topic || 'Tema 1: General',
            order: 0,
            notes: typeof raw.notes === 'string' ? raw.notes.split('\n').filter(Boolean) : [],
            originalNotesText: typeof raw.notes === 'string' ? raw.notes : '',
            enrichedExplanation: raw.summary || '',
            enrichedExamples: [],
            keyIdeas: [],
            commonMistakes: [],
            enrichmentStatus: raw.summary ? 'UP_TO_DATE' : 'PENDING',
            inferenceSource: null,
            contentVersion: 1,
            enrichedVersion: raw.summary ? 1 : 0,
            contentHash: computeSimpleHash(raw.notes || ''),
            doubts: Array.isArray(raw.doubts) ? raw.doubts : [],
            eureka: Array.isArray(raw.eureka) ? raw.eureka : [],
            updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString(),
          },
        ];

  if (existingTopics.length && typeof raw.notes === 'string' && raw.notes.trim() &&
      existingTopics.every(t => !t.originalNotesText && !t.notes.length)) {
    existingTopics[0] = { ...existingTopics[0], originalNotesText: raw.notes, notes: raw.notes.split('\n') };
  }

  const primaryTopicName = existingTopics[0]?.name || raw.topic || raw.course || 'Tema 1';
  const joinedNotes = existingTopics
    .map(t => t.originalNotesText || t.notes.join('\n'))
    .filter(Boolean)
    .join('\n\n');

  return {
    id: raw.id,
    date: raw.date,
    ...([1, 2, 3, 4, 5].includes(raw.grade) ? { grade: raw.grade } : {}),
    course: raw.course,
    // topics: Array.isArray(legacy.topics) ? legacy.topics : existingTopics
    topics: existingTopics,
    topic: primaryTopicName,
    notes: joinedNotes,
    summary: raw.summary || existingTopics[0]?.enrichedExplanation || '',
    summarySource: ['ON_DEVICE', 'IN_CLOUD', 'OFFLINE_ESSENTIAL'].includes(raw.summarySource) ? raw.summarySource : undefined,
    summaryQuechua: raw.summaryQuechua,
    doubts: Array.isArray(raw.doubts) ? raw.doubts : [],
    eureka: Array.isArray(raw.eureka) ? raw.eureka : [],
    enrichedDoubts: Array.isArray(raw.enrichedDoubts) ? raw.enrichedDoubts : [],
    enrichedEureka: Array.isArray(raw.enrichedEureka) ? raw.enrichedEureka : [],
    review: raw.review || '',
    reviewQuechua: raw.reviewQuechua,
    coverId: raw.coverId,
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}
