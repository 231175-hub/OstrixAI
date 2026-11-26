import { renderTutorMathHtml } from './tutor-math-renderer';

describe('MATH-VISUAL-04', () => {

  it('renderiza variables x e y', () => {
    const html = renderTutorMathHtml('Despeja la $x$ y luego verifica $y$.');

    expect((html.match(/class="os-math-inline"/g) || []).length).toBe(2);
    expect(html).not.toContain('$x$');
    expect(html).not.toContain('$y$');
  });

  it('renderiza ecuaciones y exponentes', () => {
    const html = renderTutorMathHtml('Resuelve $3x + 5 = 20$ y calcula $x^2$.');

    expect((html.match(/class="os-math-inline"/g) || []).length).toBe(2);
    expect(html).toContain('<sup');
  });

  it('conserva los importes monetarios', () => {
    const html = renderTutorMathHtml('Paga $3 o $4.');

    expect(html).toContain('Paga $3 o $4.');
  });

});


describe('MATH-VISUAL-05', () => {
  it('renderiza terminos algebraicos con coeficientes', () => {
    const html = renderTutorMathHtml('Aisla $3x$ y despues $-2z$.');

    expect((html.match(/class="os-math-inline"/g) || []).length).toBe(2);
    expect(html).not.toContain('$3x$');
    expect(html).not.toContain('$-2z$');
  });

  it('no confunde precios con expresiones algebraicas', () => {
    const html = renderTutorMathHtml('Paga $3 o $4.');

    expect(html).toContain('Paga $3 o $4.');
    expect(html).not.toContain('os-math-inline');
  });
});

describe('MATH-VISUAL-06', () => {

  it('renderiza ecuaciones completas', () => {
    const html = renderTutorMathHtml(
      'Ahora tienes $3x = 15$. Luego resuelve $2x + 5 = 19$.'
    );
    expect((html.match(/class="os-math-inline"/g) || []).length).toBe(2);
    expect(html).not.toContain('$3x = 15$');
    expect(html).not.toContain('$2x + 5 = 19$');
  });

  it('renderiza parentesis y exponentes', () => {
    const html = renderTutorMathHtml(
      'Resuelve $2(x+3)=12$ y despues $x^2 = 25$.'
    );
    expect((html.match(/class="os-math-inline"/g) || []).length).toBe(2);
    expect(html).toContain('<sup');
  });

  it('renderiza variables y coeficientes', () => {
    const html = renderTutorMathHtml('Aisla $x$, $3x$ y $-2z$.');
    expect((html.match(/class="os-math-inline"/g) || []).length).toBe(3);
  });

  it('conserva precios como texto', () => {
    const html = renderTutorMathHtml('Paga $3 o $4.');
    expect(html).toContain('Paga $3 o $4.');
    expect(html).not.toContain('os-math-inline');
  });

  it('escapa HTML no confiable', () => {
    const html = renderTutorMathHtml(
      'Calcula $x$ <img src=x onerror=alert(1)>'
    );
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
  });

});

describe('TEXT-POLISH-01', () => {
  it('corrige errores de redaccion en Practiquemos', () => {
    const html = renderTutorMathHtml(
      'PRACTICUEMOS:\nResolve la siguiente ecuación: 4x - 7 = 11'
    );

    expect(html).toContain('PRACTIQUEMOS:');
    expect(html).toContain('Resuelve la siguiente ecuación:');
    expect(html).not.toContain('PRACTICUEMOS');
  });

  it('conserva las expresiones en ingles', () => {
    const html = renderTutorMathHtml(
      'Resolve this exercise.'
    );

    expect(html).toContain('Resolve this exercise.');
  });
});

describe('MARKDOWN-TABLE-01', () => {

  const experiment = [
    '| Día | Grupo 1 | Grupo 2 | Grupo 3 |',
    '| :---: | :---: | :---: | :---: |',
    '| 1 | | | |',
    '| 2 | | | |',
    '| 3 | | | |',
    '| 4 | | | |',
    '| 5 | | | |',
    '| 6 | | | |',
    '| 7 | | | |'
  ].join('\n');

  it('convierte la tabla de germinacion a HTML real', () => {
    const html = renderTutorMathHtml(experiment);

    expect(html).toContain('<table');
    expect(html).toContain('<thead>');
    expect(html).toContain('<tbody>');
    expect(html).toContain('<th scope="col">Día</th>');
    expect((html.match(/<tr>/g) || []).length).toBe(8);
  });

  it('mantiene vacias las celdas sin resultados', () => {
    const html = renderTutorMathHtml(experiment);

    expect(html).toContain('<td></td>');
    expect(html).not.toContain('100%');
  });

  it('escapa HTML malicioso dentro de una celda', () => {
    const html = renderTutorMathHtml([
      '| Nombre | Resultado |',
      '| --- | --- |',
      '| Test | <img src=x onerror=alert(1)> |'
    ].join('\n'));

    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
  });

  it('conserva formulas matematicas dentro de la tabla', () => {
    const html = renderTutorMathHtml([
      '| Ejercicio | Formula |',
      '| --- | --- |',
      '| Uno | $x^2 = 25$ |'
    ].join('\n'));

    expect(html).toContain('os-math-inline');
    expect(html).toContain('<sup');
  });

  it('mantiene el renderizado anterior si no hay tabla', () => {
    const html = renderTutorMathHtml(
      'Resuelve $3x = 15$ y explica tu respuesta.'
    );

    expect(html).toContain('os-math-inline');
    expect(html).not.toContain('<table');
  });

});