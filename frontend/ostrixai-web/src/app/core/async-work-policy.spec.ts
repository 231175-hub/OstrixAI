import { mayRetrySchoolSync, schoolSyncBackoffMs, mayAutoEnrichNotes } from './async-work-policy';
describe('ASYNC-01: consent and retry policies', () => {
  const valid = { hasStudent: true, authorized: true, linked: true, online: true, pending: 2, busy: false, linking: false };
  it('requires every sync safeguard', () => {
    expect(mayRetrySchoolSync(valid)).toBeTrue();
    for (const key of ['hasStudent','authorized','linked','online'] as const) expect(mayRetrySchoolSync({...valid,[key]:false})).toBeFalse();
    for (const key of ['busy','linking'] as const) expect(mayRetrySchoolSync({...valid,[key]:true})).toBeFalse();
    expect(mayRetrySchoolSync({...valid,pending:0})).toBeFalse();
  });
  it('limits retry attempts with bounded exponential backoff', () => {
    expect(schoolSyncBackoffMs(1)).toBe(30_000);
    expect(schoolSyncBackoffMs(2)).toBe(60_000);
    expect(schoolSyncBackoffMs(3)).toBe(120_000);
    expect(schoolSyncBackoffMs(12)).toBe(300_000);
  });
  it('never enriches without local AI or explicit Cloud preference', () => {
    expect(mayAutoEnrichNotes(true,true,false,true)).toBeTrue();
    expect(mayAutoEnrichNotes(true,false,false,false)).toBeFalse();
    expect(mayAutoEnrichNotes(true,false,true,false)).toBeTrue();
    expect(mayAutoEnrichNotes(true,false,true,true)).toBeFalse();
    expect(mayAutoEnrichNotes(false,true,true,false)).toBeFalse();
  });
});
