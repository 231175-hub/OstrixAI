/**
 * Automated Test: Student Data Isolation & Web Crypto Security
 * OstrixAi - BuildHybridAI 2026
 */
import assert from 'node:assert/strict';

const ITERATIONS = 310_000;
const CHECK = 'OSTRIXAI_PROFILE_UNLOCK_V1';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const unb64 = (text) => new Uint8Array(Buffer.from(text, 'base64'));
const random = (size) => crypto.getRandomValues(new Uint8Array(size));

async function deriveKey(passphrase, salt) {
  assert(passphrase.length >= 10 && passphrase.length <= 128, 'Contraseña fuera de límites');
  const material = await crypto.subtle.importKey(
    'raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encrypt(key, text, context) {
  const nonce = random(12);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: encoder.encode(context) },
    key,
    encoder.encode(text)
  );
  return { nonce: b64(nonce), ciphertext: b64(new Uint8Array(ciphertext)) };
}

async function decrypt(key, nonce, ciphertext, context) {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(nonce), additionalData: encoder.encode(context) },
    key,
    unb64(ciphertext)
  );
  return decoder.decode(plaintext);
}

async function runTests() {
  console.log('--- TEST 1: Derivación de claves PBKDF2-SHA256 con salt independiente ---');
  const salt1 = random(16);
  const salt2 = random(16);
  assert.notDeepEqual(salt1, salt2, 'Los salts deben ser aleatorios e independientes');

  const keyAlumno1 = await deriveKey('ClaveSeguraEstudiante1!', salt1);
  const keyAlumno2 = await deriveKey('ClaveSeguraEstudiante2!', salt2);
  console.log('  ✓ Claves derivadas correctamente con 310,000 iteraciones');

  console.log('--- TEST 2: Prueba de desbloqueo (CHECK) sin almacenar contraseña ---');
  const proof1 = await encrypt(keyAlumno1, CHECK, 'profile:alumno-1-uuid');
  const proof2 = await encrypt(keyAlumno2, CHECK, 'profile:alumno-2-uuid');

  // Simular almacenamiento crudo
  const rawDb = {
    profiles: [
      { id: 'alumno-1-uuid', username: 'alumno_01', salt: b64(salt1), nonce: proof1.nonce, check: proof1.ciphertext },
      { id: 'alumno-2-uuid', username: 'alumno_02', salt: b64(salt2), nonce: proof2.nonce, check: proof2.ciphertext },
    ],
    secrets: []
  };

  // Verificar que la contraseña no esté en texto plano en la base
  const dbJson = JSON.stringify(rawDb);
  assert(!dbJson.includes('ClaveSeguraEstudiante1!'), 'La contraseña de Alumno 1 NUNCA debe guardarse');
  assert(!dbJson.includes('ClaveSeguraEstudiante2!'), 'La contraseña de Alumno 2 NUNCA debe guardarse');
  console.log('  ✓ Ninguna contraseña almacenada en texto plano');

  // Alumno 1 login exitoso
  const checkPlain1 = await decrypt(keyAlumno1, proof1.nonce, proof1.ciphertext, 'profile:alumno-1-uuid');
  assert.equal(checkPlain1, CHECK, 'El proof debe validarse');
  console.log('  ✓ Desbloqueo de perfil validado criptográficamente');

  // Intento con clave incorrecta para Alumno 1
  const fakeKey = await deriveKey('ClaveIncorrecta999!', salt1);
  await assert.rejects(
    async () => await decrypt(fakeKey, proof1.nonce, proof1.ciphertext, 'profile:alumno-1-uuid'),
    /operation failed|OperationError/i,
    'Clave incorrecta debe fallar autenticación AES-GCM'
  );
  console.log('  ✓ Contraseña incorrecta rechazada por fallo de integridad AES-GCM');

  console.log('--- TEST 3: Cifrado de apuntes y aislamiento entre estudiantes ---');
  const apunteAlumno1 = JSON.stringify({
    tema: 'Ecuaciones de segundo grado',
    apuntes: 'ax^2 + bx + c = 0. Fórmula general: x = (-b +- sqrt(b^2 - 4ac)) / 2a',
    dudas: ['¿Por qué si el discriminante es negativo no hay solución real?']
  });

  const recordId1 = 'alumno-1-uuid:diary:sesion-101';
  const encrypted1 = await encrypt(keyAlumno1, apunteAlumno1, recordId1);
  rawDb.secrets.push({
    id: recordId1,
    ownerId: 'alumno-1-uuid',
    category: 'diary',
    nonce: encrypted1.nonce,
    ciphertext: encrypted1.ciphertext
  });

  // Verificar que el apunte NO esté legible en el almacenamiento crudo
  const rawSecretJson = JSON.stringify(rawDb.secrets);
  assert(!rawSecretJson.includes('Ecuaciones de segundo grado'), 'El texto plano no debe aparecer en la BD');
  assert(!rawSecretJson.includes('Fórmula general'), 'Los apuntes deben estar estrictamente cifrados');
  console.log('  ✓ Apuntes cifrados con AES-256-GCM y nonce aleatorio de 12 bytes');

  // Alumno 1 descifra sus propios apuntes
  const decrypted1 = await decrypt(keyAlumno1, encrypted1.nonce, encrypted1.ciphertext, recordId1);
  const parsed1 = JSON.parse(decrypted1);
  assert.equal(parsed1.tema, 'Ecuaciones de segundo grado');
  console.log('  ✓ Alumno 1 descifra correctamente sus apuntes');

  // Alumno 2 intenta descifrar los apuntes de Alumno 1
  await assert.rejects(
    async () => await decrypt(keyAlumno2, encrypted1.nonce, encrypted1.ciphertext, recordId1),
    /operation failed|OperationError/i,
    'Alumno 2 NO debe poder descifrar los apuntes de Alumno 1'
  );
  console.log('  ✓ Alumno 2 bloqueado por autenticación criptográfica AES-GCM (Aislamiento real)');

  console.log('--- TEST 4: Protección contra manipulación de contexto (AAD Tampering) ---');
  // Atacante intenta mover el apunte al perfil de Alumno 2 cambiando el recordId
  const tamperedContext = 'alumno-2-uuid:diary:sesion-101';
  await assert.rejects(
    async () => await decrypt(keyAlumno1, encrypted1.nonce, encrypted1.ciphertext, tamperedContext),
    /operation failed|OperationError/i,
    'Modificar el contexto AAD debe invalidar el descifrado'
  );
  console.log('  ✓ Manipulación de contexto rechazada por autenticación AAD');

  console.log('--- TEST 5: Protección contra manipulación de ciphertext ---');
  const bytesCipher = unb64(encrypted1.ciphertext);
  bytesCipher[5] ^= 0xff; // Modificar un byte
  const tamperedCiphertext = b64(bytesCipher);
  await assert.rejects(
    async () => await decrypt(keyAlumno1, encrypted1.nonce, tamperedCiphertext, recordId1),
    /operation failed|OperationError/i,
    'Alterar cualquier byte del texto cifrado debe disparar fallo de integridad'
  );
  console.log('  ✓ Manipulación de bytes cifrados rechazada (Integridad AES-GCM)');

  console.log('\n======================================================');
  console.log('TODAS LAS PRUEBAS DE SEGURIDAD Y AISLAMIENTO SUPERADAS');
  console.log('======================================================');
}

runTests().catch((err) => {
  console.error('ERROR EN PRUEBAS:', err);
  process.exit(1);
});
