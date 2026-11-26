# Seguridad y Privacidad — OstrixAi

Última actualización: 2026-11-18.

## 1. Modelo de Amenazas (Computadora Escolar Compartida por Menores)
OstrixAi asume que varios estudiantes de secundaria comparten una misma PC rural con el mismo perfil del sistema operativo y del navegador.

## 2. Controles Criptográficos Locales Implementados
- **Derivación de claves:** Web Crypto API `PBKDF2` con `SHA-256`, **310,000 iteraciones** y `salt` aleatorio independiente de 16 bytes por estudiante.
- **Cifrado autenticado:** `AES-GCM` de 256 bits con IV aleatorio de 12 bytes por registro y **AAD (Additional Authenticated Data)** vinculando `studentId:store:recordId` para impedir trasplante o manipulación de registros entre tiendas o usuarios.
- **Cero contraseñas en texto plano:** No se almacena la contraseña ni un hash reutilizable; la verificación se realiza descifrando una prueba criptográfica (`CHECK`) con la clave derivada.
- **Limpieza en cierre de sesión (`logout`):**
  - Se abortan inmediatamente las solicitudes de IA en vuelo (`ai.cancelActiveRequest()`).
  - Se vacían todos los `signal` reactivos (diario, memoria, repasos, conversaciones del tutor, borradores, resúmenes).
  - En `TutorComponent.ask()`, se captura `ownerStudentId` antes de `await` y se descarta cualquier respuesta si la sesión cambió durante la espera.

## 3. Prevención de Filtración Cruzada en Sincronización
- **Corrección aplicada en Fase G:** Se eliminó `signInAnonymously()` de `SyncService`. Una identidad anónima de Firebase es única por perfil de navegador, no por alumno, por lo que habría mezclado cuadernos de distintos estudiantes en MySQL.
- `SyncService.flush()` exige una identidad de servidor individual no anónima (`!currentUser.isAnonymous`) vinculada explícitamente al `localStudentId`. Mientras no exista esa vinculación, la sincronización remota permanece bloqueada de forma segura y la cola local permanece cifrada por estudiante.
- En el backend Flask, el `uid` siempre proviene del token verificado por el servidor (`_authenticated_uid()`), ignorando cualquier `user_uid` enviado en el cuerpo JSON (verificado por `test_horizontal_authorization_isolation`).

## 4. Protección de Firebase App Check y XSS
- **Producción sin modo debug:** `angular.json` reemplaza `app-check-debug.ts` por `app-check-debug.prod.ts` en producción. Verificado automáticamente sobre los 12 bundles JS compilados (0 asignaciones a `FIREBASE_APPCHECK_DEBUG_TOKEN`).
- **Prevención XSS:** Todas las respuestas generadas por Gemini Nano o Gemini Cloud se renderizan mediante interpolación Angular (`{{ message.text }}`), nunca mediante `[innerHTML]`, evitando inyección de HTML/JS ejecutable.
- **Separación de datos vs. instrucciones:** `TutorContextService` etiqueta explícitamente los apuntes y el historial como datos no confiables del estudiante para mitigar prompt injection.

## 5. Limitaciones Honestas Documentadas
1. **AES-GCM no equivale a seguridad perfecta:** Si el equipo escolar tiene malware a nivel de sistema operativo o keyloggers, una contraseña tecleada puede ser interceptada en memoria mientras la sesión esté abierta.
2. **Sin recuperación remota de contraseña offline:** Si un estudiante olvida su contraseña local sin haber exportado un respaldo, sus datos cifrados son irrecuperables por diseño.
3. **Token debug previo:** El propietario debe revocar manualmente el token temporal de depuración de App Check compartido anteriormente en Firebase Console.
4. **Datos de menores:** No se utilizan datos reales de menores en pruebas ni en demostraciones.
