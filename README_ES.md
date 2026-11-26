# OstrixAi — Tu conocimiento crece contigo

**Estado al 21/11/2026.** El resultado vigente, las pruebas de producción y los bloqueos de admisión están en la [auditoría](AUDITORIA-OSTRIXAI-20-PUNTOS.md). Para reproducir el build actual, consulta el [README de entrega](README.md).

Plataforma educativa offline-first con memoria de aprendizaje personalizada, cuentas cifradas locales e inferencia híbrida (**Firebase AI Logic + Gemini Nano + Gemini Cloud**) diseñada para estudiantes de 1.º a 5.º de secundaria rural del Perú.

## Capacidades en una sola PWA
1. **Modo Esencial (100% Offline, sin LLM):** Cuentas locales cifradas (Web Crypto PBKDF2-SHA256 + AES-GCM-256), Diario Académico (`Fecha → Asignatura → Sesión → Contenido`), Libro de Dudas, Libro Eureka, ejercicios curriculares con evaluación determinista y repetición espaciada SM-2.
2. **IA Local (Gemini Nano vía Firebase AI Logic):** Inferencia `ONLY_ON_DEVICE` y `PREFER_ON_DEVICE` en Chrome de escritorio compatible, verificando `response.inferenceSource`.
3. **IA Cloud (Gemini Cloud autorizado):** Inferencia bajo consentimiento explícito del estudiante protegida por Firebase App Check (`ReCaptchaEnterpriseProvider`), con cancelación (`AbortSignal`), timeouts y manejo de errores HTTP 403/404/429/500/503.

## Ciclo Pedagógico Central
**APUNTE → DUDA → TUTOR OSTRIX → EXPLICACIÓN → EJERCICIO → RESULTADO → REPASO SM-2 → PROGRESO**

## Documentación del Proyecto
- [README en inglés (Hackathon)](README.md)
- [Estado actual](docs/ESTADO-OSTRIXAI.md)
- [Checklist 20/20](docs/CHECKLIST-20-PUNTOS.md)
- [Evidencias de pruebas](docs/PRUEBAS-EVIDENCIAS.md)
- [Bloqueadores externos](docs/BLOQUEADORES.md)
- [Seguridad y privacidad](docs/SEGURIDAD.md)
- [Arquitectura](docs/ARQUITECTURA.md)
- [Decisiones técnicas](docs/DECISIONES-TECNICAS.md)
- [Plan del hackathon y guion de video](docs/PLAN-HACKATHON.md)
- [Evaluación estricta de jurado](docs/REPORTE-JURADO.md)
