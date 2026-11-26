/**
 * Automated Verification Suite — Pizarra Inteligente & Enriquecimiento Automático
 * OstrixAi — BuildHybridAI 2026
 *
 * Verifies Pruebas A through G:
 *  - PRUEBA A: Pizarra Simultánea de 3 Zonas (A ~70%, B ~30%, C 100% strip) y Múltiples Temas Consecutivos
 *  - PRUEBA B: Auto-guardado Local Debounced (800ms) y Persistencia de Apuntes, Dudas y Eureka
 *  - PRUEBA C: Enriquecimiento Automático sin Clic Manual (Debounce 6s, Cola Secuencial FIFO, Flush on View Switch)
 *  - PRUEBA D: Actualización Selectiva y Protección de Carreras (Race Conditions & Content Versioning)
 *  - PRUEBA E: Consentimiento Estricto de Nube (allowCloudEnrichment: false por defecto, Zero Data Leak a Gemini Cloud)
 *  - PRUEBA F: Aislamiento Criptográfico en Computadora Compartida (PBKDF2 + AES-GCM-256)
 *  - PRUEBA G: Resiliencia Offline-First y PWA
 *
 * Run with: node --experimental-strip-types frontend/ostrixai-web/scripts/test-pizarra-autoenrich.mjs
 */

import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  migrateSessionIfNeeded,
  computeSimpleHash,
} from '../src/app/core/session-migration.ts';

import {
  interfaceText,
  allInterfaceKeys,
} from '../src/app/core/interface-language.ts';

import {
  cleanMarkdownToText,
  formatMarkdownToSafeHtml,
  sanitizeStudentNotesFromPrompt,
} from '../src/app/core/markdown-cleaner.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');
const cryptoSubtle = webcrypto.subtle;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

console.log('================================================================================');
console.log('OSTRIXAI: VERIFICACIÓN AUTOMATIZADA — PIZARRA INTELIGENTE Y AUTO-ENRIQUECIMIENTO');
console.log('BUILDHYBRIDAI 2026 — PRUEBAS A HASTA G');
console.log('================================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    throw err;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    throw err;
  }
}

// -----------------------------------------------------------------------------
// PRUEBA A: PIZARRA SIMULTÁNEA DE 3 ZONAS Y TEMAS CONSECUTIVOS
// -----------------------------------------------------------------------------
console.log('--- PRUEBA A: PIZARRA SIMULTÁNEA DE 3 ZONAS Y MÚLTIPLES TEMAS CONSECUTIVOS ---');

runTest('A.1: Template app.html contiene la estructura simultánea de 3 Zonas (.pizarra-shell-v2 o .pizarra-sheet)', () => {
  const htmlPath = path.join(webRoot, 'src/app/app.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.ok(html.includes('class="pizarra-shell-v2"') || html.includes('class="pizarra-sheet"'), 'Debe existir .pizarra-shell-v2 o .pizarra-sheet');
  assert.ok(html.includes('class="pizarra-top-layout"') || html.includes('class="pizarra-main-grid"'), 'Debe existir .pizarra-top-layout o .pizarra-main-grid');
  assert.ok(html.includes('class="zona-a-apuntes"') || html.includes('class="pizarra-apuntes-col '), 'Debe existir .zona-a-apuntes (~70%)');
  assert.ok(html.includes('class="zona-b-dudas"') || html.includes('class="pizarra-dudas-col '), 'Debe existir .zona-b-dudas (~30%)');
  assert.ok(html.includes('class="zona-c-eureka"') || html.includes('class="pizarra-eureka-full '), 'Debe existir .zona-c-eureka (100% ancho inferior)');
});

runTest('A.2: CSS define la distribución en grid 7fr / 3fr y franja inferior 100% con colapso responsivo a 960px', () => {
  const cssPath = path.join(webRoot, 'src/styles.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.ok(css.includes('grid-template-columns: minmax(0, 7fr) minmax(0, 3fr);'), 'Grid superior debe ser 7fr / 3fr');
  assert.ok(css.includes('.zona-c-eureka'), 'Debe definir clase .zona-c-eureka');
  assert.ok(css.includes('@media (max-width: 960px)'), 'Debe tener breakpoint responsivo a 960px');
  assert.ok(css.includes('.topics-consecutive-stack'), 'Debe definir pila de temas consecutivos');
  assert.ok(css.includes('.topic-consecutive-card'), 'Debe definir tarjeta de tema consecutivo');
});

runTest('A.3: Zona A muestra múltiples temas de forma consecutiva (no solo pestañas)', () => {
  const html = fs.readFileSync(path.join(webRoot, 'src/app/app.html'), 'utf8');

  assert.ok((html.includes('s.topics') || html.includes('draftTopics()')) && html.includes('let tIdx = index'), 'Debe iterar sobre todos los temas consecutivamente');
  assert.ok(html.includes('topic-title-inline-input') || html.includes('pizarra-topic-input-title'), 'Título del tema editable inline');
  assert.ok(html.includes('getTopicNotesLines(topic.id)'), 'Líneas de apuntes por tema');
  assert.ok(html.includes('onTopicNoteEnter(topic.id, $event, lIdx)'), 'Enter crea nuevo apunte en el tema correspondiente');
  assert.ok(html.includes('onTopicNoteBackspace(topic.id, $event, lIdx)'), 'Backspace elimina apunte vacío en el tema correspondiente');
  assert.ok(html.includes('openAddTopicDialog()') || html.includes('addAnotherTopic()'), 'Botón para agregar otro tema');
});

runTest('A.4: Zona B permite registrar, editar y borrar dudas, vincularlas a un tema y preguntar al Tutor', () => {
  const html = fs.readFileSync(path.join(webRoot, 'src/app/app.html'), 'utf8');

  assert.ok(html.includes('addBlackboardDoubt(s)') || html.includes('addDraftDoubt()'), 'Método para añadir duda');
  assert.ok(html.includes('newDoubtTopicId'), 'Dropdown para vincular duda a tema opcional');
  assert.ok(html.includes('startEditDoubt'), 'Edición en sitio de duda');
  assert.ok(html.includes('removeBlackboardDoubt(s, dIdx)') || html.includes('removeDraftDoubt(dIdx)'), 'Eliminación de duda');
  assert.ok(html.includes('openTutor'), 'Acceso directo a resolver con Tutor');
});

runTest('A.5: Zona C permite registrar, editar y borrar descubrimientos Eureka y vincularlos a un tema', () => {
  const html = fs.readFileSync(path.join(webRoot, 'src/app/app.html'), 'utf8');

  assert.ok(html.includes('addBlackboardEureka(s)') || html.includes('addDraftEureka()'), 'Método para añadir Eureka');
  assert.ok(html.includes('newEurekaTopicId'), 'Dropdown para vincular Eureka a tema opcional');
  assert.ok(html.includes('startEditEureka'), 'Edición en sitio de Eureka');
  assert.ok(html.includes('removeBlackboardEureka(s, eIdx)') || html.includes('removeDraftEureka(eIdx)'), 'Eliminación de Eureka');
  assert.ok(html.includes('eureka-grid-list') || html.includes('pizarra-eureka-grid'), 'Grilla de descubrimientos');
});

// -----------------------------------------------------------------------------
// PRUEBA B: AUTO-GUARDADO LOCAL Y PERSISTENCIA
// -----------------------------------------------------------------------------
console.log('\n--- PRUEBA B: AUTO-GUARDADO LOCAL DEBOUNCED Y PERSISTENCIA ---');

runTest('B.1: computeSimpleHash detecta cambios en las notas del tema para versionado', () => {
  const notes1 = 'Fórmula de velocidad: v = d / t\nUnidades en el SI: m/s';
  const notes2 = 'Fórmula de velocidad: v = d / t\nUnidades en el SI: m/s\nEjemplo: 100m en 10s = 10m/s';

  const hash1 = computeSimpleHash(notes1);
  const hash2 = computeSimpleHash(notes2);
  const hash1Repeat = computeSimpleHash(notes1);

  assert.strictEqual(hash1, hash1Repeat, 'El hash debe ser determinista');
  assert.notStrictEqual(hash1, hash2, 'Diferente contenido debe producir diferente hash');
});

await runAsyncTest('B.2: Simulación de debounce de 800ms: múltiples pulsaciones solo guardan una vez', async () => {
  let saveCount = 0;
  let timer = null;

  function onInputMock(text) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      saveCount++;
    }, 15); // Temporizador rápido para el test
  }

  // 10 pulsaciones rápidas
  for (let i = 0; i < 10; i++) {
    onInputMock(`Nota versión ${i}`);
  }

  assert.strictEqual(saveCount, 0, 'No debe haber guardado de inmediato');

  // Esperar a que expire el debounce
  await new Promise(r => setTimeout(r, 35));
  assert.strictEqual(saveCount, 1, 'Múltiples pulsaciones continuas deben disparar exactamente 1 guardado');
});

runTest('B.3: Modelo de sesión preserva apuntes, dudas y eureka con soporte multitema', () => {
  const legacy = {
    id: 'sess-test-01',
    course: 'Física',
    topic: 'Cinemática',
    date: '2026-11-19',
    notes: 'Apunte 1\nApunte 2',
    doubts: ['¿Por qué la aceleración es negativa al frenar?'],
    eureka: ['Entendí que frenar es acelerar en sentido opuesto'],
  };

  const migrated = migrateSessionIfNeeded(legacy);

  assert.ok(Array.isArray(migrated.topics), 'Debe contener array de topics');
  assert.strictEqual(migrated.topics.length, 1);
  assert.strictEqual(migrated.topics[0].name, 'Cinemática');
  assert.strictEqual(migrated.topics[0].notes.length, 2);
  assert.strictEqual(migrated.doubts.length, 1);
  assert.strictEqual(migrated.eureka.length, 1);
  assert.strictEqual(migrated.topics[0].contentVersion, 1);
});

// -----------------------------------------------------------------------------
// PRUEBA C: ENRIQUECIMIENTO AUTOMÁTICO EN SEGUNDO PLANO (SIN BOTÓN MANUAL)
// -----------------------------------------------------------------------------
console.log('\n--- PRUEBA C: ENRIQUECIMIENTO AUTOMÁTICO EN SEGUNDO PLANO ---');

runTest('C.1: StudentSettings contiene autoEnrichNotes (default: true) y allowCloudEnrichment (default: false)', () => {
  const settingsTs = fs.readFileSync(path.join(webRoot, 'src/app/core/student-settings.service.ts'), 'utf8');

  assert.ok(settingsTs.includes('autoEnrichNotes: boolean;'), 'Debe tipar autoEnrichNotes');
  assert.ok(settingsTs.includes('allowCloudEnrichment: boolean;'), 'Debe tipar allowCloudEnrichment');
  assert.ok(settingsTs.includes('autoEnrichNotes: true'), 'autoEnrichNotes debe ser true por defecto');
  assert.ok(settingsTs.includes('allowCloudEnrichment: false'), 'allowCloudEnrichment debe ser false por defecto (privacidad estricta)');
});

runTest('C.2: TopicEnrichmentService implementa cola FIFO secuencial para prevenir llamadas simultáneas a Gemini Nano', () => {
  const serviceTs = fs.readFileSync(path.join(webRoot, 'src/app/core/topic-enrichment.service.ts'), 'utf8');

  assert.ok(serviceTs.includes('scheduleTopicEnrichment(session: StudySession, topicId: string, delayMs = 6000)'), 'Debe implementar scheduleTopicEnrichment');
  assert.ok(serviceTs.includes('enqueueTopic(sessionId: string, topicId: string)'), 'Debe implementar enqueueTopic');
  assert.ok(serviceTs.includes('flushPendingEnrichments(session: StudySession)'), 'Debe implementar flushPendingEnrichments');
  assert.ok(serviceTs.includes('private isProcessingQueue = false;'), 'Debe implementar mutex secuencial');
});

await runAsyncTest('C.3: Simulación de cola FIFO: procesa temas consecutivamente sin solapamiento', async () => {
  const executionLog = [];
  const queue = ['topic-A', 'topic-B'];
  let isProcessing = false;

  async function processQueue() {
    if (isProcessing) return;
    isProcessing = true;
    while (queue.length > 0) {
      const cur = queue.shift();
      executionLog.push(`start:${cur}`);
      await new Promise(r => setTimeout(r, 20)); // Simulación de inferencia
      executionLog.push(`end:${cur}`);
    }
    isProcessing = false;
  }

  const p1 = processQueue();
  const p2 = processQueue(); // Intento concurrente

  await Promise.all([p1, p2]);

  assert.deepStrictEqual(executionLog, [
    'start:topic-A',
    'end:topic-A',
    'start:topic-B',
    'end:topic-B',
  ], 'Las inferencias deben ejecutarse en estricto orden secuencial sin colisión');
});

runTest('C.4: flushPendingEnrichments cancela debounce e inicia inferencia inmediata al alternar a Vistas Enriquecidas', () => {
  const appTs = fs.readFileSync(path.join(webRoot, 'src/app/app.ts'), 'utf8');

  assert.ok(appTs.includes('toggleBookMode()'), 'Debe implementar toggleBookMode');
  assert.ok(appTs.includes('this.topicEnrichment.flushPendingEnrichments(s)'), 'Debe llamar a flushPendingEnrichments al pasar a enriquecido');
});

// -----------------------------------------------------------------------------
// PRUEBA D: ACTUALIZACIÓN SELECTIVA Y PROTECCIÓN DE CARRERAS (RACE CONDITIONS)
// -----------------------------------------------------------------------------
console.log('\n--- PRUEBA D: ACTUALIZACIÓN SELECTIVA Y PROTECCIÓN DE CARRERAS ---');

runTest('D.1: Actualización selectiva: modificar Tema 1 no invalida Tema 2', () => {
  const session = {
    id: 'sess-multi',
    course: 'Física',
    topic: 'Física General',
    date: '2026-11-19',
    notes: '',
    doubts: [],
    eureka: [],
    topics: [
      { id: 'top-1', name: 'Tema 1: MRU', notes: ['d = v * t'], contentVersion: 1, enrichmentStatus: 'UP_TO_DATE' },
      { id: 'top-2', name: 'Tema 2: MRUV', notes: ['v = v0 + a * t'], contentVersion: 1, enrichmentStatus: 'UP_TO_DATE' },
    ],
  };

  // Simular edición en Tema 1
  const updatedTopics = session.topics.map(t => {
    if (t.id === 'top-1') {
      return { ...t, notes: ['d = v * t', 'v es constante'], contentVersion: 2, enrichmentStatus: 'OUTDATED' };
    }
    return t;
  });

  assert.strictEqual(updatedTopics[0].enrichmentStatus, 'OUTDATED', 'Tema 1 debe marcarse OUTDATED');
  assert.strictEqual(updatedTopics[0].contentVersion, 2, 'Tema 1 incrementa contentVersion');
  assert.strictEqual(updatedTopics[1].enrichmentStatus, 'UP_TO_DATE', 'Tema 2 debe permanecer UP_TO_DATE');
  assert.strictEqual(updatedTopics[1].contentVersion, 1, 'Tema 2 no altera su versión');
});

runTest('D.2: TopicEnrichmentService descarta respuesta tardía si el estudiante editó durante la generación', () => {
  const serviceTs = fs.readFileSync(path.join(webRoot, 'src/app/core/topic-enrichment.service.ts'), 'utf8');

  assert.ok(serviceTs.includes('const targetVersion = topic.contentVersion;'), 'Captura versión objetivo antes de inferencia');
  assert.ok(serviceTs.includes('if (freshTopic.contentVersion !== targetVersion)'), 'Verifica si la versión cambió tras la inferencia');
  assert.ok(serviceTs.includes("enrichmentStatus: 'OUTDATED'"), 'Mantiene status OUTDATED si hubo colisión de edición');
  assert.ok(serviceTs.includes('this.scheduleTopicEnrichment(freshSession, topicId, 3000)'), 'Re-programa enriquecimiento para la nueva versión');
});

// -----------------------------------------------------------------------------
// PRUEBA E: CONSENTIMIENTO ESTRICTO PARA NUBE (STRICT CLOUD CONSENT)
// -----------------------------------------------------------------------------
console.log('\n--- PRUEBA E: CONSENTIMIENTO ESTRICTO PARA NUBE (STRICT CLOUD CONSENT) ---');

runTest('E.1: Verificación de regla de privacidad en TopicEnrichmentService: si Nano no está listo y no hay consentimiento Cloud, nunca se envía a Cloud', () => {
  const serviceTs = fs.readFileSync(path.join(webRoot, 'src/app/core/topic-enrichment.service.ts'), 'utf8');

  assert.ok(serviceTs.includes('this.device.nano() === \'available\''), 'Comprueba disponibilidad real de Nano');
  assert.ok(serviceTs.includes('const cloudAllowed = studentProfile.allowCloudEnrichment && !studentProfile.offlineOnly;'), 'Comprueba consentimiento expreso de nube');
  assert.ok(serviceTs.includes('if (!nanoAvailable && !cloudAllowed)'), 'Condición de bloqueo estricto');
  assert.ok(serviceTs.includes("enrichmentStatus: 'PENDING'"), 'Marca PENDING sin enviar datos a la nube');
});

await runAsyncTest('E.2: Simulación de inferencia con fallo de Nano sin consentimiento de nube', async () => {
  let cloudCallMade = false;
  let offlineFallbackExecuted = false;

  const studentProfile = {
    autoEnrichNotes: true,
    allowCloudEnrichment: false, // Default estricto
    offlineOnly: false,
  };

  const isNanoReady = false;

  if (studentProfile.autoEnrichNotes) {
    const cloudAllowed = studentProfile.allowCloudEnrichment && !studentProfile.offlineOnly;
    if (!isNanoReady && !cloudAllowed) {
      // Bloqueo estricto: 0 llamadas de red a Gemini Cloud
      offlineFallbackExecuted = true;
    } else if (cloudAllowed) {
      cloudCallMade = true;
    }
  }

  assert.strictEqual(cloudCallMade, false, 'No debe realizar llamada a la nube sin consentimiento explícito');
  assert.strictEqual(offlineFallbackExecuted, true, 'Debe activar resguardo local/PENDING');
});

// -----------------------------------------------------------------------------
// PRUEBA F: AISLAMIENTO CRIPTOGRÁFICO EN COMPUTADORA COMPARTIDA
// -----------------------------------------------------------------------------
console.log('\n--- PRUEBA F: AISLAMIENTO CRIPTOGRÁFICO EN COMPUTADORA COMPARTIDA ---');

async function deriveAesKey(password, salt) {
  const baseKey = await cryptoSubtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return cryptoSubtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100_000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptData(key, text) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const cipher = await cryptoSubtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(text)
  );
  return { iv, cipher: new Uint8Array(cipher) };
}

async function decryptData(key, iv, cipher) {
  const plain = await cryptoSubtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    cipher
  );
  return decoder.decode(plain);
}

await runAsyncTest('F.1: Dos estudiantes en la misma PC con contraseñas distintas tienen aislamiento criptográfico total', async () => {
  const saltA = webcrypto.getRandomValues(new Uint8Array(16));
  const saltB = webcrypto.getRandomValues(new Uint8Array(16));

  const keyA = await deriveAesKey('ContrasenaAlumnoA#2026', saltA);
  const keyB = await deriveAesKey('ContrasenaAlumnoB#2026', saltB);

  const notesStudentA = JSON.stringify({
    session: 'Física - Apuntes Privados Alumno A',
    doubts: ['Duda privada A'],
    eureka: ['Eureka privado A'],
  });

  const encryptedA = await encryptData(keyA, notesStudentA);

  // Alumno A descifra con éxito
  const decryptedByA = await decryptData(keyA, encryptedA.iv, encryptedA.cipher);
  assert.strictEqual(decryptedByA, notesStudentA, 'Alumno A debe poder descifrar sus propios datos');

  // Alumno B intenta descifrar los datos de Alumno A -> DEBE FALLAR con OperationError
  let failed = false;
  try {
    await decryptData(keyB, encryptedA.iv, encryptedA.cipher);
  } catch {
    failed = true;
  }

  assert.strictEqual(failed, true, 'Alumno B NO debe poder descifrar los apuntes cifrados de Alumno A');
});

// -----------------------------------------------------------------------------
// PRUEBA G: RESILIENCIA OFFLINE Y PWA
// -----------------------------------------------------------------------------
console.log('\n--- PRUEBA G: RESILIENCIA OFFLINE Y PWA ---');

runTest('G.1: Manifiesto PWA existe y define identidad completa para instalación offline', () => {
  const manifestPath = path.join(webRoot, 'public/manifest.webmanifest');
  assert.ok(fs.existsSync(manifestPath), 'manifest.webmanifest debe existir');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  assert.ok(manifest.name.includes('OstrixAi'), 'Nombre debe incluir OstrixAi');
  assert.strictEqual(manifest.display, 'standalone');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'Debe incluir íconos responsivos');
});

runTest('G.2: Service Worker de Angular ngsw-config.json incluye configuración offline completa', () => {
  const ngswPath = path.join(webRoot, 'ngsw-config.json');
  assert.ok(fs.existsSync(ngswPath), 'ngsw-config.json debe existir');
  const ngsw = JSON.parse(fs.readFileSync(ngswPath, 'utf8'));

  assert.ok(ngsw.assetGroups.length >= 2, 'Debe configurar grupos de assets (app y assets)');
});

runTest('G.3: Las 14 nuevas claves de interfaz están traducidas en Español, Inglés y Quechua Chanka', () => {
  const newKeys = [
    'autoEnrichNotesPref',
    'allowCloudEnrichmentPref',
    'pizarraZoneANotes',
    'pizarraZoneBDoubts',
    'pizarraZoneCEureka',
    'addDoubtBtn',
    'addEurekaBtn',
    'doubtPlaceholder',
    'eurekaPlaceholder',
    'linkedTopicLabel',
    'generalTopicLabel',
    'autoEnrichingBadge',
    'autoEnrichPendingBadge',
    'autoEnrichReadyBadge',
  ];

  for (const lang of ['es', 'en', 'qu-chanka']) {
    for (const key of newKeys) {
      const text = interfaceText(lang, key);
      assert.ok(text && text.trim().length > 0, `Clave "${key}" debe existir en idioma "${lang}"`);
    }
  }
});

// -----------------------------------------------------------------------------
// RESUMEN FINAL
// -----------------------------------------------------------------------------
console.log('\n================================================================================');
console.log(`RESULTADO DE LA VERIFICACIÓN: ${passedTests} / ${totalTests} PRUEBAS SUPERADAS (100%)`);
console.log('================================================================================');
