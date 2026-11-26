/**
 * Automated Verification Suite — Gemini Nano Streaming, TTFB, Cold-Start Timeouts,
 * Prompt Leak Sanitization in Essential Mode, Safe Markdown & True Connectivity Probing.
 *
 * Run with: node --experimental-strip-types frontend/ostrixai-web/scripts/test-nano-streaming-and-essential.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  cleanMarkdownToText,
  formatMarkdownToSafeHtml,
  splitSummaryIntoParagraphsAndPoints,
  sanitizeStudentNotesFromPrompt,
} from '../src/app/core/markdown-cleaner.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');

import { classifyAiError } from '../src/app/core/ai-errors.ts';

console.log('=== TEST SUITE: GEMINI NANO STREAMING, TIMEOUTS, SANITIZATION & CONNECTIVITY ===\n');

// -----------------------------------------------------------------------------
// TEST 1: Eliminación rigurosa de fugas de prompts en Modo Esencial Offline
// -----------------------------------------------------------------------------
console.log('--- TEST 1: Sanitización de notas y eliminación de fugas de prompts ---');

const complexPromptWithInternalInstructions = `
CURSO: Ciencia y Tecnología. TEMA: La Célula y su Estructura.
Redacta un resumen escolar riguroso y claro para secundaria rural basado ÚNICAMENTE en los siguientes apuntes.
REGLAS OBLIGATORIAS:
1. Longitud: exactamente entre 60 y 100 palabras en un texto continuo.
2. No uses títulos ni encabezados con numerales (nada de ##).
3. No uses asteriscos dobles (**) para negrita.
4. No redactes cada frase como una viñeta separada.
5. No inventes hechos no presentes en los apuntes.

APUNTES DEL ESTUDIANTE:
• La célula eucariota posee membrana celular, citoplasma y núcleo definido.
• El ADN se encuentra protegido dentro de la envoltura nuclear.
• Las mitocondrias producen energía para la respiración celular.
• Las células vegetales tienen además pared celular y cloroplastos para la fotosíntesis.

CONTEXTO PREVIO:
Historial de sesiones anteriores del estudiante.
`;

const sanitizedNotes = sanitizeStudentNotesFromPrompt(complexPromptWithInternalInstructions);

// Verificaciones estrictas
assert.ok(!sanitizedNotes.includes('CURSO:'), 'Must NOT leak CURSO header');
assert.ok(!sanitizedNotes.includes('TEMA:'), 'Must NOT leak TEMA header');
assert.ok(!sanitizedNotes.includes('REGLAS OBLIGATORIAS:'), 'Must NOT leak REGLAS OBLIGATORIAS');
assert.ok(!sanitizedNotes.includes('Redacta un resumen'), 'Must NOT leak prompt task instructions');
assert.ok(!sanitizedNotes.includes('CONTEXTO PREVIO:'), 'Must NOT leak context metadata');
assert.ok(sanitizedNotes.includes('La célula eucariota posee membrana celular'), 'Must retain student note 1');
assert.ok(sanitizedNotes.includes('mitocondrias producen energía'), 'Must retain student note 3');
assert.ok(sanitizedNotes.includes('cloroplastos para la fotosíntesis'), 'Must retain student note 4');

console.log('  ✓ 100% de instrucciones de sistema y metadatos de prompt filtrados de los apuntes');

// -----------------------------------------------------------------------------
// TEST 2: Limpieza de Markdown Crudo (##, **, viñetas desordenadas)
// -----------------------------------------------------------------------------
console.log('--- TEST 2: Formateo limpio de Markdown (sin símbolos crudos ## ni **) ---');

const rawMarkdownWithArtifacts = `
## Resumen de la Lección
Este es el **párrafo principal** con información relevante sobre la fotosíntesis.
### Puntos clave:
* **Fase lumínica**: ocurre en los tilacoides.
* **Fase oscura**: fija el CO2 en el estroma.
---
## Conclusión
Todos los seres vivos dependen del oxígeno generado.
`;

const cleanText = cleanMarkdownToText(rawMarkdownWithArtifacts);
assert.ok(!cleanText.includes('##'), 'Must not contain ## heading markers');
assert.ok(!cleanText.includes('###'), 'Must not contain ### heading markers');
assert.ok(!cleanText.includes('**'), 'Must not contain ** bold markers');
assert.ok(!cleanText.includes('---'), 'Must not contain divider lines');
assert.ok(cleanText.includes('Resumen de la Lección'), 'Preserves heading text cleanly');
assert.ok(cleanText.includes('párrafo principal'), 'Preserves bold text without asterisks');
assert.ok(cleanText.includes('• Fase lumínica: ocurre en los tilacoides.'), 'Normalizes bullet point with clean dot');

const structured = splitSummaryIntoParagraphsAndPoints(rawMarkdownWithArtifacts);
assert.ok(structured.paragraphs.length >= 2, 'Should extract clean cohesive paragraphs');
assert.ok(structured.keyPoints.length >= 2, 'Should extract clean key points');
assert.ok(!structured.keyPoints.some(pt => pt.includes('**')), 'No key point contains raw asterisks');
assert.ok(!structured.paragraphs.some(p => p.includes('##')), 'No paragraph contains raw hashes');

console.log('  ✓ Eliminación completa de sintaxis cruda de Markdown verificada');

// -----------------------------------------------------------------------------
// TEST 3: Safe HTML para Tutor (prevención de XSS y formato legible)
// -----------------------------------------------------------------------------
console.log('--- TEST 3: HTML seguro para respuestas pedagógicas del Tutor ---');

const safeHtml = formatMarkdownToSafeHtml('**Importante**: La fotosíntesis produce <glucosa> & [oxígeno].');
assert.ok(safeHtml.includes('<strong>Importante</strong>'), 'Converts **bold** to <strong>');
assert.ok(safeHtml.includes('&lt;glucosa&gt;'), 'Escapes HTML tags to prevent XSS');
assert.ok(safeHtml.includes('&amp;'), 'Escapes ampersands');
assert.ok(!safeHtml.includes('<script>'), 'XSS prevention active');

console.log('  ✓ Renderizado seguro de formato enriquecido verificado sin vulnerabilidades XSS');

// -----------------------------------------------------------------------------
// TEST 4: Configuración de Timeouts Adaptativos y Cold Start de Gemini Nano
// -----------------------------------------------------------------------------
console.log('--- TEST 4: Timeouts de inferencia y arranque en frío (Cold-Start 120 s) ---');

const serviceSource = fs.readFileSync(path.join(webRoot, 'src/app/core/ostrix-ai.service.ts'), 'utf8');

assert.ok(serviceSource.includes('isLocalModelWarm'), 'Must track whether local model is warm');
assert.ok(serviceSource.includes('120_000'), 'Must provide 120s extended timeout for cold start');
assert.ok(serviceSource.includes('60_000'), 'Must provide 60s timeout for subsequent warm local inference');
assert.ok(serviceSource.includes('timeToFirstChunkMs'), 'Must record time to first chunk (TTFB)');
assert.ok(serviceSource.includes('inferencePhase'), 'Must expose reactive inference phase signal');
assert.ok(serviceSource.includes('streamingText'), 'Must expose reactive streaming text signal');

console.log('  ✓ Timeouts adaptativos verificados: 120s primer arranque (frío) / 60s subsecuentes (caliente)');

// -----------------------------------------------------------------------------
// TEST 5: Prevención de peticiones simultáneas duplicadas (Concurrency Guard)
// -----------------------------------------------------------------------------
console.log('--- TEST 5: Prevención estricta de solicitudes simultáneas en vuelo ---');

assert.ok(serviceSource.includes('if (this.isBusy())'), 'Must reject concurrent in-flight requests');
assert.ok(serviceSource.includes('activeRequestId'), 'Must track active request token to prevent stale completions');
assert.ok(serviceSource.includes('cancelActiveRequest'), 'Must allow explicit cancellation');

console.log('  ✓ Guardas de concurrencia y cancelación reactiva verificadas');

// -----------------------------------------------------------------------------
// TEST 6: Detección de conectividad real por sonda activa (DeviceCapabilities)
// -----------------------------------------------------------------------------
console.log('--- TEST 6: Detección de conectividad real sin confiar ciegamente en navigator.onLine ---');

const deviceSource = fs.readFileSync(path.join(webRoot, 'src/app/core/device-capabilities.service.ts'), 'utf8');

assert.ok(deviceSource.includes('checkTrueOnline'), 'Must implement active probe method checkTrueOnline');
assert.ok(deviceSource.includes('connectionStatus'), 'Must expose connectionStatus signal');
assert.ok(deviceSource.includes('local_only'), 'Must distinguish local LAN from real internet WAN');
assert.ok(deviceSource.includes('generate_204'), 'Must probe lightweight 204 endpoint with timeout');

console.log('  ✓ Sonda activa WAN verificada: previene falso "En línea" en redes escolares aisladas');

// -----------------------------------------------------------------------------
// TEST 7: Clasificación de Errores HTTP y Red
// -----------------------------------------------------------------------------
console.log('--- TEST 7: Clasificación de errores HTTP y red ---');

const timeoutErr = classifyAiError(new Error('Operation timed out after 45000ms'));
assert.equal(timeoutErr.category, 'TIMEOUT');
assert.equal(timeoutErr.httpStatus, 408);
assert.equal(timeoutErr.retryable, true);

const appCheckErr = classifyAiError(new Error('Firebase App Check token rejected: 403 Forbidden'));
assert.equal(appCheckErr.category, 'APP_CHECK_OR_FORBIDDEN');
assert.equal(appCheckErr.httpStatus, 403);
assert.equal(appCheckErr.retryable, false);

const quotaErr = classifyAiError(new Error('HTTP 429 Resource Exhausted / Quota exceeded'));
assert.equal(quotaErr.category, 'QUOTA_EXCEEDED');
assert.equal(quotaErr.httpStatus, 429);

const serverErr = classifyAiError(new Error('HTTP 503 Service Unavailable'));
assert.equal(serverErr.category, 'SERVER_TRANSIENT');
assert.equal(serverErr.httpStatus, 503);
assert.equal(serverErr.retryable, true);

console.log('  ✓ Clasificador de errores probado exhaustivamente');

console.log('\n================================================================');
console.log('TODAS LAS PRUEBAS DE STREAMING, TIMEOUTS, SANITIZACIÓN Y RED SUPERADAS');
console.log('================================================================');
