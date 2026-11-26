const quantity = String.raw`(?:\d+|cien|(?:one|a) hundred)`;
const wordQuantity = new RegExp(String.raw`\b(${quantity})\s+(?:palabras?|words?)\b`, 'g');
const rangeStart = new RegExp(String.raw`\b(?:entre|de|between|from)\s+(${quantity})\s+(?:a|y|to|and)\s*$`);
const dashRange = new RegExp(String.raw`\b(${quantity})\s*[-–—]\s*$`);
const maxPrefix = /\b(?:max(?:imo|imum)?\.?(?: de| of)?|limite(?: de)?|word limit(?: of)?|hasta|sin (?:superar|exceder)(?: las)?|no (?:superes|excedas)(?: las)?|no mas de|at most|up to|(?:no|not) more than|within)\s*[:=]?\s*$/;
const maxInstruction = /\b(?:no (?:uses|escribas|utilices) mas de|no (?:se )?pase[sn]? de|(?:do not|don['’]t|never) exceed)\s*$/;
const maxSuffix = /^\s*(?:como maximo|maximo|max|o menos|or (?:less|fewer)|at most|maximum)\b/;
const strictPrefix = /\b(?:menos de|less than|fewer than|under)\s*$/;
const minimumPrefix = /\b(?:no (?:(?:uses|escribas|utilices) )?menos de|(?:no|not|don['’]t)(?: (?:use|write))? (?:fewer|less) than)\s*$/;
const answerFormat = /\b(?:en|in|respuesta de|resumen de|texto de|usa|use|write)\s*$/;
const asksForReply = /\b(?:explica(?:me)?|explicacion|resume(?:n)?|responde(?:me)?|respuesta|describe|escribe(?:me)?|dime|dame|cuenta(?:me)?|answer|reply|explain|respond|describe|summari[sz]e|summary|write|use|usa)\b/;

function valueOf(quantity: string): number {
  return /^\d/.test(quantity) ? Number(quantity) : 100;
}

/** Inclusive upper bound requested for this reply. A word count in a story is not a length request. */
export function requestedWordLimit(question: string): number | undefined {
  const text = question.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/«[^»]*»|“[^”]*”|"[^"]*"|\x60[^\x60]*\x60/g, ' ');
  const limits: number[] = [];
  for (const match of text.matchAll(wordQuantity)) {
    const amount = valueOf(match[1]);
    if (!Number.isSafeInteger(amount) || amount < 1) continue;
    const before = text.slice(0, match.index);
    const after = text.slice(match.index! + match[0].length);
    const range = before.match(rangeStart) ?? before.match(dashRange);
    if (minimumPrefix.test(before)) continue;
    if (/\b(?:sin (?:un )?(?:limite|maximo)(?: de)?|no (?:word )?limit(?: of)?)\s*$/.test(before)) continue;
    if (/^\s+(?:como minimo|minimo|o mas|or more|minimum|at least)\b/.test(after)) continue;
    if (/^\s+(?:cada un[oa]|por (?:cada|parrafo|ejemplo)|each|per)\b/.test(after)) continue;
    if (range && valueOf(range[1]) <= amount) {
      limits.push(amount);
    } else if (strictPrefix.test(before)) {
      limits.push(amount - 1);
    } else if (maxPrefix.test(before) || maxInstruction.test(before) || maxSuffix.test(after) || (answerFormat.test(before) && asksForReply.test(text))
      || (/^(?:en|in)?$/.test(before.trim()) && !after.replace(/[.!?,\s]/g, ''))) {
      limits.push(amount);
    }
  }
  return limits.length ? Math.min(...limits) : undefined;
}

/** Count the visible words, with a numeric fraction (including a spaced slash) as one word. */
export function countTutorWords(visibleText: string): number {
  const words = visibleText.normalize('NFC').match(/\p{N}+(?:[.,]\p{N}+)?\s*[/⁄]\s*\p{N}+(?:[.,]\p{N}+)?|\p{N}+[.,]\p{N}+|[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:[-'’][\p{L}\p{M}\p{N}]+)*/gu);
  return words?.length ?? 0;
}
