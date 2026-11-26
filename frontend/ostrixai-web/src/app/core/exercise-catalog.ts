/**
 * Banco de Ejercicios Curriculares Peruanos para Secundaria Rural
 * OstrixAi - Modo Esencial Offline
 *
 * Funciona 100% desconectado, con respuestas canónicas y validación determinista.
 */

export interface CurriculumExercise {
  readonly id: string;
  readonly grade: 1 | 2 | 3 | 4 | 5;
  readonly course: string;
  readonly topic: string;
  readonly keywords: readonly string[];
  readonly question: string;
  readonly questionQuechua?: string;
  readonly type: 'multiple_choice' | 'true_false' | 'numeric';
  readonly options?: readonly string[];
  /** Índice de opción (para multiple_choice), booleano o número */
  readonly correctAnswer: number | boolean;
  readonly explanation: string;
  readonly explanationQuechua?: string;
}

export const EXERCISE_CATALOG: readonly CurriculumExercise[] = [
  // MATEMÁTICA
  {
    id: 'mat-sec1-001',
    grade: 1,
    course: 'Matemática',
    topic: 'Fracciones y partes',
    keywords: ['fracciones', 'fraccion', 'partes', 'suma', 'denominador'],
    question: 'Si una chacra de papas se divide en 4 partes iguales y la familia cosecha 3 partes, ¿qué fracción de la chacra representa lo cosechado?',
    questionQuechua: 'Sichus chakra tawa (4) patmaman t\'aqasqa kanman, kimsatataq (3) aymurranku, ¿ima rakiypim chay?',
    type: 'multiple_choice',
    options: ['1/4', '3/4', '4/3', '1/3'],
    correctAnswer: 1, // '3/4'
    explanation: 'El total de partes iguales es el denominador (4) y las partes tomadas son el numerador (3), por tanto es 3/4.',
    explanationQuechua: 'Llapan rakiyqa tawan (4), aymurrasqataq kimsan (3), chayraykum 3/4 kashan.'
  },
  {
    id: 'mat-frac-resta',
    grade: 1, course: 'Matemática', topic: 'Fracciones y partes',
    keywords: ['fracciones', 'fraccion', 'denominador', 'resta', 'resto', 'restar', 'queda'],
    question: 'Una jarra contiene 5/6 de litro de agua. Si se sirven 2/6 de litro, ¿cuánta agua queda en la jarra?',
    type: 'multiple_choice', options: ['3/12 de litro', '1/2 litro', '7/6 de litro', '2/3 de litro'],
    correctAnswer: 1, explanation: 'Ambas medidas cuentan sextos de litro. Quedan 5 − 2 = 3 sextos, equivalentes a medio litro.',
  },
  {
    id: 'mat-frac-equivalencia',
    grade: 1, course: 'Matemática', topic: 'Fracciones y partes',
    keywords: ['fracciones', 'fraccion', 'equivalentes'],
    question: 'Una cinta se divide en 8 partes iguales. ¿Cuántas de esas partes juntas miden lo mismo que 3/4 de la cinta?',
    type: 'multiple_choice', options: ['3', '4', '6', '7'], correctAnswer: 2,
    explanation: 'Cada cuarto de la cinta ocupa dos octavos. Tres cuartos ocupan seis octavos de la misma cinta.',
  },
  {
    id: 'mat-frac-comparacion',
    grade: 1, course: 'Matemática', topic: 'Fracciones y partes',
    keywords: ['fracciones', 'fraccion', 'denominador', 'comparar', 'mayor', 'menor'],
    question: 'Dos panes del mismo tamaño se reparten por separado. ¿Cuál porción es mayor: 2/3 del primer pan o 3/5 del segundo?',
    type: 'multiple_choice', options: ['2/3 del primer pan', '3/5 del segundo pan', 'Son iguales', 'Falta saber cuántas personas comen'],
    correctAnswer: 0, explanation: 'Con partes de igual tamaño, 2/3 equivale a 10/15 y 3/5 a 9/15. Diez quinceavos superan a nueve.',
  },
  {
    id: 'mat-frac-unidad',
    grade: 1, course: 'Matemática', topic: 'Fracciones y partes',
    keywords: ['fracciones', 'fraccion', 'partes'],
    question: 'Una familia dedica 1/2 de una parcela de 8 hectáreas a papa. Otra dedica 1/2 de una parcela de 6 hectáreas. ¿Qué superficies cultivan?',
    type: 'multiple_choice', options: ['4 y 4 hectáreas', '8 y 6 hectáreas', '3 y 3 hectáreas', '4 y 3 hectáreas'],
    correctAnswer: 3, explanation: 'La mitad se calcula sobre cada parcela. La mitad de 8 hectáreas es 4 y la mitad de 6 hectáreas es 3.',
  },
  {
    id: 'mat-sec2-002',
    grade: 2,
    course: 'Matemática',
    topic: 'Ecuaciones de primer grado',
    keywords: ['ecuacion', 'ecuaciones', 'despejar', 'incognita', 'primer grado', 'lineal'],
    question: 'En la ecuación 2x + 6 = 18, ¿cuál es el valor de x?',
    questionQuechua: '2x + 6 = 18 nisqapi, ¿hayk\'ataq x chanin?',
    type: 'multiple_choice',
    options: ['4', '6', '12', '9'],
    correctAnswer: 1, // '6'
    explanation: 'Restamos 6 a ambos lados: 2x = 12. Luego dividimos entre 2: x = 6.',
    explanationQuechua: '6 yupayta qichunchik: 2x = 12. Chaymanta 2-wan rakispa: x = 6.'
  },
  {
    id: 'mat-sec3-003',
    grade: 3,
    course: 'Matemática',
    topic: 'Teorema de Pitágoras',
    keywords: ['pitagoras', 'triangulo', 'hipotenusa', 'catetos', 'geometria'],
    question: 'En un triángulo rectángulo cuyos catetos miden 3 m y 4 m, ¿cuánto mide la hipotenusa?',
    type: 'multiple_choice',
    options: ['5 m', '7 m', '12 m', '25 m'],
    correctAnswer: 0, // '5 m'
    explanation: 'Por el Teorema de Pitágoras: c² = 3² + 4² = 9 + 16 = 25. La raíz cuadrada de 25 es 5.',
  },
  {
    id: 'mat-sec4-004',
    grade: 4,
    course: 'Matemática',
    topic: 'Ecuaciones cuadráticas y discriminante',
    keywords: ['cuadratica', 'discriminante', 'raices', 'segundo grado', 'formula general'],
    question: 'Si el discriminante (b² - 4ac) de una ecuación cuadrática es negativo (< 0), ¿cuántas soluciones reales tiene?',
    type: 'multiple_choice',
    options: ['Dos soluciones reales distintas', 'Una solución real doble', 'Cero soluciones reales (soluciones complejas)', 'Infinitas soluciones'],
    correctAnswer: 2,
    explanation: 'Cuando el discriminante es menor que cero, la raíz cuadrada en los números reales no existe, por lo que no hay soluciones reales.',
  },
  {
    id: 'mat-sec5-005',
    grade: 5,
    course: 'Matemática',
    topic: 'Funciones trigonométricas y razones',
    keywords: ['trigonometria', 'seno', 'coseno', 'tangente', 'razones'],
    question: '¿A qué razón geométrica equivale la función seno de un ángulo agudo en un triángulo rectángulo?',
    type: 'multiple_choice',
    options: ['Cateto adyacente / Hipotenusa', 'Cateto opuesto / Hipotenusa', 'Cateto opuesto / Cateto adyacente', 'Hipotenusa / Cateto opuesto'],
    correctAnswer: 1,
    explanation: 'El seno se define como la razón entre el cateto opuesto y la hipotenusa (sen θ = CO / H).',
  },

  // CIENCIA Y TECNOLOGÍA / BIOLOGÍA / FÍSICA / QUÍMICA
  {
    id: 'cyt-sec1-001',
    grade: 1,
    course: 'Ciencia y Tecnología',
    topic: 'La célula y sus tipos',
    keywords: ['celula', 'nucleo', 'procariota', 'eucariota', 'membrana', 'organelos'],
    question: '¿Qué característica fundamental distingue a una célula eucariota de una procariota?',
    questionQuechua: '¿Imaynanpitaq kawsayku (célula) eucariota nisqa procariota nisqamanta huk rikch\'ayniyuq?',
    type: 'multiple_choice',
    options: [
      'La presencia de una membrana plasmática',
      'La presencia de un núcleo definido por una membrana nuclear',
      'La capacidad de sintetizar proteínas',
      'El uso de agua para sus funciones'
    ],
    correctAnswer: 1,
    explanation: 'Las células eucariotas tienen núcleo celular verdadero rodeado por carioteca o envoltura nuclear, donde guardan su ADN.',
    explanationQuechua: 'Eucariota kawsaykukunam ukhunpi llapa kawsaypa yachayninta (ADN) allin pakarisqata kikin kurkunchapi churan.'
  },
  {
    id: 'cyt-sec2-002',
    grade: 2,
    course: 'Ciencia y Tecnología',
    topic: 'Fotosíntesis y energía vegetal',
    keywords: ['fotosintesis', 'luz', 'clorofila', 'sol', 'energia', 'oxigeno', 'glucosa'],
    question: '¿Qué gas absorben las plantas durante la fase luminosa de la fotosíntesis para producir glucosa y qué gas liberan al ambiente?',
    questionQuechua: '¿Ima samaytam yurakuna chaskinku intipa kallpanwan mikhunata ruranankupaq?',
    type: 'multiple_choice',
    options: [
      'Absorben oxígeno y liberan dióxido de carbono',
      'Absorben nitrógeno y liberan hidrógeno',
      'Absorben dióxido de carbono (CO₂) y liberan oxígeno (O₂)',
      'Absorben monóxido de carbono y liberan metano'
    ],
    correctAnswer: 2,
    explanation: 'Las plantas toman dióxido de carbono del aire y agua del suelo, utilizando luz solar para producir glucosa y liberar oxígeno.',
    explanationQuechua: 'Yurakunaqa wayramanta CO₂ nisqatam chaskinku, intipa kallpanwantaq O₂ wayrata qispichinku.'
  },
  {
    id: 'cyt-sec3-003',
    grade: 3,
    course: 'Ciencia y Tecnología',
    topic: 'Estructura atómica y enlaces químicos',
    keywords: ['atomo', 'electron', 'proton', 'neutron', 'enlace', 'valencia'],
    question: '¿Cuáles son las partículas subatómicas que se encuentran orbitando en la corteza del átomo e intervienen en los enlaces químicos?',
    type: 'multiple_choice',
    options: ['Protones', 'Neutrones', 'Electrones', 'Positrones'],
    correctAnswer: 2,
    explanation: 'Los electrones de valencia (en la nube exterior del átomo) son los que se comparten, ganan o pierden para formar enlaces.',
  },
  {
    id: 'cyt-sec4-004',
    grade: 4,
    course: 'Ciencia y Tecnología',
    topic: 'Leyes del movimiento de Newton',
    keywords: ['newton', 'fuerza', 'inercia', 'aceleracion', 'movimiento', 'fisica'],
    question: 'Según la Primera Ley de Newton (Ley de la Inercia), un cuerpo permanece en reposo o con velocidad constante en línea recta si:',
    type: 'multiple_choice',
    options: [
      'Se le aplica una fuerza constante',
      'La fuerza neta o resultante sobre él es cero',
      'Su masa se reduce a la mitad',
      'Se encuentra a nivel del mar'
    ],
    correctAnswer: 1,
    explanation: 'La inercia establece que si la suma de fuerzas es cero (fuerza neta = 0), el estado de reposo o movimiento rectilíneo uniforme no cambia.',
  },
  {
    id: 'cyt-sec5-005',
    grade: 5,
    course: 'Ciencia y Tecnología',
    topic: 'Conservación de la energía mecánica',
    keywords: ['energia', 'mecanica', 'cinetica', 'potencial', 'conservacion'],
    question: 'En un sistema cerrado sin fricción, cuando una pelota cae desde lo alto, ¿cómo se transforma su energía mecánica?',
    type: 'multiple_choice',
    options: [
      'La energía potencial gravitatoria se transforma en energía cinética',
      'La energía cinética se transforma en potencial',
      'La energía total se destruye paulatinamente',
      'La energía potencial aumenta conforme desciende'
    ],
    correctAnswer: 0,
    explanation: 'Al descender, la altura disminuye (baja Ep) y la velocidad aumenta (sube Ec), manteniéndose constante la suma de ambas.',
  },

  // COMUNICACIÓN
  {
    id: 'com-sec1-001',
    grade: 1,
    course: 'Comunicación',
    topic: 'Idea principal y secundaria',
    keywords: ['lectura', 'idea principal', 'secundaria', 'parrafo', 'comprension'],
    question: '¿Qué es la "idea principal" de un párrafo o texto expositivo?',
    questionQuechua: '¿Imataq qillqasqapa chawpi yuyaynin (idea principal)?',
    type: 'multiple_choice',
    options: [
      'Un ejemplo curioso o detalle decorativo',
      'El enunciado que contiene el mensaje central sin el cual el texto pierde sentido',
      'La palabra más larga del párrafo',
      'La última oración de la página'
    ],
    correctAnswer: 1,
    explanation: 'La idea principal sintetiza la información medular. Las secundarias explican, ejemplifican o amplían.',
    explanationQuechua: 'Chawpi yuyayqa qillqasqapa saphinmi; mana chaywanqa manam qillqasqa allintachu hamut\'akunman.'
  },
  {
    id: 'com-sec3-002',
    grade: 3,
    course: 'Comunicación',
    topic: 'Conectores lógicos de oposición o contraste',
    keywords: ['conectores', 'oposicion', 'contraste', 'cohesion', 'pero', 'embargo'],
    question: '¿Cuál de los siguientes términos es un conector de oposición o contraste?',
    type: 'multiple_choice',
    options: ['Además', 'Sin embargo', 'Por lo tanto', 'En primer lugar'],
    correctAnswer: 1,
    explanation: '"Sin embargo", "no obstante" y "pero" introducen una restricción u oposición respecto a la proposición anterior.',
  },

  // COMUNICACIÓN · VERBOS (ejercicios revisados; una sola respuesta correcta)
  {
    id: 'com-verbo-sec1-001', grade: 1, course: 'Comunicación', topic: 'Verbos',
    keywords: ['verbo', 'verbos', 'conjugacion', 'presente', 'oracion'],
    question: 'En la oración «El atleta corre rápidamente hacia la meta», ¿cuál es el verbo conjugado?',
    type: 'multiple_choice',
    options: ['atleta', 'corre', 'rápidamente', 'meta'], correctAnswer: 1,
    explanation: '«Corre» es una forma del verbo correr: presente del indicativo, tercera persona del singular. «Rápidamente» es un adverbio.',
  },
  {
    id: 'com-verbo-sec1-002', grade: 1, course: 'Comunicación', topic: 'Verbos',
    keywords: ['verbo', 'verbos', 'conjugacion', 'infinitivo'],
    question: '¿Cuál es el infinitivo del verbo conjugado «leemos»?',
    type: 'multiple_choice',
    options: ['leí', 'leyendo', 'leer', 'lectura'], correctAnswer: 2,
    explanation: '«Leemos» es una forma conjugada del verbo «leer». El infinitivo no expresa persona ni tiempo.',
  },
  {
    id: 'com-verbo-sec1-003', grade: 1, course: 'Comunicación', topic: 'Verbos',
    keywords: ['verbo', 'verbos', 'conjugacion', 'pasado', 'tiempo'],
    question: 'En «Ayer, Elena escribió una carta», ¿en qué tiempo verbal está «escribió»?',
    type: 'multiple_choice',
    options: ['Presente', 'Futuro', 'Pretérito perfecto simple', 'Condicional'], correctAnswer: 2,
    explanation: '«Escribió» expresa una acción terminada en el pasado: pretérito perfecto simple del indicativo.',
  },
  {
    id: 'com-verbo-sec1-004', grade: 1, course: 'Comunicación', topic: 'Verbos',
    keywords: ['verbo', 'verbos', 'conjugacion', 'persona'],
    question: 'En «Los estudiantes leen en silencio», ¿qué persona y número tiene el verbo «leen»?',
    type: 'multiple_choice',
    options: ['Primera persona singular', 'Segunda persona plural', 'Tercera persona plural', 'Tercera persona singular'], correctAnswer: 2,
    explanation: '«Leen» concuerda con «los estudiantes», tercera persona del plural, en presente del indicativo.',
  },

  // CIENCIAS SOCIALES
  {
    id: 'cso-sec2-001',
    grade: 2,
    course: 'Ciencias Sociales',
    topic: 'Organización económica del Tahuantinsuyo',
    keywords: ['tahuantinsuyo', 'inca', 'mita', 'ayni', 'minka', 'reciprocidad'],
    question: 'En el Tahuantinsuyo, ¿qué principio regía el trabajo comunitario recíproco entre miembros del mismo ayllu ("hoy por ti, mañana por mí")?',
    questionQuechua: 'Inkakunapa kawsayninpi, ¿ima sutiyuqtaq ayllu ukhupi yanapanakuy llamk\'ay karqan?',
    type: 'multiple_choice',
    options: ['El Ayni', 'La Mita', 'El Tributo monetario', 'La Encomienda'],
    correctAnswer: 0,
    explanation: 'El Ayni era el sistema de reciprocidad familiar y comunal directa dentro del ayllu.',
    explanationQuechua: 'Ayni nisqaqa kikin ayllukunapura yanapanakuymi karqan, "kunan qampaq, paqarin ñuqaqpaq".'
  }
];

/**
 * Busca ejercicios curriculares que coincidan por curso, grado y palabras clave.
 */
export function findMatchingExercises(
  course: string,
  topic: string,
  grade?: number,
  limit = 3,
  requireTopicMatch = false
): readonly CurriculumExercise[] {
  const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const normCourse = normalize(course).trim();
  const stop = new Set(['los', 'las', 'del', 'para', 'por', 'con', 'una', 'que', 'como', 'entre', 'primer', 'grado', 'tema', 'cual', 'ejemplo', 'son', 'sus', 'sin', 'dos']);
  const studyText = ' ' + normalize(topic).replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  const searchTerms = studyText.split(' ').filter(t => t.length > 2 && !stop.has(t));

  // Filtrar por curso afín
  const filtered = EXERCISE_CATALOG.filter(ex => {
    const exCourse = normalize(ex.course);
    const courseMatches = exCourse === normCourse ||
      (normCourse.includes('fisica') && ex.topic.toLowerCase().includes('movimiento')) ||
      (normCourse.includes('quimica') && normalize(ex.topic).includes('atom')) ||
      (normCourse.includes('biologia') && ex.topic.toLowerCase().includes('célula'));
    return courseMatches;
  });

  // Puntuación por coincidencia de términos
  const scored = filtered.map(ex => {
    let score = 0;

    const keywordMatch = ex.keywords.some(k => studyText.includes(' ' + normalize(k) + ' '));
    for (const term of searchTerms) {
      if (normalize(ex.topic).split(/[^a-z0-9]+/).includes(term)) score += 3;
      if (ex.keywords.some(k => normalize(k) === term)) score += 2;
    }
    return { ex, score: score + (grade === ex.grade ? 2 : 0), topicMatch: keywordMatch || normalize(topic).trim() === normalize(ex.topic) };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.filter(item => !requireTopicMatch || item.topicMatch).slice(0, limit).map(s => s.ex);
}
