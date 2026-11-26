import { inspectExploreShadow, shadowScienceFallback, shadowSciencePrompt } from './tutor-explore-shadow';

const first = 'Soy estudiante de segundo de secundaria. ¿Por qué cambia la sombra de un palo durante el día? Diseña un experimento con hipótesis, variables, materiales y pasos; no inventes mediciones y termina con una pregunta.';
const wrong = `Experimento sobre el cambio de tamaño de la sombra
Pregunta Investigable
¿Cómo afecta la distancia entre un objeto y la fuente de luz solar a la longitud de su sombra?
Hipótesis
Si se coloca un objeto a una distancia más corta desde el sol, tendrá una sombra más larga.
Variable Independiente: La distancia entre el objeto y el sol.
Variable Dependiente: La longitud de la sombra.
Materiales: palo, regla y cuaderno.
Pasos: Mueve el palo a una distancia X; mide su sombra. Mueve el palo otra vez para comparar.
¿Qué distancia cambiarías?`;
const correction = 'Ostrix, revisa tu experimento: la distancia entre el palo y el Sol no cambia al moverme unos metros. Identifica tus errores y vuelve a diseñar el experimento de sombras manteniendo el objeto fijo.';
const badCorrection = `Tienes razón. Mi hipótesis: al mediodía la sombra será más corta.
Pregunta investigable: ¿Cómo afecta el ángulo solar y la distancia entre el palo y el Sol?
Variables controladas: misma luz y palo.
Materiales: palo, regla, cuaderno.
Pasos: palo vertical fijo a las 12:00 y 15:00, registro de sombra, compara.
¿Qué influye más, la altura del Sol o la distancia del objeto?`;
const history = [{role: 'user', text: first}, {role: 'assistant', text: wrong}];

describe('EXPLORE-SCIENCE-01: sombras del Sol', () => {
  it('detecta distancia al Sol como falsa variable', () => {
    expect(inspectExploreShadow(first, wrong, [], false)?.issues).toContain('distance-misconception');
  });
  it('detecta mover el palo en lugar de medir por horas', () => {
    expect(inspectExploreShadow(first, wrong, [], false)?.issues).toContain('moving-stick');
  });
  it('rechaza una autocorrección que conserva el error y no lo reconoce', () => {
    const issues = inspectExploreShadow(correction, badCorrection, history, false)?.issues;
    expect(issues).toContain('does-not-own-error');
    expect(issues).toContain('distance-misconception');
  });
  it('produce respaldo de experimento fijo con tabla vacía', () => {
    const answer = shadowScienceFallback(first, [], false)!;
    expect(answer).toContain('Variable independiente: hora');
    expect(answer).toContain('no lo muevas');
    expect(answer).toContain('| 9:00 | |');
    expect(inspectExploreShadow(first, answer, [], false)).toBeNull();
  });
  it('reconoce el error propio al corregir', () => {
    const answer = shadowScienceFallback(correction, history, false)!;
    expect(answer).toContain('Me equivoqué');
    expect(inspectExploreShadow(correction, answer, history, false)).toBeNull();
  });
  it('no interviene en germinación u otros experimentos', () => {
    expect(inspectExploreShadow('Diseña un experimento de lentejas y agua', wrong, [], false)).toBeNull();
    expect(shadowSciencePrompt('¿Cómo germina una semilla?', [], false)).toBeNull();
  });
  it('produce instrucciones específicas también para primer turno', () => {
    expect(shadowSciencePrompt(first, [], false)).toContain('Variable independiente');
  });
  it('no atribuye la respuesta esencial a Gemini Nano (lo decide el componente)', () => {
    expect(shadowScienceFallback(first, [], false)).not.toContain('ON_DEVICE');
  });
});
