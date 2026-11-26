import { unsavedCompanionEntries } from './companion-background-save';
describe('AUTO-02: background save retry boundaries', () => {
  const entry = { sessionId: 'class-1', note: 'Aprendí sobre nubes.', doubt: '¿Cómo se forman?' };
  it('keeps only the doubt after a successful note', () => {
    expect(unsavedCompanionEntries(entry, true, false)).toEqual({ sessionId: 'class-1', doubt: entry.doubt });
  });
  it('keeps only the note after a successful doubt', () => {
    expect(unsavedCompanionEntries(entry, false, true)).toEqual({ sessionId: 'class-1', note: entry.note });
  });
  it('returns no pending work after complete success', () => {
    expect(unsavedCompanionEntries(entry, true, true)).toEqual({ sessionId: 'class-1' });
  });
  it('keeps both if no write succeeded', () => {
    expect(unsavedCompanionEntries(entry, false, false)).toEqual(entry);
  });
});
