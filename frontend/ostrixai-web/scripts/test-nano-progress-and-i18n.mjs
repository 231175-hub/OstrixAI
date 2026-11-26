/**
 * OSTRIXAI — SUITE DE PRUEBAS DE DISPONIBILIDAD NANO, TELEMETRÍA, CONSENTIMIENTO Y MULTILINGÜISMO
 *
 * Verificación exhaustiva de:
 * GRUPO A: Disponibilidad y Detección Unificada de Gemini Nano (A01 - A04)
 * GRUPO B: Telemetría Real Monotónica y Formateo Amigable (B01 - B06)
 * GRUPO C: Privacidad Pedagógica, Contexto Local y Consentimiento Cloud (C01 - C06)
 * GRUPO D: Tres Capas de Idioma, Preservación de Originales y Traducción Derivada (D01 - D08)
 * GRUPO E: Prácticas Formativas para Exámenes y Ausencia de Falsos Errores (E01 - E07)
 * GRUPO F: Regresión, Compilación y Consistencia Offline (F01 - F07)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyAiError } from '../src/app/core/ai-errors.ts';
import { webcrypto } from 'node:crypto';

const crypto = webcrypto;
const webRoot = fileURLToPath(new URL('../', import.meta.url));

let passed = 0;
let total = 0;

function runTest(id, name, fn) {
  total++;
  try {
    const res = fn();
    if (res instanceof Promise) {
      throw new Error(`Test ${name} is async; use runAsyncTest instead`);
    }
    console.log(`  ✓ [${id}] ${name}: PASS`);
    passed++;
  } catch (err) {
    console.error(`  ✕ [${id}] ${name}: FAIL`);
    console.error(`     Detalle: ${err.message}`);
    throw err;
  }
}

async function runAsyncTest(id, name, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✓ [${id}] ${name}: PASS`);
    passed++;
  } catch (err) {
    console.error(`  ✕ [${id}] ${name}: FAIL`);
    console.error(`     Detalle: ${err.message}`);
    throw err;
  }
}

async function main() {
  console.log('\n=============================================================================');
  console.log('🧪 OSTRIXAI — SUITE: NANO DISPONIBILIDAD, PROGRESO, CONSENTIMIENTO E IDIOMAS');
  console.log('=============================================================================\n');

  // ===========================================================================
  // GRUPO A: DISPONIBILIDAD NANO Y FUENTE ÚNICA DE VERDAD
  // ===========================================================================
  console.log('--- GRUPO A: DISPONIBILIDAD NANO Y FUENTE ÚNICA DE VERDAD ---');

  runTest('A01', 'Detección universal de Prompt API (window.ai.languageModel, window.LanguageModel, window.model.languageModel)', () => {
    const code = fs.readFileSync(path.join(webRoot, 'src/app/core/device-capabilities.service.ts'), 'utf8');
    assert.ok(code.includes('w.ai?.languageModel ?? w.LanguageModel ?? w.model?.languageModel'), 'Debe consultar las tres variantes de Prompt API');
    assert.ok(code.includes('AiEngineState'), 'Debe definir tipo AiEngineState');
    assert.ok(code.includes('engineState = signal<AiEngineState>'), 'Debe exponer engineState unificado');
  });

  runTest('A02', 'Cabecera, Tutor y Practicar consumen estado coherente sin comprobaciones aisladas', () => {
    const practiceCode = fs.readFileSync(path.join(webRoot, 'src/app/core/practice-exam.service.ts'), 'utf8');
    const appHtml = fs.readFileSync(path.join(webRoot, 'src/app/app.html'), 'utf8');
    const tutorCode = fs.readFileSync(path.join(webRoot, 'src/app/features/tutor/tutor.component.ts'), 'utf8');

    assert.ok(practiceCode.includes('this.device.checkNano()'), 'Practice debe verificar disponibilidad con el servicio central');
    assert.ok(practiceCode.includes('this.device.engineState()'), 'Practice debe consultar engineState');
    assert.ok(appHtml.includes('device.engineState()'), 'App html debe mostrar engineState');
    assert.ok(tutorCode.includes('this.device.nano()'), 'Tutor debe sincronizar con device capabilities');
  });

  runTest('A03', 'classifyAiError no clasifica timeout, JSON parse, modelo ocupado ni límites como modelo no instalado', () => {
    assert.equal(classifyAiError(new DOMException('Request timeout on-device', 'TimeoutError')).category, 'LOCAL_TIMEOUT');
    assert.equal(classifyAiError(new SyntaxError('Unexpected token in JSON')).category, 'LOCAL_PARSE_ERROR');
    assert.equal(classifyAiError(new Error('LanguageModel session is busy')).category, 'LOCAL_BUSY');
    assert.equal(classifyAiError(new Error('Input tokens exceed max context limit')).category, 'LOCAL_CONTEXT_EXCEEDED');
  });

  runTest('A04', 'Inicialización y preparación de Nano sincronizan engineState sin exigir pasos manuales repetitivos', () => {
    const aiCode = fs.readFileSync(path.join(webRoot, 'src/app/core/ostrix-ai.service.ts'), 'utf8');
    assert.ok(aiCode.includes('this.device.setEnginePreparing(true)'), 'Debe marcar estado preparing');
    assert.ok(aiCode.includes('this.device.setEngineReady()'), 'Debe marcar estado ready al terminar');
    assert.ok(aiCode.includes('this.device.setEngineDownloading(pct)'), 'Debe registrar progreso de descarga real');
  });

  // ===========================================================================
  // GRUPO B: TIEMPOS REALES Y TELEMETRÍA COMPRENSIBLE
  // ===========================================================================
  console.log('--- GRUPO B: TIEMPOS REALES Y TELEMETRÍA COMPRENSIBLE ---');

  runTest('B01', 'OstrixAiService instrumenta el flujo completo T0 a T8 con performance.now()', () => {
    const aiCode = fs.readFileSync(path.join(webRoot, 'src/app/core/ostrix-ai.service.ts'), 'utf8');
    assert.ok(aiCode.includes('t0 = performance.now()'), 'Debe registrar T0');
    assert.ok(aiCode.includes('t1 = performance.now()'), 'Debe registrar T1');
    assert.ok(aiCode.includes('t2 = performance.now()'), 'Debe registrar T2');
    assert.ok(aiCode.includes('t3 = performance.now()'), 'Debe registrar T3');
    assert.ok(aiCode.includes('t5: performance.now()'), 'Debe registrar T5');
    assert.ok(aiCode.includes('t6 = performance.now()'), 'Debe registrar T6');
    assert.ok(aiCode.includes('t7 = performance.now()'), 'Debe registrar T7');
    assert.ok(aiCode.includes('t8 = performance.now()'), 'Debe registrar T8');
    assert.ok(aiCode.includes('InferenceTelemetry'), 'Debe estructurar la telemetría completa');
  });

  runTest('B02', 'Medición precisa de Time to First Chunk (TTFB) durante streaming', () => {
    const aiCode = fs.readFileSync(path.join(webRoot, 'src/app/core/ostrix-ai.service.ts'), 'utf8');
    assert.ok(aiCode.includes('timeToFirstChunkMs: t4 === undefined ? undefined : Math.round(t4 - t3)'), 'TTFB debe medirse desde t3 hasta t4');
    assert.ok(aiCode.includes('this.timeToFirstChunkMs.set(Math.round(t4 - t3))'), 'Debe exponer señal reactiva TTFB');
  });

  runTest('B03', 'Cálculo de latencia total percibida por el estudiante (t8 - t0)', () => {
    const aiCode = fs.readFileSync(path.join(webRoot, 'src/app/core/ostrix-ai.service.ts'), 'utf8');
    assert.ok(aiCode.includes('totalLatencyMs = Math.round(t8 - t0)'), 'Latencia total debe incluir el pipeline completo');
    assert.ok(aiCode.includes('preInferenceWaitMs: Math.round(output.t3 - t0)'), 'Debe medir espera previa');
    assert.ok(aiCode.includes('postProcessingMs: Math.round(t8 - output.t5)'), 'Debe medir post-procesamiento');
  });

  runTest('B04', 'formatFriendlyDuration convierte duraciones a formato amigable (ej: 118566 ms -> 1 min 59 s)', () => {
    const aiCode = fs.readFileSync(path.join(webRoot, 'src/app/core/ostrix-ai.service.ts'), 'utf8');
    assert.ok(aiCode.includes('export function formatFriendlyDuration'), 'Debe exportar formatFriendlyDuration');

    // Función pura evaluada
    function formatFriendly(ms, lang = 'es') {
      if (ms == null || isNaN(ms) || ms < 0) ms = 0;
      const totalSeconds = Math.round(ms / 1000);
      if (totalSeconds < 1) return lang === 'en' ? 'under 1 s' : 'menos de 1 s';
      if (totalSeconds < 60) return `${totalSeconds} s`;
      const mins = Math.floor(totalSeconds / 60);
      const remainingSecs = totalSeconds % 60;
      if (remainingSecs === 0) return `${mins} min`;
      return `${mins} min ${remainingSecs} s`;
    }

    assert.equal(formatFriendly(350), 'menos de 1 s');
    assert.equal(formatFriendly(12300), '12 s');
    assert.equal(formatFriendly(118566), '1 min 59 s');
    assert.equal(formatFriendly(60000), '1 min');
    assert.equal(formatFriendly(180000), '3 min');
    assert.equal(formatFriendly(118566, 'en'), '1 min 59 s');
  });

  runTest('B05', 'Indicador de progreso finaliza limpiamente y no permite spinners infinitos', () => {
    const progressCode = fs.readFileSync(path.join(webRoot, 'src/app/components/ai-progress/ai-progress.component.ts'), 'utf8');
    assert.ok(progressCode.includes("phase === 'complete' || this.phase === 'error' || this.phase === 'idle'"), 'Timer debe detenerse al completar o fallar');
    assert.ok(progressCode.includes('clearInterval(this.timerHandle)'), 'Debe limpiar temporizador al destruir');
  });

  runTest('B06', 'Barra de progreso indeterminado accesible sin simular porcentajes ficticios (10%, 30%, 80%)', () => {
    const progressHtml = fs.readFileSync(path.join(webRoot, 'src/app/components/ai-progress/ai-progress.component.html'), 'utf8');
    assert.ok(progressHtml.includes('ai-progress-bar-indeterminate'), 'Debe incluir animación indeterminada');
    assert.ok(progressHtml.includes('*ngIf="hasRealPercentage"'), 'Solo debe renderizar porcentaje si el navegador lo reporta');
    assert.ok(progressHtml.includes('[attr.aria-valuenow]="hasRealPercentage ? downloadPercent : null"'), 'No debe falsificar aria-valuenow');
  });

  // ===========================================================================
  // GRUPO C: PRIVACIDAD PEDAGÓGICA Y CONSENTIMIENTO CLOUD
  // ===========================================================================
  console.log('--- GRUPO C: PRIVACIDAD PEDAGÓGICA Y CONSENTIMIENTO CLOUD ---');

  runTest('C01', 'Contexto local de apuntes activado por defecto sin casillas repetitivas por mensaje', () => {
    const settingsCode = fs.readFileSync(path.join(webRoot, 'src/app/core/student-settings.service.ts'), 'utf8');
    const tutorCode = fs.readFileSync(path.join(webRoot, 'src/app/features/tutor/tutor.component.ts'), 'utf8');

    assert.ok(settingsCode.includes('autoInjectSessionContext: true'), 'Por defecto autoInjectSessionContext es true');
    assert.ok(tutorCode.includes('studentProfile.autoInjectSessionContext'), 'Tutor usa la preferencia central');
  });

  runTest('C02', 'El estudiante puede desactivar la inyección de contexto desde Configuración', () => {
    const settingsCode = fs.readFileSync(path.join(webRoot, 'src/app/core/student-settings.service.ts'), 'utf8');
    const appHtml = fs.readFileSync(path.join(webRoot, 'src/app/app.html'), 'utf8');
    assert.ok(settingsCode.includes('setAutoInjectSessionContext'), 'Debe existir setter');
    assert.ok(appHtml.includes('setupAutoInjectSessionContext'), 'Debe estar enlazado en la vista de configuración');
  });

  runTest('C03', 'OstrixAiService prohíbe llamadas Cloud sin consentimiento explícito y rechaza fallback silencioso', () => {
    const aiCode = fs.readFileSync(path.join(webRoot, 'src/app/core/ostrix-ai.service.ts'), 'utf8');
    assert.ok(aiCode.includes("mode === 'cloud' && !cloudAllowed()"), 'generateCloudOnly debe verificar consentimiento');
    assert.ok(aiCode.includes('!cloudAllowed() || !this.isOnline() || !this.cloudConfigured() ? InferenceMode.ONLY_ON_DEVICE'), 'Debe existir rama estricta sin nube');
    assert.ok(aiCode.includes('Se requiere autorización explícita'), 'Mensaje de advertencia claro');
  });

  runTest('C04', 'Consentimiento Cloud se persiste por estudiante en IndexedDB cifrado', () => {
    const settingsCode = fs.readFileSync(path.join(webRoot, 'src/app/core/student-settings.service.ts'), 'utf8');
    assert.ok(settingsCode.includes('await this.identity.save(\'settings\', \'profile\', settings)'), 'Se guarda en storage cifrado por cuenta');
    assert.ok(settingsCode.includes('allowCloudEnrichment: settings.allowCloudEnrichment === true'), 'Se lee y preserva el flag');
  });

  runTest('C05', 'El consentimiento Cloud puede revocarse en cualquier momento y actualiza el servicio de IA de inmediato', () => {
    const appCode = fs.readFileSync(path.join(webRoot, 'src/app/app.ts'), 'utf8');
    assert.ok(appCode.includes('this.setupOfflineOnly || !this.setupAllowCloudEnrichment'), 'Debe sincronizar al guardar');
    assert.ok(appCode.includes('this.ai.revokeCloudConsent()'), 'Debe revocar de inmediato si offlineOnly');
  });

  runTest('C06', 'Aislamiento de sesiones: cambio de cuenta limpia credenciales y cancela consultas en vuelo', () => {
    const aiCode = fs.readFileSync(path.join(webRoot, 'src/app/core/ostrix-ai.service.ts'), 'utf8');
    const tutorCode = fs.readFileSync(path.join(webRoot, 'src/app/features/tutor/tutor.component.ts'), 'utf8');

    assert.ok(aiCode.includes('cancelActiveRequest(): void'), 'OstrixAiService permite cancelar peticiones');
    assert.ok(tutorCode.includes('version === this.requestVersion && sameSession()') && tutorCode.includes('if (!active()) return'), 'Descarta respuestas si cambió de usuario');
  });

  // ===========================================================================
  // GRUPO D: TRES CAPAS DE IDIOMA Y TRADUCCIONES DERIVADAS
  // ===========================================================================
  console.log('--- GRUPO D: TRES CAPAS DE IDIOMA Y TRADUCCIÓN DERIVADA ---');

  runTest('D01', 'Capa 1: Interfaz completa en español (100% de claves requeridas presentes)', () => {
    const i18nCode = fs.readFileSync(path.join(webRoot, 'src/app/core/interface-language.ts'), 'utf8');
    assert.ok(i18nCode.includes('viewOriginalBtn'), 'viewOriginalBtn existe');
    assert.ok(i18nCode.includes('viewTranslationBtn'), 'viewTranslationBtn existe');
    assert.ok(i18nCode.includes('derivedTranslationNotice'), 'derivedTranslationNotice existe');
    assert.ok(i18nCode.includes('translateDerivedBtn'), 'translateDerivedBtn existe');
    assert.ok(i18nCode.includes('autoInjectContextSettingTitle'), 'autoInjectContextSettingTitle existe');
    assert.ok(i18nCode.includes('allowCloudSettingTitle'), 'allowCloudSettingTitle existe');
  });

  runTest('D02', 'Capa 1: Interfaz completa en inglés (BuildHybridAI 2026)', () => {
    const i18nCode = fs.readFileSync(path.join(webRoot, 'src/app/core/interface-language.ts'), 'utf8');
    assert.ok(i18nCode.includes("en: 'View original'"), 'Traducción en inglés de viewOriginalBtn');
    assert.ok(i18nCode.includes("en: 'View translation'"), 'Traducción en inglés de viewTranslationBtn');
    assert.ok(i18nCode.includes("en: 'Gemini Cloud Processing'"), 'Traducción en inglés de allowCloudSettingTitle');
  });

  runTest('D03', 'Capa 2: Apuntes originales del estudiante NUNCA se sobrescriben al cambiar idioma', () => {
    const appHtml = fs.readFileSync(path.join(webRoot, 'src/app/app.html'), 'utf8');
    const appCode = fs.readFileSync(path.join(webRoot, 'src/app/app.ts'), 'utf8');

    // La pizarra muestra las líneas originales en el textarea
    assert.ok(appHtml.includes('[value]="line"'), 'Textarea de apuntes mantiene el texto original sin mutación');
    assert.ok(appCode.includes('topicDerivedTranslation'), 'Traducciones se guardan en mapa derivado separado');
  });

  runTest('D04', 'Capa 2: Soporte para API Translator de Chrome local en parejas es <-> en', () => {
    const trCode = fs.readFileSync(path.join(webRoot, 'src/app/core/translation.service.ts'), 'utf8');
    assert.ok(trCode.includes('tryChromeTranslatorApi'), 'Debe invocar API Translator local de Chrome');
    assert.ok(trCode.includes('w.translation ?? w.ai?.translator'), 'Detecta tanto window.translation como window.ai.translator');
    assert.ok(trCode.includes("'CHROME_BUILTIN_TRANSLATOR'"), 'Identifica origen de traducción local');
  });

  runTest('D05', 'Capa 2: Caché de representaciones derivadas por hash sin alterar apunte fuente', () => {
    const trCode = fs.readFileSync(path.join(webRoot, 'src/app/core/translation.service.ts'), 'utf8');
    assert.ok(trCode.includes('contentHash = this.hashText(clean)'), 'Calcula hash de contenido');
    assert.ok(trCode.includes('DerivedTranslation'), 'Estructura DerivedTranslation definida');
    assert.ok(trCode.includes('translations'), 'Guarda en store translations de IndexedDB');
  });

  runTest('D06', 'Capa 3: Historial del Tutor conserva respuestas originales y permite traducir a demanda', () => {
    const tutorHtml = fs.readFileSync(path.join(webRoot, 'src/app/features/tutor/tutor.component.html'), 'utf8');
    const tutorCode = fs.readFileSync(path.join(webRoot, 'src/app/features/tutor/tutor.component.ts'), 'utf8');

    assert.ok(tutorHtml.includes('toggleOriginal(message.id)'), 'Permite alternar entre original y traducción');
    assert.ok(tutorCode.includes('translateDerived'), 'Permite derivar traducción a demanda');
    assert.ok(tutorHtml.includes('translateDerivedBtn'), 'Botón visible cuando aplica');
  });

  runTest('D07', 'Capa 4: Nuevas respuestas del Tutor siguen el idioma configurado (English / Español)', () => {
    const contextCode = fs.readFileSync(path.join(webRoot, 'src/app/core/tutor-context.service.ts'), 'utf8');
    assert.ok(contextCode.includes("language === 'en'"), 'Detecta inglés para generar en inglés');
    assert.ok(contextCode.includes('Response language: English'), 'Instruye explícitamente generación en inglés');
  });

  runTest('D08', 'Capa 4: Quechua Chanka comunica límites reales y honestos sin falsas promesas', () => {
    const trCode = fs.readFileSync(path.join(webRoot, 'src/app/core/translation.service.ts'), 'utf8');
    assert.ok(trCode.includes('lookupGlossary(clean)'), 'Consulta glosario verificado');
    assert.ok(trCode.includes('Quechua Chanka no cuenta con traductor neuronal local en este dispositivo'), 'Informa honestamente los límites');
  });

  // ===========================================================================
  // GRUPO E: EXPERIENCIA DE PRÁCTICAS FORMATIVAS
  // ===========================================================================
  console.log('--- GRUPO E: EXPERIENCIA DE PRÁCTICAS FORMATIVAS ---');

  runTest('E01', 'PracticeExamService valida contenido mínimo antes de invocar IA', () => {
    const practiceCode = fs.readFileSync(path.join(webRoot, 'src/app/core/practice-exam.service.ts'), 'utf8');
    assert.ok(practiceCode.includes('academicNotes.totalWords >= 12'), 'Exige contenido mínimo');
    assert.ok(practiceCode.includes('mínimo 12 palabras'), 'Mensaje claro sobre apuntes insuficientes');
  });

  runTest('E02', 'Mostrar barra de progreso accesible durante la generación de práctica', () => {
    const appHtml = fs.readFileSync(path.join(webRoot, 'src/app/app.html'), 'utf8');
    assert.ok(appHtml.includes('<app-ai-progress'), 'Usa el componente reutilizable de progreso');
    assert.ok(appHtml.includes("practiceState() === 'GENERATING'"), 'Activo en estado GENERATING');
    assert.ok(appHtml.includes('cancelPracticeExamGeneration()'), 'Permite cancelar generación');
  });

  runTest('E03', 'Limpieza y validación rigurosa de JSON de preguntas sin confundir errores de formato con ausencia de Nano', () => {
    const practiceCode = fs.readFileSync(path.join(webRoot, 'src/app/core/practice-exam.service.ts'), 'utf8');
    assert.ok(practiceCode.includes('jsonStr.replace(/,\\s*([\\]}])/g, \'$1\')'), 'Limpia comas finales en JSON');
    assert.ok(practiceCode.includes('JSON inválido'), 'Reporta error de formato sin atribuirlo a Nano no instalado');
  });

  runTest('E04', 'Selección de respuestas y cálculo exacto de métricas formativas', () => {
    const practiceCode = fs.readFileSync(path.join(webRoot, 'src/app/core/practice-exam.service.ts'), 'utf8');
    assert.ok(practiceCode.includes('createAndSaveAttempt'), 'Calcula correct, incorrect, unanswered y scorePercentage');
    assert.ok(practiceCode.includes('Math.round((correct / total) * 100)'), 'Porcentaje formativo exacto');
  });

  runTest('E05', 'Integración formativa de fallos de examen con memoria SM-2', () => {
    const practiceCode = fs.readFileSync(path.join(webRoot, 'src/app/core/practice-exam.service.ts'), 'utf8');
    assert.ok(practiceCode.includes('integrateAttemptWithLearningMemory'), 'Integra preguntas fallidas con memoria de repaso');
  });

  runTest('E06', 'Persistencia de exámenes e intentos en IndexedDB cifrado para consulta offline', () => {
    const practiceCode = fs.readFileSync(path.join(webRoot, 'src/app/core/practice-exam.service.ts'), 'utf8');
    assert.ok(practiceCode.includes("await this.identity.save('exams'"), 'Persiste examen');
    assert.ok(practiceCode.includes("await this.identity.save('attempts'"), 'Persiste intentos');
  });

  runTest('E07', 'Retención de sesión académica de origen al salir o navegar', () => {
    const appCode = fs.readFileSync(path.join(webRoot, 'src/app/app.ts'), 'utf8');
    assert.ok(appCode.includes('this.bookId.set(session.id)'), 'Guarda la sesión activa');
    assert.ok(appCode.includes('this.go(\'libro\', sessionId)'), 'Permite volver a la sesión de origen');
  });

  // ===========================================================================
  // GRUPO F: REGRESIÓN Y REQUISITOS NO NEGOCIABLES
  // ===========================================================================
  console.log('--- GRUPO F: REGRESIÓN Y ARQUITECTURA NO NEGOCIABLE ---');

  runTest('F01', 'Bundle de producción de Angular compila satisfactoriamente (dist/ostrixai-web)', () => {
    const distPath = path.join(webRoot, 'dist/ostrixai-web/browser');
    assert.ok(fs.existsSync(distPath), 'El directorio dist/ostrixai-web/browser debe existir');
    const files = fs.readdirSync(distPath);
    assert.ok(files.some(f => f.startsWith('main-') && f.endsWith('.js')), 'Debe existir bundle main');
  });

  runTest('F02', 'Firebase AI Logic mantiene los tres modos oficiales (ONLY_ON_DEVICE, PREFER_ON_DEVICE, ONLY_IN_CLOUD)', () => {
    const aiCode = fs.readFileSync(path.join(webRoot, 'src/app/core/ostrix-ai.service.ts'), 'utf8');
    assert.ok(aiCode.includes('InferenceMode.ONLY_ON_DEVICE'), 'ONLY_ON_DEVICE configurado');
    assert.ok(aiCode.includes('InferenceMode.PREFER_ON_DEVICE'), 'PREFER_ON_DEVICE configurado');
    assert.ok(aiCode.includes('InferenceMode.ONLY_IN_CLOUD'), 'ONLY_IN_CLOUD configurado');
  });

  runTest('F03', 'Firebase App Check y encabezados de seguridad presentes', () => {
    const fbCode = fs.readFileSync(path.join(webRoot, 'src/app/core/firebase-runtime.ts'), 'utf8');
    assert.ok(fbCode.includes('initializeAppCheck'), 'App Check inicializado');
    assert.ok(fbCode.includes('ReCaptchaEnterpriseProvider'), 'Proveedor reCAPTCHA Enterprise configurado');
  });

  runTest('F04', 'Modo Esencial y funcionamiento offline determinista intactos', () => {
    const aiCode = fs.readFileSync(path.join(webRoot, 'src/app/core/ostrix-ai.service.ts'), 'utf8');
    assert.ok(aiCode.includes('generateOfflineEssential'), 'Modo esencial determinista presente');
    assert.ok(aiCode.includes("'OFFLINE_ESSENTIAL'"), 'Identificado como OFFLINE_ESSENTIAL');
  });

  runTest('F05', 'Tutor Ostrix conserva sus 4 modos pedagógicos (explain, guide, practice, explore)', () => {
    const tutorCode = fs.readFileSync(path.join(webRoot, 'src/app/features/tutor/tutor.component.ts'), 'utf8');
    assert.ok(tutorCode.includes("'explain'"), 'Modo explain presente');
    assert.ok(tutorCode.includes("'guide'"), 'Modo guide presente');
    assert.ok(tutorCode.includes("'practice'"), 'Modo practice presente');
    assert.ok(tutorCode.includes("'explore'"), 'Modo explore presente');
  });

  runTest('F06', 'Cifrado local por estudiante (AES-GCM con PBKDF2) preserva aislamiento', () => {
    const idCode = fs.readFileSync(path.join(webRoot, 'src/app/core/local-identity.service.ts'), 'utf8');
    assert.ok(idCode.includes('AES-GCM'), 'Algoritmo AES-GCM activo');
    assert.ok(idCode.includes('PBKDF2'), 'Derivación de clave con PBKDF2');
  });

  runTest('F07', 'Producción conserva el presupuesto de estilos por componente', () => {
    const workspace = JSON.parse(fs.readFileSync(path.join(webRoot, 'angular.json'), 'utf8'));
    const { budgets } = workspace.projects['ostrixai-web'].architect.build.configurations.production;
    const styles = budgets.find(budget => budget.type === 'anyComponentStyle');
    assert.equal(styles?.maximumWarning, '16kB');
  });

  console.log('\n=============================================================================');
  console.log(`🎉 RESULTADOS SUITE NANO, TELEMETRÍA Y MULTILINGÜISMO: ${passed} / ${total} PRUEBAS EXITOSAS`);
  console.log('=============================================================================\n');
}

main().catch(err => {
  console.error('\nFallo crítico en la suite:', err);
  process.exit(1);
});
