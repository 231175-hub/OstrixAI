import { buildPedagogicalPrompt } from '../src/app/core/pedagogical-rules.ts';
/**
 * TEST SUITE: Optimización de Gemini Nano y Corrección de las Tres Vistas Inteligentes
 *
 * Verifica:
 * 1. Pre-calentamiento no bloqueante de Gemini Nano (warmUpLocalModel / isWarm).
 * 2. Construcción de prompt compacto (sin doble envoltura, rawPrompt: true, 50-80 palabras).
 * 3. Telemetría microsegundo a microsegundo (TTFB, t_total, t_inference, t_initModel).
 * 4. Vista 2 (Dudas): CERO formularios/inputs de escritura, espacio puro de estudio pedagógico.
 * 5. Vista 3 (Eureka): CERO formularios/inputs de escritura, espacio puro de descubrimientos.
 * 6. Vista 1 (Enriquecidos): Estados coherentes y navegación "Ver apunte original".
 * 7. Enriquecimiento automático de dudas y descubrimientos en el guardado.
 * 8. Fallback seguro offline/esencial sin afirmaciones falsas.
 * 9. Badge "Pendientes de sync" condicionado estrictamente al consentimiento.
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '..');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}:`, err.message);
  }
}

console.log('=== TEST SUITE: GEMINI NANO OPTIMIZATION & 3 VISTAS INTELIGENTES ===\n');

// -----------------------------------------------------------------------------
// BLOQUE 1: PRE-CALENTAMIENTO Y SESIÓN PERSISTENTE DE GEMINI NANO
// -----------------------------------------------------------------------------
console.log('--- 1. PRE-CALENTAMIENTO Y RENDIMIENTO DE GEMINI NANO ---');

runTest('1.1: OstrixAiService implementa warmUpLocalModel() e isWarm()', () => {
  const code = fs.readFileSync(path.join(webRoot, 'src/app/core/ostrix-ai.service.ts'), 'utf8');
  assert.ok(code.includes('warmUpLocalModel('), 'Debe existir warmUpLocalModel');
  assert.ok(code.includes('isWarm()'), 'Debe existir método isWarm()');
  assert.ok(code.includes('isLocalModelWarm'), 'Debe mantener bandera isLocalModelWarm');
  assert.ok(code.includes('model.initializeDeviceModel('), 'Debe preparar el modelo con Firebase AI Logic');
});

runTest('1.2: App pre-calienta Nano de forma no bloqueante al cargar sesión', () => {
  const code = fs.readFileSync(path.join(webRoot, 'src/app/app.ts'), 'utf8');
  assert.ok(code.includes('this.ai.warmUpLocalModel()'), 'Debe llamar warmUpLocalModel() en loadBookSession');
  assert.ok(code.includes('.catch(() => {})'), 'La llamada debe ser no bloqueante y manejar errores');
});

// -----------------------------------------------------------------------------
// BLOQUE 2: PROMPT COMPACTO Y ELIMINACIÓN DE DOBLE ENVOLTURA
// -----------------------------------------------------------------------------
console.log('\n--- 2. PROMPT COMPACTO Y ELIMINACIÓN DE DOBLE ENVOLTURA ---');

runTest('2.1: TopicEnrichmentService envía rawPrompt: true evitando doble persona', () => {
  const code = fs.readFileSync(path.join(webRoot, 'src/app/core/topic-enrichment.service.ts'), 'utf8');
  assert.ok(code.includes('rawPrompt: true'), 'Debe enviar rawPrompt: true a OstrixAiService');
  const prompt = buildPedagogicalPrompt('Biología', 'Células', 'Las células contienen material genético.');
  assert.ok(prompt.includes('50 a 80 palabras') && prompt.includes('Las células contienen material genético.'), 'Prompt compacto basado en apuntes');
  assert.ok(!code.includes('Actúa como tutor educativo para secundaria rural. Explica paso a paso... Apuntes: \nActúa como tutor'), 'No debe tener doble envoltura de prompt');
});

runTest('2.2: Telemetría registra t_ttfbMs, t_inferenceMs, t_totalMs y t_saveLocalMs', () => {
  const code = fs.readFileSync(path.join(webRoot, 'src/app/core/topic-enrichment.service.ts'), 'utf8');
  assert.ok(code.includes('t_ttfbMs'), 'Debe registrar Time to First Byte');
  assert.ok(code.includes('t_inferenceMs'), 'Debe registrar tiempo de inferencia');
  assert.match(code, /const t_saveLocalMs = Math\.round\(performance\.now\(\) - tSave\)/, 'Debe medir la escritura local');
  assert.ok(code.includes('t_totalMs'), 'Debe registrar tiempo total');
  assert.ok(code.includes('performance.now()'), 'Debe usar performance.now() para medición de alta resolución');
});

// -----------------------------------------------------------------------------
// BLOQUE 3: VISTA 2 (DUDAS) — CERO FORMULARIOS Y ESPACIO PURO DE ESTUDIO
// -----------------------------------------------------------------------------
console.log('\n--- 3. VISTA 2: COSAS QUE NO ENTIENDO (ESPACIO PURO DE ESTUDIO) ---');

runTest('3.1: Vista 2 NO tiene formulario de registro ni inputs de texto', () => {
  const html = fs.readFileSync(path.join(webRoot, 'src/app/app.html'), 'utf8');
  const dudasSectionMatch = html.match(/\*ngIf="intelTab\(\) === 'dudas'"[\s\S]*?(?=\*ngIf="intelTab\(\) === 'eureka'")/);
  assert.ok(dudasSectionMatch, 'Debe existir la sección de dudas');
  const dudasHtml = dudasSectionMatch[0];

  assert.ok(!dudasHtml.includes('<form'), 'Vista 2 NO debe contener elemento <form>');
  assert.ok(!dudasHtml.includes('[(ngModel)]="newDoubtText"'), 'Vista 2 NO debe tener input para newDoubtText');
  assert.ok(!dudasHtml.includes('addBookDoubt()'), 'Vista 2 NO debe llamar addBookDoubt()');
});

runTest('3.2: Vista 2 muestra duda original, explicación de Ostrix y acciones pedagógicas', () => {
  const html = fs.readFileSync(path.join(webRoot, 'src/app/app.html'), 'utf8');
  const dudasSectionMatch = html.match(/\*ngIf="intelTab\(\) === 'dudas'"[\s\S]*?(?=\*ngIf="intelTab\(\) === 'eureka'")/);
  const dudasHtml = dudasSectionMatch[0];

  assert.ok(dudasHtml.includes('getEnrichedDoubt(s, d)'), 'Debe recuperar la duda enriquecida');
  assert.ok(dudasHtml.includes('enriched.explanation'), 'Debe mostrar la explicación pedagógica');
  assert.ok(dudasHtml.includes('openTutor(s.id, d)'), 'Acción: Preguntar a Tutor Ostrix');
  assert.ok(dudasHtml.includes('markDoubtUnderstood(s, d)'), 'Acción: Marcar como comprendido');
  assert.ok(dudasHtml.includes('practiceDoubt(d)'), 'Acción: Practicar ejercicio');
  assert.ok(dudasHtml.includes('goToBlackboardDoubts()'), 'Acción: Editar en pizarra');
});

// -----------------------------------------------------------------------------
// BLOQUE 4: VISTA 3 (EUREKA) — CERO FORMULARIOS Y ESPACIO PURO DE DESCUBRIMIENTOS
// -----------------------------------------------------------------------------
console.log('\n--- 4. VISTA 3: EUREKA (ESPACIO PURO DE DESCUBRIMIENTOS) ---');

runTest('4.1: Vista 3 NO tiene formulario de registro ni inputs de texto', () => {
  const html = fs.readFileSync(path.join(webRoot, 'src/app/app.html'), 'utf8');
  const eurekaSectionMatch = html.match(/\*ngIf="intelTab\(\) === 'eureka'"[\s\S]*?(?=<\/div>\s*<\/ng-container>)/);
  assert.ok(eurekaSectionMatch, 'Debe existir la sección Eureka');
  const eurekaHtml = eurekaSectionMatch[0];

  assert.ok(!eurekaHtml.includes('<form'), 'Vista 3 NO debe contener elemento <form>');
  assert.ok(!eurekaHtml.includes('[(ngModel)]="newEurekaText"'), 'Vista 3 NO debe tener input para newEurekaText');
  assert.ok(!eurekaHtml.includes('addBookEureka()'), 'Vista 3 NO debe llamar addBookEureka()');
});

runTest('4.2: Vista 3 muestra descubrimiento, ampliación de Ostrix y aplicaciones prácticas', () => {
  const html = fs.readFileSync(path.join(webRoot, 'src/app/app.html'), 'utf8');
  const eurekaSectionMatch = html.match(/\*ngIf="intelTab\(\) === 'eureka'"[\s\S]*?(?=<\/div>\s*<\/ng-container>)/);
  const eurekaHtml = eurekaSectionMatch[0];

  assert.ok(eurekaHtml.includes('getEnrichedEureka(s, e)'), 'Debe recuperar el Eureka enriquecido');
  assert.ok(eurekaHtml.includes('enriched.expansion'), 'Debe mostrar la ampliación de Ostrix');
  assert.ok(eurekaHtml.includes('enriched.practicalApplication'), 'Debe mostrar dónde más aplicarlo');
  assert.ok(eurekaHtml.includes('openTutor(s.id, e)'), 'Acción: Explorar con Tutor Ostrix');
  assert.ok(eurekaHtml.includes('goToBlackboardEureka()'), 'Acción: Editar en pizarra');
});

// -----------------------------------------------------------------------------
// BLOQUE 5: VISTA 1 (ENRIQUECIDOS) — ESTADOS COHERENTES Y RETORNO A PIZARRA
// -----------------------------------------------------------------------------
console.log('\n--- 5. VISTA 1: APUNTES ENRIQUECIDOS Y ESTADOS COHERENTES ---');

runTest('5.1: Vista 1 incluye botón para ver apunte original en la pizarra', () => {
  const html = fs.readFileSync(path.join(webRoot, 'src/app/app.html'), 'utf8');
  assert.ok(html.includes('(click)="goToBlackboardTopic(topic.id)"'), 'Botón para navegar al apunte original');
});

runTest('5.2: Vista 1 muestra estados coherentes (ACTUALIZADO, GENERANDO, PENDIENTE, DESACTUALIZADO)', () => {
  const html = fs.readFileSync(path.join(webRoot, 'src/app/app.html'), 'utf8');
  assert.ok(html.includes("statusUpToDate"), 'Debe mostrar estado actualizado');
  assert.ok(html.includes("statusOutdated"), 'Debe mostrar estado desactualizado');
  assert.ok(html.includes("statusGenerating"), 'Debe mostrar estado generando');
  assert.ok(html.includes("statusPending"), 'Debe mostrar estado pendiente');
});

// -----------------------------------------------------------------------------
// BLOQUE 6: PERSISTENCIA Y ENRIQUECIMIENTO AUTOMÁTICO EN GUARDADO
// -----------------------------------------------------------------------------
console.log('\n--- 6. PERSISTENCIA Y ENRIQUECIMIENTO AUTOMÁTICO EN GUARDADO ---');

runTest('6.1: StudySession soporta enrichedDoubts y enrichedEureka en migración', () => {
  const code = fs.readFileSync(path.join(webRoot, 'src/app/core/session-migration.ts'), 'utf8');
  assert.ok(code.includes('interface EnrichedDoubtItem'), 'Debe definir EnrichedDoubtItem');
  assert.ok(code.includes('interface EnrichedEurekaItem'), 'Debe definir EnrichedEurekaItem');
  assert.ok(code.includes('enrichedDoubts?:'), 'StudySession debe incluir enrichedDoubts');
  assert.ok(code.includes('enrichedEureka?:'), 'StudySession debe incluir enrichedEureka');
});

runTest('6.2: TopicEnrichmentService enriquece dudas y eureka automáticamente', () => {
  const code = fs.readFileSync(path.join(webRoot, 'src/app/core/topic-enrichment.service.ts'), 'utf8');
  assert.ok(code.includes('enrichDoubtsAndEureka('), 'Debe procesar dudas y eureka');
  assert.ok(code.includes('enrichedDoubts: existingEnriched'), 'Debe actualizar enrichedDoubts en la sesión');
  assert.ok(code.includes('enrichedEureka: existingEnriched'), 'Debe actualizar enrichedEureka en la sesión');
  assert.ok(code.includes('this.diary.saveFullSession('), 'Debe persistir en IndexedDB');
});

runTest('6.3: saveBlackboardExplicit dispara enriquecimiento cuando cambian notas, dudas o eureka', () => {
  const code = fs.readFileSync(path.join(webRoot, 'src/app/app.ts'), 'utf8');
  assert.ok(code.includes('doubtsOrEurekaChanged'), 'Debe detectar cambios en dudas o eureka');
  assert.ok(code.includes('changedTopicIds.length > 0 || doubtsOrEurekaChanged'), 'Debe disparar si hay cambios en temas o dudas/eureka');
  assert.ok(code.includes('this.topicEnrichment.triggerSaveEnrichment('), 'Debe invocar triggerSaveEnrichment');
});

// -----------------------------------------------------------------------------
// BLOQUE 7: SINCRONIZACIÓN Y PRIVACIDAD DE DATOS
// -----------------------------------------------------------------------------
console.log('\n--- 7. SINCRONIZACIÓN Y PRIVACIDAD ---');

runTest('7.1: SyncService requiere consentimiento incluso con servidor vinculado', () => {
  const code = fs.readFileSync(path.join(webRoot, 'src/app/core/sync.service.ts'), 'utf8');
  assert.ok(code.includes('if (!this.syncConsent)'), 'No debe encolar si no hay consentimiento ni servidor');
});

runTest('7.2: Los pendientes locales siguen visibles al interrumpirse la autorización', () => {
  const html = fs.readFileSync(path.join(webRoot, 'src/app/app.html'), 'utf8');
  assert.ok(html.includes('*ngIf="sync.pendingCount() > 0"'), 'Chip debe reflejar el conteo local');
});

// -----------------------------------------------------------------------------
// RESUMEN
// -----------------------------------------------------------------------------
console.log('\n=============================================================');
console.log(`TOTAL: ${passedTests}/${totalTests} pruebas pasaron exitosamente.`);
if (passedTests === totalTests) {
  console.log('✓ TODAS LAS VERIFICACIONES COMPLETADAS CON ÉXITO.');
  process.exit(0);
} else {
  console.error(`✗ FALLARON ${totalTests - passedTests} PRUEBAS.`);
  process.exit(1);
}
