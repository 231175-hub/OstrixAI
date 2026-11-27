/** NANO-RAG-01: small, curated offline fact index. No network, embeddings, answer templates or student storage.
 * Facts are original summaries of standard school concepts. The model still writes the answer.
 * Reference: https://www.weather.gov/safety/lightning-science-overview
 * https://openstax.org/books/biology-2e/pages/30-5-transport-of-water-and-solutes-in-plants
 * https://openstax.org/books/chemistry-2e/pages/11-3-solubility
 */
interface FactCard { id: string; match: RegExp; es: string; en: string }
const cards: readonly FactCard[] = [
  { id: 'light-sound', match: /\b(?:relampag\w*|truen\w*|lightning|thunder)\b|(?=.*\b(?:luz|light)\b)(?=.*\b(?:sonido|sound)\b)/,
    es: 'La luz viaja aproximadamente a 300 000 km/s en el vacío (casi igual en aire); el sonido en aire a 20 °C, a 343 m/s. La luz es unas 874 000 veces más rápida, nunca al revés. El trueno es una onda causada por el calentamiento y expansión súbitos del aire. Una distancia de 1 km implica unos 2,9 s de retraso sonoro. Observar tormentas solo desde un refugio seguro.',
    en: 'Light travels at about 300,000 km/s in vacuum (nearly the same in air); sound in air at 20 °C travels at 343 m/s. Light is roughly 874,000 times faster, not the reverse. Thunder comes from rapid heating and expansion of air. At 1 km the sound delay is about 2.9 s. Observe storms only from safe shelter.' },
  { id: 'heat-conduction', match: /conductividad termica|conduccion termica|thermal conductiv|heat conduction|(?=.*\b(?:metal|metales)\b)(?=.*\b(?:madera|wood|calor|heat)\b)/,
    es: 'La conducción transfiere energía de la región caliente a la fría. Los metales suelen conducir mejor que la madera; el calor llega al mango metálico más rápidamente. Conductividad no es capacidad calorífica ni distancia recorrida. La madera también se calienta y puede quemar. Para comparar, mide temperaturas en puntos equivalentes de las cucharas, no solo del agua.',
    en: 'Conduction transfers energy from warmer to cooler regions. Metals usually conduct better than wood, so heat reaches a metal handle faster. Conductivity is not heat capacity or travel distance. Wood can also get hot enough to burn. Compare temperatures at equivalent points on the spoons, not only the water.' },
  { id: 'plant-water', match: /\b(?:xilema|xylem|capilaridad|capillary|transpiracion|transpiration)\b|(?=.*\b(?:agua|water)\b)(?=.*\b(?:tallo|tallos|stem|stems|apio|celery)\b)/,
    es: 'El xilema transporta agua. La evaporación en hojas genera tensión (presión menor que la atmosférica); cohesión y adhesión ayudan a mantener la columna de agua. Un colorante alimentario permite observar su recorrido, no medir presión. Para investigar transpiración, compara tallos equivalentes con distinta cantidad de hojas y el mismo colorante; registra altura visible en cm a tiempos iguales. No compares altura de color con agua sin colorante.',
    en: 'Xylem carries water. Evaporation from leaves creates tension (pressure below atmospheric pressure); cohesion and adhesion help maintain the water column. Food dye traces the path, not pressure. To investigate transpiration, compare similar stems with different leaf area and the same dye; record visible dye height in cm at equal times. Do not compare dye height with clear water.' },
  { id: 'photosynthesis', match: /fotosintes|photosynth|(?=.*\b(?:plantas?|plants?)\b)(?=.*\b(?:alimento|food|glucosa|glucose)\b)/,
    es: 'En la fotosíntesis, las plantas usan energía luminosa, agua y dióxido de carbono para producir azúcares y liberar oxígeno. Las raíces absorben agua y minerales, no todo el alimento. La luz aporta energía, no materia. La respiración celular también ocurre en plantas.',
    en: 'In photosynthesis, plants use light energy, water and carbon dioxide to make sugars and release oxygen. Roots take up water and minerals, not all their food. Light provides energy, not matter. Plants also perform cellular respiration.' },
  { id: 'phase-change', match: /\b(?:derret\w*|fusion|solidific\w*|estados de la materia|phase change|melt\w*|freez\w*)\b/,
    es: 'La fusión cambia sólido a líquido sin cambiar la sustancia (hielo y agua son H2O). Para comparar derretimiento usa cubos separados de igual masa, recipientes iguales, inicia cronómetros al mismo tiempo y detén cada uno cuando desaparezca el último hielo. No fijes un tiempo de finalización igual si la variable medida es duración.',
    en: 'Melting changes a solid into a liquid without changing the substance (ice and water are H2O). Compare separate equal-mass cubes in identical containers, start timers together and stop each when the last ice disappears. Do not impose equal stopping times if duration is the measurement.' },
  { id: 'dissolution', match: /\b(?:disuelv\w*|disoluci\w*|dissolv\w*|dissolution|solubili\w*)\b/,
    es: 'Disolver no es derretir. El azúcar suele disolverse más rápido en agua tibia que fría. Velocidad de disolución y solubilidad de equilibrio son distintas. Varía solo temperatura; conserva masa de azúcar, volumen, tamaño de granos y agitación. Mide tiempo hasta que desaparezcan los granos visibles. Usa agua tibia, no hirviendo.',
    en: 'Dissolving is not melting. Sugar generally dissolves faster in warm than cold water. Dissolution rate and equilibrium solubility differ. Vary only temperature; keep sugar mass, water volume, grain size and stirring equal. Measure time until visible grains disappear. Use warm, not boiling, water.' },
  { id: 'gravity-motion', match: /\b(?:gravedad|gravity|caida libre|free fall|rampa|ramp|energia potencial|potential energy)\b/,
    es: 'Cerca de la Tierra g≈9,8 m/s² y de la Luna g≈1,62 m/s². Sin resistencia del aire, a=F/m=g. En una rampa aumenta la componente del peso paralela al plano al aumentar el ángulo, no el peso total. Una mayor altura inicial aporta más energía potencial mgh; la fricción disipa energía. Mide desde un punto de referencia fijo y repite ensayos.',
    en: 'Near Earth g≈9.8 m/s²; near the Moon g≈1.62 m/s². Without air resistance, a=F/m=g. On a ramp a steeper angle increases the component of weight along the ramp, not total weight. A higher start provides more potential energy mgh; friction dissipates energy. Measure from a consistent reference and repeat trials.' },
  { id: 'water-cycle', match: /\b(?:evapor\w*|condens\w*|lluvia|nubes?|water cycle|clouds?|rain|precipitacion)\b/,
    es: 'Evaporación: líquido a vapor. Condensación: vapor a líquido al alcanzarse condiciones adecuadas, normalmente por enfriamiento. Las nubes visibles son gotas o cristales, no vapor invisible. La precipitación ocurre cuando las partículas crecen lo suficiente para caer. Para medir evaporación compara el cambio de masa o volumen durante intervalos iguales.',
    en: 'Evaporation changes liquid to vapor. Condensation changes vapor to liquid under suitable conditions, often through cooling. Visible clouds are droplets or crystals, not invisible vapor. Precipitation occurs when particles grow enough to fall. Measure evaporation by mass or volume change over equal time intervals.' },
  { id: 'cells', match: /\b(?:celulas?|cells?)\b/,
    es: 'Células animales y vegetales típicas son eucariotas, con membrana y núcleo. Las vegetales tienen pared celular y gran vacuola central típica; las fotosintéticas contienen cloroplastos. Las animales no poseen pared celular ni cloroplastos. No todas las células vegetales fotosintetizan.',
    en: 'Typical animal and plant cells are eukaryotic, with a membrane and nucleus. Plant cells have a cell wall and usually a large central vacuole; photosynthetic cells contain chloroplasts. Animal cells lack cell walls and chloroplasts. Not every plant cell photosynthesizes.' },
  { id: 'fractions', match: /\b(?:fracci\w*|denominador\w*|numerador\w*|fractions?|denominator\w*|numerator\w*)\b|\d\s*\/\s*\d/,
    es: 'En suma/resta de fracciones usa denominador común y suma/resta numeradores equivalentes; no sumes denominadores. En U partes usadas de T, usadas=U/T y restantes=(T-U)/T. Compara contra el mismo entero. Multiplicar y dividir son reglas distintas.',
    en: 'For addition/subtraction of fractions use a common denominator and add/subtract equivalent numerators; never add denominators. For U used parts out of T, used=U/T and remaining=(T-U)/T. Use the same whole. Multiplication and division follow different rules.' },
  { id: 'percentages', match: /\b(?:porcentaj\w*|percent\w*|descuent\w*|discount\w*)\b|\d\s*%/,
    es: 'Un porcentaje p% de B es B×p/100. Un descuento reduce la base. Dos descuentos sucesivos d1,d2 dan B×(1-d1/100)×(1-d2/100); no se suman sus tasas. Usa la base y unidades correctas. Si creas un ejercicio, proporciona todos los datos y no reveles la solución.',
    en: 'p% of B is B×p/100. A discount reduces the base. Two successive discounts d1,d2 give B×(1-d1/100)×(1-d2/100); do not add rates. Use the correct base and units. When creating an exercise, provide all data and do not reveal its solution.' },
  { id: 'linear-equation', match: /\b(?:ecuacion\w*|equation\w*)\b|\d\s*x\s*[+−-]/,
    es: 'En una ecuación, aplica la misma operación a ambos miembros. Para eliminar +b resta b; para eliminar -b suma b. Después divide por el coeficiente no nulo de la incógnita. Verifica por sustitución. No felicites pasos incorrectos ni reveles la solución en Guíame.',
    en: 'Apply the same operation to both sides of an equation. To remove +b subtract b; to remove -b add b. Then divide by the nonzero coefficient. Check by substitution. Do not praise incorrect steps or reveal the solution in Guide mode.' },
  { id: 'germination', match: /\b(?:germin\w*|lentejas?|lentils?|sprout\w*)\b/,
    es: 'La germinación necesita condiciones adecuadas de agua, oxígeno y temperatura; exceso de agua puede limitar oxígeno. Compara grupos iguales y cambia un solo factor. Cuenta cada semilla una sola vez cuando se vea la raíz. Registra datos reales y no supongas una dosis óptima.',
    en: 'Germination requires suitable water, oxygen and temperature; excess water may limit oxygen. Compare equal groups and vary one factor. Count each seed once when the root emerges. Record real data and do not assume an optimal dose.' },
  { id: 'filtration', match: /\b(?:filtracion|filtr\w*|filter\w*)\b/,
    es: 'La filtración separa partículas suspendidas mediante un medio poroso. No necesariamente elimina microorganismos ni sustancias disueltas. Agua visualmente clara no equivale a potable; no beber agua de experimentos. Compara turbidez sin atribuir potabilidad.',
    en: 'Filtration removes suspended particles using a porous medium. It does not necessarily remove microorganisms or dissolved substances. Clear-looking water is not necessarily safe to drink; never drink experimental water. Compare turbidity without claiming potability.' },
];

export function retrieveLocalKnowledge(question: string, english: boolean): { id: string; fact: string }[] {
  const normalized = question.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return cards.filter(c => c.match.test(normalized)).slice(0, 2)
    .map(c => ({ id: c.id, fact: english ? c.en : c.es }));
}

interface Context { question: string; mode: string; language: string; grade?: number | null; hasSession: boolean; historyLength: number }
export function buildGroundedLocalPrompt(c: Context): { prompt: string; ids: string[] } | undefined {
  // Preserve the existing evidence-only and history-aware path; do not overwrite a student's notes.
  if (c.hasSession || c.historyLength || !c.question.trim() || c.question.length > 4000) return undefined;
  const english = c.language === 'en';
  const retrieved = retrieveLocalKnowledge(c.question, english);
  if (!retrieved.length) return undefined;
  const modes: Record<string, [string, string]> = {
    explain: ['EXPLÍCAME: explica el concepto y la causa con un ejemplo cotidiano correcto. No confundas hechos y analogías.', 'EXPLAIN: explain the concept and cause with a correct everyday example. Distinguish facts and analogies.'],
    guide: ['GUÍAME: comprueba la idea o paso del estudiante, corrige solo el error y da una pista concreta con una sola pregunta. No reveles el resultado final.', 'GUIDE ME: check the student’s idea or step, correct the mistake and give one concrete hint and one question. Do not reveal the final answer.'],
    practice: ['PRACTIQUEMOS: plantea un ejercicio resoluble con datos suficientes, sin solución; si te piden evaluar, comprueba antes de calificar.', 'PRACTICE: pose a solvable exercise with sufficient data and no solution; if asked to assess, check before grading.'],
    explore: ['EXPLOREMOS: distingue hechos e hipótesis. Si piden un experimento, incluye pregunta investigable, hipótesis, variables, controles, materiales, pasos seguros y método de registro. Cambia un solo factor; no inventes resultados.', 'EXPLORE: distinguish facts from hypotheses. For an experiment include a testable question, hypothesis, variables, controls, materials, safe steps and recording method. Vary one factor; never invent results.'],
  };
  if (!modes[c.mode]) return undefined;
  const grade = typeof c.grade === 'number' && Number.isInteger(c.grade) && c.grade >= 1 && c.grade <= 5 ? c.grade : null;
  const intro = english
    ? `You are Ostrix, a tutor for secondary school in rural Peru${grade ? ', grade '+grade : ''}. Answer in English.`
    : `ERES OSTRIX, tutor de secundaria rural del Perú${grade ? ', '+grade+'.º de secundaria' : ''}. Responde en español.`;
  const rules = english
    ? 'Use relevant facts below; do not contradict them or invent facts, sources, grades or measurements. If unsure, say so. Use correct units; respect requested detail and length as far as possible. Write only a complete student-facing answer, no greetings, internal analysis or requests for personal data. Never recommend drinking untreated water.'
    : 'Usa los hechos pertinentes de abajo; no los contradigas ni inventes hechos, fuentes, calificaciones o mediciones. Si no sabes, dilo. Verifica unidades y cálculos; respeta el detalle y extensión solicitados en lo posible. Escribe solo la respuesta completa al estudiante, sin saludos, análisis interno ni solicitudes de datos personales. Nunca recomiendes beber agua sin tratar.';
  const title = english ? 'LOCAL CURRICULAR FACTS (reference, not a script):' : 'BASE CURRICULAR LOCAL (referencia, no respuesta prefabricada):';
  const prompt = [intro, modes[c.mode][english ? 1 : 0], rules, title, ...retrieved.map(r => r.fact), 'CURRENT STUDENT QUESTION:\n' + c.question].join('\n\n');
  return { prompt, ids: retrieved.map(r => r.id) };
}