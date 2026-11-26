type Role = 'used' | 'remaining';
interface Counts { used: number; total: number; unit: string; }
export interface FractionMismatch { used: number; total: number; role: Role; }

const useVerb = /\b(?:comer|comes?|comen|comi|comio|comiste|comieron|consumir|consumes?|consumi[o]?|consumiste|consumieron|usar|usas?|use|uso|usaste|usaron|gastar|gastas?|gaste|gasto|gastaron|vender|vendes?|vendi[o]?|vendiste|vendieron|eat|eats|ate|used|sell|sold|spend|spent)\b/.source;
const quantity = /(\d{1,6})/.source;
const unit = /([a-z]+)\b/.source;
const outOf = /\s+(?:de(?: las| los)?|(?:out )?of(?: the)?)\s+/.source;
const countedAction = new RegExp(useVerb + '\\s+' + quantity + outOf + quantity + '\\s+' + unit, 'g');
const startWithTotal = /\b(?:hay|habia|tienes?|tenias?|tengo|there (?:are|were)|you (?:have|had)|i (?:have|had))\s+/.source;
const followedByUse = /(?:\s*[.,;]\s*(?:(?:y|and)\s+)?|\s+(?:y|and)\s+)(?:si |if )?(?:(?:you|i|te|me|se) )?/.source;
const separateCounts = new RegExp(startWithTotal + quantity + '\\s+' + unit + followedByUse + useVerb +
  '\\s+' + quantity + '(?: de (?:ellas|ellos)| of them)?(?=\\s*(?:$|[.,;?!]|\\by\\b|\\band\\b))', 'g');

const countWords = [
  ['cero', 'zero'], ['un', 'una', 'uno', 'one'], ['dos', 'two'], ['tres', 'three'],
  ['cuatro', 'four'], ['cinco', 'five'], ['seis', 'six'], ['siete', 'seven'],
  ['ocho', 'eight'], ['nueve', 'nine'], ['diez', 'ten'], ['once', 'eleven'], ['doce', 'twelve'],
];
const numbers = new Map(countWords.flatMap((words, n) => words.map(word => [word, n] as const)));
const denominators: Record<string, number> = {
  medio: 2, half: 2, halves: 2, tercio: 3, third: 3, cuarto: 4, fourth: 4,
  quarter: 4, quinto: 5, fifth: 5, sexto: 6, sixth: 6, octavo: 8, eighth: 8,
};
const numberWord = new RegExp('\\b(' + [...numbers.keys()].join('|') + ')\\b', 'g');
const fractionInWords = new RegExp('\\b(\\d{1,6})[ -](' + Object.keys(denominators).join('|') + ')s?\\b', 'g');

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[*_]/g, '')
    .replace(/\bde un total de\b/g, 'de').replace(/\bof a total of\b/g, 'of')
    .replace(numberWord, word => String(numbers.get(word)))
    .replace(fractionInWords, (_text, numerator: string, denomination: string) =>
      numerator + '/' + denominators[denomination]);
}

function countsIn(text: string): Counts[] {
  const matches: Counts[] = [];
  for (const [, used, total, noun] of text.matchAll(countedAction)) {
    matches.push({ used: Number(used), total: Number(total), unit: noun });
  }
  for (const [, total, noun, used] of text.matchAll(separateCounts)) {
    matches.push({ used: Number(used), total: Number(total), unit: noun });
  }
  return matches;
}

const remaining = /^(?:(?:(?:te|me|nos|le|les) )?(?:quedan?|restan?|sobran?)|(?:la )?(?:parte|fraccion) (?:restante|que queda) (?:es|equivale a)|(?:the )?(?:remaining fraction|fraction left) is|(?:you )?have left)\s*[:=]?$/;
const used = new RegExp('^(?:(?:(?:te|se|me|you|i) )?' + useVerb + '|(?:la )?(?:parte|fraccion) (?:consumida|usada|gastada|vendida) (?:es|equivale a)|(?:the )?(?:used|consumed) fraction is)\\s*[:=]?$');
const remainsAfter = /^(?:(?:is|are|was|were)\s+)?(?:remain(?:s)?|left)$/;
const usedAfter = /^(?:was|were|is|are)\s+(?:eaten|used|spent|sold)$/;
const fraction = /(?<![\d/.,+-])\b(\d{1,6})\s*\/\s*(\d{1,6})\b(?![\d/]|\.\d)/g;

function mismatchInClause(clause: string, counts: Counts): FractionMismatch | null {
  for (const match of clause.matchAll(fraction)) {
    const before = clause.slice(0, match.index).replace(/^.*?\b(?:entonces|por lo tanto|por tanto|asi que|therefore|so)\b\s*/, '').trim();
    let after = clause.slice(match.index + match[0].length).trim().replace(/[.!]$/, '').trim();
    // A fraction of one item or of another basket has a different denominator.
    const base = /^(?:de(?:l)?|of)\s+(?:la |las |los |el |the )?([a-z0-9]+)\b/.exec(after);
    if (base) {
      if (base[1] !== counts.unit && !['total', 'whole'].includes(base[1])) continue;
      after = after.slice(base[0].length).trim();
    }
    let role: Role;
    if ((!after && remaining.test(before)) || (!before && remainsAfter.test(after))
      || (before === 'you have' && after === 'left')) role = 'remaining';
    else if ((!after && used.test(before)) || (!before && usedAfter.test(after))) role = 'used';
    else continue;
    const expected = role === 'used' ? counts.used : counts.total - counts.used;
    if (Number(match[2]) === 0 || Number(match[1]) * counts.total !== expected * Number(match[2])) {
      return { used: counts.used, total: counts.total, role };
    }
  }
  return null;
}

/** Accept plain a/b fractions. Null includes wording outside the single-action grammar. */
export function findTutorFractionMismatch(question: string, answer: string): FractionMismatch | null {
  const prompt = normalize(question);
  const sentences = normalize(answer).trim().split(/(?<=[.!?])(?=\s|$)|\n+/).filter(s => s.trim());
  // A follow-up question can introduce another example after an already completed explanation.
  while (sentences.length && /[?¿]/.test(sentences[sentences.length - 1])) sentences.pop();
  const reply = sentences.join(' ');
  const references = [...countsIn(prompt), ...countsIn(reply)];
  const counts = references[0];
  if (!counts || !counts.total || counts.used > counts.total) return null;
  if (references.some(c => c.used !== counts.used || c.total !== counts.total || c.unit !== counts.unit)) return null;
  // Negated premises and further transactions do not establish a single complement.
  const combined = prompt + ' ' + reply;
  const negatedAction = new RegExp('\\b(?:no|not|never|nunca)\\s+(?:(?:te|se|me|has|did|do)\\s+)*' + useVerb);
  if (negatedAction.test(combined)) return null;
  if (/\b(?:luego|despues|otra vez|ademas|mas tarde|later|again|another (?:basket|group|field|example)|otr[oa] (?:canasta|cesta|chacra|grupo|terreno|ejemplo))\b/.test(combined)) return null;
  if (/\b(?:o|or)\s+\d/.test(combined)) return null;
  const outsidePremises = combined.replace(countedAction, '').replace(separateCounts, '');
  if (new RegExp(useVerb + '\\s+\\d+\\b(?!\\s*[/])').test(outsidePremises)) return null;
  if (/\b(?:compras?|compraste|recibes?|recibiste|buy|bought|receive[d]?)\s+\d/.test(outsidePremises)) return null;
  for (const sentence of sentences) {
    if (/[?¿"«“]/.test(sentence) || /\b(?:no|not|never|nunca|incorrect[oa]?|wrong|falso|false|error)\b/.test(sentence)) continue;
    for (const clause of sentence.split(/[,;]|\by\b|\band\b/)) {
      const mismatch = mismatchInClause(clause, counts);
      if (mismatch) return mismatch;
    }
  }
  return null;
}
