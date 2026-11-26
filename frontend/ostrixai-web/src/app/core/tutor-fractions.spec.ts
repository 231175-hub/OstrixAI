import { formatTutorFractions } from './tutor-fractions';

describe('plain text Tutor fractions', () => {
  it('shows plain arithmetic in headings without changing currency', () => {
    expect(formatTutorFractions('$4 - 3 = 1$')).toBe('4 - 3 = 1');
    expect(formatTutorFractions('Paga $3 o $4.')).toBe('Paga $3 o $4.');
  });
  it('renders consumed and remaining quantities in text that can be copied', () => {
    expect(formatTutorFractions('Comiste $\\frac{3}{4}$ de las papas y queda \\(\\frac{1}{4}\\).'))
      .toBe('Comiste 3/4 de las papas y queda 1/4.');
  });

  it('renders Gemini Nano numeric text fractions in the tutor chat and history', () => {
    const response = 'La fracción $\\text{3/4}$ significa tres partes. Te queda $\\text{1/4}$.';
    expect(formatTutorFractions(response))
      .toBe('La fracción 3/4 significa tres partes. Te queda 1/4.');
    expect(formatTutorFractions('\\(\\text{ -3 / 4 }\\) y \\text{1/4}'))
      .toBe('-3/4 y 1/4');
  });

  it('handles text fractions in equations without removing nonnumeric TeX', () => {
    expect(formatTutorFractions('$$ \\text{3/4} + \\frac{1}{4} = 1 $$'))
      .toBe('3/4 + 1/4 = 1');
    expect(formatTutorFractions('$\\text{porción}$; $\\text{x/4}$; \\sqrt{\\text{3/4}}; x\\text{3/4}'))
      .toBe('$\\text{porción}$; $\\text{x/4}$; \\sqrt{\\text{3/4}}; x\\text{3/4}');
    expect(formatTutorFractions('$1 / \\text{3/4}$ y $\\text{3/4} ^ 2$'))
      .toBe('1 / (3/4) y (3/4) ^ 2');
  });

  it('renders display delimiters, numeric equations, common fraction commands and signed integers', () => {
    expect(formatTutorFractions('$$ \\dfrac{ 5 }{8} + \\tfrac{3}{8} = 1 $$; \\[1 - 5/8 = 3/8\\]; \\frac{-1}{12}'))
      .toBe('5/8 + 3/8 = 1; 1 - 5/8 = 3/8; -1/12');
  });

  it('preserves grouping when a fraction is the divisor or the base of a power', () => {
    expect(formatTutorFractions('$1 / \\frac{3}{4}$ y $\\frac{2}{3} ^ 2$'))
      .toBe('1 / (3/4) y (2/3) ^ 2');
  });

  it('leaves ordinary prices, existing plain text, escaped dollars and incomplete commands intact', () => {
    const text = 'Paga $3 o $4. Ya tienes 3/4. \\$5/8 cuesta $1. Borrador: \\frac{3}{';
    expect(formatTutorFractions(text)).toBe(text);
  });

  it('keeps nested fractions, algebra and implicit products literal', () => {
    const unsupported = [
      '$\\frac{1 + \\frac{1}{2} + 3}{4}$', '$\\frac{a + b}{c}$',
      'x\\frac{1}{2}', '\\frac{1}{2}x', '\\frac{1}{2}\\dfrac{3}{4}', '$x^2$',
    ];
    for (const text of unsupported) expect(formatTutorFractions(text)).toBe(text);
  });
});
