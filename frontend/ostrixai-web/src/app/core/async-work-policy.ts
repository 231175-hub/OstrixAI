/** ASYNC-01: conservative, user-consent-gated background policies. No network access here. */
export interface SyncPrerequisites {
  readonly hasStudent: boolean;
  readonly authorized: boolean;
  readonly linked: boolean;
  readonly online: boolean;
  readonly pending: number;
  readonly busy: boolean;
  readonly linking: boolean;
}
export function mayRetrySchoolSync(p: SyncPrerequisites): boolean {
  return p.hasStudent && p.authorized && p.linked && p.online && p.pending > 0 && !p.busy && !p.linking;
}
export function schoolSyncBackoffMs(failures: number): number {
  return Math.min(5 * 60_000, 30_000 * 2 ** Math.min(4, Math.max(0, Math.floor(failures) - 1)));
}
export function mayAutoEnrichNotes(enabled: boolean, nanoReady: boolean, cloudConsent: boolean, offlineOnly: boolean): boolean {
  return enabled && (nanoReady || (cloudConsent && !offlineOnly));
}
