import { nextCompanionGesture } from './companion-personality';
describe('Companion personality cadence', () => {
  it('starts with a curious look', () => {
    expect(nextCompanionGesture(1, 3, true)).toBe('curious');
  });
  it('flies only between at least two safe places', () => {
    expect(nextCompanionGesture(2, 2, true)).toBe('fly');
    expect(nextCompanionGesture(2, 1, true)).toBe('walk');
    expect(nextCompanionGesture(2, 4, false)).toBe('walk');
  });
  it('walks on the perch without changing the page', () => {
    expect(nextCompanionGesture(3, 3, true)).toBe('walk');
    expect(nextCompanionGesture(0, 0, false)).toBe('walk');
  });
  it('rejects invalid motion counters', () => {
    expect(nextCompanionGesture(NaN, 2, true)).toBe('curious');
    expect(nextCompanionGesture(-1, 2, true)).toBe('curious');
  });
});
