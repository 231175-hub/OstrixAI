/** OSTRIX-SEMANTICA-01: segmentación por cláusulas y clasificación revisable. */
export interface StudyPreview { readonly note: string; readonly doubt: string; }
export interface StudyPreviewAssessment extends StudyPreview {
  /** La app no debe asignar una categoría automáticamente si no puede justificarla. */
  readonly needsReview: boolean;
  readonly reason: 'clear' | 'uncertain' | 'incomplete' | 'too_long';
}

type Label = 'note' | 'doubt' | 'unknown';
interface Clause { readonly text: string; readonly label: Label; }

/** Neutraliza solo variaciones ortográficas para reconocer intención; no altera el texto guardado. */
const norm = (s: string): string => s.replace(/«[^»]{1,160}»|"[^"]{1,160}"/gu, ' ').toLocaleLowerCase('es').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

const QUESTION_START = /^(?:[¿?]\s*|(?:que|cual(?:es)?|como|donde|cuanto|quien(?:es)?|por que|para que|de que|con que)\s+(?!el\s|la\s|los\s|las\s|un\s|una\s))/u;
// Dificultades y preguntas: expresiones generales, no nombres de asignaturas ni temas concretos.
const UNCERTAINTY = [
  /\b(?:no|nunca|jamas)\s+(?:(?:me|lo|la|los|las)\s+)?(?:entiend\w*|entend\w*|comprend\w*|capt\w*|pill\w*|logr\w*|consig\w*|pued\w*|recuerd\w*|record\w*|acuerd\w*|tengo\s+(?:ni\s+)?idea|me\s+queda\s+clar\w*|estoy\s+segur\w*)\b/u,
  /\b(?:sigo|seguimos)\s+sin\s+(?:entender|comprender|saber|poder|recordar|captar|pillar|dominar)\b/u,
  /\b(?:todavia|aun)\s+(?:(?:no|me|se me)\s+|tengo\s+(?:una\s+)?(?:duda|pregunta))\b/u,
  /\b(?:me|se me|yo|aun me|todavia me)\s+(?:(?:estoy|esta|resulta|quede|siento|hace|da|quedo)\s+)?(?:enred\w*|confund\w*|perdid\w*|complic\w*|cuest\w*|frustr\w*|li\w*|hago\s+bolas|hice\s+bolas|dificult\w*|olvid\w*|olvid[oó]|qued\w*\s+la\s+inquietud|queda\s+la\s+inquietud|falta\s+entender|falta\s+comprender)\b/u,
  /\b(?:me\s+cuesta|me\s+resulta\s+dificil|se\s+me\s+hace\s+(?:un\s+mundo|dificil)|tengo\s+dificultad\w*|quede\s+perdido|quede\s+perdida|me\s+entra\s+en\s+la\s+cabeza|no\s+me\s+entra\s+en\s+la\s+cabeza)\b/u,
  /\b(?:tengo|tengo\s+una|quede\s+con|me\s+quedo|me\s+surge|siento|me\s+da|me\s+queda|me\s+quedan|sigo\s+con|me\s+quedaron)\s+(?:(?:una|muchas|varias|algunas|algo\s+de|la)\s+)?(?:duda(?:s)?|pregunta(?:s)?|inquietud|incertidumbre|confusion|curiosidad)\b/u,
  /\b(?:desconozco|ignoro|no\s+capto|no\s+pillo|no\s+tengo\s+(?:ni\s+)?idea|no\s+me\s+entra\s+en\s+la\s+cabeza)\b/u,
  /\b(?:quiero|quisiera|querria|necesito|necesitaria|me\s+gustaria|me\s+interesaria|me\s+interesa|deseo|podrias|puedes|podrian|podrian|me\s+podrias)\s+(?:(?:que\s+(?:me|nos)\s+)?(?:resuelv\w*|aclar\w*|orient\w*|expli\w*|ayud\w*|enseñ\w*)|(?:a\s+)?(?:saber|entender|comprender|averiguar|descubrir|investigar|aprender|preguntar|conocer))\b/u,
  /\b(?:me\s+pregunt\w*|me\s+estoy\s+pregunt\w*|me\s+quede\s+pensando\s+(?:si|como|que|por\s+que)|me\s+hace\s+falta\s+(?:entender|saber|comprender)|no\s+termino\s+de\s+(?:entender|comprender)|no\s+estoy\s+segur\w*)\b/u,
  /\b(?:una\s+cosa\s+no\s+me\s+qued\w*\s+clara?|hay\s+(?:algo|una\s+parte)\s+que\s+no\s+(?:entend\w*|comprend\w*))\b/u,
  /\b(?:explicame|aclarame|ayudame|ensename|dime|orientame|podrias|puedes|podrian|quisiera|querria|necesitaria)\b/u,
  /\b(?:estoy|quede|me\s+siento|me\s+encuentro)\s+(?:muy\s+)?(?:confundid\w*|perdid\w*|desorientad\w*)\b/u,
  /\b(?:no\s+me\s+resulta\s+facil\b|no\s+me\s+sale\b|no\s+tengo\s+claro\b|no\s+me\s+(?:quedo|queda|es|resulta|sale)\s+(?:claro|clara|bien)|me\s+resulta\s+(?:confuso|confusa)|dudo\s+de|me\s+pierdo\s+al|no\s+capto\s+bien|no\s+pillo\s+bien)\b/u,
  /\b(?:me\s+(?:da|hace|produce)\s+curiosidad|siento\s+curiosidad|me\s+gustaria\s+que|me\s+gustaria\s+preguntar|no\s+me\s+entra\s+en\s+la\s+cabeza)\b/u,
  /\b(?:se\s+me\s+escap\w*|tengo\s+(?:un|mucho)\s+li\w*|me\s+romp\w*\s+la\s+cabeza|me\s+vendria\s+bien\s+que|estoy\s+atascad\w*|me\s+siento\s+(?:insegur\w*|confundid\w*|perdid\w*)|(?:todavia|aun)\s+batall\w*|me\s+cuesta\s+trabajo)\b/u,
  /\b(?:me\s+(?:desconciert\w*|intrig\w*|perdi\s+al|perdia\s+al)|tengo\s+(?:(?:una|varias|algunas)\s+)?(?:consulta|problemas?\s+para)|(?:aun|todavia)\s+ando\s+(?:perdid\w*|confundid\w*)|no\s+encuentro\s+(?:la\s+forma|la\s+manera|como)|estoy\s+tratando\s+de\s+(?:aclarar|entender|comprender)|me\s+gustaria\s+averiguar)\b/u,
];

// Señales generalizables de dudas coloquiales que incluyen un tema o concepto.
const NATURAL_DIFFICULTY = [
  // No confundir «no sé cómo» con la pasiva negativa «no se crea».
  /\bno\s+se\s+(?:que|como|cual\w*|por\s+que|donde|cuando|cuant\w*|si|ni|(?:resolver|diferenci\w*|explic\w*|hacer|calcul\w*|interpret\w*|entend\w*|aplic\w*))\b/u,
  /\b(?:sigo|aun|todavia)\s+(?:estoy\s+)?(?:confundid\w*|perdid\w*|desorientad\w*)\b/u,
  /\b(?:no\s+me\s+aclar\w*|me\s+estoy\s+haciendo\s+(?:un\s+)?li\w*|me\s+(?:hago|hice)\s+(?:un\s+)?li\w*|me\s+da\s+vueltas\s+la\s+cabeza|no\s+me\s+convenc\w*|no\s+me\s+cuadr\w*|me\s+enred\w*|se\s+me\s+enred\w*)\b/u,
  /\b(?:me\s+(?:queda|quedo)\s+(?:la\s+)?duda\b|no\s+(?:logr\w*|consig\w*)\s+(?:entender|comprender|resolver)|tengo\s+(?:un\s+)?(?:lio|problema)\s+con)\b/u,
];

/**
 * Filtro independiente de las etiquetas: si no hay contenido académico identificable,
 * elegir «apunte»/«duda» no basta; Ostrix necesita una aclaración explícita.
 * Conserva íntegramente el texto del alumno y no envía nada a Cloud.
 */
const NON_TOPIC_WORDS = new Set([
  'a','al','algo','alguien','algun','alguna','algunas','algunos','ahi','ahora','ayer','aquel','aquella','aquello','aquellos','aquellas',
  'bien','bastante','buena','bueno','buenas','buenos','casi','claro','clara','clarisimo','como','con','contra','cosa','cosas','cual','cuando',
  'cuanto','de','del','desde','dificil','dificiles','dije','dijo','dieron','donde','dos','duda','dudas','el','ella','ellos','en','entendi',
  'entiendo','era','eran','es','esa','esas','ese','eses','eso','esta','estaba','estamos','estan','estar','estuvo','estas','este','esto','estos',
  'explicacion','explicaciones','explicaron','explico','facil','faciles','fue','fueron','funciona','funcionan','hacer','hace','hacen','hago',
  'he','hice','hicimos','hoy','idea','ideas','interesante','interesantes','la','las','les','lo','los','mal','mas','me','mi','mis','mucha','mucho',
  'muy','nada','necesito','no','nos','nosotros','nunca','otra','otro','otras','otros','para','parte','partes','pero','poco','por','porque',
  'pregunta','preguntas','problema','problemas','puedo','que','quedo','quedan','quedaron','quiero','quisiera','raro','rara','recuerdo',
  'resolvi','resolver','sale','salio','se','seguir','si','sin','sobre','solo','son','su','sus','tambien','tan','tanto','tema','temas',
  'tengo','tiene','tienen','todavia','todo','todas','todos','un','una','unas','uno','unos','ver','vi','vimos','ya','yo','aun',
  'aprendi','aprendimos','aprendizaje','estudie','estudiamos','comprendi','comprendo','conoci','entienda','ayuda','ayudar',
  'anterior','anteriores','antes','despues','clase','clases','profesor','profesora','profe','maestro','maestra','ejercicio','ejercicios',
  'actividad','actividades','tarea','tareas','ejemplo','ejemplos','explicame','ayudame','dime','saber','significa','significan',
  'interesa','gusto','gustaron','parece','parecio','parecieron','parecia','gustaria','entiendes','entender','comprender','aclarar',
  'capte','capto','pillo','estoy','sigo','entonces','siguiente','anteriormente','alguno','ninguna','ninguno','recuerdo',
  'esto','eso','asi','porfa','favor','necesaria','necesario','cierto','correcto','correcta','normal','genial','mejor','peor',
  'estuvieron','mejor','bien','mal','divertido','divertida','listo','lista','siguiente','segundo','segunda','ultimas','ultimo','ultima','resultado','resultados','resuelto','resuelta','resolucion','explicarme','entenderlo','comprenderlo',
  'convence','convencio','confundio','confundida','confundido','confundieron','gusto','muchisimo','util','utiles','interesado',
  'quede','quedamos','quedo','creo','creia','acuerdo','puedes','podrias','quieres','estudiar','practicar','funcionar',
  'pense','pensaba','penso','salieron','estudiando','haciendo','ocurrio','paso','pasaron','ayer','anteayer','complicado',
]);
const META_REFERENCE = /\b(?:esto|eso|aquello|lo\s+anterior|lo\s+de\s+(?:hoy|ayer|antes)|(?:esa?|aquel(?:la)?)\s+(?:parte|idea|explicacion|tema|cosa|actividad|pregunta|clase|ejercicio)|(?:lo|la)\s+(?:hice|resolvi|entendi|comprendi|capte|pille)|lo\s+que\s+(?:dij\w*|coment\w*|explic\w*|mostr\w*)|(?:las?\s+cosas?\s+de\s+(?:ayer|hoy|antes))|lo\s+que\s+(?:vimos|hicimos|dijo|explico)|otra\s+(?:consulta|pregunta)|mas\s+cosas?)\b/u;
const GENERIC_PROGRESS = /\b(?:me\s+paso\s+algo|ya\s+(?:entendi|comprendi|lo\s+se)|ahora\s+(?:ya\s+)?(?:se|entiendo|comprendo)|no\s+me\s+(?:salio|sale)|me\s+quede\s+con\s+una\s+duda|tengo\s+(?:otra|una)\s+(?:consulta|pregunta|duda)|me\s+(?:gusto|parecio|resulto|quedo)|no\s+(?:recuerdo|me\s+acuerdo)|me\s+(?:cuesta|confunde)|quiero\s+(?:estudiar|practicar)|necesito\s+ayuda|no\s+(?:entiendo|comprendo|capto)|no\s+se|creo\s+que\s+lo\s+entendi|fue\s+(?:bien|mal)|estuvo\s+(?:bien|mal))\b/u;
const GENERIC_META_SENTENCE = /^(?:(?:la|el|una|un|esa|ese|aquel)\s+(?:clase|tema|explicacion|ejercicio|actividad|tarea|asunto|idea|parte)\b|(?:esto|eso|aquello|lo|ya|ahora)\b|(?:me\s+(?:quede|parecio|gusto|cuesta|confunde)|tengo\s+una\s+duda|necesito\s+ayuda|quiero\s+(?:estudiar|practicar)))\b/u;
/**
 * Vocabulario de interacción: estas palabras describen la experiencia del alumno,
 * pero no identifican por sí mismas un contenido de estudio.
 * Una materia desconocida seguirá siendo válida: no usamos un diccionario cerrado
 * de asignaturas para decidir qué merece guardarse.
 */
const GENERIC_PROCESS_WORDS = new Set([
  'fin','saque','saco','sacado','avance','avanzamos','avance','mezcle','mezclaron','olvido','olvide','olvide','olvidado',
  'ocurre','ocurrio','ocurrira','despues','antes','luego','mas','menos','piensas','pienso','pensar','pasada','pasado',
  'semana','dia','dias','vez','veces','otra','intente','intento','intentamos','intentar','reintente','hice',
  'supe','supo','sabia','supimos','respuesta','respuestas','excelente','genial','estupendo','increible',
  'facil','sencillo','sencilla','sencillos','sencillas','bien','mal','regular','mejor','peor',
  'falto','falta','faltaba','faltan','revisar','revise','revisamos','revisado','encontre','encontramos',
  'decir','digo','dije','diria','comentar','comentario','comentarios','siguiente','anteriores',
  'logre','logramos','resolvi','resuelto','terminamos','termine','aprobar','aprobe','aprobo',
  'correctamente','incorrectamente','contento','feliz','triste','aburrido','entretenida',
  'interesante','interesantes','estuvo','estaba','estuvieron','hubo','haber','ser','estar',
  'clase','sesion','actividad','ejercicio','profesor','profesora','tarea','trabajo',
  'final','convierte','convertir','repasamos','repasar','ojala','manana','sea','sera',
  'empezamos','empezar','empezare','hare','haremos','esperaba','esperamos','salio','salieron',
  'tenia','tendria','siento','senti','mejore','mejoramos','tenian','tenemos',
  'hecho','hecha','hechos','hechas','nota','notas','calificacion','calificaciones',
]);
/**
 * Señales de metaconversación que necesitan un referente académico. No se asigna
 * apunte ni duda por decir que una clase gustó, que terminó una tarea o que algo
 * fue sencillo. Si sí hay un tema explícito, se mantiene el flujo normal.
 */
const GENERIC_ACTIVITY = /\b(?:por\s+fin|mas\s+o\s+menos|otra\s+vez|la\s+semana\s+pasada|la\s+sesion|la\s+clase|el\s+problema|lo\s+(?:intente|vimos|hice|saque|resolvi)|ahora\s+si|solo\s+falta|se\s+me\s+olvido|me\s+quede\s+con\s+(?:una|la)\s+duda|no\s+se\s+que\s+decir|no\s+encontre\s+la\s+respuesta|no\s+avance\s+mucho)\b/u;

// Elipsis idiomáticas sin objeto, no mensajes científicos sobre la cabeza.
const STANDALONE_STATUS = /^(?:(?:(?:ya|ahora)\s+)?lo\s+(?:tengo|tenia|deje|traigo)\s+(?:hecho|resuelto|listo)|se\s+me\s+(?:fue|escapo)\s+de\s+la\s+cabeza)$/u;
/** Cuenta palabras concretas, excluyendo referencias, opiniones y verbos meta del estudiante. */
function hasConcreteSubject(s: string): boolean {
  const tokens = s.match(/[\p{L}\p{N}]+/gu) ?? [];
  // Verbos de interacción y referencias deícticas no son conceptos académicos.
  const nonTopicVerb = /^(?:dij|coment|mostr|cost|demasiad|complic|entreten|nuev|much|pas|perfect|ayud|termin|pud|resuelv|resolv|ultim|respuest|gust|parec|ocurr|pasab|suced|qued|sent|pens|explic|pregunt|convers|consigu|entend|comprend|intent|cambi|falt|lleg|trat|hic|divert|segund|list|mejor|siguient|hac|pod|record|varia|volv|voy|nuev|rapid|sesion|experienci|increibl|motivo|sigu|alcanc|repet|repas|pregunt|profesor|maestr|intent)[\p{L}]*$/u;
  return tokens.some(token => (((token.length > 2 || /^\d+$/u.test(token)) && !NON_TOPIC_WORDS.has(token) && !GENERIC_PROCESS_WORDS.has(token) && !nonTopicVerb.test(token)) || /^(?:pi|ph|x)$/u.test(token) || (token === 'y' && /[=+*/×÷]/u.test(s))));
}
/** Se aplica a todo el relato y a sus oraciones; también funciona si una oración es vaga. */
export function needsStudyContext(raw: string): boolean {
  const original = raw.trim();
  if (!original) return false;
  const sentences = splitPunctuation(original);
  for (const sentence of sentences) {
    const s = norm(sentence).replace(/^[¿?\s]+|[.!?¿\s]+$/gu, '').trim();
    if (!s) continue;
    if (STANDALONE_STATUS.test(s)) return true;
    if (/^(?:no\s+(?:puedo|logro|consigo)|me\s+(?:cuesta|confunde)|necesito\s+ayuda|ayudame|explicame|quiero\s+(?:estudiar|practicar)|tengo\s+(?:una|otra)\s+(?:duda|consulta|pregunta))$/u.test(s)) return true;
    // Opiniones sobre la clase y referencias sin objeto de estudio no son apuntes.
    if (/^(?:(?:la|el|una|un|esta|este|esa|ese)\s+(?:clase|tema|explicacion|actividad|parte|pregunta|ejercicio|sesion)\b|(?:ayer|hoy)\s+(?:aprendi|hicimos|vimos)\s+(?:varias|muchas|algunas|pocas)\s+(?:cosas|ideas|temas)\b)/u.test(s) &&
        !/\b(?:sobre|acerca\s+de|de\s+las?|del|con)\s+(?:las?|los?|unas?|unos?)?\s*[\p{L}]{4,}/u.test(s)) return true;
    if (/\b(?:muchas|varias|algunas|pocas)\s+(?:cosas|ideas|temas)\s+(?:nuevas|interesantes)?\b/u.test(s) && !hasConcreteSubject(s.replace(/\b(?:muchas|varias|algunas|pocas)\s+(?:cosas|ideas|temas)\s+(?:nuevas|interesantes)?\b/gu,''))) return true;
    // El texto citado no tiene un referente resoluble dentro de esa oración.
    if ((META_REFERENCE.test(s) || GENERIC_PROGRESS.test(s) || GENERIC_META_SENTENCE.test(s)) && !hasConcreteSubject(s)) return true;
    // Estado de clase o avance sin concepto: preferir aclarar antes de guardar.
    if (GENERIC_ACTIVITY.test(s) && !hasConcreteSubject(s)) return true;
    // Preguntas sin objeto: «¿Por qué funciona así?», «¿Cómo lo hago?».
    if (/^(?:por\s+que|como|cuando|donde|para\s+que|de\s+que|que\s+es|que\s+son|cual\s+es)\b/u.test(s) && !hasConcreteSubject(s)) return true;
    // Mensajes sin contenido concreto como «La explicación estuvo bien».
    if (!hasConcreteSubject(s) && s.split(/\s+/u).length <= 10 && !/\d/u.test(s)) return true;
  }
  return false;
}

/** Pregunta única y breve; el texto que responda el estudiante reemplazará el relato ambiguo. */
export function studyClarificationQuestion(raw: string, english = false): string {
  const s = norm(raw);
  if (/\b(?:no\s+(?:entiendo|comprendo|se|puedo|recuerdo)|me\s+(?:cuesta|confunde)|duda|pregunta|ayuda|por\s+que|como)\b/u.test(s) || /[¿?]/u.test(raw)) {
    return english ? 'What topic is your question about, and what exactly do you not understand?' : '¿Sobre qué tema es tu duda y qué parte no entiendes?';
  }
  return english ? 'What exactly did you learn? Tell me one specific idea from class.' : '¿Qué aprendiste exactamente? Cuéntame una idea concreta de la clase.';
}

const AFFIRMATION = /\b(?:aprend\w*|anot\w*|estudi\w*|observ\w*|mi\s+maestro|mi\s+maestra|el\s+profe|la\s+profe|comprend\w*|entend\w*|escrib\w*|memorice|practicamos|vi|me\s+gusto|me\s+parecio\s+interesante|la\s+frase|la\s+oracion|el\s+titulo|el\s+ejercicio\s+decia|pense|pensaba|resolv\w*|resolvimos|vimos|repas\w*|leimos|lei|hice|hicimos|conozco|conocimos|descubr\w*|experimente|practiqu\w*|investig\w*|(?:el|la|mi)\s+(?:profesor|profesora|resumen|cuaderno)|en\s+clase|hoy\s+practicamos|ya\s+se(?:\s+que)?|ahora\s+se(?:\s+que)?|ahora\s+comprendo|me\s+fascin\w*|me\s+sorprend\w*|entiendo\s+que|se\s+que)\b/u;

/** No inferir preguntas desde «cómo» o «cuando» dentro de una afirmación. */
function labelClause(fragment: string): Label {
  const s = norm(fragment);
  if (!s) return 'unknown';
  // Una frase citada de un ejercicio no expresa necesariamente una duda del alumno.
  if (/^(?:el ejercicio decia|la frase|la oracion|el titulo)\b/u.test(s) && !fragment.startsWith('¿')) return 'note';
  if (fragment.includes('¿') || /\?\s*$/u.test(fragment) || QUESTION_START.test(s)) return 'doubt';
  // Negación impersonal «no se debe/mezcla/conserva» no es «no sé» (duda).
  if (/^no\s+se\s+(?:deb\w*|conserv\w*|produc\w*|mezcl\w*|destruy\w*|cre\w*|observ\w*|recomiend\w*|permit\w*)\b/u.test(s) && hasConcreteSubject(s)) return 'note';
  if (/^(?:(?:todavia|aun|sigo)\s+)?(?:confundo|mezclo|olvido)\b/u.test(s) && hasConcreteSubject(s)) return 'doubt';
  // «No sé dibujar» es duda cuando sé lleva tilde; «no se transforma» puede ser una afirmación.
  if (/\bno\s+sé\s+[\p{L}]+/iu.test(fragment)) return 'doubt';
  if (/^(?:se\s+me|me)\s+(?:mezclan|mezclo|confunden|enredan|desordenan)\b/u.test(s) && hasConcreteSubject(s)) return 'doubt';
  if (/^me\s+(?:preocupa|inquieta)\s+(?:no\s+)?(?:saber|comprender|poder|entender)\b/u.test(s)) return 'doubt';
  if (UNCERTAINTY.some(rule => rule.test(s)) || NATURAL_DIFFICULTY.some(rule => rule.test(s)) || /\bno\s+sé\b/iu.test(fragment)) return 'doubt';
  if (AFFIRMATION.test(s)) return 'note';
  // Una afirmación sin señal de incertidumbre sigue siendo un apunte.
  if (/^(?:las?\s+dos\s+cosas|lo\s+de\s+(?:ayer|hoy)|lo\s+anterior|eso|esto|aquello)\b/u.test(s)) return 'unknown';
  if (s.length >= 12 && /\b(?:es|son|queda|quedan|tiene|tienen|fue|fueron|hay|puede|pueden|estaban|estaba|esta|estan|depende|requiere|transforma|contiene|pas\w*|libera|liberan|mide|miden|explica|explico|se\s+forma|se\s+produce)\b/u.test(s)) return 'note';
  // No convertir un relato de dificultad o petición poco reconocible en un apunte.
  if (/^(?:no\s+me|me\s+|se\s+me|todavia\s+|aun\s+|estoy\s+|quisiera\s+|quiero\s+|necesito\s+|podrias\s+|puedes\s+|tengo\s+|no\s+se\s+|no\s+puedo\s+)/u.test(s)) return 'unknown';
  // Las demás oraciones declarativas son apuntes; se revisan en pantalla antes de guardar.
  return s.length >= 8 ? 'note' : 'unknown';
}

function trimClause(text: string): string {
  return text.replace(/^[\s,;.!]+|[\s,;.!]+$/gu, '').trim();
}
/** Segmenta por puntuación; conserva el signo de pregunta como parte de la duda. */
function splitPunctuation(text: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!/[.;!?\n]/u.test(ch)) continue;
    // «0.5», «3.1416» y otras cifras decimales son un único dato.
    if (ch === '.' && /\d/u.test(text[i - 1] ?? '') && /\d/u.test(text[i + 1] ?? '')) continue;
    const piece = text.slice(start, i + 1).trim();
    if (/[\p{L}\p{N}]/u.test(piece)) parts.push(piece);
    start = i + 1;
  }
  const rest = text.slice(start).trim();
  if (/[\p{L}\p{N}]/u.test(rest)) parts.push(rest);
  return parts;
}
/** «pero / aunque / y» se segmentan SOLO cuando cambian de intención. */
function splitContrasting(part: string): string[] {
  const connectors = /(?:,\s*|\s+)(?:pero|aunque|sin embargo|no obstante|y)\s+/giu;
  for (const hit of part.matchAll(connectors)) {
    const before = trimClause(part.slice(0, hit.index));
    const after = trimClause(part.slice((hit.index ?? 0) + hit[0].length));
    const left = labelClause(before);
    const right = labelClause(after);
    const isAnd = /\by\s+$/iu.test(hit[0]);
    if (before && after && left !== 'unknown' && right !== 'unknown' && left !== right &&
        (!isAnd || right === 'doubt' || AFFIRMATION.test(norm(after)))) {
      return [...splitContrasting(before), ...splitContrasting(after)];
    }
  }
  return [part];
}

function collectClauses(raw: string): Clause[] {
  const result: Clause[] = [];
  for (const part of splitPunctuation(raw)) {
    for (const piece of splitContrasting(part)) {
      const text = trimClause(piece);
      if (text) result.push({ text, label: labelClause(text) });
    }
  }
  return result;
}

function displayDoubt(s: string): string {
  const trimmed = s.trim();
  return trimmed ? trimmed[0].toLocaleUpperCase('es') + trimmed.slice(1) : '';
}

/** Indica duda sin asignarle de forma silenciosa la categoría «apunte». */
export function assessStudyPreview(raw: string): StudyPreviewAssessment {
  const story = raw.trim();
  if (!story) return { note: '', doubt: '', needsReview: false, reason: 'clear' };
  if (needsStudyContext(story)) return { note: '', doubt: '', needsReview: true, reason: 'incomplete' };
  const clauses = collectClauses(story);
  const notes = clauses.filter(c => c.label === 'note').map(c => c.text);
  const doubts = clauses.filter(c => c.label === 'doubt').map(c => displayDoubt(c.text));
  const unknown = clauses.some(c => c.label === 'unknown');
  const note = notes.join('\n');
  const doubt = doubts.join('\n');
  if (unknown) return { note: '', doubt: '', needsReview: true, reason: 'uncertain' };
  // No perder silenciosamente texto ni truncar al superar los campos.
  if (note.length > 2000 || doubt.length > 400) return { note: '', doubt: '', needsReview: true, reason: 'too_long' };
  return { note, doubt, needsReview: false, reason: 'clear' };
}

/** Conserva la interfaz usada en toda la aplicación. */
export function suggestStudyPreview(raw: string): StudyPreview {
  const { note, doubt } = assessStudyPreview(raw);
  return { note, doubt };
}

/** Comprueba explícitamente cada guardado antes de presentar la siguiente etapa. */
export function canSaveJourney(text: string, limit: number): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= limit;
}

/** Los borradores solo se envían al Tutor si la persona marca consentimiento. */
export function journeyTutorPrompt(mode: 'explain' | 'guide' | 'practice', text: string, share: boolean, english: boolean): string {
  const task = english
    ? {
        explain: 'Explain the concept simply at secondary-school level. Finish with one check question.',
        guide: 'Give one hint at a time; do not reveal the answer. Ask one question.',
        practice: 'Ask just one practice question; wait for my answer and then give feedback.',
      }[mode]
    : {
        explain: 'Explícame el concepto de forma sencilla para secundaria y termina con una pregunta de comprensión.',
        guide: 'Guíame con una pista cada vez, sin revelar la solución, y haz una sola pregunta.',
        practice: 'Dame un ejercicio corto, espera mi respuesta y después corrige mi razonamiento.',
      }[mode];
  const clean = text.trim().slice(0, 1200);
  if (share && clean) {
    return english ? `I authorize using this text I just wrote as context: «${clean}». ${task}` : `Autorizo usar el siguiente texto que acabo de escribir como contexto: «${clean}». ${task}`;
  }
  return english ? `First ask me what topic I want to study. ${task}` : `Primero pregúntame qué tema quiero estudiar. ${task}`;
}
