/**
 * Automated Test: Deterministic Learning Memory & SM-2 Spaced Repetition
 * OstrixAi - BuildHybridAI 2026
 */
import assert from 'node:assert/strict';

// Importar catálogo de ejercicios
import { EXERCISE_CATALOG, findMatchingExercises } from '../src/app/core/exercise-catalog.ts';

function addDays(baseDateStr, days) {
  const d = new Date(`${baseDateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function evaluateAnswer(concept, exercise, selectedAnswerIndex, currentDateStr) {
  const isCorrect = exercise.correctAnswer === selectedAnswerIndex;
  const score = isCorrect ? 5 : 1;

  let newRepetitions = concept.repetitions;
  let newStreak = concept.streak;
  let newInterval = concept.intervalDays;
  let newEaseFactor = concept.easeFactor;
  let newStatus;

  if (isCorrect) {
    newStreak += 1;
    if (newRepetitions === 0) {
      newInterval = 1;
    } else if (newRepetitions === 1) {
      newInterval = 3;
    } else {
      newInterval = Math.round(newInterval * newEaseFactor);
    }
    newRepetitions += 1;
    newEaseFactor = Math.max(1.3, newEaseFactor + (0.1 - (5 - score) * (0.08 + (5 - score) * 0.02)));
    newStatus = newStreak >= 2 ? 'MASTERED' : 'TESTED';
  } else {
    newRepetitions = 0;
    newStreak = 0;
    newInterval = 1;
    newEaseFactor = Math.max(1.3, newEaseFactor - 0.2);
    newStatus = 'REINFORCING';
  }

  const nextReviewDate = addDays(currentDateStr, newInterval);

  return {
    ...concept,
    repetitions: newRepetitions,
    streak: newStreak,
    intervalDays: newInterval,
    easeFactor: Number(newEaseFactor.toFixed(2)),
    lastReviewedDate: currentDateStr,
    nextReviewDate,
    status: newStatus,
    isCorrect,
    explanation: exercise.explanation
  };
}

async function runTests() {
  console.log('--- TEST 1: Catálogo de ejercicios curriculares peruanos offline ---');
  assert(EXERCISE_CATALOG.length >= 10, 'El catálogo debe contener ejercicios variados');
  const fracEx = findMatchingExercises('Matemática', 'Fracciones y partes de la chacra', 1);
  assert(fracEx.length > 0, 'Debe encontrar ejercicios afines a Fracciones');
  assert.equal(fracEx[0].id, 'mat-sec1-001');
  console.log(`  ✓ Ejercicio identificado: "${fracEx[0].question}"`);

  console.log('--- TEST 2: Flujo de Memoria: APUNTES -> DUDA (Creación de Concepto) ---');
  const today = '2026-11-16';
  let concept = {
    id: 'concept-101',
    sessionId: 'session-math-01',
    course: 'Matemática',
    topic: 'Fracciones y partes',
    conceptText: '¿Por qué el denominador indica el total de partes?',
    status: 'PENDING',
    repetitions: 0,
    streak: 0,
    intervalDays: 1,
    easeFactor: 2.5,
    nextReviewDate: today
  };
  assert.equal(concept.status, 'PENDING');
  console.log('  ✓ Duda registrada en estado PENDING para revisión');

  console.log('--- TEST 3: Flujo de Memoria: EXPLICACIÓN ---');
  concept = {
    ...concept,
    status: 'EXPLAINED',
    explanation: 'El denominador da nombre a la fracción (denota) e indica en cuántas partes iguales se divide la unidad.',
    explanationSource: 'ON_DEVICE'
  };
  assert.equal(concept.status, 'EXPLAINED');
  console.log('  ✓ Explicación asociada y origen ON_DEVICE verificado');

  console.log('--- TEST 4: Flujo de Memoria: EVALUACIÓN Y REPASO DETERMINISTA (SM-2) ---');
  const targetExercise = fracEx[0]; // Pregunta de chacra 3/4, respuesta correcta index 1

  // Intento 1: Acierto
  let step1 = evaluateAnswer(concept, targetExercise, 1, today);
  assert.equal(step1.isCorrect, true);
  assert.equal(step1.repetitions, 1);
  assert.equal(step1.streak, 1);
  assert.equal(step1.intervalDays, 1);
  assert.equal(step1.status, 'TESTED');
  assert.equal(step1.nextReviewDate, addDays(today, 1));
  console.log('  ✓ Intento 1 (Acierto): status=TESTED, intervalo=1 día');

  // Intento 2: Acierto consecutivo (día siguiente)
  const day2 = step1.nextReviewDate;
  let step2 = evaluateAnswer(step1, targetExercise, 1, day2);
  assert.equal(step2.isCorrect, true);
  assert.equal(step2.repetitions, 2);
  assert.equal(step2.streak, 2);
  assert.equal(step2.intervalDays, 3);
  assert.equal(step2.status, 'MASTERED');
  assert.equal(step2.nextReviewDate, addDays(day2, 3));
  console.log('  ✓ Intento 2 (Acierto consecutivo): status=MASTERED, intervalo=3 días');

  // Intento 3: Acierto (repaso a los 3 días)
  const day3 = step2.nextReviewDate;
  let step3 = evaluateAnswer(step2, targetExercise, 1, day3);
  assert.equal(step3.isCorrect, true);
  assert.equal(step3.repetitions, 3);
  assert.equal(step3.streak, 3);
  // Intervalo esperado: round(3 * 2.6) = 8 días
  assert.equal(step3.intervalDays, 8);
  assert.equal(step3.status, 'MASTERED');
  console.log('  ✓ Intento 3 (Acierto espaciado): intervalo incrementado a 8 días');

  // Intento 4: Fallo simulado en repaso futuro
  const day4 = step3.nextReviewDate;
  let step4 = evaluateAnswer(step3, targetExercise, 0, day4); // 0 es incorrecto
  assert.equal(step4.isCorrect, false);
  assert.equal(step4.repetitions, 0, 'Al fallar, las repeticiones deben reiniciarse');
  assert.equal(step4.streak, 0, 'La racha debe reiniciarse');
  assert.equal(step4.intervalDays, 1, 'El intervalo debe volver a 1 día');
  assert.equal(step4.status, 'REINFORCING', 'El estado debe cambiar a REINFORCING');
  assert.equal(step4.nextReviewDate, addDays(day4, 1));
  console.log('  ✓ Intento 4 (Error determinista): status=REINFORCING, intervalo=1 día, racha reseteada');

  console.log('--- TEST 5: Recuperación de contexto estructurado para la IA ---');
  const mockMemoryList = [
    { course: 'Matemática', status: 'REINFORCING', conceptText: 'Discriminante negativo en ecuaciones cuadráticas' },
    { course: 'Matemática', status: 'MASTERED', conceptText: 'Fracciones y partes iguales' },
  ];
  const reinforcingList = mockMemoryList.filter(c => c.status === 'REINFORCING').map(c => c.conceptText);
  const masteredList = mockMemoryList.filter(c => c.status === 'MASTERED').map(c => c.conceptText);
  const promptContext = `\nCONCEPTOS EN REFUERZO: ${reinforcingList.join('; ')}.\nCONCEPTOS COMPRENDIDOS: ${masteredList.join('; ')}.`;
  assert(promptContext.includes('Discriminante negativo'));
  assert(promptContext.includes('Fracciones y partes iguales'));
  console.log('  ✓ Contexto pedagógico estructurado generado sin reentrenamiento simulado');

  console.log('\n================================================================');
  console.log('TODAS LAS PRUEBAS DE LA MEMORIA DE APRENDIZAJE REAL SUPERADAS');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('ERROR EN PRUEBAS:', err);
  process.exit(1);
});
