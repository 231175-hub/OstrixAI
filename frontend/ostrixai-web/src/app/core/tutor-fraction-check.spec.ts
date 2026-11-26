import { findTutorFractionMismatch as check } from './tutor-fraction-check';

describe('Arithmetic checks on stated consumed and remaining fractions', () => {
  it('catches the consumed fraction labelled as the remainder in the potato example', () => {
    const question = 'Explícame 3/4 con una chacra de papas en un máximo de 100 palabras.';
    expect(check(question, 'Si comes 3 de las 4 papas, te quedan 3/4.'))
      .toEqual({ used: 3, total: 4, role: 'remaining' });
    expect(check(question, 'Si comes 3 de las 4 papas, consumes 3/4 y te queda 1/4.')).toBeNull();
  });

  it('uses explicit counts from a question, detects an incorrect base and accepts equivalent fractions', () => {
    const question = 'Vendiste 4 de 12 naranjas. ¿Qué fracción del total te queda?';
    expect(check(question, 'Quedan 8/8 del total.')).toEqual({ used: 4, total: 12, role: 'remaining' });
    expect(check(question, 'La fracción vendida es 2/3.')).toEqual({ used: 4, total: 12, role: 'used' });
    expect(check(question, 'La parte vendida es 1/3. Quedan 2/3 de las naranjas.')).toBeNull();
  });

  it('recognizes small counts and named fractions in the crop example', () => {
    expect(check('Explícame 3/4 con una chacra.',
      'Tienes cuatro papas. Si te comes tres, te quedan tres cuartos.'))
      .toEqual({ used: 3, total: 4, role: 'remaining' });
    expect(check('Si comes tres de las cuatro papas, explica en no más de 100 palabras.',
      'Se consumieron tres cuartos y te queda un cuarto.')).toBeNull();
    expect(check('Usaste dos de un total de ocho fichas.', 'Queda un cuarto.'))
      .toEqual({ used: 2, total: 8, role: 'remaining' });
    expect(check('You ate three of the four potatoes.', 'Three quarters are left.'))
      .toEqual({ used: 3, total: 4, role: 'remaining' });
    expect(check('Si comes tres de las cuatro papas, explica en no más de 100 palabras.',
      'Te quedan 3/4, es decir, tres cuartos.')).toEqual({ used: 3, total: 4, role: 'remaining' });
  });

  it('recognizes a stated total followed by one action in either language', () => {
    expect(check('Hay 8 semillas y usas 2, ¿cuántas quedan?', 'Te quedan 1/4.'))
      .toEqual({ used: 2, total: 8, role: 'remaining' });
    expect(check('You have 8 apples and you eat 2. What fraction remains?', '1/4 is left.'))
      .toEqual({ used: 2, total: 8, role: 'remaining' });
    expect(check('You ate 2 out of 8 apples.', '1/4 was eaten and 3/4 is left.')).toBeNull();
  });

  it('checks a completed explanation before the Tutor asks about another example', () => {
    expect(check('Explícame 3/4.', 'Si comes 3 de 4 papas, te quedan 3/4. ¿Se te ocurre otro ejemplo?'))
      .toEqual({ used: 3, total: 4, role: 'remaining' });
    expect(check('Explícame 3/4.', 'Comen 3 de 4 papas, así que les quedan 3/4. ¿Y en otra canasta?'))
      .toEqual({ used: 3, total: 4, role: 'remaining' });
    expect(check('You ate 3 of a total of 4 potatoes.', 'You have 3/4 left. Can you give another example?'))
      .toEqual({ used: 3, total: 4, role: 'remaining' });
    expect(check('Comes 3 de 4 papas.', '¿Y si comes 1 de 4 manzanas? Quedan 3/4.')).toBeNull();
  });

  it('allows zero or all of a whole and distinguishes a real zero denominator', () => {
    expect(check('Usaste 0 de 6 fichas.', 'Quedan 6/6.')).toBeNull();
    expect(check('Comes 5 de 5 mangos.', 'Quedan 0/5.')).toBeNull();
    expect(check('Comes 5 de 5 mangos.', 'Quedan 0/0.')).toEqual({ used: 5, total: 5, role: 'remaining' });
  });

  it('leaves questions, corrections, compound expressions, other wholes and ambiguous premises alone', () => {
    const prompt = 'Comes 3 de 4 papas.';
    for (const statement of [
      '¿Quedan 3/4 o queda 1/4?', 'No quedan 3/4. Queda 1/4.',
      'Queda 3/4 de una papa cortada.', 'Quedan 3/4 de las manzanas.', 'En las manzanas quedan 3/4.',
      'Quedan 3/4 de las papas nuevas.', 'En otro ejemplo quedan 3/4.',
      'Quedan 3/4 - 2/4 del total.', 'En otra canasta quedan 3/4.',
      'Si comes 1 de 4 manzanas, quedan 3/4.',
    ]) expect(check(prompt, statement)).withContext(statement).toBeNull();
    expect(check('Explícame 3/4.', 'Quedan 3/4 del terreno sin sembrar.')).toBeNull();
    expect(check('No comes 3 de 4 papas.', 'Quedan 4/4.')).toBeNull();
    expect(check('Comes 3 de 4 papas. Después recibes otra papa.', 'Quedan 2/4.')).toBeNull();
    expect(check('Comes 3 de 4 papas y vendes 1 más.', 'Quedan 0/4.')).toBeNull();
    expect(check('Comes 3 de 4 papas y compras 2 más.', 'Quedan 3/4.')).toBeNull();
    expect(check('¿Comes 3 de 4 papas o 1 de 4?', 'Quedan 3/4.')).toBeNull();
  });
});
