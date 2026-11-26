import type { StudySession } from './session-migration';
import type { ReviewCard } from './review-scheduler.service';
import type { ConceptMemory } from './learning-memory.service';
import type { PracticeAttempt, PracticeQuestion } from './practice-exam.service';

export interface LearningStep {
  sessionId: string;
  focus: string;
  reason: 'due' | 'missedDoubt' | 'doubt' | 'repeated';
  date: string;
  question?: PracticeQuestion;
}

export function localStudyDay(date = new Date()): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const key = (id: string, text: string) => JSON.stringify([id, normalize(text)]);
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Due first (oldest deadline), then exact missed doubts, journal doubts and repeated misses (newest evidence). */
export function nextLearningStep(sessions: readonly StudySession[], concepts: readonly ConceptMemory[],
  cards: readonly ReviewCard[], attempts: readonly PracticeAttempt[], today: string): LearningStep | null {
  const candidates: LearningStep[] = [];
  const completed = new Set<string>();
  const answers = new Map<string, { sessionId: string; focus: string; date: string; misses: number; question: PracticeQuestion }>();
  for (const a of [...attempts].sort((x, y) => compare(x.completedAt, y.completedAt) || compare(x.id, y.id))) {
    for (const q of a.questions) {
      const choice = a.userAnswers[q.id];
      if (!Number.isInteger(choice) || choice < 0 || choice >= q.options.length) continue;
      const focus = a.practiceFocus ?? q.questionText;
      const id = key(a.sessionId, focus);
      const date = localStudyDay(new Date(a.completedAt));
      if (a.practiceFocus && date === today) completed.add(id);
      const misses = choice === q.correctAnswerIndex ? 0 : (answers.get(id)?.misses ?? 0) + 1;
      answers.set(id, { sessionId: a.sessionId, focus, date, misses, question: q });
    }
  }
  for (const session of sessions) {
    const add = (focus: string, reason: LearningStep['reason'], date: string) => {
      const id = key(session.id, focus);
      if (focus.trim() && !completed.has(id)) candidates.push({
        sessionId: session.id, focus, reason, date, question: answers.get(id)?.question,
      });
    };
    const memory = concepts.filter(c => c.sessionId === session.id);
    const sessionCards = cards.filter(c => c.sourceSessionId === session.id);
    const deferredByStudent = (text: string) => sessionCards.some(c => c.attempts > 0 &&
      c.dueDate > today && normalize(c.concept) === normalize(text));
    for (const card of sessionCards) {
      const graded = memory.find(c => normalize(c.conceptText) === normalize(card.concept));
      if (card.dueDate <= today && !(graded?.lastReviewedDate && graded.lastReviewedDate >= card.dueDate &&
          graded.nextReviewDate > today)) add(card.concept, 'due', card.dueDate);
    }
    for (const c of memory) {
      // New doubts receive today's default SM-2 date before their first assessment.
      if (c.lastReviewedDate && c.history.length && c.nextReviewDate <= today && !deferredByStudent(c.conceptText)) {
        add(c.conceptText, 'due', c.nextReviewDate);
      }
    }
    for (const doubt of session.doubts) {
      const c = memory.find(item => normalize(item.conceptText) === normalize(doubt));
      if (deferredByStudent(doubt) || c && (c.status === 'MASTERED' || c.status === 'TESTED' || c.nextReviewDate > today)) continue;
      const evidence = answers.get(key(session.id, doubt));
      if (evidence?.misses) add(doubt, 'missedDoubt', evidence.date);
      else add(doubt, 'doubt', session.date);
    }
    for (const evidence of answers.values()) {
      if (evidence.sessionId === session.id && evidence.misses >= 2 && !deferredByStudent(evidence.focus) &&
          !memory.some(c => normalize(c.conceptText) === normalize(evidence.focus) && c.nextReviewDate > today)) {
        add(evidence.focus, 'repeated', evidence.date);
      }
    }
  }
  const order = { due: 0, missedDoubt: 1, doubt: 2, repeated: 3 };
  candidates.sort((a, b) => order[a.reason] - order[b.reason] ||
    (a.reason === 'due' ? compare(a.date, b.date) : compare(b.date, a.date)) ||
    compare(key(a.sessionId, a.focus), key(b.sessionId, b.focus)));
  return candidates[0] ?? null;
}
