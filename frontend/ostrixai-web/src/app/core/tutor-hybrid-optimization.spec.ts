import { isComplexTutorTask } from './tutor-hybrid-policy';
import { gradeSuccessiveDiscounts, gradeDiscountPracticeTurn } from './practice-successive-discounts';

const first = 'Un camarón cuesta inicialmente S/ 3.50. El vendedor aplica un descuento del 10% más un adicional del 5% en el último precio. ¿Cuál es el precio final?';
const second = 'Juan compra un aguacate por 12.50 soles. Primero, le ofrecen un descuento del 15%. Luego, le aplican un descuento adicional del 10% sobre el precio reducido anterior. ¿Cuál es el precio final del aguacate después de ambos descuentos?';
const history = [{ role: 'assistant', text: second }];

describe('HIBRIDO-OPTIMO-01: context-aware routing', () => {
  it('keeps basic explanations and simple hints device-preferred', () => {
    expect(isComplexTutorTask('¿Qué es un átomo?', 'explain')).toBeFalse();
    expect(isComplexTutorTask('Dame una pista', 'guide')).toBeFalse();
  });
  it('marks comparisons, inquiries and guided reasoning for the complex route', () => {
    expect(isComplexTutorTask('Compara la madera y el metal', 'explain')).toBeTrue();
    expect(isComplexTutorTask('¿Qué es la luz?', 'explore')).toBeTrue();
    expect(isComplexTutorTask('¿Estoy haciendo lo correcto?', 'guide')).toBeTrue();
    expect(isComplexTutorTask('Check my reasoning', 'guide')).toBeTrue();
  });
  it('prioritizes evaluation even for a short answer without magic keywords', () => {
    expect(isComplexTutorTask('S/ 9.375', 'practice', history)).toBeTrue();
    expect(isComplexTutorTask('9.56', 'practice', history)).toBeTrue();
    expect(isComplexTutorTask('Mi respuesta es 8, dame otro ejercicio', 'practice', history)).toBeTrue();
  });
  it('keeps generation local-preferred and never guesses a missing prior exercise', () => {
    expect(isComplexTutorTask('Diseña un ejercicio de descuentos sucesivos', 'practice')).toBeFalse();
    expect(isComplexTutorTask('Otro ejercicio', 'practice', history)).toBeFalse();
    expect(isComplexTutorTask('9.56', 'practice', [{ role: 'user', text: 'Hola' }])).toBeFalse();
  });
});

describe('HIBRIDO-OPTIMO-01: bounded successive-discount verification', () => {
  it('rejects the observed incorrect Nano answer without giving away the final price', () => {
    const grade = gradeSuccessiveDiscounts(first, 'Mi respuesta es S/ 2.975 porque sumé los porcentajes');
    expect(grade?.correct).toBeFalse();
    expect(grade?.feedback).toContain('no se suman');
    expect(grade?.feedback).not.toContain('2.9925');
    expect(grade?.feedback).toContain('no generada por IA');
  });
  it('accepts the exact result and final monetary rounding', () => {
    expect(gradeSuccessiveDiscounts(first, '2.9925')?.correct).toBeTrue();
    expect(gradeSuccessiveDiscounts(first, 'S/ 2.99')?.correct).toBeTrue();
  });
  it('grades the actual second exercise and accepts decimal comma and rounding conventions', () => {
    expect(gradeSuccessiveDiscounts(second, 'Mi respuesta es S/ 9.375 porque sumé el descuento del 15% y el 10%')?.correct).toBeFalse();
    expect(gradeSuccessiveDiscounts(second, 'S/ 9,56')?.correct).toBeTrue();
    expect(gradeSuccessiveDiscounts(second, '9.5625')?.correct).toBeTrue();
    expect(gradeSuccessiveDiscounts(second, '9.57')?.correct).toBeTrue();
  });
  it('does not grade a discount on the original price, multiple prices or a tax', () => {
    expect(gradeSuccessiveDiscounts(second.replace('sobre el precio reducido anterior', 'sobre el precio original'), '9.56')).toBeNull();
    expect(gradeSuccessiveDiscounts(second.replace('12.50 soles', '12.50 soles o S/ 15'), '9.56')).toBeNull();
    expect(gradeSuccessiveDiscounts(second.replace('descuento adicional', 'impuesto adicional'), '9.56')).toBeNull();
  });
  it('does not confuse percentages, unknown answers or per-unit prices with a final price', () => {
    expect(gradeSuccessiveDiscounts(second, '15%')).toBeNull();
    expect(gradeSuccessiveDiscounts(second, 'Mi respuesta es 9.56%')).toBeNull();
    expect(gradeSuccessiveDiscounts(second, 'No sé')).toBeNull();
    expect(gradeSuccessiveDiscounts(second, 'Mi respuesta es S/ 9.56 por kilo')).toBeNull();
  });
  it('rechecks an immediate retry against the same original exercise without jumping across topics', () => {
    const correction = gradeSuccessiveDiscounts(second, '9.375')!;
    const turns = [...history, { role: 'user', text: '9.375' }, { role: 'assistant', text: correction.feedback }];
    expect(gradeDiscountPracticeTurn(turns, '9.56')?.correct).toBeTrue();
    expect(gradeDiscountPracticeTurn(turns, '9.375')?.correct).toBeFalse();
    expect(gradeDiscountPracticeTurn([...turns, { role: 'user', text: 'Otro ejercicio' }, { role: 'assistant', text: 'Calcula 2 + 2.' }], '9.56')).toBeNull();
  });
  it('avoids unsupported rounding rules and negative rates', () => {
    expect(gradeSuccessiveDiscounts(second.replace('¿Cuál', 'Redondea a un decimal. ¿Cuál'), '9.6')).toBeNull();
    expect(gradeSuccessiveDiscounts(second.replace('15%', '-15%'), '9.56')).toBeNull();
  });
  it('keeps the verified arithmetic separate from any generated guidance in either language', () => {
    expect(gradeSuccessiveDiscounts(second, '9.56', 'en')?.feedback).toContain('Local mathematical check');
    expect(gradeSuccessiveDiscounts(second, '9.375')?.feedback).not.toContain('9.56');
  });
});