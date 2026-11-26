/**
 * EXPLORE-SCIENCE-01 — bounded scientific guard for the sun/shadow school experiment.
 * Deliberately DOES NOT try to validate all science. Unsupported activities pass
 * through the existing tutor checks; a null inspection is not a certificate.
 */
export interface ShadowPriorTurn { readonly role: string; readonly text: string }
export interface ShadowInspection {
  readonly issues: readonly string[];
  readonly feedback: string;
  readonly fallback: string;
}

function shadowContext(question: string, history: readonly ShadowPriorTurn[]): { correction: boolean } | null {
  // NANO-FINAL-SCOPE: apply only to the intended shadow-length experiment.
  // A new evaporation question must never inherit a shadow-length backup.
  if (/evapor\w*|evaporaci[oó]n/i.test(question)) return null;
  const shadowLengthTopic = (s: string) => /\b(?:sombras?|shadows?)\b/i.test(s)
    && /\b(?:palos?|postes?|objetos?|sticks?|poles?|objects?|longitud|length|tama[nñ]o|size)\b/i.test(s);
  const followup = /(?:corr[ií]g|correc|revis|errores?|equivoc|mejor|replante|fix|mistake|wrong|correct|revise)/i.test(question);
  const userHistory = history.slice(-4).filter(message => message.role === 'user').map(message => message.text);
  if (!shadowLengthTopic(question) && !(followup && userHistory.some(shadowLengthTopic))) return null;
  const context = [question, ...userHistory].join(' ');
  if (!/\b(?:sombras?|shadows?)\b/i.test(context) || !/\b(?:sol|solar|sun|d[ií]a|mediod[ií]a|noon)\b/i.test(context)) return null;
  if (!/(?:experimen|investig|hip[oó]tes|hypothes|procedim|variables?|pasos?|steps?|corrig|correc|revis|error|mistake)/i.test(question)) return null;
  const correction = history.some(message => message.role === 'assistant') &&
    /(?:corr[ií]g|correc|revis|errores?|equivoc|mejor|replante|fix|mistake|wrong|correct|revise)/i.test(question);
  return { correction };
}

/** Additional pre-generation instruction ONLY for the supported experiment. */
export function shadowSciencePrompt(question: string, history: readonly ShadowPriorTurn[], english: boolean): string | null {
  if (!shadowContext(question, history)) return null;
  return english
    ? 'SHADOW-SCIENCE CHECK: Keep the stick vertical and FIXED in one place. The independent variable is observation time (proxy for solar elevation angle), the dependent variable is shadow length in cm; keep the same stick, place and measuring method. Do NOT change the stick-to-Sun distance or move the stick to study time-of-day shadows. Never say that the clock must show exactly 12:00 at solar noon. Acknowledge previous tutor mistakes explicitly if the student asks for corrections. Provide a testable hypothesis, materials, steps, a BLANK observation table, comparison method and exactly one FINAL reflection question. No invented observations.'
    : 'VERIFICACIÓN SOMBRAS: mantén el palo VERTICAL y FIJO en el mismo lugar. Variable independiente: hora de observación (aproximación a la altura angular del Sol). Variable dependiente: longitud de la sombra en cm. Controla palo, ubicación, verticalidad y método de medición. NO muevas el palo ni cambies la distancia al Sol. El mediodía solar no siempre son las 12:00 del reloj. Si corriges tu respuesta anterior, reconoce explícitamente el error propio y elimínalo de hipótesis, variables, pasos y pregunta final. Incluye hipótesis comprobable, materiales, pasos, tabla VACÍA de medidas, método de comparación y una sola pregunta FINAL. No inventes observaciones.';
}

/** A modest, deterministic backup. It is NEVER attributed to ON_DEVICE. */
export function shadowScienceFallback(question: string, history: readonly ShadowPriorTurn[], english: boolean): string | null {
  const context = shadowContext(question, history);
  if (!context) return null;
  if (english) return `${context.correction ? 'I was wrong: moving the stick or changing its distance from the Sun does not test how shadows change during the day. I correct my previous hypothesis and variables.\n\n' : ''}Question: How does the length of a fixed stick's shadow change during the day?\nHypothesis: As the Sun rises higher in the sky, the shadow gets shorter; as the Sun gets lower, it gets longer.\nIndependent variable: time of observation (indicator of the Sun's elevation angle).\nDependent variable: shadow length (cm).\nControls: same stick, vertical position, fixed location, same measuring method.\nMaterials: stick, ruler, notebook.\nSteps:\n1. Place the stick vertically in one fixed sunny spot. Do not move it.\n2. Measure from its base to the end of its shadow at three distinct times, e.g. 9:00, 12:00 and 15:00.\n3. Record the time and length in cm for each measurement.\n4. Compare the lengths; relate them to how high the Sun appears. These clock times are examples, not a guarantee that solar noon is at 12:00.\n\n| Time | Shadow length (cm) |\n|---|---|\n| 9:00 | |\n| 12:00 | |\n| 15:00 | |\n\nWhat relationship do you observe between the Sun's apparent height and the shadow length?`;
  return `${context.correction ? 'Me equivoqué: mover el palo o variar su distancia al Sol no permite investigar cómo cambia su sombra durante el día. Corrijo mi hipótesis, las variables y el procedimiento.\n\n' : ''}Pregunta investigable: ¿Cómo cambia la longitud de la sombra de un palo fijo durante el día?\nHipótesis: cuando el Sol está más alto en el cielo, la sombra será más corta; cuando está más bajo, será más larga.\nVariable independiente: hora de observación (indicador de la altura angular del Sol).\nVariable dependiente: longitud de la sombra (cm).\nVariables controladas: mismo palo vertical, lugar fijo y misma forma de medir.\nMateriales: palo, regla y cuaderno.\nPasos:\n1. Coloca el palo verticalmente en una zona soleada y no lo muevas.\n2. Mide desde su base hasta la punta de la sombra a distintas horas, por ejemplo 9:00, 12:00 y 15:00.\n3. Registra cada hora y la longitud de la sombra en centímetros.\n4. Compara las medidas y relaciónalas con la altura aparente del Sol. Los horarios son ejemplos: el mediodía solar no siempre coincide con las 12:00.\n\n| Hora | Longitud de la sombra (cm) |\n|---|---|\n| 9:00 | |\n| 12:00 | |\n| 15:00 | |\n\n¿Qué relación observas entre la altura aparente del Sol y la longitud de la sombra?`;
}

function sectionText(answer: string, heading: RegExp): string {
  const lines = answer.split(/\r?\n/);
  const index = lines.findIndex(line => heading.test(line));
  if (index < 0) return '';
  return lines.slice(index, Math.min(index + 3, lines.length)).join(' ').slice(0, 280);
}

/** Returns null for a safe-looking or unsupported answer, NOT proof of correctness. */
export function inspectExploreShadow(
  question: string, answer: string, history: readonly ShadowPriorTurn[], english: boolean
): ShadowInspection | null {
  const context = shadowContext(question, history);
  if (!context) return null;
  const issues: string[] = [];
  const text = answer.replace(/\*\*/g, '').replace(/[−–]/g, '-');
  const lineQuestion = sectionText(text, /(?:pregunta investigable|research question|question to investigate)/i);
  const lineHypothesis = sectionText(text, /hip[oó]tesis|hypothesis/i);
  const lineIndependent = sectionText(text, /(?:independiente|independent)/i);
  const directDistance = /(?:distancia|distance)\s+(?:entre|from|to|del?|al?)?[^\n.?!]{0,110}(?:el\s+sol|sun|luz\s+solar)|(?:sol|sun)[^\n.?!]{0,85}(?:distancia|distance)/i;
  // Distance may legitimately be mentioned to DISCARD it as a variable.
  const distanceAsCause = [lineQuestion, lineHypothesis, lineIndependent].some(section =>
    directDistance.test(section) && !/(?:no\s+(?:es|se\s+modifica|cambia|depende)|not\s+(?:the|a|an|changed|relevant)|incorrect|equivocad|error)/i.test(section));
  if (distanceAsCause) issues.push('distance-misconception');
  if (/(?:mueve|mover|moviendo|desplaza|cambia\s+(?:el|la)\s+(?:palo|objeto)|move\s+the\s+(?:stick|pole)|adjust\s+the\s+distance)/i.test(text)
      && !/(?:no\s+(?:(?:lo|la)\s+)?(?:muevas|mover|se\s+mueve)|sin\s+mover|do\s+not\s+move|without\s+moving)/i.test(text)) issues.push('moving-stick');
  const hasIndependent = /(?:variable\s+independiente|independent\s+variable)[\s\S]{0,115}(?:hora|tiempo|momento|observaci[oó]n|time|hour|solar\s+elevation)/i.test(text);
  if (!hasIndependent) issues.push('missing-time-variable');
  const hasDependent = /(?:variable\s+dependiente|dependent\s+variable)[\s\S]{0,115}(?:longitud|sombra|length|shadow)/i.test(text);
  if (!hasDependent) issues.push('missing-shadow-measurement');
  if (!/hip[oó]tesis|hypothesis/i.test(text)) issues.push('missing-hypothesis');
  if (!/material|materials/i.test(text) || !/(?:pasos?|procedimiento|steps?|procedure)/i.test(text)) issues.push('missing-experiment-structure');
  if (!/(?:fij[oa]|mismo\s+lugar|sin\s+mover|no\s+(?:lo|la)\s+muevas|fixed|same\s+place|do\s+not\s+move)/i.test(text)
      || !/(?:vertical|upright)/i.test(text)) issues.push('stick-not-controlled');
  if (!/(?:\b\d{1,2}:\d{2}\b|distintas\s+horas|diferentes\s+(?:horas|momentos)|varias\s+horas|different\s+times|various\s+times)/i.test(text)) issues.push('missing-time-comparison');
  if (!/(?:registra|anota|registro|tabla|record|table)/i.test(text)) issues.push('missing-recording');
  if (!/(?:compara|comparaci[oó]n|compare|comparison)/i.test(text)) issues.push('missing-comparison');
  if (context.correction && !/(?:me\s+equivoqu[eé]|mi\s+error|fue\s+un\s+error\s+m[ií]o|i\s+was\s+wrong|my\s+mistake)/i.test(text)) issues.push('does-not-own-error');
  // The last question must not reintroduce the discredited Sun-distance variable.
  const lastQuestion = text.slice(text.lastIndexOf('?') >= 0 ? Math.max(0, text.lastIndexOf('¿') + 1) : text.length - 250).trim();
  if (!text.trimEnd().endsWith('?') || !/\?/.test(lastQuestion)) issues.push('missing-final-question');
  if (directDistance.test(lastQuestion)) issues.push('wrong-reflection-question');
  if (!issues.length) return null;
  return {
    issues,
    feedback: english
      ? `The solar-shadow experiment has problems (${issues.join(', ')}). Keep the pole fixed. Use observation time, shadow length, realistic controls, and correct scientific explanations. Acknowledge your earlier error when correcting it. End with one reflection question without inventing measurements.`
      : `El experimento de sombras tiene fallos (${issues.join(', ')}). Mantén el palo fijo. Usa hora de observación, longitud de la sombra y controles reales. Corrige científicamente el razonamiento y reconoce tu error anterior cuando corresponda. Termina con una pregunta de reflexión sin inventar mediciones.`,
    fallback: shadowScienceFallback(question, history, english)!,
  };
}
