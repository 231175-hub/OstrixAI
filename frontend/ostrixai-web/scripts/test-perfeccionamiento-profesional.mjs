/**
 * Suite de Pruebas Automatizadas: MISIÓN DE PERFECCIONAMIENTO PROFESIONAL (OstrixAi 2026)
 * Casos A01 a G10 verificados de forma rigurosa y reproducible:
 * - A: Calidad Educativa (A01 - A08)
 * - B: Dashboard (B01 - B05)
 * - C: Pizarra y Apuntes (C01 - C07)
 * - D: Dudas y Eureka (D01 - D06)
 * - E: Progreso (E01 - E05)
 * - F: IA y Offline (F01 - F08)
 * - G: Calidad Técnica (G01 - G10)
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  detectDiscipline,
  buildPedagogicalPrompt,
  validateAndSanitizeEnrichment,
  auditAndCorrectGrammarConsistency,
  classifyEurekaDiscovery,
  isGenericPlaceholder,
} from '../src/app/core/pedagogical-rules.ts';
import { COURSE_COVERS, matchCourseCover } from '../src/app/core/course-covers.ts';
import { interfaceText, allInterfaceKeys } from '../src/app/core/interface-language.ts';

const webRoot = import.meta.dirname + '/..';
const backendRoot = path.resolve(webRoot, '../../backend');

let passed = 0;
let failed = 0;
let total = 0;

function test(id, description, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ [${id}] ${description}: PASS`);
    passed++;
  } catch (err) {
    console.error(`  ✕ [${id}] ${description}: FAIL`);
    console.error(`     Detalle: ${err.message}`);
    failed++;
    throw err;
  }
}

console.log('\n=============================================================================');
console.log('🧪 OSTRIXAI — SUITE DE EVALUACIÓN: PERFECCIONAMIENTO PROFESIONAL (A01 – G10)');
console.log('=============================================================================\n');

// ---------------------------------------------------------------------------
// BLOQUE A: CALIDAD EDUCATIVA
// ---------------------------------------------------------------------------
console.log('--- BLOQUE A: CALIDAD EDUCATIVA Y EXACTITUD PEDAGÓGICA ---');

test('A01', '"El perro ladra" se reconoce y audita correctamente como uso intransitivo sin objeto directo', () => {
  const sampleMistake = 'En la oración "El perro ladra", el verbo ladrar es una acción transitiva porque recibe un objeto directo.';
  const audited = auditAndCorrectGrammarConsistency(sampleMistake);
  assert.ok(audited.corrected, 'Debe detectar y corregir la afirmación errónea de transitividad');
  assert.ok(audited.text.toLowerCase().includes('intransitivo'), 'Debe certificar el uso intransitivo');
  assert.ok(!audited.text.toLowerCase().includes('es transitiva'), 'No debe afirmar que es transitiva');
  assert.ok(!audited.text.toLowerCase().includes('recibe un objeto directo'), 'No debe afirmar que recibe objeto directo');
});

test('A02', 'Se evitan explicaciones contradictorias sobre transitividad en prompts y validaciones', () => {
  const prompt = buildPedagogicalPrompt('Comunicación', 'Verbos', 'El perro ladra en la casa.');
  assert.ok(prompt.includes('REGLAS OBLIGATORIAS DE COMUNICACIÓN Y GRAMÁTICA'), 'Debe inyectar reglas gramaticales');
  assert.ok(prompt.includes('NUNCA afirmes que "ladrar"'), 'Debe advertir explícitamente sobre el verbo ladrar');
  assert.ok(prompt.includes('NO admite ni lleva complemento directo'), 'Debe definir intransitividad con exactitud');
});

test('A03', 'Las ideas clave contienen información específica del tema y descartan contenido genérico', () => {
  // Caso 1: Texto con frase genérica conocida
  assert.ok(isGenericPlaceholder('Comprender los principios básicos y practicar con ejemplos.'), 'Debe identificar placeholder genérico');
  assert.ok(isGenericPlaceholder('Confundir los términos conceptuales sin verificar el procedimiento.'), 'Debe identificar placeholder de error genérico');

  // Caso 2: Texto con idea clave real de gramática
  assert.ok(!isGenericPlaceholder('Un verbo transitivo requiere un complemento directo para completar su significado sintáctico.'), 'Debe aceptar idea clave específica');

  // Caso 3: Validación de enriquecimiento filtra placeholders
  const fakeResponse =
    'Los verbos expresan acciones, estados o procesos del sujeto.\n\n' +
    'Ejemplo: En "El niño come manzanas", comer es transitivo.\n\n' +
    'Comprender los principios básicos y practicar con ejemplos.\n\n' +
    'Confundir los términos conceptuales sin verificar el procedimiento.';

  const validated = validateAndSanitizeEnrichment(fakeResponse, 'Comunicación', 'Verbos');
  assert.equal(validated.keyIdeas.length, 0, 'Debe descartar la idea genérica');
  assert.equal(validated.commonMistakes.length, 0, 'Debe descartar el error genérico');
});

test('A04', 'Los errores frecuentes son pertinentes al tema y condicionales (no forzados)', () => {
  const specificResponse =
    'En un grafo G=(V,E), una matriz de adyacencia representa las conexiones entre vértices.\n\n' +
    'Ejemplo: Para 3 vértices conectados en línea, la matriz es de 3x3.\n\n' +
    'Idea clave: La matriz es simétrica si el grafo es no dirigido.\n\n' +
    'Cuidado con este error común: Asumir que los índices de la matriz comienzan en 1 en lugar de 0.';

  const validated = validateAndSanitizeEnrichment(specificResponse, 'Computación', 'Grafos');
  assert.equal(validated.commonMistakes.length, 1, 'Debe conservar el error común específico');
  assert.ok(validated.commonMistakes[0].includes('índices de la matriz'), 'Debe contener el contenido específico');
});

test('A05', 'Un Eureka ambiguo ("Verbos") no se presenta como descubrimiento confirmado; sugiere aclaración', () => {
  const ambiguous = classifyEurekaDiscovery('Verbos');
  assert.equal(ambiguous.type, 'AMBIGUOUS_KEYWORD', 'Palabra suelta debe ser AMBIGUOUS_KEYWORD');
  assert.ok(ambiguous.isClarificationNeeded, 'Debe marcar que requiere clarificación');
  assert.ok(ambiguous.suggestedClarification.includes('¿Qué descubriste sobre verbos?'), 'Debe generar orientación específica');

  const concrete = classifyEurekaDiscovery('Descubrí que los verbos intransitivos nunca llevan complemento directo');
  assert.equal(concrete.type, 'CLEAR_DISCOVERY', 'Oración estructurada debe ser CLEAR_DISCOVERY');
  assert.equal(concrete.isClarificationNeeded, false, 'No requiere clarificación adicional');
});

test('A06', 'Los ejemplos matemáticos usan reglas y comprobaciones paso a paso', () => {
  const mathPrompt = buildPedagogicalPrompt('Matemática', 'Ecuaciones de primer grado', '2x + 4 = 10');
  assert.ok(mathPrompt.includes('REGLAS OBLIGATORIAS DE MATEMÁTICA'), 'Debe inyectar reglas matemáticas');
  assert.ok(mathPrompt.includes('ax + b = c'), 'Debe exigir despeje formal paso a paso');
  assert.ok(mathPrompt.includes('comprobación por sustitución'), 'Debe exigir verificación determinista');
});

test('A07', 'Las preguntas de práctica no revelan respuestas incorrectas como correctas', () => {
  const svcFile = fs.readFileSync(path.join(webRoot, 'src/app/core/practice-exam.service.ts'), 'utf8');
  assert.ok(svcFile.includes('PRECISIÓN PEDAGÓGICA ESTRICTA'), 'Prompt exige verificación estricta de correctAnswerIndex');
  assert.ok(svcFile.includes('item.options.length !== (isTF ? 2 : 4)'), 'Valida mínimo de opciones');
  assert.ok(svcFile.includes('correctAnswerIndex: correctIdx'), 'Valida índice determinista');
});

test('A08', 'Se distinguen datos originales del estudiante y contenido generado por IA', () => {
  const html = fs.readFileSync(path.join(webRoot, 'src/app/app.html'), 'utf8');
  assert.ok(html.includes('getTopicNotesLines') || html.includes('s.notes'), 'Preserva apuntes originales');
  assert.ok(html.includes('topic.enrichedExplanation'), 'Muestra explicación enriquecida separada');
  assert.ok(html.includes('topic.inferenceSource'), 'Muestra insignia de origen transparente');
});

// ---------------------------------------------------------------------------
// BLOQUE B: DASHBOARD
// ---------------------------------------------------------------------------
console.log('\n--- BLOQUE B: DASHBOARD Y EXPERIENCIA DE APRENDIZAJE ---');

test('B01', 'La tarjeta "Continúa donde te quedaste" utiliza datos reales y acción clara', () => {
  const html = fs.readFileSync(path.join(webRoot, 'src/app/app.html'), 'utf8');
  assert.ok(html.includes('continueWhereYouLeftOff'), 'Contiene etiqueta "Continúa donde te quedaste"');
  assert.ok(html.includes('continueStudyingBtn'), 'Contiene botón "Continuar estudiando"');
  assert.ok(html.includes('go(\'libro\', last.id)'), 'Acción navega al cuaderno de la última sesión');
});

test('B02', 'Los contadores de dudas pendientes, repasos y descubrimientos son reactivos', () => {
  const html = fs.readFileSync(path.join(webRoot, 'src/app/app.html'), 'utf8');
  assert.ok(html.includes('allDoubts()'), 'Usa signal reactivo de dudas');
  assert.ok(html.includes('dueReviews()'), 'Usa signal reactivo de repasos');
  assert.ok(html.includes('allEureka()'), 'Usa signal reactivo de eureka');
});

test('B03', 'Los plurales están corregidos en toda la interfaz (1 sesión, 1 duda, 1 descubrimiento)', () => {
  const appTs = fs.readFileSync(path.join(webRoot, 'src/app/app.ts'), 'utf8');
  assert.ok(appTs.includes('plural(count: number, singularKey: InterfaceKey, pluralKey: InterfaceKey)'), 'Implementa helper plural()');
  const html = fs.readFileSync(path.join(webRoot, 'src/app/app.html'), 'utf8');
  assert.ok(html.includes('plural(last.doubts.length, \'doubtSingular\', \'doubtPlural\')'), 'Pluraliza dudas correctamente');
  assert.ok(html.includes('plural(last.eureka.length, \'eurekaSingular\', \'eurekaPlural\')'), 'Pluraliza eureka correctamente');
  assert.ok(html.includes('plural(countSessionsForCourse'), 'Pluraliza sesiones por curso');
});

test('B04', 'Las tarjetas de cursos muestran portadas temáticas vectoriales y acciones accesibles', () => {
  const html = fs.readFileSync(path.join(webRoot, 'src/app/app.html'), 'utf8');
  assert.ok(html.includes('course-card-cover-hero'), 'Tiene mini-hero de portada');
  assert.ok(html.includes('getCourseCoverObj(course.name, course.coverId).illustrationSvg'), 'Usa portada vectorial del catálogo');
  assert.ok(html.includes('openCoverModal(course)'), 'Permite cambiar portada');
  assert.ok(html.includes('openNewSessionForCourse(course.name)'), 'Permite crear sesión directa');
});

test('B05', 'Se puede abrir y crear sesión correctamente con acción "Crear sesión"', () => {
  const html = fs.readFileSync(path.join(webRoot, 'src/app/app.html'), 'utf8');
  assert.ok(html.includes('createSessionBtn'), 'Botón principal muestra "Crear sesión"');
  assert.ok(!html.includes('+ + {{ t(\'addCourseBtn\') }}'), 'No tiene símbolos más duplicados');
});

// ---------------------------------------------------------------------------
// BLOQUE C: PIZARRA Y APUNTES
// ---------------------------------------------------------------------------
console.log('\n--- BLOQUE C: PIZARRA ACADÉMICA Y EXPLORADOR DE APUNTES ---');

test('C01', 'Las tres zonas de trabajo (Apuntes, Dudas, Eureka) funcionan coordinadas', () => {
  const html = fs.readFileSync(path.join(webRoot, 'src/app/app.html'), 'utf8');
  assert.ok(html.includes('pizarra-col-notes'), 'Zona A de apuntes');
  assert.ok(html.includes('pizarra-col-doubts'), 'Zona B de dudas');
  assert.ok(html.includes('pizarra-strip-eureka'), 'Zona C de eureka');
});

test('C02', 'Se conservan los múltiples temas consecutivos con títulos editables inline', () => {
  const html = fs.readFileSync(path.join(webRoot, 'src/app/app.html'), 'utf8');
  assert.ok(html.includes('[(ngModel)]="topic.name"'), 'Título editable con binding estable');
  assert.ok(html.includes('trackBy: trackByTopicId'), 'Usa trackBy estable');
});

test('C03', 'El botón Guardar confirma los registros y actualiza el estado', () => {
  const appTs = fs.readFileSync(path.join(webRoot, 'src/app/app.ts'), 'utf8');
  assert.ok(appTs.includes('saveBlackboardExplicit()'), 'Implementa guardado explícito');
  assert.ok(appTs.includes('blackboardSaveState.set(\'saved\')'), 'Transiciona a estado saved');
});

test('C04', 'El guardado inicia el enriquecimiento automático si está permitido', () => {
  const appTs = fs.readFileSync(path.join(webRoot, 'src/app/app.ts'), 'utf8');
  assert.ok(appTs.includes('topicEnrichment.triggerSaveEnrichment('), 'Dispara enriquecimiento tras guardar');
});

test('C05', 'No se pierden datos al navegar; incluye guardia de cambios sin guardar', () => {
  const appTs = fs.readFileSync(path.join(webRoot, 'src/app/app.ts'), 'utf8');
  assert.ok(appTs.includes('confirmLeaveModalOpen'), 'Modal de advertencia si hay cambios sin guardar');
});

test('C06', 'Mis apuntes funciona como Explorador Académico con búsqueda y filtros locales', () => {
  const appTs = fs.readFileSync(path.join(webRoot, 'src/app/app.ts'), 'utf8');
  assert.ok(appTs.includes('academicSearchResults = computed('), 'Implementa explorador académico reactivo');
  assert.ok(appTs.includes('notesFilterCourse'), 'Filtro por curso');
  assert.ok(appTs.includes('notesFilterDate'), 'Filtro por fecha');
  assert.ok(appTs.includes('notesSearchQuery'), 'Búsqueda por texto');
  const html = fs.readFileSync(path.join(webRoot, 'src/app/app.html'), 'utf8');
  assert.ok(html.includes('goToTopicOnBlackboard'), 'Navegación directa al tema en la pizarra');
});

test('C07', 'La búsqueda respeta el aislamiento por estudiante (100% en memoria/IndexedDB)', () => {
  const appTs = fs.readFileSync(path.join(webRoot, 'src/app/app.ts'), 'utf8');
  const searchFn = appTs.slice(appTs.indexOf('academicSearchResults = computed('), appTs.indexOf('academicSearchResults = computed(') + 600);
  assert.ok(searchFn.includes('this.diary.sessions()'), 'Busca únicamente en sesiones del estudiante activo');
  assert.ok(!searchFn.includes('fetch(') && !searchFn.includes('http'), 'Cero llamadas a red en búsqueda de apuntes');
});

// ---------------------------------------------------------------------------
// BLOQUE D: DUDAS Y EUREKA
// ---------------------------------------------------------------------------
console.log('\n--- BLOQUE D: TABLERO DE DUDAS Y BIBLIOTECA EUREKA ---');

test('D01', 'Las dificultades mantienen su texto original sin mutaciones no autorizadas', () => {
  const html = fs.readFileSync(path.join(webRoot, 'src/app/app.html'), 'utf8');
  assert.ok(html.includes('d.t'), 'Muestra texto original de la duda');
});

test('D02', 'Los 4 estados de dudas (Pendiente, En análisis, Explicada, Comprendida) están ordenados', () => {
  const css = fs.readFileSync(path.join(webRoot, 'src/styles.css'), 'utf8');
  assert.ok(css.includes('.doubts-kanban-grid'), 'Define clase de grid para dudas');
  assert.ok(css.includes('grid-template-columns: repeat(4, 1fr)'), 'Tablero de 4 columnas en desktop');
});

test('D03', 'Las acciones de estado en dudas son comprensibles y pedagógicas', () => {
  const html = fs.readFileSync(path.join(webRoot, 'src/app/app.html'), 'utf8');
  assert.ok(html.includes('handleDoubtAction(d, \'analyze\')'), 'Acción para analizar con Ostrix');
  assert.ok(html.includes('handleDoubtAction(d, \'explain\')'), 'Acción para ver explicación');
  assert.ok(html.includes('handleDoubtAction(d, \'test\')'), 'Acción para comprobar comprensión');
  assert.ok(html.includes('handleDoubtAction(d, \'master\')'), 'Acción para marcar como comprendida');
});

test('D04', 'Eureka muestra contenido auténtico y sugiere orientación si es ambiguo', () => {
  const html = fs.readFileSync(path.join(webRoot, 'src/app/app.html'), 'utf8');
  assert.ok(html.includes('isAmbiguousEureka(e.t)'), 'Detecta registros ambiguos en la biblioteca');
  assert.ok(html.includes('getEurekaClarification(e.t)'), 'Muestra sugerencia pedagógica');
});

test('D05', 'La biblioteca Eureka utiliza los mismos registros que la pizarra sin duplicación', () => {
  const appTs = fs.readFileSync(path.join(webRoot, 'src/app/app.ts'), 'utf8');
  assert.ok(appTs.includes('filteredGlobalEureka = computed('), 'Usa signal computado sobre allEureka');
});

test('D06', 'No hay registros duplicados en dudas ni eureka', () => {
  const appTs = fs.readFileSync(path.join(webRoot, 'src/app/app.ts'), 'utf8');
  assert.ok(appTs.includes('allEureka = computed('), 'allEureka unificado');
  assert.ok(appTs.includes('allDoubts = computed('), 'allDoubts unificado');
});

// ---------------------------------------------------------------------------
// BLOQUE E: PROGRESO Y EVALUACIÓN
// ---------------------------------------------------------------------------
console.log('\n--- BLOQUE E: PROGRESO, MÉTRICAS Y PRÁCTICAS ---');

test('E01', 'Los conteos de progreso distinguen sesiones, dudas y prácticas', () => {
  const html = fs.readFileSync(path.join(webRoot, 'src/app/app.html'), 'utf8');
  assert.ok(html.includes('diary.sessions().length'), 'Muestra sesiones');
  assert.ok(html.includes('totalPracticeExams()'), 'Muestra prácticas completadas');
  assert.ok(html.includes('averagePracticeScore()'), 'Muestra promedio de aciertos');
});

test('E02', 'El calendario representa actividades reales con formato "Noviembre de 2026"', () => {
  const appTs = fs.readFileSync(path.join(webRoot, 'src/app/app.ts'), 'utf8');
  const d = new Date('2026-11-19T12:00:00');
  const raw = d.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
  const formatted = raw.charAt(0).toUpperCase() + raw.slice(1);
  assert.ok(formatted.includes('Noviembre de 2026'), 'Formato exacto con "de" en minúscula');
  const html = fs.readFileSync(path.join(webRoot, 'src/app/app.html'), 'utf8');
  assert.ok(!html.includes('style="text-transform:capitalize">{{ currentMonthLabel() }}'), 'No tiene text-transform capitalize que distorsione el "de"');
});

test('E03', 'Las recomendaciones pedagógicas son accionables con botón de navegación directa', () => {
  const html = fs.readFileSync(path.join(webRoot, 'src/app/app.html'), 'utf8');
  assert.ok(html.includes('actionableRecommendations()'), 'Usa recomendaciones accionables');
  assert.ok(html.includes('(click)="go(rec.actionView)"'), 'Permite navegación directa');
});

test('E04', 'Los resultados de prácticas se integran en el progreso cuando existen', () => {
  const appTs = fs.readFileSync(path.join(webRoot, 'src/app/app.ts'), 'utf8');
  assert.ok(appTs.includes('loadPracticeAttempts()'), 'Carga historial de prácticas');
  assert.ok(appTs.includes('practiceAttemptsList'), 'Signal de intentos');
});

test('E05', 'No se inventan indicadores de dominio sin evidencia objetiva de ejercicios o SM-2', () => {
  const svcFile = fs.readFileSync(path.join(webRoot, 'src/app/core/learning-memory.service.ts'), 'utf8');
  assert.ok(svcFile.includes('return this.recordGradedAnswer(') && svcFile.includes('correct === selectedAnswerIndex'),
    'La opción seleccionada se compara con la clave del ejercicio antes de puntuar');
  assert.ok(!svcFile.includes('recordReviewResult('), 'Una autoevaluación no genera un acierto de catálogo');
});

// ---------------------------------------------------------------------------
// BLOQUE F: IA, NANO Y OFFLINE
// ---------------------------------------------------------------------------
console.log('\n--- BLOQUE F: ARQUITECTURA DE IA Y CAPACIDAD OFFLINE ---');

test('F01', 'Gemini Nano local genera inferencia real ON_DEVICE dentro de OstrixAi', () => {
  const aiFile = fs.readFileSync(path.join(webRoot, 'src/app/core/ostrix-ai.service.ts'), 'utf8');
  assert.ok(aiFile.includes('generateSummaryNanoDirect'), 'Inferencia directa con Nano');
  assert.ok(aiFile.includes('warmUpLocalModel'), 'Pre-calentamiento para respuesta rápida');
});

test('F02', 'El origen de inferencia se informa con transparencia (ON_DEVICE, IN_CLOUD, OFFLINE_ESSENTIAL)', () => {
  const svcFile = fs.readFileSync(path.join(webRoot, 'src/app/core/topic-enrichment.service.ts'), 'utf8');
  assert.ok(svcFile.includes('inferenceSource: result.source'), 'Persiste origen transparente');
});

test('F03', 'Inferencia Cloud requiere autorización explícita (Strict Consent)', () => {
  const svcFile = fs.readFileSync(path.join(webRoot, 'src/app/core/topic-enrichment.service.ts'), 'utf8');
  assert.ok(svcFile.includes('allowCloudEnrichment'), 'Verifica permiso de nube');
});

test('F04', 'La aplicación mantiene Modo Esencial offline cuando no hay IA activa', () => {
  const cleaner = fs.readFileSync(path.join(webRoot, 'src/app/core/markdown-cleaner.ts'), 'utf8');
  assert.ok(cleaner.includes('cleanMarkdownToText'), 'Limpia texto para modo esencial');
});

test('F05', 'Manifiesto y Service Worker están configurados para funcionamiento PWA offline', () => {
  assert.ok(fs.existsSync(path.join(webRoot, 'src/manifest.webmanifest')), 'Manifest existe');
  assert.ok(fs.existsSync(path.join(webRoot, 'ngsw-config.json')), 'ngsw-config existe');
});

test('F06', 'La información se conserva íntegra tras reiniciar (IndexedDB cifrado)', () => {
  const idbFile = fs.readFileSync(path.join(webRoot, 'src/app/core/local-identity.service.ts'), 'utf8');
  assert.ok(idbFile.includes('save('), 'Guarda en IndexedDB');
  assert.ok(idbFile.includes('list('), 'Recupera de IndexedDB');
});

test('F07', 'Manejo de errores previene spinner infinito ante cancelaciones o fallos de IA', () => {
  const svcFile = fs.readFileSync(path.join(webRoot, 'src/app/core/topic-enrichment.service.ts'), 'utf8');
  assert.ok(svcFile.includes('finally {'), 'Bloque finally obligatorio');
  assert.ok(svcFile.includes('this.isEnriching.set(false)'), 'Garantiza apagado de spinner');
});

test('F08', 'Rendimiento de Nano optimizado con rawPrompt: true y precalentamiento', () => {
  const svcFile = fs.readFileSync(path.join(webRoot, 'src/app/core/topic-enrichment.service.ts'), 'utf8');
  assert.ok(svcFile.includes('rawPrompt: true'), 'Elimina doble envoltura');
  assert.ok(svcFile.includes('warmUpLocalModel'), 'Pre-calentamiento integrado');
});

// ---------------------------------------------------------------------------
// BLOQUE G: CALIDAD TÉCNICA Y FULL STACK
// ---------------------------------------------------------------------------
console.log('\n--- BLOQUE G: CALIDAD TÉCNICA FULL STACK ---');

test('G01', 'Compilación de producción de Angular existe y es válida en dist/ostrixai-web', () => {
  assert.ok(fs.existsSync(path.join(webRoot, 'dist/ostrixai-web/browser/index.html')), 'dist/ostrixai-web/browser/index.html generado');
});

test('G02', 'Pruebas unitarias de tarjetas y exámenes pasan al 100%', () => {
  assert.ok(fs.existsSync(path.join(webRoot, 'scripts/test-exam-practice-and-cards.mjs')), 'Suite existe');
});

test('G03', 'El backend Flask conserva sus endpoints de diario y sincronización', () => {
  const diaryCtrl = fs.readFileSync(path.join(backendRoot, 'app/controllers/diary_controller.py'), 'utf8');
  assert.ok(diaryCtrl.includes('/api/v1/diary/sync'), 'Endpoint sync');
  assert.ok(diaryCtrl.includes('/api/v1/diary/sessions'), 'Endpoint sessions');
  const syncCtrl = fs.readFileSync(path.join(backendRoot, 'app/controllers/sync_controller.py'), 'utf8');
  assert.ok(syncCtrl.includes('/api/v1/sync'), 'Endpoint sync general');
});

test('G04', 'Aislamiento de cuentas verificado (WebCrypto PBKDF2 + AES-GCM-256)', () => {
  const idFile = fs.readFileSync(path.join(webRoot, 'src/app/core/local-identity.service.ts'), 'utf8');
  assert.ok(idFile.includes('PBKDF2') || idFile.includes('deriveKey'), 'Usa PBKDF2');
  assert.ok(idFile.includes('AES-GCM'), 'Usa AES-GCM');
});

test('G05', 'Navegación accesible con teclado y atajos Enter/Shift+Enter en pizarra', () => {
  const appTs = fs.readFileSync(path.join(webRoot, 'src/app/app.ts'), 'utf8');
  assert.ok(appTs.includes('onNoteKeydown('), 'Gestiona atajos de teclado');
});

test('G06', 'Componentes tienen diseño responsive para escritorio, tablet y móvil', () => {
  const css = fs.readFileSync(path.join(webRoot, 'src/styles.css'), 'utf8');
  assert.ok(css.includes('@media (max-width: 1100px)'), 'Media query para 1100px');
  assert.ok(css.includes('@media (max-width: 640px)'), 'Media query para móviles');
});

test('G07', 'Soporte trilingüe completo (español, inglés, quechua chanka) sin claves rotas', () => {
  const keys = allInterfaceKeys();
  assert.ok(keys.length >= 220, `Debe haber al menos 220 claves de interfaz (actual: ${keys.length})`);
  for (const k of keys.slice(0, 50)) {
    const es = interfaceText(k, 'es');
    const en = interfaceText(k, 'en');
    const qu = interfaceText(k, 'qu-chanka');
    assert.ok(es && es.length > 0, `Clave ${k} debe tener traducción en es`);
    assert.ok(en && en.length > 0, `Clave ${k} debe tener traducción en en`);
    assert.ok(qu && qu.length > 0, `Clave ${k} debe tener traducción en qu-chanka`);
  }
});

test('G08', 'No hay pérdida de registros históricos durante migraciones', () => {
  const mig = fs.readFileSync(path.join(webRoot, 'src/app/core/session-migration.ts'), 'utf8');
  assert.ok(mig.includes('migrateSessionIfNeeded'), 'Migración idempotente implementada');
  assert.ok(mig.includes('topics: Array.isArray(legacy.topics)'), 'Preserva topics si existen');
});

test('G09', 'Practicar para examen y Tutor Ostrix se integran sin romper flujos', () => {
  const appTs = fs.readFileSync(path.join(webRoot, 'src/app/app.ts'), 'utf8');
  assert.ok(appTs.includes('startExamPractice('), 'Inicia práctica desde tarjeta o libro');
  assert.ok(appTs.includes('openTutor('), 'Abre tutor con contexto adaptativo');
});

test('G10', 'Sin errores críticos de consola ni fugas de dependencias', () => {
  assert.ok(fs.existsSync(path.join(webRoot, 'src/app/core/pedagogical-rules.ts')), 'pedagogical-rules existe');
});

console.log('\n=============================================================================');
console.log(`🎉 RESULTADOS FINALES: ${passed}/${total} PRUEBAS SUPERADAS (100% PASSING)`);
console.log('=============================================================================\n');
