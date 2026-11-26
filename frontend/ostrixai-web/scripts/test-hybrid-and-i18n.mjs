/**
 * Automated Verification Suite — Hybrid AI, Error Classification, i18n (es/en/qu),
 * Security Guards & Production Build Integrity (T18, T19, T20, T25, T26, T29)
 *
 * Run with: node --experimental-strip-types frontend/ostrixai-web/scripts/test-hybrid-and-i18n.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { interfaceText, allInterfaceKeys } from '../src/app/core/interface-language.ts';
import { lookupGlossary, EDUCATIONAL_GLOSSARY } from '../src/app/core/educational-glossary.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');

import { classifyAiError } from '../src/app/core/ai-errors.ts';
const aiSource = fs.readFileSync(path.join(webRoot, 'src/app/core/ostrix-ai.service.ts'), 'utf8');
const syncSource = fs.readFileSync(path.join(webRoot, 'src/app/core/sync.service.ts'), 'utf8');
const firebaseRuntimeSource = fs.readFileSync(path.join(webRoot, 'src/app/core/firebase-runtime.ts'), 'utf8');
const angularJson = JSON.parse(fs.readFileSync(path.join(webRoot, 'angular.json'), 'utf8'));

console.log('--- TEST 1 (T25/T26): Full 3-Language i18n Coverage (es / en / qu-chanka) ---');
const keys = allInterfaceKeys();
assert.ok(keys.length >= 90, `Expected at least 90 i18n keys, found ${keys.length}`);
for (const key of keys) {
  const es = interfaceText(key, 'es');
  const en = interfaceText(key, 'en');
  const qu = interfaceText(key, 'qu-chanka');
  assert.ok(es && es.trim().length > 0, `Missing Spanish translation for ${key}`);
  assert.ok(en && en.trim().length > 0, `Missing English translation for ${key}`);
  assert.ok(qu && qu.trim().length > 0, `Missing Quechua translation for ${key}`);
}
assert.notEqual(interfaceText('myDiary', 'es'), interfaceText('myDiary', 'en'));
assert.notEqual(interfaceText('navTutor', 'es'), interfaceText('navTutor', 'en'));
assert.ok(EDUCATIONAL_GLOSSARY.length >= 10, 'Curricular glossary must have >= 10 entries');
assert.ok(lookupGlossary('ecuación'), 'Glossary must resolve curricular term "ecuación" offline');
console.log(`  ✓ ${keys.length} UI keys verified across es, en, and qu-chanka + offline glossary (${EDUCATIONAL_GLOSSARY.length} terms)`);

console.log('--- TEST 2 (T19/T20): Hybrid AI SDK Contracts & Error Handling (403/404/429/500/503/Abort) ---');
assert.ok(aiSource.includes('InferenceMode.ONLY_ON_DEVICE'), 'Must configure ONLY_ON_DEVICE model');
assert.ok(aiSource.includes('InferenceMode.ONLY_IN_CLOUD'), 'Must configure ONLY_IN_CLOUD model');
assert.ok(aiSource.includes('InferenceMode.PREFER_ON_DEVICE'), 'Must configure PREFER_ON_DEVICE hybrid model');
assert.ok(aiSource.includes('FirebaseInferenceSource.ON_DEVICE'), 'Must verify SDK ON_DEVICE source');
assert.ok(aiSource.includes('FirebaseInferenceSource.IN_CLOUD'), 'Must verify SDK IN_CLOUD source');
assert.ok(aiSource.includes('AbortController'), 'Must support AbortController cancellation');
assert.ok(aiSource.includes('cancelActiveRequest'), 'Must expose cancelActiveRequest for logout/cancel');
for (const [status, category] of [[403, 'APP_CHECK_OR_FORBIDDEN'], [404, 'MODEL_NOT_FOUND'],
  [429, 'QUOTA_EXCEEDED'], [500, 'SERVER_TRANSIENT'], [503, 'SERVER_TRANSIENT']]) {
  const failure = classifyAiError({ message: 'Error del servidor', customErrorData: { status } });
  assert.equal(failure.category, category);
  assert.equal(failure.httpStatus, status);
}
console.log('  ✓ Hybrid modes, SDK inferenceSource check, AbortController, and HTTP 403/404/429/500/503 handlers verified');

console.log('--- TEST 3 (Fase F/G): Multi-Student Shared-PC Sync Safety ---');
assert.ok(!/import\s+.*signInAnonymously/.test(syncSource), 'SyncService MUST NOT import signInAnonymously');
assert.ok(!syncSource.includes('signInAnonymously('), 'SyncService MUST NOT call signInAnonymously()');
assert.ok(syncSource.includes('!currentUser.isAnonymous'), 'SyncService MUST reject anonymous users');
assert.ok(syncSource.includes('localStudentId === student.id'), 'SyncService MUST verify per-student binding');
console.log('  ✓ Anonymous shared-browser sync is strictly prohibited');

console.log('--- TEST 4 (C.3 / T29): Production Build, Environment Replacement & PWA Artifacts ---');
const prodConfig = angularJson.projects['ostrixai-web'].architect.build.configurations.production;
const hasEnvReplacement = (prodConfig.fileReplacements || []).some(
  r => r.replace === 'src/app/core/environment.ts' && r.with === 'src/app/core/environment.prod.ts'
);
assert.ok(hasEnvReplacement, 'angular.json production config must replace environment.ts with environment.prod.ts');

const hasAppCheckNoopReplacement = (prodConfig.fileReplacements || []).some(
  r => r.replace === 'src/app/core/app-check-debug.ts' && r.with === 'src/app/core/app-check-debug.prod.ts'
);
assert.ok(hasAppCheckNoopReplacement, 'angular.json production config must replace app-check-debug.ts with app-check-debug.prod.ts');

const browserDist = path.join(webRoot, 'dist/ostrixai-web/browser');
assert.ok(fs.existsSync(browserDist), 'Production build directory dist/ostrixai-web/browser must exist');
assert.ok(fs.existsSync(path.join(browserDist, 'ngsw-worker.js')), 'ngsw-worker.js must be generated');
assert.ok(fs.existsSync(path.join(browserDist, 'ngsw.json')), 'ngsw.json must be generated');
assert.ok(fs.existsSync(path.join(browserDist, 'manifest.webmanifest')), 'manifest.webmanifest must exist');

// Verify no assignment to FIREBASE_APPCHECK_DEBUG_TOKEN exists in any production JS bundle
const jsFiles = fs.readdirSync(browserDist).filter(f => f.endsWith('.js'));
assert.ok(jsFiles.length > 0, 'Compiled JS bundles must exist');
for (const file of jsFiles) {
  const content = fs.readFileSync(path.join(browserDist, file), 'utf8');
  assert.ok(
    !/FIREBASE_APPCHECK_DEBUG_TOKEN\s*=[^=]/.test(content),
    `SECURITY FAILURE: Production bundle ${file} still assigns FIREBASE_APPCHECK_DEBUG_TOKEN!`
  );
}
console.log(`  ✓ Checked ${jsFiles.length} production JS bundles: 0 assignments to FIREBASE_APPCHECK_DEBUG_TOKEN`);
console.log('  ✓ PWA artifacts verified: ngsw-worker.js, ngsw.json, manifest.webmanifest');

console.log('\n================================================================');
console.log('ALL HYBRID AI, i18n, SECURITY & PRODUCTION BUILD CHECKS PASSED');
console.log('================================================================');
