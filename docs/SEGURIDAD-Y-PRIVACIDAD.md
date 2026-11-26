# Seguridad y Privacidad — OstrixAi

**Fecha:** Noviembre 2026  
**Estándar:** Web Crypto API (W3C), AES-GCM (NIST SP 800-38D), PBKDF2 (RFC 8018)  
**Proyecto:** OstrixAi — Biblioteca Inteligente de Aprendizaje (BuildHybridAI 2026)

---

## 1. Modelo de Amenazas y Contexto Escolar

En escuelas secundarias de zonas rurales del Perú, las computadoras son un recurso escaso y compartido:
- Múltiples estudiantes utilizan el mismo equipo de cómputo en diferentes turnos o días.
- La conectividad a internet es intermitente o ausente durante las sesiones de estudio.
- El filtrado visual simple por nombre de usuario en la interfaz **NO es seguridad**: cualquier usuario técnico o inspección de IndexedDB revelaría los apuntes y diarios de otros estudiantes si estuvieran en texto plano.
- Los apuntes de menores de edad deben protegerse frente a curiosidad de pares, manipulación y filtraciones.

---

## 2. Arquitectura de Cuentas Locales Seguras

Cada estudiante posee un perfil local aislado criptográficamente en el navegador:

```
[Contraseña del Estudiante] + [Salt aleatorio de 16 bytes]
            │
            ▼  (PBKDF2-SHA256, 310,000 iteraciones)
   [CryptoKey AES-GCM 256 bits]
            │
      ┌─────┴───────────────────────────────────┐
      ▼                                         ▼
[Verificación de Acceso]              [Almacenamiento de Cuaderno]
AES-GCM-256 (IV: 12B)                 AES-GCM-256 (IV: 12B)
AAD: "profile:<UUID>"                 AAD: "<UUID>:<category>:<record_id>"
Texto: "OSTRIXAI_PROFILE_UNLOCK_V1"   Texto: JSON cifrado del apunte/repaso
```

### Parámetros Criptográficos Documentados:
- **Derivación de clave:** PBKDF2 con función pseudoaleatoria HMAC-SHA-256.
- **Iteraciones:** `310,000` (conforme a las directrices OWASP 2023/2026 para PBKDF2-HMAC-SHA256).
- **Salt:** 16 bytes (128 bits) generados criptográficamente mediante `crypto.getRandomValues()`. Cada estudiante tiene un salt único e independiente.
- **Algoritmo de cifrado:** AES-GCM (Galois/Counter Mode) con longitud de clave de 256 bits.
- **Vector de Inicialización (Nonce / IV):** 12 bytes (96 bits) criptográficamente aleatorios por cada operación de cifrado. Nunca se reutiliza un nonce con la misma clave.
- **Datos Adicionales Autenticados (AAD):** Se vincula el identificador del registro (`${student.id}:${category}:${id}`) como Additional Authenticated Data en AES-GCM. Si un atacante copia un registro cifrado a otro perfil o cambia la clave de búsqueda, la verificación del tag GCM falla inmediatamente.

---

## 3. Garantías de Privacidad y Aislamiento

1. **Cero Contraseñas en Texto Plano:** La contraseña ingresada por el estudiante nunca se escribe en disco, memoria persistente ni IndexedDB. Únicamente se utiliza como material transitorio en Web Crypto API para derivar la `CryptoKey`.
2. **Cero Hashing Reversible:** En lugar de guardar hashes de contraseñas, se almacena una prueba cifrada autenticada de una constante (`CHECK`). Solo quien posea la contraseña correcta puede descifrar la constante sin error de integridad GCM.
3. **Aislamiento Criptográfico Real:**
   - Si el `Estudiante A` inicia sesión, solo puede descifrar sus propios registros.
   - Si el `Estudiante B` intenta leer los registros del `Estudiante A`, la clave derivada del `Estudiante B` generará un fallo de autenticación de tag GCM (`OperationError`).
   - El aislamiento no depende de sentencias `WHERE` o filtros de interfaz: los datos en reposo están completamente cifrados.
4. **Purga de Memoria en Cierre de Sesión:**
   - Al invocar `logout()`, la referencia en memoria a la `CryptoKey` se establece a `null`.
   - Las señales reactivas de Angular que contenían los apuntes descifrados (`diary.sessions`, `reviews.cards`, `settings.profile`) se limpian inmediatamente (`clear()` / `lock()`).
5. **No Mezcla con Firebase Anónimo:**
   - La sincronización a la nube requiere una identidad propia autenticada y vinculada explícitamente al perfil. No se utiliza un UID anónimo compartido entre múltiples estudiantes de una misma máquina.

---

## 4. Limitaciones Documentadas del Modo Offline

| Característica | Comportamiento en OstrixAi | Mitigación / Instrucción al Usuario |
|---|---|---|
| **Recuperación de contraseña** | **No disponible offline.** Sin internet ni servidor central, no existe mecanismo de restablecimiento de contraseña sin comprometer la criptografía. | La interfaz advierte al estudiante que debe recordar su contraseña o conservarla en un medio seguro físico. |
| **Borrado de caché del navegador** | Si el administrador de la máquina o un usuario limpia todos los datos del navegador (IndexedDB), los cuadernos locales se eliminan. | Se proporciona la función **Exportar Cuaderno (JSON)** para realizar respaldos personales en memorias USB. |
| **Fuerza bruta local extrema** | Si un atacante extrae la base IndexedDB con privilegios de administrador de Windows, podría intentar ataques de diccionario offline. | El sistema exige contraseñas de al menos 10 caracteres y aplica 310 000 iteraciones de PBKDF2 para elevar exponencialmente el costo computacional de cualquier ataque. |

---

## 5. Evidencia de Pruebas Automatizadas

El archivo de pruebas automatizadas `frontend/ostrixai-web/scripts/test-crypto-isolation.mjs` verifica formalmente:
- Generación de salts independientes por perfil.
- Derivación correcta con 310 000 iteraciones.
- Imposibilidad de descifrado entre cuentas distintas (aislamiento garantizado por AES-GCM).
- Rechazo de manipulación de contexto (AAD Tampering).
- Rechazo de alteración de bytes en el texto cifrado (integridad criptográfica).
