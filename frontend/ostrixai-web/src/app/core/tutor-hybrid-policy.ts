/** Policy only: the AI service remains the sole authority on consent, identity and availability. */
export function isComplexTutorTask(
  question: string, mode: string,
  history: readonly { role: string; text: string }[] = []
): boolean {
  const q = question.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  if (mode === 'explore') return true;
  // Explicit reasoning, comparison, investigation or multi-stage mathematics.
  if (/\b(?:compar\w*|contrast\w*|analiz\w*|analy[sz]\w*|justific\w*|demuestr\w*|demostr\w*|prove|deriv\w*|experimen\w*|investigacion|research design|paso a paso|step.by.step|descuentos sucesivos|successive discounts|compound interest|interes compuesto)\b/.test(q)) {
    // A new practice problem can still be generated locally. Evaluating its answer cannot.
    if (mode !== 'practice' || !/\b(?:plantea\w*|propon\w*|genera\w*|disena\w*|crea\w*|pose|propose|generate|design|create)\b/.test(q)
      || /\b(?:mi respuesta|my answer|mi procedimiento|my reasoning|corrige|correct my|evalua|evaluate)\b/.test(q)) return true;
  }
  const last = history.at(-1);
  if (mode === 'practice' && last?.role === 'assistant') {
    // Recognize a clearly requested new exercise; otherwise treat a follow-up as assessment.
    const newExercise = /\b(?:otro ejercicio|otra pregunta|nuevo ejercicio|nueva pregunta|another exercise|another question|new exercise|new question|next exercise)\b/.test(q)
      && !/\b(?:mi respuesta|my answer|mi procedimiento|my reasoning|corrige|evalua|evaluate|check my)\b/.test(q);
    return !newExercise;
  }
  if (mode === 'guide' && /\b(?:mi razonamiento|mi procedimiento|mi respuesta|my reasoning|my answer|my work|estoy haciendo lo correcto|es correcto|es correcta|me equivoque|is this correct|am i right|corrige|check my)\b/.test(q)) return true;
  return false;
}

/** Only use compact instructions for independent local exploration, never instead of authorized notes. */
export function useCompactExplore(mode: string, hasSession: boolean, hasHistory: boolean, localOnly: boolean): boolean {
  return mode === 'explore' && !hasSession && !hasHistory && localOnly;
}

export function compactExploreGuidance(question: string, english: boolean): string {
  const experimental = /experimen|investig|hip[oó]tes|hypothes|variables?|materiales?|materials?|pasos?|steps?|procedim/i.test(question);
  if (!experimental) return english
    ? 'EXPLORE: Explain the observation, distinguish evidence and hypotheses, and suggest a safe way to investigate if relevant. Do not invent results.'
    : 'EXPLOREMOS: explica la observación, distingue hechos e hipótesis y sugiere cómo investigar de forma segura si corresponde. No inventes resultados.';
  const base = english
    ? 'EXPLORE: Give a testable question, hypothesis, independent/dependent variables and controls, materials, steps and a recording method. Vary one factor. Use separate comparable samples, realistic tools and clear measurement endpoints. Never invent results or recommend drinking untreated water. Prefer a short usable design; respect requested counts and detail.'
    : 'EXPLOREMOS: incluye pregunta investigable, hipótesis, variables independiente y dependiente, controles, materiales, pasos y registro. Cambia un solo factor. Usa muestras separadas comparables, instrumentos adecuados y un final de medición definido. No inventes resultados ni recomiendes beber agua sin tratar. Prefiere un diseño breve y realizable; respeta el detalle y cantidades solicitadas.';
  // Small facts, not finished responses. General science principles for common school investigations.
  const facts: string[] = [];
  if (/germin|lenteja|lentil|sprout/i.test(question)) facts.push(english
    ? 'Germination: too little or excess water may reduce germination. Count each seed once using visible root emergence.'
    : 'Germinación: falta o exceso de agua pueden reducirla. Cuenta cada semilla una vez al observar la raíz.');
  if (/tallo|xilema|capilar|stem|xylem/i.test(question) && /agua|water/i.test(question)) facts.push(english
    ? 'Water transport: transpiration from leaves creates tension in xylem; cohesion and adhesion help. A visible dye can trace the pathway, not measure pressure.'
    : 'Transporte de agua: la transpiración de las hojas genera tensión en el xilema; cohesión y adhesión ayudan. Un colorante permite observar el recorrido, no medir la presión.');
  if (/disuelv|disoluci|dissolv/i.test(question) && /temperatur|fr[ií]|tibi|calient|cold|warm/i.test(question)) facts.push(english
    ? 'Dissolution: compare equal amounts, stirring and particle size; vary water temperature. Measure time until visible solute disappears, not solubility.'
    : 'Disolución: compara cantidades iguales, agitación y tamaño de partículas; varía la temperatura. Mide tiempo hasta que desaparezca el soluto visible, no solubilidad.');
  return [base, ...facts].join('\n');
}

/** A general planning activity, explicitly not a generated or verified topic-specific answer. */
export function essentialExploreActivity(english: boolean): string {
  return english
    ? 'The AI could not complete this question. This is an offline planning activity, not a verified answer about the topic.\n\nChoose one factor to change and one outcome to measure. Write a testable prediction. List the materials you have, keep other conditions comparable and define a safe procedure. Make a blank table with trial, condition, measurement and unit. Record only actual observations; compare them with your prediction. Ask a teacher to check the plan before doing an experiment.'
    : 'La IA no pudo completar esta consulta. Esta es una actividad de planificación offline, no una respuesta específica verificada sobre el tema.\n\nElige un factor que cambiar y un resultado que medir. Escribe una predicción comprobable. Anota los materiales disponibles, conserva iguales las otras condiciones y define un procedimiento seguro. Prepara una tabla vacía con ensayo, condición, medición y unidad. Registra solo observaciones reales y compáralas con tu predicción. Pide a un docente que revise el plan antes de experimentar.';
}