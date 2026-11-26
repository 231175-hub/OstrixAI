export type AiErrorCategory =
  | 'ABORTED'
  | 'TIMEOUT'
  | 'LOCAL_TIMEOUT'
  | 'LOCAL_BUSY'
  | 'LOCAL_CONTEXT_EXCEEDED'
  | 'LOCAL_PARSE_ERROR'
  | 'LOCAL_UNAVAILABLE'
  | 'OFFLINE'
  | 'CONSENT_REQUIRED'
  | 'APP_CHECK_OR_FORBIDDEN'
  | 'MODEL_NOT_FOUND'
  | 'QUOTA_EXCEEDED'
  | 'SERVER_TRANSIENT'
  | 'UNKNOWN';

export interface ClassifiedAiError {
  readonly category: AiErrorCategory;
  readonly httpStatus?: number;
  readonly retryable: boolean;
  readonly message: string;
}

/**
 * Clasificador fidedigno de errores de IA.
 * Regla de oro: Jamás clasificar timeout, JSON parse, modelo ocupado o límite de contexto como "modelo no instalado".
 */
export function classifyAiError(error: unknown): ClassifiedAiError {
  const detail = error && typeof error === 'object' ? error : {};
  const rawMessage = 'message' in detail ? String(detail.message) : String(error ?? '');
  const rawName = 'name' in detail ? String(detail.name) : '';
  const combined = (rawName + ' ' + rawMessage).toLowerCase();
  const data = 'customErrorData' in detail ? detail.customErrorData : undefined;
  const status = data && typeof data === 'object' && 'status' in data ? Number(data.status)
    : Number(/(?:\bhttp\s+|\[)(401|403|404|408|429|500|502|503|504)\b/i.exec(rawMessage)?.[1]);
  if (rawName === 'TimeoutError' || status === 408 || /timed out|timeout|deadline/.test(combined)) {
    const local = /on.device|local/.test(combined);
    return { category: local ? 'LOCAL_TIMEOUT' : 'TIMEOUT', httpStatus: 408, retryable: true,
      message: local ? 'La inferencia local superó el tiempo límite.' : 'La respuesta superó el tiempo límite.' };
  }
  if (rawName === 'AbortError' || /aborted|cancelled|cancelada/.test(combined)) {
    return { category: 'ABORTED', retryable: false, message: 'Solicitud cancelada.' };
  }
  if (status === 401 || status === 403 || /app.?check|permission denied|forbidden/.test(combined)) {
    return { category: 'APP_CHECK_OR_FORBIDDEN', httpStatus: status === 401 ? 401 : 403, retryable: false,
      message: 'Acceso denegado. Verifica la identidad y Firebase App Check.' };
  }
  if (status === 404) {
    return { category: 'MODEL_NOT_FOUND', httpStatus: status, retryable: false, message: 'El modelo Cloud solicitado no está disponible.' };
  }
  if (status === 429 || /resource_exhausted|rate limit/.test(combined)) {
    return { category: 'QUOTA_EXCEEDED', httpStatus: 429, retryable: false, message: 'Se alcanzó la cuota Cloud. Intenta más tarde.' };
  }
  if ([500, 502, 503, 504].includes(status)) {
    return { category: 'SERVER_TRANSIENT', httpStatus: status, retryable: true,
      message: 'El servicio de IA devolvió un error temporal (HTTP ' + status + ').' };
  }
  // 2. Modelo ocupado o concurrencia
  if (combined.includes('busy') || combined.includes('en curso') || combined.includes('in progress') || combined.includes('concurrency')) {
    return {
      category: 'LOCAL_BUSY',
      retryable: true,
      message: 'El modelo local está procesando otra consulta. Espera un momento antes de enviar otra.',
    };
  }

  // 3. Límite de contexto real. No clasificar por las palabras aisladas
  // "context", "token" o "exceed": también aparecen en errores de otro tipo.
  const confirmedContextLimit =
    /(?:context window|context length|context size|context limit|max(?:imum)? context|too many tokens|token limit|token count limit|prompt too long|input too long|input tokens exceeded|(?:exceed|exceeded|exceeds)[^\n]{0,80}(?:tokens?|context)|(?:tokens?|context)[^\n]{0,80}(?:exceed|exceeded|exceeds))/.test(combined);
  if (confirmedContextLimit) {
    return {
      category: 'LOCAL_CONTEXT_EXCEEDED',
      retryable: false,
      message: 'La consulta excede la memoria máxima permitida para el modelo local. Intenta con un texto más breve.',
    };
  }

  // 5. Errores de parseo o JSON inválido
  if (combined.includes('json') || combined.includes('syntaxerror') || combined.includes('parse') || combined.includes('formato') || combined.includes('estructurar')) {
    return {
      category: 'LOCAL_PARSE_ERROR',
      retryable: true,
      message: 'El modelo generó la respuesta pero no se pudo estructurar el formato requerido.',
    };
  }

  // 10. Desconexión / Offline
  if (combined.includes('failed to fetch') || combined.includes('network') || combined.includes('offline') || combined.includes('sin conexión')) {
    return {
      category: 'OFFLINE',
      retryable: false,
      message: 'Sin conexión a internet para consultar Gemini Cloud. Puedes seguir estudiando en Modo Esencial o con IA local compatible.',
    };
  }

  // 11. Consentimiento requerido
  if (combined.includes('consent') || combined.includes('autorización') || combined.includes('autoriza')) {
    return {
      category: 'CONSENT_REQUIRED',
      retryable: false,
      message: 'Se requiere autorización explícita para consultar Gemini Cloud.',
    };
  }

  // 12. Fallo del proceso local de Chrome: no confundir con descarga pendiente.
  if (combined.includes('crashed too many times') ||
      combined.includes('unable to create a session') ||
      combined.includes('invalidstateerror')) {
    return {
      category: 'LOCAL_UNAVAILABLE',
      retryable: false,
      message: 'Chrome no pudo iniciar el modelo local. Revisa los fallos en chrome://on-device-internals y chrome://crashes antes de repetir la prueba.',
    };
  }

  // 13. Modelo realmente no instalado / no soportado
  if (combined.includes('on-device model is not available') || combined.includes('api not available') || combined.includes('unsupported browser') || combined.includes('no-api') || combined.includes('not installed') || combined.includes('no compatible device model') || combined.includes('not supported') || (combined.includes('languagemodel') && combined.includes('undefined'))) {
    return {
      category: 'LOCAL_UNAVAILABLE',
      retryable: false,
      message: 'Gemini Nano no está instalado o disponible en este navegador todavía.',
    };
  }

  return {
    category: 'UNKNOWN',
    retryable: false,
    message: 'No se pudo completar la inferencia con el modelo solicitado.',
  };
}

