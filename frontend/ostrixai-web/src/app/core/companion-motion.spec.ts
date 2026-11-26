import { companionMotion } from './companion-motion';
describe('Companion-05 movement', () => {
  it('walks four out of five cycles with multiple cards', () => {
    expect([1,2,3,4,5,6,7,8,9,10].map(i => companionMotion(i, 3))).toEqual([
      'walk','walk','walk','walk','fly','walk','walk','walk','walk','fly'
    ]);
  });
  it('never flies with one card and sometimes shows curiosity', () => {
    for (let i = 1; i < 50; i++) expect(companionMotion(i, 1)).not.toBe('fly');
    expect(companionMotion(13, 3)).toBe('curious');
  });
});
