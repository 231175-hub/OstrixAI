import { guidedAlgebraFallback, inspectGuidedAlgebra } from './tutor-guide-algebra';

const first = 'Estoy aprendiendo: 2x + 6 = 14. Resté 6 y obtuve 2x = 8. ¿Qué hago ahora?';
const error = 'Creo que debo restar 2 a ambos lados porque tengo 2x = 8; así x = 6. ¿Está bien?';
const third = 'Ostrix, dijiste que sumé 6 pero resté 6. Además propuse restar 2 desde 2x = 8. Revisa dos errores.';
const transfer = 'Estoy resolviendo 3x - 5 = 16. Sumé 5 y obtuve 3x = 21. Creo que debo restar 3 y x = 18. Corrígeme con una pista y una pregunta.';
const history = [
  {role: 'user', text: first},
  {role: 'assistant', text: 'Pista: piensa. ¿Qué operación harías?'},
  {role: 'user', text: error},
  {role: 'assistant', text: 'Pista: recuerda que sumaste 6. ¿Qué harías?'}
];

describe('GUIAME-01: guardia de álgebra sin resultados revelados', () => {
  it('rechaza pistas genéricas', () => {
    expect(inspectGuidedAlgebra(first, 'Pista: piensa en el paso. ¿Qué harías?', [], false)?.issues)
      .toContain('vague-hint');
  });
  it('detecta una operación anterior matemáticamente falsa', () => {
    expect(inspectGuidedAlgebra(error, 'Pista: recuerda que sumaste 6. ¿Qué operación sigue?', history.slice(0, 1), false)?.issues)
      .toContain('wrong-previous-operation');
  });
  it('no publica x=4 aunque la cuenta sea correcta', () => {
    expect(inspectGuidedAlgebra(third, 'Error 2: x = 4. Pista: divide. ¿Qué haces?', history, false)?.issues)
      .toContain('revealed-value');
  });
  it('exige reconocer explícitamente el propio error', () => {
    expect(inspectGuidedAlgebra(third, 'Pista: el 2 multiplica a x. ¿Qué operación inversa aplicarías?', history, false)?.issues)
      .toContain('did-not-own-tutor-error');
  });
  it('detecta falta de corrección al error del estudiante en otra ecuación', () => {
    expect(inspectGuidedAlgebra(transfer, 'Pista: el 3 multiplica a x. ¿Qué harías?', [], false)?.issues)
      .toContain('did-not-correct-student');
  });
  it('produce respaldo sin solución para el estudiante confundido', () => {
    const fallback = guidedAlgebraFallback(transfer, [], false)!;
    expect(fallback).toContain('Restar 3 no es');
    expect(fallback).toContain('multiplicando');
    expect(fallback).not.toMatch(/x\s*=\s*(7|18)/);
    expect((fallback.match(/\?/g) ?? []).length).toBe(1);
  });
  it('corrige el error propio sin revelar el valor de x', () => {
    const fallback = guidedAlgebraFallback(third, history, false)!;
    expect(fallback).toContain('yo me equivoqué');
    expect(fallback).toContain('restaste 6');
    expect(fallback).not.toMatch(/x\s*=\s*4/);
  });
  it('deja pasar una guía concreta y segura', () => {
    const safe = 'Restar 3 no es adecuado: el 3 multiplica a x. Pista: piensa en la operación inversa. ¿Qué aplicarías a ambos lados?';
    expect(inspectGuidedAlgebra(transfer, safe, [], false)).toBeNull();
  });
  it('no interviene en ecuaciones fuera de la clase soportada', () => {
    expect(inspectGuidedAlgebra('Calcula x²+3=12', 'Pista: piensa. ¿Qué harías?', [], false)).toBeNull();
  });
  it('no confunde negar una suma con recomendarla', () => {
    const safe = 'No sumaste 6: restaste 6. Me equivoqué al decirlo. Pista: el 2 multiplica a x; piensa en la inversa. ¿Qué aplicarías a ambos lados?';
    expect(inspectGuidedAlgebra(third, safe, history, false)).toBeNull();
  });
});
