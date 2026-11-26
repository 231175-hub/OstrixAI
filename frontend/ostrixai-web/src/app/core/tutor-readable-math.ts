/**
 * Presentación de un subconjunto SEGURO de LaTeX como texto legible en Tutor.
 * No interpreta HTML ni modifica el texto original guardado.
 * Las fórmulas que no entiende permanecen intactas para evitar inventar notación.
 */
const subscripts: Readonly<Record<string, string>> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '(': '₍', ')': '₎',
};
const superscripts: Readonly<Record<string, string>> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '(': '⁽', ')': '⁾',
};

function mapDigits(value: string, table: Readonly<Record<string, string>>): string {
  return Array.from(value, c => table[c] ?? c).join('');
}

function supportedMath(body: string): string | null {
  let v = body.trim();
  if (!v || v.length > 500) return null;
  // No tocar texto normal entre signos $, como dos precios o una variable sin contexto.
  const looksMathematical = /\\(?:text|mathrm|operatorname|times|cdot|div|circ|,|;|quad)|(?:[_^]\s*(?:\{|\\|\d))|\d\s*[-+*/=×÷−]\s*\d|^[-+−]?\d+(?:[.,]\d+)?$|^\d+\s*\/\s*\d+$/.test(v);
  if (!looksMathematical) return null;

  // No tocar macros TeX arbitrarias; este convertidor no es un motor LaTeX general.
  v = v.replace(/\\(?:text|mathrm|operatorname)\s*\{([^{}]*)\}/g, (_m, content: string) => content.trim());
  v = v.replace(/\\(?:left|right)\b/g, '');
  v = v.replace(/\\(?:times)\b/g, '×')
       .replace(/\\(?:cdot)\b/g, '·')
       .replace(/\\(?:div)\b/g, '÷')
       .replace(/\\(?:pm)\b/g, '±')
       .replace(/\\(?:leq|le)\b/g, '≤')
       .replace(/\\(?:geq|ge)\b/g, '≥')
       .replace(/\\(?:neq|ne)\b/g, '≠');
  v = v.replace(/\^\s*(?:\{\\circ\}|\\circ)/g, '°');
  v = v.replace(/\\circ\b/g, '°');
  v = v.replace(/\\(?:,|;|:|!|quad|qquad|\ )/g, ' ');
  v = v.replace(/\\_/g, '_');
  v = v.replace(/_\s*\{([+\-()\d]{1,16})\}/g, (_m, n: string) => mapDigits(n, subscripts));
  v = v.replace(/_([+-]?\d+)/g, (_m, n: string) => mapDigits(n, subscripts));
  v = v.replace(/\^\s*\{([+\-()\d]{1,16})\}/g, (_m, n: string) => mapDigits(n, superscripts));
  v = v.replace(/\^([+-]?\d+)/g, (_m, n: string) => mapDigits(n, superscripts));
  // Dejar las expresiones desconocidas tal cual, incluidos fracciones simbólicas y macros.
  if (/[\\{}<>]/.test(v)) return null;
  return v.replace(/\s+/g, ' ').trim() || null;
}

/** Convierte SOLO matemáticas delimitadas conocidas a texto Unicode copiable. */
export function formatTutorReadableMath(text: string): string {
  if (!text) return '';
  return text.replace(
    /\$\$([\s\S]*?)\$\$|(?<!\\)\$([^\r\n$]{1,500})\$|\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g,
    (original, display: string | undefined, inline: string | undefined, parens: string | undefined, brackets: string | undefined) => {
      const inner = display ?? inline ?? parens ?? brackets;
      return supportedMath(inner ?? '') ?? original;
    },
  );
}
