import { companionMessage, type CompanionArea } from './companion-content';

describe('COMPANION-01 context prompts', () => {
  const views: CompanionArea[] = ['inicio', 'diario', 'apuntes', 'dudas', 'eureka', 'repaso', 'progreso', 'libro', 'configuracion'];
  for (const view of views) {
    it(`provides four existing tutor modes on ${view}`, () => {
      const copy = companionMessage(view, 'es');
      expect(copy.actions.map(a => a.mode)).toEqual(['explain', 'guide', 'practice', 'explore']);
      expect(copy.actions.every(a => a.prompt.length > 25)).toBeTrue();
    });
  }
  it('does not attach private diary content or request cloud access automatically', () => {
    const text = companionMessage('libro', 'es').actions.map(a => a.prompt).join(' ');
    expect(text).not.toContain('IN_CLOUD');
    expect(text).not.toContain('API');
  });
  it('shows safe Spanish prompts for unverified Quechua', () => {
    const copy = companionMessage('dudas', 'qu-chanka');
    expect(copy.actions[0].prompt).toContain('Ayúdame');
  });
  it('provides English prompts when language is en', () => {
    const copy = companionMessage('repaso', 'en');
    expect(copy.actions[0].prompt).toContain('Help me');
  });
});
