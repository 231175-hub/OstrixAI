/** AUTO-02: conservative retry payload; never resubmit entries already confirmed saved. */
export interface PendingCompanionEntry { readonly sessionId: string; readonly note?: string; readonly doubt?: string; }
export function unsavedCompanionEntries(entry: PendingCompanionEntry, noteSaved: boolean, doubtSaved: boolean): PendingCompanionEntry {
  return { sessionId: entry.sessionId,
    ...(!noteSaved && entry.note ? { note: entry.note } : {}),
    ...(!doubtSaved && entry.doubt ? { doubt: entry.doubt } : {}) };
}
