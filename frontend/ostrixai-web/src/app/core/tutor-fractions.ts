/** Display elementary numeric fractions as copyable text without evaluating TeX or HTML. */
export function formatTutorFractions(text: string): string {
  // Chrome's on-device model may emit either \frac{3}{4} or \text{3/4}.
  // Flatten only isolated numeric fractions, never arbitrary TeX or prose.
  const numericFraction = /\\(?:(?:[dt]?frac)\s*\{\s*([+-]?\d+)\s*\}\s*\{\s*([+-]?\d+)\s*\}|text\s*\{\s*([+-]?\d+)\s*\/\s*([+-]?\d+)\s*\})/g;
  let scanned = 0;
  let braceDepth = 0;
  const plain = text.replace(numericFraction, (original, fracTop, fracBottom, textTop, textBottom, offset: number) => {
    for (; scanned < offset; scanned++) {
      if (text[scanned] === '{') braceDepth++;
      if (text[scanned] === '}') braceDepth = Math.max(0, braceDepth - 1);
    }
    const before = text[offset - 1] ?? '';
    const end = offset + original.length;
    const after = text[end] ?? '';
    scanned = end; // Each numeric command has balanced braces.
    // Leave nested commands and implicit products intact rather than joining their digits.
    if (braceDepth || /[\\{}\p{L}\d]/u.test(before) || /[{}\p{L}\d]/u.test(after) || /^\\(?:[dt]?frac|text)\s*\{/.test(text.slice(end))) {
      return original;
    }
    const fraction = (fracTop ?? textTop) + '/' + (fracBottom ?? textBottom);
    // Parenthesize when flattening a denominator or power would change its meaning.
    let left = offset - 1;
    let right = end;
    while (left >= 0 && /\s/.test(text[left])) left--;
    while (right < text.length && /\s/.test(text[right])) right++;
    return /[/÷^]/.test(text[left] ?? '') || text[right] === '^' ? '(' + fraction + ')' : fraction;
  });
  // Only unwrap numeric expressions containing a fraction. Currency and other TeX stay literal.
  const delimiters = /(?<![\\$])(\${1,2})([\s\d()/+.,=−×÷*^-]+)\1(?!\$)|\\\(([\s\d()/+.,=−×÷*^-]+)\\\)|\\\[([\s\d()/+.,=−×÷*^-]+)\\\]/g;
  return plain.replace(delimiters, (original, _dollars, dollarBody, inlineBody, displayBody) => {
    const body: string = dollarBody ?? inlineBody ?? displayBody;
    return /(?:\d\s*\/\s*[+-]?\d|\d\s*[+\-−×÷*=^]\s*\d)/.test(body) ? body.trim().replace(/\*/g, '×') : original;
  });
}
