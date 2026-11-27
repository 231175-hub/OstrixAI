/** Bounded offline curriculum and arithmetic. This is NOT a generative model. */
import { requestedWordLimit, countTutorWords } from './tutor-word-limit';

export interface LocalTurn { readonly role: string; readonly text: string }
export interface VerifiedLocalReply { readonly text: string; readonly kind: 'reference' | 'hint' | 'exercise' | 'feedback' | 'experiment' }
const normalize = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[−–]/g, '-');
const reply = (text: string, kind: VerifiedLocalReply['kind'], question: string): VerifiedLocalReply | null => {
  const limit = requestedWordLimit(question);
  return limit !== undefined && countTutorWords(text) > limit ? null : { text, kind };
};
const freshExercise = /\b(?:propon\w*|plantea\w*|genera\w*|crea\w*|dame|otro)\b.*\b(?:ejercicio|problema|practica)\b/;

// The exact same problem data are recovered from our own persisted exercise.
// Reject unknown units, multiple numbers and mixed prose rather than guessing.
function gradeGenerated(previous: string, answer: string): string | null {
  const p = normalize(previous);
  let expected: number, operation: string, unit: 'money' | 'temperature';
  const sale = /vende papas a s\/\s*(\d+(?:\.\d+)?) por kilogramo\. vende (\d+) kg\. ¿cuanto dinero recauda en total\?/i.exec(p);
  const discount = /cuesta s\/\s*(\d+(?:\.\d+)?) y tiene un descuento del (\d+)%\. ¿cual es el precio final\?/i.exec(p);
  const temperature = /temperatura inicial es de (-?\d+) °c\. (sube|baja) (\d+) °c\. ¿cual es la temperatura final\?/i.exec(p);
  if (sale) {
    expected = Math.round(Number(sale[1]) * Number(sale[2]) * 100) / 100;
    operation = `${sale[1]} × ${sale[2]} = ${expected}`; unit = 'money';
  } else if (discount) {
    expected = Math.round(Number(discount[1]) * (100 - Number(discount[2]))) / 100;
    operation = `${discount[1]} × (1 - ${discount[2]}/100) = ${expected}`; unit = 'money';
  } else if (temperature) {
    const sign = temperature[2] === 'sube' ? 1 : -1;
    expected = Number(temperature[1]) + sign * Number(temperature[3]);
    operation = `${temperature[1]} ${sign > 0 ? '+' : '-'} ${temperature[3]} = ${expected}`; unit = 'temperature';
  } else return null;
  const a = normalize(answer).trim().replace(/^(?:la respuesta es|mi respuesta es|el resultado es|es|creo que es)\s+/, '');
  const m = /^(s\/\s*)?(-?\d{1,7}(?:[.,]\d{1,2})?)\s*(soles?|pen|°\s*c|grados(?: celsius)?|por (?:cada )?kilogramo|soles? por (?:cada )?kilogramo|s\/kg|soles?\/kg)?[.!]?$/.exec(a);
  if (!m) return 'No puedo verificar esa respuesta con seguridad. Escribe un solo valor numérico con su unidad, sin cambiar los datos del ejercicio.';
  const suffix = m[3] ?? '';
  const money = /sol|pen|s\//.test(suffix) || Boolean(m[1]);
  const temp = /°|grado/.test(suffix);
  const perKg = /kilogramo|\/kg/.test(suffix);
  const label = unit === 'money' ? 'soles en total' : '°C';
  if (perKg || (unit === 'money' && temp) || (unit === 'temperature' && money)) return `La unidad no corresponde a lo pedido. El resultado debe expresarse en ${label}. ¿Puedes corregirla?`;
  const submitted = Number(m[2].replace(',', '.'));
  if (Math.abs(submitted - expected) < 0.000001) return `Correcto. ${operation}. Resultado: ${expected} ${label}.`;
  return `Tu respuesta no es correcta. Revisa la operación ${operation.slice(0, operation.lastIndexOf('='))}. ¿Qué resultado obtienes en ${label}?`;
}

function guideHint(q: string): string | null {
  // A single integer linear equation, with an explicit request for guidance.
  // Do not parse a decimal or a subexpression of a more complex equation.
  const eqs = [...q.matchAll(/(?<![\w./^²³])([+-]?\d{1,4})\s*x\s*([+-])\s*(\d{1,4})\s*=\s*([+-]?\d{1,5})(?!\d|[.,]\d|[x/])/g)];
  if (eqs.length === 1 && (q.match(/=/g) ?? []).length === 1 && /\b(?:pista|guia\w*|corrig\w*|creo que|pienso que|siguiente paso)\b/.test(q)) {
    const [, a, sign, b] = eqs[0];
    if (Number(a) !== 0 && Number(b) > 0 && !/\b(?:ya (?:sume|reste)|obtuve|resultado|solucion anterior)\b/.test(q)) {
      const wrong = sign === '-' ? 'restar' : 'sumar';
      const proposesWrong = new RegExp(`(?:debo|deberia|voy a|pienso|creo)[^.!?]{0,45}\\b${wrong}\\s+(?:el\\s+)?${b}\\b`).test(q) && !/\bno (?:debo|deberia|voy a)\b/.test(q);
      const first = proposesWrong ? `${wrong[0].toUpperCase()}${wrong.slice(1)} ${b} no elimina el término independiente. ` : '';
      return `${first}Pista: primero elimina el término ${sign}${b} usando la operación inversa en ambos miembros. ¿Qué operación debes aplicar a ambos lados?`;
    }
  }
  const fraction = /(?<![\d/])(\d{1,3})\s*\/\s*(\d{1,3})\s*\+\s*(\d{1,3})\s*\/\s*(\d{1,3})(?![\d/])/.exec(q);
  if (fraction && Number(fraction[2]) > 0 && Number(fraction[4]) > 0 && Number(fraction[2]) !== Number(fraction[4]) && /sumar los numeradores y (?:los )?denominadores|sumar numeradores y denominadores/.test(q) && /guia|pista|voy bien/.test(q)) {
    return `No se suman directamente los denominadores: las partes tienen tamaños diferentes. Pista: busca un múltiplo común de ${fraction[2]} y ${fraction[4]}. ¿Qué denominador común podrías usar?`;
  }
  return null;
}

function experiment(q: string): string | null {
  if (!/\b(?:disena\w*|propon\w*|planea\w*|plantea\w*)\b.*\bexperimento\b/.test(q)) return null;
  // The resource has four materials and four steps. Other constraints go to AI.
  if (/\b(?:solo tengo|solo dispongo|unicamente|sin usar|no tengo|utiliza solo|corrige|anterior)\b/.test(q)) return null;
  const counts = [...q.matchAll(/\b(\d+|uno|un|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(?:materiales|pasos)\b/g)];
  if (counts.some(m => !['4','cuatro'].includes(m[1]))) return null;
  if (/germin/.test(q) && /lenteja/.test(q) && /agua/.test(q)) return `Hipótesis: demasiada o poca agua reduce la germinación.\nIndependiente: agua diaria. Dependiente: lentejas germinadas. Controles: recipiente, semillas, luz y temperatura.\nMateriales:\n1. Tres recipientes iguales\n2. Lentejas\n3. Agua\n4. Cucharita\nPasos:\n1. Coloca diez lentejas por recipiente.\n2. Aplica diariamente 0, 1 y 3 cucharaditas, respectivamente.\n3. Durante siete días, anota cuántas germinaron en cada grupo sin repetir conteos.\n4. Compara los totales finales. Las dosis son ejemplos, no resultados ni cantidades óptimas.`;
  if (!/\bsol\b/.test(q) || !/\bsombra\b/.test(q)) return null;
  if (/hielo/.test(q) && /derret|fund|fusion/.test(q)) return `Hipótesis: el hielo expuesto al sol tardará menos en derretirse.\nIndependiente: exposición al sol o sombra. Dependiente: tiempo hasta derretirse (minutos). Controles: tamaño inicial del hielo, recipientes y momento de inicio.\nMateriales:\n1. Cubos de hielo iguales\n2. Dos platos iguales\n3. Cronómetro\n4. Cuaderno\nPasos:\n1. Coloca un cubo en cada plato simultáneamente.\n2. Deja uno al sol y otro a la sombra; inicia el cronómetro.\n3. Registra el tiempo cuando cada cubo desaparezca por completo.\n4. Repite y compara los tiempos.\nRegistro: ensayo | minutos al sol | minutos a la sombra. Deja las casillas vacías hasta medir.`;
  if (/evapor/.test(q) && /agua/.test(q)) return `Hipótesis: al sol se evaporará más agua que a la sombra.\nIndependiente: exposición al sol o sombra. Dependiente: volumen perdido (mL). Controles: volumen inicial, recipientes y duración.\nMateriales:\n1. Dos recipientes iguales\n2. Agua\n3. Vaso medidor graduado\n4. Reloj\nPasos:\n1. Mide 100 mL en cada recipiente.\n2. Coloca uno al sol y otro a la sombra, protegidos de lluvia.\n3. Tras dos horas, mide el volumen restante en cada uno.\n4. Resta cada volumen final de 100 mL; registra y compara las pérdidas. No anticipes los resultados.`;
  return null;
}

export function verifiedLocalTutor(question: string, mode: string, history: readonly LocalTurn[], language: string): VerifiedLocalReply | null {
  // Reviewed Spanish only. Other languages and unsupported requests keep the existing route.
  if (language !== 'es' || question.length > 700) return null;
  const q = normalize(question);
  if (/\b(?:mis apuntes|mi diario|segun el texto|segun mis|segun la sesion|traduce|en ingles|en quechua)\b/.test(q)) return null;
  if (mode === 'guide') { const text = guideHint(q); return text ? reply(text, 'hint', question) : null; }
  if (mode === 'explore') { const text = experiment(q); return text ? reply(text, 'experiment', question) : null; }
  if (mode === 'practice') {
    if (!freshExercise.test(q)) {
      const last = history.at(-1);
      if (last?.role !== 'assistant' || !/^(?:(?:la respuesta es|mi respuesta es|el resultado es|creo que es|es)\s+)?(?:s\/\s*)?-?\d|^no se[.!]?$/i.test(q.trim())) return null;
      let feedback = gradeGenerated(last.text, question);
      if (!feedback && /^(?:Tu respuesta no es correcta|La unidad no corresponde|No puedo verificar esa respuesta)/.test(last.text)) {
        for (const turn of history.slice(-8).reverse()) {
          if (turn.role !== 'assistant') continue;
          feedback = gradeGenerated(turn.text, question);
          if (feedback) break;
        }
      }
      return feedback ? reply(feedback, 'feedback', question) : null;
    }
    // Pick from safe data sets. All answers are calculated from the emitted problem, not cached.
    // Explicit user-supplied numbers or quantities are not overridden.
    if (/\d/.test(q) || /\b(?:exactamente|tres ejercicios|dos ejercicios|sin usar)\b/.test(q)) return null;
    const n = history.filter(m => m.role === 'assistant').length % 3;
    if (/proporcionalidad directa/.test(q) && /papa/.test(q)) {
      const [price, kg] = [[2.5,12],[3,15],[4.5,8]][n];
      return reply(`En una venta de Apurímac, una comerciante vende papas a S/ ${price.toFixed(2)} por kilogramo. Vende ${kg} kg. ¿Cuánto dinero recauda en total?`, 'exercise', question);
    }
    if (/porcentaj|descuento/.test(q) && /mercado|compra/.test(q)) {
      const [price, rate] = [[40,15],[60,20],[80,25]][n];
      return reply(`En el mercado de Abancay, una mochila cuesta S/ ${price} y tiene un descuento del ${rate}%. ¿Cuál es el precio final?`, 'exercise', question);
    }
    if (/temperatur/.test(q) && /negativ|enteros|positiv/.test(q)) {
      const [start, change] = [[-6,11],[-9,13],[4,9]][n];
      return reply(`En una comunidad altoandina, la temperatura inicial es de ${start} °C. ${n === 2 ? 'Baja' : 'Sube'} ${change} °C. ¿Cuál es la temperatura final?`, 'exercise', question);
    }
  }
  if (mode === 'explain' && /\b(?:explica\w*|diferencia|compara\w*|por que|que es)\b/.test(q) && !/\d/.test(q.replace(/\b\d+\s+palabras\b/g,''))) {
    if (/\bmasa\b/.test(q) && /\bpeso\b/.test(q)) return reply('La masa mide la cantidad de materia de un cuerpo, en kilogramos. El peso es la fuerza gravitatoria sobre él, en newtons. Se calcula multiplicando la masa por la aceleración de la gravedad. Al viajar de la Tierra a la Luna, la masa permanece igual y el peso disminuye porque la gravedad lunar es aproximadamente una sexta parte de la terrestre. Dos cuerpos de igual masa tienen igual peso en el mismo campo gravitatorio.', 'reference', question);
    if (/metal/.test(q) && /dilat|expan/.test(q) && /calor|temperatur|calient/.test(q)) return reply('Al calentar un metal, sus átomos vibran con mayor amplitud y aumenta su separación promedio. El metal se dilata: sus dimensiones aumentan ligeramente. Por ejemplo, al poner una tapa metálica ajustada bajo agua tibia, la tapa puede expandirse y resultar más fácil abrir el frasco. La dilatación depende del material, de su tamaño inicial y del cambio de temperatura.', 'reference', question);
  }
  return null;
}
