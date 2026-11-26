# ADR-002 — Dirigir OstrixAi a secundaria rural con degradación funcional explícita

- **Fecha:** 2026-11-16
- **Estado:** Aceptado para el hackathon; revisión obligatoria tras pruebas de dispositivos
- **Responsables:** Equipo OstrixAi
- **Relacionado con:** ADR-001 (inferencia híbrida)

## Contexto

OstrixAi comenzó como tutor genérico y luego como libro de aprendizaje con sesiones agrupadas por `fecha → curso`. La población universitaria puede dar feedback rápido, pero el caso de conectividad intermitente resulta especialmente pertinente a estudiantes de educación secundaria rural. La limitación crucial es tecnológica: Gemini Nano vía Chrome Prompt API no funciona en cualquier equipo; exige Chrome de escritorio compatible, recursos de hardware y una descarga inicial en línea.

Además, trabajar con menores obliga a limitar la información procesada, protegerla y contar con supervisión y autorizaciones antes de cualquier despliegue real.

## Decisión

1. **Persona primaria:** estudiante de 3.º a 5.º de secundaria rural peruana.
2. **Flujo principal:** diario cronológico con sesiones `fecha → asignatura → tema`, y cinco áreas: Apuntes, Resumen, Dudas, Eureka, Repaso.
3. **Offline esencial para todo dispositivo que instale la PWA:** consulta de material cacheado, captura y guardado local en IndexedDB, y contenido previamente generado; no se exige IA para estas operaciones.
4. **Offline generativo solo para dispositivos compatibles:** Gemini Nano por Firebase AI Logic, `ONLY_ON_DEVICE` sin red y preparación previa explícita. No se comunica como universal.
5. **Cloud solo con conexión y autorización:** IA generativa vía Firebase AI Logic y App Check; historial de interacciones opcional a Flask/AWS con autenticación y App Check independientes.
6. **Menores:** MVP y vídeo solo con datos ficticios. Antes de piloto: autorización, roles de docentes/adultos responsables, gestión de datos, borrado, retención y evaluación de seguridad.
7. **Iteración pedagógica:** las dudas y descubrimientos enriquecen prompts de repaso; esto es personalización **por contexto**, no entrenamiento autónomo del modelo ni diagnóstico de estudiante.

## Alternativas

- **Universidad en general:** reduce complejidad de consentimiento pero pierde precisión del caso de uso rural como foco del producto; podría probarse como público auxiliar sin cambiar el relato.
- **Primaria rural:** gran necesidad educativa, pero requiere interacción más visual, acompañamiento intensivo y mayores adaptaciones por edad; posponer.
- **Solo IA offline en todos los dispositivos:** inviable con los requisitos de hardware actuales del SDK web.
- **Modelo local distinto en lugar de Firebase:** podría funcionar en hardware distinto, pero no reemplaza el requisito de integración real con Firebase AI Logic en este concurso.

## Consecuencias

**A favor:** relato de impacto específico; interfaz organizada por la rutina escolar; separación honesta de capacidad esencial y generación de IA; componente académico explicable mediante ADR.

**Costes / riesgos:** estudiantes beneficiarios pueden carecer del hardware para IA local; compatibilidad en español debe probarse; la función de docentes exige desarrollo posterior; la seguridad para menores impide usar datos reales en una demo apresurada; AWS aumenta costo y complejidad.

## Validación / reversibilidad

1. Probar la aplicación y el modo Gemini Nano con el equipo real de demostración.
2. Probar diario sin conexión incluso cuando `LanguageModel.availability()` sea `unavailable`.
3. Validar con docentes o personas adultas el flujo fecha → curso → libro; no recopilar material de menores sin controles.
4. Si solo se dispone de hardware de alta gama, explicitar que es prueba de concepto de infraestructura escolar compartida, no solución ya desplegable masivamente.
5. Revisar decisión con evidencias (dispositivos, tasas de éxito y comentarios de usuarios).

## Referencias

- https://firebase.google.com/docs/ai-logic/hybrid/web/get-started
- https://developer.chrome.com/docs/ai/prompt-api
- https://firebasehybridaihackathon.devpost.com/rules
