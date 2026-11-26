import { nextLearningStep } from './learning-recommendation';
import { migrateSessionIfNeeded } from './session-migration';
import type { PracticeAttempt, PracticeQuestion } from './practice-exam.service';
import type { ReviewCard } from './review-scheduler.service';

describe('Deterministic next learning step', () => {
  const today = '2026-11-23';
  const a = migrateSessionIfNeeded({ id: 'alpha', course: 'Matemática', date: today,
    topic: 'Fracciones', notes: 'Se cuentan partes iguales.', doubts: ['¿Qué significa el denominador?'] });
  const b = { ...a, id: 'beta', doubts: ['¿Cómo se suman dos fracciones?'] };
  const card = (id: string, sessionId: string, dueDate: string): ReviewCard => ({
    id, sourceSessionId: sessionId, course: a.course, concept: id, dueDate, attempts: 0, streak: 0, lastRating: null,
  });
  const q: PracticeQuestion = { id: 'q', questionText: b.doubts[0], type: 'TRUE_FALSE', options: ['Sí','No'],
    correctAnswerIndex: 1, explanation: 'Justificación', difficulty: 'BASIC' };
  const attempt = (id: string, answer: number, text = q.questionText): PracticeAttempt => ({
    id, examId: id, sessionId: b.id, course: b.course, sessionTitle: b.topic,
    completedAt: '2026-11-22T12:00:00Z', totalQuestions: 1, correctCount: answer, incorrectCount: 1-answer,
    unansweredCount: 0, scorePercentage: 100*answer, timeSpentSeconds: 4, userAnswers: { q: answer },
    questions: [{ ...q, questionText: text }],
  });
  it('chooses the oldest due date, then a stable session tie breaker, ignoring orphan records', () => {
    const cards = [card('x','alpha',today), card('y','beta',today), card('z','beta','2026-11-01'),card('orphan','other','2024-01-01')];
    expect(nextLearningStep([a,b],[],cards,[],today)?.focus).toBe('z');
    expect(nextLearningStep([b,a],[],cards.slice(0,2).reverse(),[],today)?.sessionId).toBe(a.id);
    expect(nextLearningStep([],[],cards,[attempt('1',0)],today)).toBeNull();
  });
  it('ranks an exact missed doubt over a recent note and distinguishes repeated errors from one miss or an omission', () => {
    expect(nextLearningStep([a,b],[],[],[attempt('1',0)],today)?.reason).toBe('missedDoubt');
    expect(nextLearningStep([a],[],[],[attempt('1',0)],today)?.reason).toBe('doubt');
    expect(nextLearningStep([{ ...a, notes: '', topics: [] }],[],[],[],today)?.focus).toBe(a.doubts[0]);
    const noDoubts = { ...b, doubts: [] };
    expect(nextLearningStep([noDoubts],[],[],[attempt('1',0)],today)).toBeNull();
    expect(nextLearningStep([noDoubts],[],[],[attempt('1',0),attempt('2',0)],today)?.reason).toBe('repeated');
    expect(nextLearningStep([noDoubts],[],[],[attempt('1',0),attempt('2',0),attempt('3',1)],today)).toBeNull();
    expect(nextLearningStep([noDoubts],[],[],[attempt('1',0),{...attempt('2',0),userAnswers:{}}],today)).toBeNull();
  });
  it('respects rescheduled self-assessment and leaves the underlying journal intact', () => {
    const deferred = { ...card(a.doubts[0], a.id, '2026-11-24'), attempts: 1 };
    expect(nextLearningStep([a],[],[deferred],[],today)).toBeNull();
    expect(a.doubts.length).toBe(1);
  });
});
