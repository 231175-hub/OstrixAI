/** Narrow, deterministic check for two explicitly sequential discounts on ONE monetary price.
 * Returns null for ambiguous questions, multiple prices, missing units or unclear answers.
 * It is not a general word-problem solver. No network or model calls.
 */
export function gradeSuccessiveDiscounts(
  previousAssistant: string, studentAnswer: string, lang: 'es' | 'en' = 'es'
): { correct: boolean; feedback: string } | null {
  const normalize = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/\*\*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const p = normalize(previousAssistant);
  const a = normalize(studentAnswer);
  if ((p.match(/\?/g)?.length ?? 0) !== 1) return null;
  if (!/\b(?:precio final|precio despues de (?:ambos|los dos) descuentos|final price|final cost)\b/.test(p)) return null;
  // Exclude alternative operations and ambiguous mixed-rate exercises.
  if (/\b(?:impuesto|iva|igv|tax|shipping|envio|recargo|surcharge|interes|interest|aumento|increase|cashback|reembolso|comision|fee|cuotas|installments|por unidad|per unit|por kilo|per kilo|por kilogramo)\b/.test(p)) return null;
  if (/\b(?:redondea\w*|redondeo|trunca\w*|round\w*|truncat\w*)\b/.test(p)) return null;
  const amounts = [...p.matchAll(/(?:s\/\s*(\d{1,4}(?:[.,]\d{1,2})?)(?!\d|[.,]\d)|(?<![\d.,+\-])(\d{1,4}(?:[.,]\d{1,2})?)\s*soles\b)/g)];
  const rates = [...p.matchAll(/(?<![\d.,+\-])(\d{1,3}(?:[.,]\d{1,2})?)\s*%/g)];
  if (amounts.length !== 1 || rates.length !== 2) return null;
  if ((amounts[0].index ?? 0) >= (rates[0].index ?? 0)) return null;
  const before = p.slice(0, rates[0].index);
  const between = p.slice((rates[0].index ?? 0) + rates[0][0].length, rates[1].index);
  const after = p.slice((rates[1].index ?? 0) + rates[1][0].length);
  if (!/\b(?:descuento|discount)\b/.test(before) || !/\b(?:descuento|discount|adicional|additional)\b/.test(between)) return null;
  if (!/\b(?:sobre (?:el |la )?(?:nuevo precio|precio reducido|precio anterior|precio resultante|precio con descuento|importe reducido)|en el ultimo precio|on the (?:new|reduced|discounted|remaining) price|off the (?:new|reduced|discounted|remaining) price|descuentos sucesivos|successive discounts)\b/.test(between + ' ' + after)) return null;
  // Accept an explicit price answer (including a subsequent explanation), or a standalone amount.
  const answer = /^(?:mi respuesta es|el precio final es|my answer is|the final price is)\s+(?:s\/\s*)?(\d{1,5}(?:[.,]\d{1,6})?)(?:\s+soles)?(?=$|\s|[.!?;](?:\s|$))/i.exec(a)
    ?? /^(?:s\/\s*)?(\d{1,5}(?:[.,]\d{1,6})?)(?:\s+soles)?\.?$/.exec(a);
  if (!answer) return null;
  const suffix = a.slice(answer[0].length).trim();
  if (suffix.startsWith('%') || /^(?:por |per |dolares|dollars|euros|usd\b|pen\b|kg\b)/.test(suffix)) return null;
  const number = (v: string) => Number(v.replace(',', '.'));
  const cents = Math.round(number(amounts[0][1] ?? amounts[0][2]) * 100);
  const b1 = Math.round(number(rates[0][1]) * 100);
  const b2 = Math.round(number(rates[1][1]) * 100);
  if (cents <= 0 || ![b1, b2].every(b => b >= 0 && b <= 10000)) return null;
  // Integer arithmetic: cents times two basis-point factors. At the bounded input size
  // this remains well within Number.MAX_SAFE_INTEGER. Round half-up only at the end.
  const numerator = cents * (10000 - b1) * (10000 - b2);
  const exact = numerator / 1e10;
  const rounded = Math.floor((numerator + 5e7) / 1e8) / 100;
  // Some school exercises round the intermediate currency amount. Accept that convention too.
  const firstCents = Math.floor((cents * (10000 - b1) + 5000) / 10000);
  const roundedEach = Math.floor((firstCents * (10000 - b2) + 5000) / 10000) / 100;
  const submitted = number(answer[1]);
  const equivalent = (v: number) => Math.abs(v - submitted) < 0.0000005;
  const correct = equivalent(exact) || equivalent(rounded) || equivalent(roundedEach);
  const first = (cents * (10000 - b1) / 1e6).toString();
  const feedback = lang === 'en'
    ? (correct ? `Correct. Apply the first discount to the original price and the second to the reduced price. Your final amount is valid (rounding to cents is accepted).`
      : `Not yet. The discounts are successive, not additive. After the first discount the price is S/ ${first}. Apply the second discount to that amount, not the original price. Try again.`)
    : (correct ? `¡Correcto! El primer descuento se aplica al precio original y el segundo al precio reducido. Tu importe final es válido (se admite el redondeo a céntimos).`
      : `Todavía no. Los descuentos son sucesivos, no se suman. Después del primer descuento el precio es S/ ${first}. Aplica el segundo descuento sobre ese importe, no sobre el precio original. Inténtalo de nuevo.`);
  return { correct, feedback: feedback + (lang === 'en' ? '\n\nLocal mathematical check (not AI-generated).' : '\n\nComprobación matemática local (no generada por IA).') };
}

/** On an immediate retry, reuse only an exercise connected by our own explicit correction. */
export function gradeDiscountPracticeTurn(
  history: readonly { role: string; text: string; source?: string }[], studentAnswer: string, lang: 'es' | 'en' = 'es'
): { correct: boolean; feedback: string } | null {
  if (history.at(-1)?.role !== 'assistant') return null;
  for (let i = history.length - 1; i >= Math.max(0, history.length - 9); i -= 2) {
    const turn = history[i];
    if (turn.role !== 'assistant') return null;
    const grade = gradeSuccessiveDiscounts(turn.text, studentAnswer, lang);
    if (grade) return grade;
    // Only traverse a previous correction produced by the verified branch, never an unrelated assistant reply.
    if (!/^(?:Todavía no\. Los descuentos son sucesivos, no se suman\.|Not yet\. The discounts are successive, not additive\.)/.test(turn.text)
      || !/(?:Comprobación matemática local \(no generada por IA\)\.|Local mathematical check \(not AI-generated\)\.)/.test(turn.text)
      || history[i - 1]?.role !== 'user') return null;
  }
  return null;
}