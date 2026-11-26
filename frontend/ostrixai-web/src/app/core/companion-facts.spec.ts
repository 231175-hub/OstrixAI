import { companionFacts, COMPANION_FACTS_ES } from './companion-facts';

describe('Companion offline facts', () => {
  it('contains exactly 200 different Spanish facts without network requests', () => {
    const all = Object.values(COMPANION_FACTS_ES).flat();
    expect(all.length).toBe(200);
    expect(new Set(all).size).toBe(200);
  });
  it('provides contextual Spanish facts without calling an AI service', () => {
    expect(companionFacts('apuntes', 'es').length).toBeGreaterThan(1);
    expect(companionFacts('inicio', 'es').some(s => s.includes('evaporarse'))).toBeTrue();
  });
  it('never pretends that Quechua has been validated', () => {
    const texts = companionFacts('inicio', 'qu-chanka');
    expect(texts.every(s => s.length > 10)).toBeTrue();
    expect(texts).toEqual(companionFacts('inicio','es'));
  });
  it('offers English text in English mode', () => {
    expect(companionFacts('inicio','en')[0]).toContain('Fun fact');
  });
});
