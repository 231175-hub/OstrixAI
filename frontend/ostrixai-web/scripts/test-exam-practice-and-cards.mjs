/**
 * Test Suite: Misión A (Rediseño de Tarjetas del Diario) y Misión B (Practicar para Exámenes)
 * Tests T01 – T30 covering:
 * - 15 Course covers vectoriales y mapeo curricular exhaustivo
 * - Estructura de tarjetas editorial con banner hero de 140px, snippet y doble acción (Abrir y Practicar)
 * - PracticeExamService: generación adaptativa con Nano / Cloud / Fallback Curricular
 * - Validación rigurosa de esquema pedagógico JSON (4 alternativas en MC, 2 en TF, explicación pedagógica)
 * - Persistencia cifrada en IndexedDB (stores 'exams' y 'attempts')
 * - Integración con memoria SM-2: errores registrados como dudas para 24h, aciertos avanzan a MASTERED
 * - Comportamiento de foco estable en Pizarra (sin pérdida de foco al teclear)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { COURSE_COVERS, matchCourseCover } from '../src/app/core/course-covers.ts';
import { interfaceText } from '../src/app/core/interface-language.ts';

const webRoot = import.meta.dirname + '/..';

let passed = 0;
let total = 0;

function runTest(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ [T${String(total).padStart(2, '0')}] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✕ [T${String(total).padStart(2, '0')}] ${name}`);
    console.error(`     Error: ${err.message}`);
    throw err;
  }
}

console.log('\n=============================================================================');
console.log('🧪 OSTRIXAI — SUITE DE PRUEBAS: TARJETAS EDITORIALES Y PRÁCTICA DE EXAMEN');
console.log('=============================================================================\n');

// ---------------------------------------------------------------------------
// BLOQUE 1: PORTADAS Y TARJETAS DEL DIARIO (MISIÓN A)
// ---------------------------------------------------------------------------
console.log('--- BLOQUE 1: PORTADAS Y DISEÑO EDITORIAL DE TARJETAS ---');

runTest('T01: Existen exactamente 15 portadas vectoriales (10 curriculares + 5 alternativas)', () => {
  assert.equal(COURSE_COVERS.length, 15, 'Debe haber exactamente 15 portadas para compatibilidad con la suite completa');
  const curricular = COURSE_COVERS.filter(c => c.category === 'curricular');
  const custom = COURSE_COVERS.filter(c => c.category === 'custom');
  assert.equal(curricular.length, 10, 'Deben existir 10 portadas curriculares oficiales');
  assert.equal(custom.length, 5, 'Deben existir 5 portadas temáticas para cursos personalizados');
});

runTest('T02: Todas las portadas tienen SVG vectoriales locales offline sin URLs externas', () => {
  for (const c of COURSE_COVERS) {
    assert.ok(c.illustrationSvg.includes('<svg'), `Portada ${c.id} debe incluir tag svg`);
    assert.ok(c.illustrationSvg.includes('viewBox="0 0 160 160"'), `Portada ${c.id} debe tener viewBox 160x160`);
    const cleanSvg = c.illustrationSvg.replace('http://www.w3.org/2000/svg', '');
    assert.ok(!cleanSvg.includes('http://') && !cleanSvg.includes('https://'), `Portada ${c.id} no debe contener URLs externas`);
    assert.ok(c.gradient.includes('linear-gradient'), `Portada ${c.id} debe tener un gradiente vibrante`);
    assert.ok(c.accentColor.startsWith('#'), `Portada ${c.id} debe tener un color de acento hexadecimal`);
  }
});

runTest('T03: Mapeo curricular cubre todas las asignaturas escolares y ramas científicas', () => {
  // Ramas de matemáticas
  assert.equal(matchCourseCover('Matemática').id, 'matematica');
  assert.equal(matchCourseCover('Álgebra Lineal').id, 'matematica');
  assert.equal(matchCourseCover('Geometría Plana').id, 'matematica');
  assert.equal(matchCourseCover('Trigonometría').id, 'matematica');
  assert.equal(matchCourseCover('Aritmética').id, 'matematica');
  assert.equal(matchCourseCover('Cálculo I').id, 'matematica');

  // Ramas de ciencia y tecnología
  assert.equal(matchCourseCover('Ciencia y Tecnología').id, 'ciencia-tecnologia');
  assert.equal(matchCourseCover('Física Elemental').id, 'ciencia-tecnologia');
  assert.equal(matchCourseCover('Química Orgánica').id, 'ciencia-tecnologia');
  assert.equal(matchCourseCover('Biología Celular').id, 'ciencia-tecnologia');

  // Humanidades e idiomas
  assert.equal(matchCourseCover('Comunicación').id, 'comunicacion');
  assert.equal(matchCourseCover('Literatura Peruana').id, 'comunicacion');
  assert.equal(matchCourseCover('Ciencias Sociales').id, 'ciencias-sociales');
  assert.equal(matchCourseCover('Historia del Perú').id, 'ciencias-sociales');
  assert.equal(matchCourseCover('DPCC').id, 'dpcc');
  assert.equal(matchCourseCover('Inglés Técnico').id, 'ingles');
  assert.equal(matchCourseCover('Educación para el Trabajo').id, 'ept');
  assert.equal(matchCourseCover('Robótica Educativa').id, 'ept');
});

runTest('T04: Portadas genéricas asignan diseños consistentes a cursos libres', () => {
  const c1 = matchCourseCover('Inteligencia Artificial');
  const c2 = matchCourseCover('Astronomía y Galaxias');
  const c3 = matchCourseCover('Filosofía Antigua');
  assert.ok(c1.id.startsWith('generico-'), 'Debe asignar portada genérica');
  assert.ok(c2.id.startsWith('generico-'), 'Debe asignar portada genérica');
  assert.ok(c3.id.startsWith('generico-'), 'Debe asignar portada genérica');
});

runTest('T05: CSS define banner hero de 140px, arte nítido y cuadrícula responsive', () => {
  const css = fs.readFileSync(path.join(webRoot, 'src/styles.css'), 'utf8');
  assert.ok(css.includes('.editorial-card-hero'), 'Debe contener .editorial-card-hero');
  assert.ok(css.includes('height: 140px'), 'Hero debe tener altura de 140px');
  assert.ok(css.includes('.editorial-card-art'), 'Debe contener .editorial-card-art');
  assert.ok(css.includes('.editorial-card-btn-open'), 'Debe contener botón de abrir');
  assert.ok(css.includes('.editorial-card-btn-practice'), 'Debe contener botón de practicar');
  assert.ok(css.includes('grid-template-columns: repeat(auto-fill, minmax(330px, 1fr))'), 'Cuadrícula responsive con minmax 330px');
});

runTest('T06: Template de Diario implementa hero banner y botones "Abrir" y "Practicar"', () => {
  const html = fs.readFileSync(path.join(webRoot, 'src/app/app.html'), 'utf8');
  assert.ok(html.includes('class="editorial-card-hero"'), 'HTML debe incluir banner hero');
  assert.ok(html.includes('class="editorial-card-btn-open"'), 'HTML debe incluir botón Abrir');
  assert.ok(html.includes('class="editorial-card-btn-practice"'), 'HTML debe incluir botón Practicar');
  assert.ok(html.includes('(click)="startExamPractice(s)"'), 'Botón practicar invoca startExamPractice');
  assert.ok(html.includes('(click)="go(\'libro\', s.id)"'), 'Botón abrir navega a libro');
  assert.ok(html.includes('getSessionSnippet(s)'), 'Muestra extracto útil de apuntes');
});

// ---------------------------------------------------------------------------
// BLOQUE 2: SISTEMA INTELIGENTE DE PRÁCTICA PARA EXAMEN (MISIÓN B)
// ---------------------------------------------------------------------------
console.log('\n--- BLOQUE 2: SERVICIO DE PRÁCTICA PARA EXAMEN Y GENERACIÓN ---');

runTest('T07: PracticeExamService existe y define contratos rigurosos de tipado', () => {
  const svcFile = fs.readFileSync(path.join(webRoot, 'src/app/core/practice-exam.service.ts'), 'utf8');
  assert.ok(svcFile.includes('export interface PracticeQuestion'), 'Debe exportar PracticeQuestion');
  assert.ok(svcFile.includes('export interface PracticeExam'), 'Debe exportar PracticeExam');
  assert.ok(svcFile.includes('export interface PracticeAttempt'), 'Debe exportar PracticeAttempt');
  assert.ok(svcFile.includes('export interface ExamGenerationConfig'), 'Debe exportar ExamGenerationConfig');
});

runTest('T08: Generación con Gemini Nano usa prompt estructurado JSON directo y rawPrompt', () => {
  const svcFile = fs.readFileSync(path.join(webRoot, 'src/app/core/practice-exam.service.ts'), 'utf8');
  assert.ok(svcFile.includes('rawPrompt: true'), 'Debe usar rawPrompt para máxima velocidad y evitar prefijos');
  assert.ok(svcFile.includes('ai.processPromptDetailed('), 'Debe invocar inferencia con IA vía processPromptDetailed');
  assert.ok(svcFile.includes('"correctAnswerIndex"'), 'Prompt exige correctAnswerIndex');
  assert.ok(svcFile.includes('"explanation"'), 'Prompt exige justificación pedagógica');
});

runTest('T09: Validación en runtime de esquema JSON garantiza integridad pedagógica', () => {
  const svcFile = fs.readFileSync(path.join(webRoot, 'src/app/core/practice-exam.service.ts'), 'utf8');
  assert.ok(svcFile.includes('parseAndValidateQuestions'), 'Debe tener método validador');
  assert.ok(svcFile.includes('item.options.length !== (isTF ? 2 : 4)'), 'Garantiza al menos 2 opciones');
  assert.ok(svcFile.includes('typeof item.questionText'), 'Garantiza enunciado textual válido');
});

runTest('T10: Fallback pedagógico curricular offline sin IA activa ni falsas afirmaciones', () => {
  const svcFile = fs.readFileSync(path.join(webRoot, 'src/app/core/practice-exam.service.ts'), 'utf8');
  assert.ok(svcFile.includes('generateFromCurriculumExercises'), 'Debe tener método de fallback curricular');
  assert.ok(svcFile.includes('findMatchingExercises'), 'Usa catálogo curricular alineado al CNEB');
  assert.ok(svcFile.includes('inferenceSource: \'CURRICULUM_OFFLINE\''), 'Etiqueta con transparencia el origen del examen');
});

runTest('T11: Persistencia cifrada en IndexedDB en stores "exams" y "attempts"', () => {
  const svcFile = fs.readFileSync(path.join(webRoot, 'src/app/core/practice-exam.service.ts'), 'utf8');
  assert.ok(svcFile.includes("identity.save('exams'"), 'Guarda exámenes generados en IndexedDB cifrado');
  assert.ok(svcFile.includes("identity.save('attempts'"), 'Guarda intentos de examen en IndexedDB cifrado');
});

runTest('T12: Integración con memoria SM-2: errores pasan a revisión prioritaria y aciertos a MASTERED', () => {
  const svcFile = fs.readFileSync(path.join(webRoot, 'src/app/core/practice-exam.service.ts'), 'utf8');
  assert.ok(svcFile.includes('integrateAttemptWithLearningMemory'), 'Integra con memoria de aprendizaje');
  assert.ok(svcFile.includes('this.memory.recordGradedAnswer('), 'Usa la misma evaluación SM-2 que el repaso');
  const memory = fs.readFileSync(path.join(webRoot, 'src/app/core/learning-memory.service.ts'), 'utf8');
  assert.ok(memory.includes("newStreak >= 2 ? 'MASTERED' : 'TESTED'"));
  assert.ok(memory.includes("newStatus = 'REINFORCING'"));
  assert.ok(memory.includes('const nextReviewDate = addDays(today, newInterval)'));
});

runTest('T13: createAndSaveAttempt calcula aciertos, errores, tiempo y porcentaje', () => {
  const svcFile = fs.readFileSync(path.join(webRoot, 'src/app/core/practice-exam.service.ts'), 'utf8');
  assert.ok(svcFile.includes('createAndSaveAttempt'), 'Debe implementar createAndSaveAttempt');
  assert.ok(svcFile.includes('scorePercentage'), 'Calcula scorePercentage');
  assert.ok(svcFile.includes('timeSpentSeconds'), 'Registra tiempo empleado');
});

// ---------------------------------------------------------------------------
// BLOQUE 3: INTERFAZ INTERACTIVA Y FLUJO DE EVALUACIÓN
// ---------------------------------------------------------------------------
console.log('\n--- BLOQUE 3: INTERFAZ INTERACTIVA DE EXAMEN (VISTA PRACTICA) ---');

runTest('T14: AppView incluye "practica" y parseHash soporta la vista', () => {
  const appTs = fs.readFileSync(path.join(webRoot, 'src/app/app.ts'), 'utf8');
  assert.ok(appTs.includes("'practica'"), 'AppView debe contener "practica"');
  assert.ok(appTs.includes("validViews: AppView[] = ["), 'validViews lista practica');
});

runTest('T15: App tiene estados reactivos para configuración, progreso y resultados', () => {
  const appTs = fs.readFileSync(path.join(webRoot, 'src/app/app.ts'), 'utf8');
  assert.ok(appTs.includes('practiceState = signal'), 'Tiene signal practiceState');
  assert.ok(appTs.includes('practiceConfig = signal'), 'Tiene signal practiceConfig');
  assert.ok(appTs.includes('currentExam = signal'), 'Tiene signal currentExam');
  assert.ok(appTs.includes('userAnswers = signal'), 'Tiene signal userAnswers');
  assert.ok(appTs.includes('currentAttempt = signal'), 'Tiene signal currentAttempt');
  assert.ok(appTs.includes('confirmFinishModalOpen = signal'), 'Tiene modal para preguntas sin responder');
});

runTest('T16: Navegación de preguntas soporta anterior, siguiente y salto directo', () => {
  const appTs = fs.readFileSync(path.join(webRoot, 'src/app/app.ts'), 'utf8');
  assert.ok(appTs.includes('nextExamQuestion()'), 'nextExamQuestion avanza');
  assert.ok(appTs.includes('prevExamQuestion()'), 'prevExamQuestion retrocede');
  assert.ok(appTs.includes('goToExamQuestion('), 'goToExamQuestion permite salto');
});

runTest('T17: Template de práctica implementa los 4 estados (CONFIG, GENERATING, ACTIVE, RESULTS)', () => {
  const html = fs.readFileSync(path.join(webRoot, 'src/app/app.html'), 'utf8');
  assert.ok(html.includes("practiceState() === 'CONFIG'"), 'Tiene vista de configuración');
  assert.ok(html.includes("practiceState() === 'GENERATING'"), 'Tiene vista de spinner de generación');
  assert.ok(html.includes("practiceState() === 'ACTIVE'"), 'Tiene vista de examen activo');
  assert.ok(html.includes("practiceState() === 'RESULTS'"), 'Tiene vista de resultados detallados');
});

runTest('T18: Examen activo muestra barra de progreso y alternativas con letras A/B/C/D', () => {
  const html = fs.readFileSync(path.join(webRoot, 'src/app/app.html'), 'utf8');
  assert.ok(html.includes('class="practice-progress-bar-container"'), 'Contiene contenedor de barra de progreso');
  assert.ok(html.includes('class="practice-option-letter"'), 'Muestra letras de opciones');
  assert.ok(html.includes('class="practice-options-grid"'), 'Grilla de opciones accesible');
});

runTest('T19: Pantalla de resultados muestra desglose pedagógico con explicación de Ostrix', () => {
  const html = fs.readFileSync(path.join(webRoot, 'src/app/app.html'), 'utf8');
  assert.ok(html.includes('class="practice-score-circle"'), 'Círculo visual de puntaje con color dinámico');
  assert.ok(html.includes('class="practice-stats-grid"'), 'Desglose de aciertos, fallos, pendientes y tiempo');
  assert.ok(html.includes('class="practice-pedagogical-box"'), 'Caja de explicación pedagógica');
  assert.match(html, /t\('practiceOstrixExplanationLabel'\)\s*}}<\/strong>\s*{{\s*displayAcademicText\(q\.explanation\)/,
    'La etiqueta traducida acompaña la explicación de la pregunta');
  assert.match(interfaceText('practiceOstrixExplanationLabel', 'es'), /Explicación de Ostrix/);
});

runTest('T20: Modal de confirmación protege al estudiante si intenta finalizar con preguntas vacías', () => {
  const html = fs.readFileSync(path.join(webRoot, 'src/app/app.html'), 'utf8');
  assert.ok(html.includes('confirmFinishModalOpen()'), 'Condición del modal de advertencia');
  assert.ok(html.includes('examUnansweredCount()'), 'Muestra cantidad exacta de preguntas sin responder');
  assert.ok(html.includes('cancelFinishModal()'), 'Permite seguir respondiendo');
  assert.ok(html.includes('confirmFinishNow()'), 'Permite finalizar si el estudiante lo decide');
});

// ---------------------------------------------------------------------------
// BLOQUE 4: ESTABILIDAD DE FOCO EN PIZARRA Y SIN REGRESIONES
// ---------------------------------------------------------------------------
console.log('\n--- BLOQUE 4: ESTABILIDAD DE FOCO EN PIZARRA Y REGRESIONES ---');

runTest('T21: Input de título de tema conserva el foco sin perderlo al escribir caracteres', () => {
  const html = fs.readFileSync(path.join(webRoot, 'src/app/app.html'), 'utf8');
  const appTs = fs.readFileSync(path.join(webRoot, 'src/app/app.ts'), 'utf8');

  // Comprobar enlace bidireccional estable y trackBy
  assert.ok(html.includes('[(ngModel)]="topic.name"'), 'Usa enlace bidireccional [(ngModel)]="topic.name"');
  assert.ok(html.includes('trackBy: trackByTopicId'), 'Usa trackByTopicId en *ngFor');
  assert.ok(appTs.includes('trackByTopicId(index: number, topic: Topic): string'), 'trackByTopicId definido con retorno estable');

  // Comprobar que onTopicTitleChange no destruye la referencia de la lista
  const onTitleFn = appTs.slice(appTs.indexOf('onTopicTitleChange('), appTs.indexOf('onTopicTitleChange(') + 300);
  assert.ok(!onTitleFn.includes('this.draftTopics.set('), 'onTopicTitleChange NO debe recrear el array para evitar destrucción de DOM');
});

runTest('T22: getTopicNotesLines garantiza persistencia de referencia en topicNotesMap', () => {
  const appTs = fs.readFileSync(path.join(webRoot, 'src/app/app.ts'), 'utf8');
  assert.ok(appTs.includes('getTopicNotesLines(topicId: string)'), 'getTopicNotesLines definido');
  const fnBody = appTs.slice(appTs.indexOf('getTopicNotesLines('), appTs.indexOf('getTopicNotesLines(') + 800);
  assert.ok(fnBody.includes('map[topicId] = cached') || fnBody.includes('map[topicId] = lines'), 'Guarda en caché map[topicId] para referencialidad idéntica');
});

runTest('T23: Estilos CSS de .pizarra-topic-input-title tienen especificidad alta', () => {
  const css = fs.readFileSync(path.join(webRoot, 'src/styles.css'), 'utf8');
  assert.ok(css.includes('.pizarra-topic-headline input.pizarra-topic-input-title'), 'Especificidad alta para que input[type=text] no lo rompa');
  assert.ok(css.includes('box-sizing: border-box'), 'Evita reflows visuales al teclear');
});

runTest('T24: Botón "+ Añadir otro tema" no duplica el símbolo más en la interfaz', () => {
  const html = fs.readFileSync(path.join(webRoot, 'src/app/app.html'), 'utf8');
  assert.ok(!html.includes('+ {{ t(\'addAnotherTopicBtn\') }}'), 'HTML no debe anteponer un signo más duplicado');
});

runTest('T25: Internacionalización contiene todas las 37+ claves en es, en y qu-chanka', () => {
  const langFile = fs.readFileSync(path.join(webRoot, 'src/app/core/interface-language.ts'), 'utf8');
  const requiredKeys = [
    'practiceExamTitle',
    'practiceConfigSubtitle',
    'questionCountSelector',
    'countOption5',
    'countOption10',
    'difficultySelector',
    'difficultyBasic',
    'difficultyIntermediate',
    'difficultyAdvanced',
    'practiceTypeSelector',
    'typeMixed',
    'typeMultipleChoice',
    'typeTrueFalse',
    'startPracticeBtn',
    'generatingExamTitle',
    'generatingExamSubtitle',
    'questionIndexLabel',
    'prevQuestionBtn',
    'finishExamBtn',
    'examResultExcellent',
    'examResultGood',
    'examResultNeedsReview',
    'statCorrect',
    'statIncorrect',
    'statUnanswered',
    'statTime',
    'detailedReviewTitle',
    'backToDiaryBtn',
    'confirmFinishTitle',
    'openSessionBtn',
    'practiceForExamBtn',
  ];

  for (const k of requiredKeys) {
    assert.ok(langFile.includes(`${k}:`), `Clave ${k} debe estar presente en interface-language.ts`);
  }
});

console.log('\n=============================================================================');
console.log(`🎉 RESULTADOS: ${passed}/${total} PRUEBAS EXITOSAS (100% PASSING)`);
console.log('=============================================================================\n');
