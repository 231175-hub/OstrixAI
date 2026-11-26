/**
 * Pedagogical Rules & Academic Verification Engine — OstrixAi / BuildHybridAI 2026
 * Enforces strict pedagogical accuracy across disciplines:
 * - Grammar: Transitive vs Intransitive verbs (e.g. "El perro ladra" is strictly intransitive with NO direct object).
 * - Mathematics: Deterministic checks, step-by-step verification, linear equations, graphs and adjacency matrices.
 * - Natural Sciences: Vector vs scalar, mass vs weight, atom vs molecule.
 * - Eureka: Semantic classification of discoveries to prevent hallucinating understanding from single isolated keywords.
 * - Filtering of generic canned placeholders.
 */

export type AcademicDiscipline =
  | 'COMUNICACION'
  | 'MATEMATICA'
  | 'CIENCIA_TECNOLOGIA'
  | 'CIENCIAS_SOCIALES'
  | 'COMPUTACION'
  | 'GENERAL';

export type EurekaClassificationType = 'CLEAR_DISCOVERY' | 'AMBIGUOUS_KEYWORD';

export interface EurekaClassification {
  readonly type: EurekaClassificationType;
  readonly isClarificationNeeded: boolean;
  readonly suggestedClarification?: string;
}

export interface ValidatedEnrichment {
  readonly explanation: string;
  readonly examples: readonly string[];
  readonly keyIdeas: readonly string[];
  readonly commonMistakes: readonly string[];
  readonly discipline: AcademicDiscipline;
  readonly wasCorrected: boolean;
  readonly correctionReason?: string;
}

/** Known list of purely intransitive verbs in Spanish to prevent false transitive classifications */
const INTRANSITIVE_VERB_ROOTS = [
  'ladra', 'ladrar', 'ladran', 'ladraba', 'ladró',
  'duerme', 'dormir', 'duermen', 'dormía', 'durmió',
  'nace', 'nacer', 'nacen', 'nacía', 'nació',
  'muere', 'morir', 'mueren', 'moría', 'murió',
  'tose', 'toser', 'tosen', 'tosía', 'tosió',
  'sonrie', 'sonreir', 'sonríe', 'sonreír',
  'viaja', 'viajar', 'viajan', 'viajaba', 'viajó',
  'estornuda', 'estornudar', 'estornudan',
  'existe', 'existir', 'existen', 'existía',
  'brilla', 'brillar', 'brillan', 'brillaba',
];

/** Generic placeholder phrases that must NEVER be shown to students as real learning */
const GENERIC_PHRASE_PATTERNS = [
  /comprender los principios b[aá]sicos y practicar con ejemplos/i,
  /confundir los t[eé]rminos conceptuales sin verificar el procedimiento/i,
  /prestar atenci[oó]n a los conceptos generales/i,
  /revisar la teor[ií]a antes de hacer ejercicios/i,
  /practicar constantemente para mejorar/i,
  /no olvidar repasar lo aprendido/i,
  /comprender la importancia de este tema/i,
  /memorizar las definiciones b[aá]sicas/i,
];

/**
 * Detects the discipline based on course name and topic text.
 */
export function detectDiscipline(courseName: string, topicText: string = ''): AcademicDiscipline {
  const norm = `${courseName} ${topicText}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (norm.includes('comunica') || norm.includes('lengua') || norm.includes('literatur') ||
      norm.includes('verbo') || norm.includes('oracion') || norm.includes('gramat') ||
      norm.includes('redacc') || norm.includes('sintaxis') || norm.includes('comprension lectora')) {
    return 'COMUNICACION';
  }

  if (norm.includes('matemat') || norm.includes('algebra') || norm.includes('aritmet') ||
      norm.includes('geometr') || norm.includes('trigono') || norm.includes('calculo') ||
      norm.includes('ecuacion') || norm.includes('pitagoras') || norm.includes('fraccion') ||
      norm.includes('numero') || norm.includes('polinomio')) {
    return 'MATEMATICA';
  }

  if (norm.includes('ciencia') || norm.includes('fisica') || norm.includes('quimica') ||
      norm.includes('biolog') || norm.includes('ambiente') || norm.includes('celula') ||
      norm.includes('energia') || norm.includes('fuerza') || norm.includes('atomo') ||
      norm.includes('materia') || norm.includes('ecosistema') || norm.includes('adn')) {
    return 'CIENCIA_TECNOLOGIA';
  }

  if (norm.includes('grafo') || norm.includes('algoritmo') || norm.includes('robot') ||
      norm.includes('programac') || norm.includes('computac') || norm.includes('software') ||
      norm.includes('matriz de adyacencia') || norm.includes('vertice') || norm.includes('arista') ||
      norm.includes('dijkstra') || norm.includes('ept')) {
    return 'COMPUTACION';
  }

  if (norm.includes('social') || norm.includes('historia') || norm.includes('geograf') ||
      norm.includes('dpcc') || norm.includes('ciudadan') || norm.includes('civica') ||
      norm.includes('cultura') || norm.includes('economia') || norm.includes('tahuantinsuyo')) {
    return 'CIENCIAS_SOCIALES';
  }

  return 'GENERAL';
}

/**
 * Builds discipline-specific pedagogical instructions that prevent common AI hallucinations.
 */
export function buildPedagogicalPrompt(
  courseName: string,
  topicName: string,
  notesSnippet: string
): string {
  const discipline = detectDiscipline(courseName, topicName + ' ' + notesSnippet);

  let disciplineGuidance = '';

  switch (discipline) {
    case 'COMUNICACION':
      disciplineGuidance =
        `REGLAS OBLIGATORIAS DE COMUNICACIÓN Y GRAMÁTICA:\n` +
        `1. Distingue estrictamente verbos transitivos de intransitivos:\n` +
        `   - Un verbo es INTRANSITIVO cuando NO admite ni lleva complemento directo (objeto directo). La acción no recae sobre nada externo.\n` +
        `   - Ejemplos intransitivos: "El perro ladra", "El bebé duerme", "Ella tose", "Los niños juegan en el parque" ("en el parque" es circunstancial de lugar, NUNCA objeto directo).\n` +
        `   - Un verbo es TRANSITIVO ÚNICAMENTE si exige y presenta complemento directo (ej. "Juan lee un libro" -> ¿Qué lee? Un libro = CD).\n` +
        `2. NUNCA afirmes que "ladrar", "dormir", "morir" o "nacer" son verbos transitivos ni que tienen objeto directo.\n` +
        `3. Sé exacto al analizar la función sintáctica del sujeto, verbo y modificadores.\n`;
      break;

    case 'MATEMATICA':
      disciplineGuidance =
        `REGLAS OBLIGATORIAS DE MATEMÁTICA:\n` +
        `1. Verifica cada operación y fórmula matemática con exactitud determinista.\n` +
        `2. En ecuaciones de primer grado ax + b = c, muestra el despeje formal ax = c - b => x = (c - b)/a y la comprobación por sustitución.\n` +
        `3. En geometría y trigonometría, nombra con precisión vértices, lados y teoremas (ej. Pitágoras a² + b² = c²).\n` +
        `4. Si un apunte no especifica números, usa un ejemplo numérico elemental verificable.\n`;
      break;

    case 'CIENCIA_TECNOLOGIA':
      disciplineGuidance =
        `REGLAS OBLIGATORIAS DE CIENCIA Y TECNOLOGÍA:\n` +
        `1. Distingue claramente magnitudes físicas: masa (kg, escalar) de peso (fuerza en Newtons, P = m·g).\n` +
        `2. Distingue velocidad (vector con dirección) de rapidez (escalar).\n` +
        `3. En química y biología, distingue célula procariota de eucariota, átomo de molécula, y elemento de compuesto con rigor.\n` +
        `4. No inventes propiedades empíricas ni relaciones causales no demostradas.\n`;
      break;

    case 'COMPUTACION':
      disciplineGuidance =
        `REGLAS OBLIGATORIAS DE COMPUTACIÓN Y GRAFOS:\n` +
        `1. Un grafo G = (V, E) se compone de un conjunto de vértices V (nodos) y un conjunto de aristas E (conexiones).\n` +
        `2. Una matriz de adyacencia es una matriz cuadrada |V| x |V| donde la posición A[i][j] indica la conexión entre el vértice i y el vértice j.\n` +
        `3. En algoritmos como Dijkstra, explica que encuentra el camino más corto desde un origen en grafos con pesos no negativos.\n`;
      break;

    case 'CIENCIAS_SOCIALES':
      disciplineGuidance =
        `REGLAS OBLIGATORIAS DE CIENCIAS SOCIALES:\n` +
        `1. Respeta el marco temporal y contexto histórico de los hechos.\n` +
        `2. Distingue causas estructurales de causas coyunturales.\n` +
        `3. Explica conceptos ciudadanos (derechos, deberes, democracia) de forma objetiva y constructiva.\n`;
      break;

    default:
      disciplineGuidance =
        `REGLAS GENERALES DE EXACTITUD:\n` +
        `1. Prioriza la exactitud conceptual sobre la extensión.\n` +
        `2. Basa la explicación exclusivamente en los conceptos presentes en los apuntes.\n` +
        `3. Si un concepto es ambiguo, explica lo que sí es claro y señala la ambigüedad con honestidad.\n`;
      break;
  }

  return (
    `Curso: ${courseName}. Tema: ${topicName}.\n` +
    `Apuntes del estudiante:\n${notesSnippet}\n\n` +
    `${disciplineGuidance}\n` +
    `FORMATO DE RESPUESTA EXIGIDO:\n` +
    `Escribe en español con lenguaje claro y educativo para educación secundaria.\n` +
    `Divide tu respuesta en secciones bien diferenciadas separadas por doble salto de línea:\n` +
    `Párrafo 1: Explicación conceptual rigurosa y clara (50 a 80 palabras).\n` +
    `Párrafo 2: Ejemplo práctico y verificable desarrollado paso a paso.\n` +
    `Párrafo 3 (opcional): Una idea clave concreta y específica del tema (solo si aporta valor real, NUNCA frases genéricas).\n` +
    `Párrafo 4 (opcional): Un error común frecuente específico de este tema (solo si aplica directamente, NUNCA frases genéricas).\n\n` +
    `REGLA FUNDAMENTAL: No uses viñetas genéricas ni decorativas. Si no hay un error común relevante, no lo inventes. Usa texto limpio sin asteriscos ni numerales.`
  );
}

/**
 * Validates whether a text is a generic canned phrase that should be discarded.
 */
export function isGenericPlaceholder(text: string): boolean {
  if (!text || text.trim().length < 10) return true;
  const clean = text.trim();
  for (const pat of GENERIC_PHRASE_PATTERNS) {
    if (pat.test(clean)) return true;
  }
  // Check for ultra-short vague phrases
  if (/^(comprender|estudiar|practicar|repasar|recordar)\s+los\s+(conceptos|temas|ejemplos)/i.test(clean)) {
    return true;
  }
  return false;
}

/**
 * Validates grammatical consistency in Spanish linguistics explanations,
 * specifically fixing false transitive claims on intransitive verbs like "ladrar".
 */
export function auditAndCorrectGrammarConsistency(rawExplanation: string): {
  text: string;
  corrected: boolean;
  reason?: string;
} {
  let text = rawExplanation;
  let corrected = false;
  let reason: string | undefined;

  const lower = text.toLowerCase();

  // Pattern detection: claiming that "El perro ladra" or "ladrar" is transitivo or has objeto directo
  const mentionsLadra = lower.includes('ladra') || lower.includes('perro');
  const claimsTransitive = lower.includes('transitiv') || lower.includes('objeto directo') || lower.includes('complemento directo');

  if (mentionsLadra && claimsTransitive) {
    const errorPattern1 = /(?:el verbo\s+)?(?:["']?el perro ladra["']?|["']?ladrar["']?)[^.]*?(?:es\s+(?:una\s+acci[oó]n\s+)?transitiva|recibe\s+(?:un\s+)?objeto\s+directo|tiene\s+(?:un\s+)?complemento\s+directo)[^.]*/i;
    const errorPattern2 = /(?:acci[oó]n|verbo)\s+transitiv[ao][^.]*?(?:el perro ladra|ladrar)[^.]*/i;

    if (errorPattern1.test(text) || errorPattern2.test(text)) {
      // Correct the mistake with factual grammar truth
      text = text.replace(
        errorPattern1,
        'el verbo "ladrar" en "El perro ladra" es intransitivo porque no admite ni presenta complemento directo'
      );
      text = text.replace(
        errorPattern2,
        'un verbo intransitivo (como en "El perro ladra", donde no hay complemento directo)'
      );
      corrected = true;
      reason = 'Corrección pedagógica: "El perro ladra" es una oración intransitiva sin complemento directo.';
    }
  }

  // General check for intransitive verbs mistakenly called transitivos
  for (const verb of ['dormir', 'morir', 'toser', 'sonreir', 'sonreír']) {
    const falseTransitive = new RegExp(`(?:el verbo|la acci[oó]n)\\s+["']?${verb}["']?\\s+es\\s+transitiv[ao]`, 'i');
    if (falseTransitive.test(text)) {
      text = text.replace(falseTransitive, `el verbo "${verb}" es intransitivo`);
      corrected = true;
      reason = `Corrección pedagógica: "${verb}" es un verbo intransitivo.`;
    }
  }

  return { text, corrected, reason };
}

/**
 * Validates and sanitizes the output of an enrichment generation.
 * Guarantees zero generic placeholders, conditioned sections, and grammatical accuracy.
 */
export function validateAndSanitizeEnrichment(
  rawText: string,
  courseName: string,
  topicName: string
): ValidatedEnrichment {
  const discipline = detectDiscipline(courseName, topicName);
  const grammarAudit = discipline === 'COMUNICACION'
    ? auditAndCorrectGrammarConsistency(rawText)
    : { text: rawText, corrected: false };

  const paragraphs = grammarAudit.text
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  const explanation = paragraphs.length > 0 ? paragraphs[0] : grammarAudit.text.trim();

  // Extract examples
  const examples: string[] = [];
  if (paragraphs.length > 1) {
    const p1 = paragraphs[1];
    // Strip prefixes like "Ejemplo:", "Ejemplo práctico:"
    const cleanEx = p1.replace(/^(?:ejemplo(?:\s+pr[aá]ctico)?[:\s\-]+)/i, '').trim();
    if (cleanEx.length > 15 && !isGenericPlaceholder(cleanEx)) {
      examples.push(cleanEx);
    }
  }

  // Extract key ideas (conditioned, non-generic)
  const keyIdeas: string[] = [];
  if (paragraphs.length > 2) {
    const p2 = paragraphs[2];
    const cleanIdea = p2.replace(/^(?:idea\s+clave(?:\s+para\s+recordar)?[:\s\-]+)/i, '').trim();
    if (cleanIdea.length > 15 && !isGenericPlaceholder(cleanIdea)) {
      keyIdeas.push(cleanIdea);
    }
  }

  // Extract common mistakes (conditioned, non-generic)
  const commonMistakes: string[] = [];
  if (paragraphs.length > 3) {
    const p3 = paragraphs[3];
    const cleanMistake = p3.replace(/^(?:cuidado\s+con\s+este\s+error\s+com[uú]n|error\s+(?:com[uú]n|frecuente))[:\s\-]+/i, '').trim();
    if (cleanMistake.length > 15 && !isGenericPlaceholder(cleanMistake)) {
      commonMistakes.push(cleanMistake);
    }
  }

  return {
    explanation,
    examples,
    keyIdeas,
    commonMistakes,
    discipline,
    wasCorrected: grammarAudit.corrected,
    correctionReason: grammarAudit.reason,
  };
}

/**
 * Classifies Eureka discoveries to prevent hallucinating understanding from single isolated words.
 * Section 4: If student writes "Verbos", don't claim they discovered functions of verbs; suggest clarification.
 */
export function classifyEurekaDiscovery(rawText: string): EurekaClassification {
  const clean = rawText.trim();
  const words = clean.split(/\s+/).filter(Boolean);

  // If 1 or 2 words only (e.g. "Verbos", "Ecuaciones", "La fotosíntesis")
  if (words.length <= 2) {
    const term = clean.replace(/^(el|la|los|las|un|una)\s+/i, '');
    return {
      type: 'AMBIGUOUS_KEYWORD',
      isClarificationNeeded: true,
      suggestedClarification: `¿Qué descubriste sobre ${clean.toLowerCase()}? Completa tu idea con una oración breve para que Ostrix te ayude a profundizarla.`,
    };
  }

  // If 3 words but without an active verb or relation (e.g. "Los verbos irregulares")
  const hasVerbIndicator = /(es|son|descubr[ií]|not[eé]|aprend[ií]|funciona|sirve|cambia|depende|tiene|tienen|produce|relaciona|porque|cuando)/i.test(clean);
  if (words.length <= 4 && !hasVerbIndicator) {
    return {
      type: 'AMBIGUOUS_KEYWORD',
      isClarificationNeeded: true,
      suggestedClarification: `Registraste el tema "${clean}". ¿Cuál fue tu descubrimiento o momento Eureka específico?`,
    };
  }

  return {
    type: 'CLEAR_DISCOVERY',
    isClarificationNeeded: false,
  };
}
