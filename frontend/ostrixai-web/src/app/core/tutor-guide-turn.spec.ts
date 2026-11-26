import { keepOneGuideQuestion } from './tutor-guide-turn';

describe('TUTOR-GUIAME-02', () => {
  it('conserva la pista y solamente la primera pregunta', () => {
    expect(keepOneGuideQuestion(
      'Pista: piensa en el calor del Sol.\nPregunta: ¿Qué sucede con el agua?\n¿Y después?'
    )).toBe('Pista: piensa en el calor del Sol.\nPregunta: ¿Qué sucede con el agua?');
  });

  it('no altera una respuesta con una sola pregunta', () => {
    const answer = 'Pista: observa la temperatura.\n¿Qué pasa al enfriarse?';
    expect(keepOneGuideQuestion(answer)).toBe(answer);
  });

  it('no inventa preguntas cuando faltan', () => {
    expect(keepOneGuideQuestion('Piensa en el vapor.')).toBe('Piensa en el vapor.');
  });

  it('tambien conserva la pista en ingles', () => {
    expect(keepOneGuideQuestion('Hint: Think about cooling.\nWhat happens next? Why?'))
      .toBe('Hint: Think about cooling.\nWhat happens next?');
  });
});
