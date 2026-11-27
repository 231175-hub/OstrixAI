import { verifiedLocalTutor } from './tutor-verified-local';
import { countTutorWords } from './tutor-word-limit';

describe('TUTOR-RESCATE-01: bounded local verified content', () => {
  const ask = (q: string, mode: string, history: {role: string; text: string}[] = [], lang = 'es') => verifiedLocalTutor(q, mode, history, lang);
  it('guides the first step of a negative constant without praise or solution', () => {
    const r = ask('Estoy resolviendo 4x - 8 = 16. Creo que debo restar 8. Dame una pista.', 'guide')!;
    expect(r.text).toContain('Restar 8 no elimina'); expect(r.text).not.toMatch(/x\s*=\s*6/); expect((r.text.match(/\?/g) ?? []).length).toBe(1);
  });
  it('also handles a different positive constant', () => {
    expect(ask('Resuelvo 7x + 12 = 33. Creo que debo sumar 12. Dame una pista.', 'guide')?.text).toContain('Sumar 12 no elimina');
  });
  it('guides unlike fractions without solving', () => {
    const r = ask('Para sumar 2/3 + 1/5 pienso sumar los numeradores y los denominadores. Guíame.', 'guide')!;
    expect(r.text).toContain('múltiplo común de 3 y 5'); expect(r.text).not.toContain('13/15');
  });
  it('sets a solvable exercise and checks result and units against its own data', () => {
    const e = ask('Propón un problema de proporcionalidad directa con venta de papas.', 'practice')!;
    expect(e.text).toContain('en total'); expect(e.text).not.toContain('30 soles');
    const h = [{role:'assistant',text:e.text}];
    expect(ask('30 soles', 'practice', h)?.text).toMatch(/^Correcto/);
    expect(ask('30 soles por cada kilogramo', 'practice', h)?.text).toMatch(/^La unidad no corresponde/);
    const wrong = ask('31 soles', 'practice', h)!;
    expect(wrong.text).toMatch(/^Tu respuesta no es correcta/);
    expect(ask('30 soles', 'practice', [...h,{role:'user',text:'31 soles'},{role:'assistant',text:wrong.text}])?.text).toMatch(/^Correcto/);
  });
  it('verifies discount and negative temperatures', () => {
    const d = ask('Propón un ejercicio de porcentajes en el mercado.', 'practice')!;
    expect(ask('34 soles','practice',[{role:'assistant',text:d.text}])?.text).toMatch(/^Correcto/);
    const t = ask('Propón un ejercicio de temperaturas negativas.', 'practice')!;
    expect(ask('5 °C','practice',[{role:'assistant',text:t.text}])?.text).toMatch(/^Correcto/);
  });
  it('keeps germination within 100 words and four steps/materials', () => {
    const r = ask('Diseña un experimento de germinación de lentejas con agua, cuatro materiales y cuatro pasos. Máximo 100 palabras.', 'explore')!;
    expect(countTutorWords(r.text)).toBeLessThanOrEqual(100); expect((r.text.match(/^\d\. /gm) ?? []).length).toBe(8); expect(r.text).toContain('no resultados');
  });
  it('distinguishes melting from evaporation and uses appropriate measurements', () => {
    const ice = ask('Diseña un experimento de derretimiento de hielo al sol y a la sombra.', 'explore')!;
    expect(ice.text).toContain('cronómetro'); expect(ice.text).not.toContain('palo');
    const water = ask('Diseña un experimento de evaporación de agua al sol y a la sombra.', 'explore')!;
    expect(water.text).toContain('Vaso medidor graduado'); expect(water.text).not.toContain('palo');
  });
  it('provides bounded factual references without invented examples', () => {
    expect(ask('Explica masa y peso.', 'explain')?.text).toContain('igual peso');
    expect(ask('Explica por qué se dilatan los metales al subir la temperatura.', 'explain')?.text).toContain('tapa metálica');
  });
  it('does not intercept unrelated topics, other languages, or incompatible constraints', () => {
    expect(ask('Explica la Revolución francesa.', 'explain')).toBeNull();
    expect(ask('Explica masa y peso.', 'explain', [], 'en')).toBeNull();
    expect(ask('Explica masa y peso según mis apuntes.', 'explain')).toBeNull();
    expect(ask('Diseña un experimento de germinación de lentejas con agua. Solo tengo algodón.', 'explore')).toBeNull();
    expect(ask('Diseña un experimento de germinación de lentejas con agua. Tres materiales.', 'explore')).toBeNull();
  });
});
