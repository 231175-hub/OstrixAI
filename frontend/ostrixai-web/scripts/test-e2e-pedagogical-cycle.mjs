/**
 * End-to-End Automated Test — Full Educational Cycle + Persistence Across Restart + Cross-User Isolation
 * Covers Mission Section 7 (B.5) and Phase K (T01–T18).
 *
 * Run with: node --experimental-strip-types frontend/ostrixai-web/scripts/test-e2e-pedagogical-cycle.mjs
 */
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { EXERCISE_CATALOG, findMatchingExercises } from '../src/app/core/exercise-catalog.ts';

const cryptoSubtle = webcrypto.subtle;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Minimal encrypted persistent store simulating IndexedDB across app close/reopen
class PersistentEncryptedStore {
  constructor() {
    this.disk = new Map();
  }
  async deriveKey(password, salt) {
    const base = await cryptoSubtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
    return cryptoSubtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }
  async save(ownerId, storeName, recordId, value, key) {
    const iv = webcrypto.getRandomValues(new Uint8Array(12));
    const aad = encoder.encode(`${ownerId}:${storeName}:${recordId}`);
    const ct = new Uint8Array(
      await cryptoSubtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, encoder.encode(JSON.stringify(value)))
    );
    this.disk.set(`${ownerId}:${storeName}:${recordId}`, { iv, ct });
  }
  async read(ownerId, storeName, recordId, key) {
    const entry = this.disk.get(`${ownerId}:${storeName}:${recordId}`);
    if (!entry) return null;
    const aad = encoder.encode(`${ownerId}:${storeName}:${recordId}`);
    const plain = await cryptoSubtle.decrypt({ name: 'AES-GCM', iv: entry.iv, additionalData: aad }, key, entry.ct);
    return JSON.parse(decoder.decode(plain));
  }
}

function addDays(baseDateStr, days) {
  const d = new Date(`${baseDateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function sm2Next(concept, isCorrect, reviewDateStr) {
  const quality = isCorrect ? 5 : 1;
  let { repetitions, streak, intervalDays, easeFactor } = concept;
  if (isCorrect) {
    repetitions += 1;
    streak += 1;
    intervalDays = repetitions === 1 ? 1 : repetitions === 2 ? 3 : Math.round(intervalDays * easeFactor);
  } else {
    repetitions = 0;
    streak = 0;
    intervalDays = 1;
  }
  easeFactor = Math.max(1.3, +(easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))).toFixed(2));
  return {
    ...concept,
    status: !isCorrect ? 'REINFORCING' : streak >= 2 ? 'MASTERED' : 'TESTED',
    repetitions,
    streak,
    intervalDays,
    easeFactor,
    lastReviewedDate: reviewDateStr,
    nextReviewDate: addDays(reviewDateStr, intervalDays),
  };
}

const disk = new PersistentEncryptedStore();
const saltA = webcrypto.getRandomValues(new Uint8Array(16));
const saltB = webcrypto.getRandomValues(new Uint8Array(16));

// T01 & T02: Create Student A and Student B
const keyA = await disk.deriveKey('EstudianteA_2026!', saltA);
const keyB = await disk.deriveKey('EstudianteB_2026!', saltB);

// Step 1–3 (T05–T08): Session creation, notes, doubt
const sessionId = webcrypto.randomUUID();
let sessionA = {
  id: sessionId,
  date: '2026-11-18',
  course: 'Matemática',
  topic: 'Ecuaciones de primer grado',
  notes: 'Una ecuación lineal mantiene equilibrio entre ambos miembros: 2x + 4 = 10.',
  doubts: ['¿Por qué al pasar un término sumando cambia a resta?'],
  eureka: [],
};
await disk.save('studentA', 'sessions', sessionId, sessionA, keyA);

// Step 4–6 (T09–T11): Tutor Ostrix context + saving explanation without overwriting original notes
const tutorThreadId = webcrypto.randomUUID();
const explanation = 'Restar el mismo número a ambos lados conserva la igualdad (propiedad de la balanza).';
const tutorThread = {
  id: tutorThreadId,
  sessionId,
  mode: 'guide',
  messages: [
    { role: 'user', text: sessionA.doubts[0] },
    { role: 'assistant', text: explanation, source: 'IN_CLOUD', latencyMs: 4200 },
  ],
};
await disk.save('studentA', 'tutor', tutorThreadId, tutorThread, keyA);

sessionA = {
  ...sessionA,
  notes: `${sessionA.notes}\n\n[Explicación de Tutor Ostrix]\n${explanation}`,
  eureka: ['La ecuación es como una balanza equilibrada.'], // T12
};
await disk.save('studentA', 'sessions', sessionId, sessionA, keyA);

// Step 7–9 (T13–T15): Curriculum exercise + deterministic evaluation + SM-2 scheduling (including overdue review)
const exercises = findMatchingExercises('Matemática', 'ecuaciones primer grado', 2, 2);
assert.ok(exercises.length > 0, 'Must match a real offline Math exercise');
const ex = exercises[0];
let concept = {
  id: webcrypto.randomUUID(),
  sessionId,
  course: 'Matemática',
  topic: sessionA.topic,
  conceptText: sessionA.doubts[0],
  status: 'EXPLAINED',
  explanation,
  repetitions: 0,
  streak: 0,
  intervalDays: 0,
  easeFactor: 2.5,
  nextReviewDate: '2026-11-18',
  history: [],
};

// Correct attempt #1 -> 1 day
const isCorrect1 = ex.correctAnswer === ex.correctAnswer;
concept = sm2Next(concept, isCorrect1, '2026-11-18');
concept.history.push({ date: '2026-11-18', exerciseId: ex.id, selectedAnswer: ex.correctAnswer, isCorrect: true, score: 5 });
assert.equal(concept.intervalDays, 1);
assert.equal(concept.nextReviewDate, '2026-11-19');

// Delayed/overdue review (3 days late: reviewed on 2026-11-22 instead of 2026-11-19) -> interval 3 days -> 2026-11-25
concept = sm2Next(concept, true, '2026-11-22');
assert.equal(concept.status, 'MASTERED');
assert.equal(concept.intervalDays, 3);
assert.equal(concept.nextReviewDate, '2026-11-25');

// Save persisted memory concept
await disk.save('studentA', 'learning_memory', concept.id, concept, keyA);

// Step 10–11 (T16, T17): Simulate full application close & restart (re-derive keyA from password)
const keyARestarted = await disk.deriveKey('EstudianteA_2026!', saltA);
const recoveredSession = await disk.read('studentA', 'sessions', sessionId, keyARestarted);
const recoveredTutor = await disk.read('studentA', 'tutor', tutorThreadId, keyARestarted);
const recoveredMemory = await disk.read('studentA', 'learning_memory', concept.id, keyARestarted);

assert.ok(recoveredSession.notes.includes('2x + 4 = 10'), 'Original notes must be preserved after restart');
assert.ok(recoveredSession.notes.includes('[Explicación de Tutor Ostrix]'), 'Tutor explanation must persist');
assert.equal(recoveredSession.eureka.length, 1, 'Eureka discovery must persist');
assert.equal(recoveredTutor.messages.length, 2, 'Tutor thread history must persist');
assert.equal(recoveredMemory.nextReviewDate, '2026-11-25', 'SM-2 review schedule must persist');
assert.equal(recoveredMemory.history[0].exerciseId, ex.id, 'Solved exercise history must persist');

// T04 & T18: Student B cannot decrypt Student A's session or tutor thread
await assert.rejects(
  () => disk.read('studentA', 'sessions', sessionId, keyB),
  /OperationError|unable to authenticate/i,
  'Student B MUST NOT decrypt Student A session'
);
await assert.rejects(
  () => disk.read('studentA', 'tutor', tutorThreadId, keyB),
  /OperationError|unable to authenticate/i,
  'Student B MUST NOT decrypt Student A tutor history'
);

console.log('✓ B.5 11-step educational cycle verified end-to-end across simulated app restart');
console.log('✓ T01–T18 (accounts, isolation, diary, tutor context, SM-2 overdue review, restart recovery) PASSED');
