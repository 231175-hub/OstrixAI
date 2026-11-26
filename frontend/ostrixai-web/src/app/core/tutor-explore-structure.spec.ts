import { reviewExploreItemCounts } from './tutor-explore-structure';

describe('TUTOR-EXPLOREMOS-02', () => {
  const question = 'Propón solo cuatro materiales y cuatro pasos para el experimento.';
  const materials = 'Materiales (4):\n1. Dos platos\n2. Agua\n3. Vaso medidor\n4. Reloj\n';
  const steps4 = 'Pasos del Experimento:\n1. Mide 100 mL.\n2. Coloca los platos.\n3. Espera dos horas.\n4. Mide el agua restante.\n';

  it('acepta cuatro materiales y cuatro pasos', () => {
    expect(reviewExploreItemCounts(question, materials + steps4, false)).toBeNull();
  });
  it('detecta seis pasos aunque el modelo diga que son cuatro', () => {
    const steps6 = steps4 + '5. Registra los datos.\n6. Compara los resultados.\n';
    expect(reviewExploreItemCounts(question, materials + steps6, false)).toContain('4 pasos');
  });
  it('detecta materiales incompletos', () => {
    const short = materials.replace('4. Reloj\n', '');
    expect(reviewExploreItemCounts(question, short + steps4, false)).toContain('4 materiales');
  });
  it('no agrega restricciones si el estudiante no solicito cantidades', () => {
    expect(reviewExploreItemCounts('Propón un experimento sencillo.', 'Respuesta libre', false)).toBeNull();
  });
  it('acepta instrucciones inglesas', () => {
    const english = 'Materials:\n1. Plates\n2. Water\n3. Measuring cup\n4. Timer\nSteps:\n1. Fill\n2. Place\n3. Wait\n4. Measure';
    expect(reviewExploreItemCounts('Give exactly four materials and four steps.', english, true)).toBeNull();
  });
  it('exige secciones numeradas si el numero es explicito', () => {
    expect(reviewExploreItemCounts('Dame 4 pasos', 'Primero prepara, luego observa.', false)).toContain('4 pasos');
  });
});
