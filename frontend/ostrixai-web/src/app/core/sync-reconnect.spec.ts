import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { LearningDiaryService, StudySession } from './learning-diary.service';
import { LearningMemoryService } from './learning-memory.service';
import { LocalIdentityService } from './local-identity.service';
import { StudentSettingsService } from './student-settings.service';
import { SyncEvent, SyncService } from './sync.service';

describe('Reconnection with encrypted local data', () => {
  const post = jasmine.createSpy('POST');
  const get = jasmine.createSpy('GET');
  let identity: LocalIdentityService;
  let sync: SyncService;
  let diary: LearningDiaryService;
  let network: jasmine.Spy;
  const hash = 'a'.repeat(64);

  beforeEach(async () => {
    get.calls.reset();
    post.calls.reset();
    TestBed.configureTestingModule({ providers: [{ provide: HttpClient, useValue: { post, get } }] });
    identity = TestBed.inject(LocalIdentityService);
    sync = TestBed.inject(SyncService);
    diary = TestBed.inject(LearningDiaryService);
    const name = crypto.randomUUID().slice(0, 12);
    await identity.register(name, 'synthetic-test-password');
    const uid = 'fixture-' + name;
    await identity.linkServerAccount(uid);
    // The real owner checks and HTTP header construction still run. No external service is called.
    Object.assign(sync, { auth: { currentUser: { uid, emailVerified: true, isAnonymous: false,
      getIdToken: async () => 'synthetic-auth' } } });
    spyOn(sync as unknown as { appCheckToken(): Promise<string> }, 'appCheckToken')
      .and.resolveTo('synthetic-attestation');
    network = spyOnProperty(navigator, 'onLine', 'get').and.returnValue(false);
    sync.setSyncConsent(true);
    await sync.refreshCount();
  });

  afterEach(() => { identity.logout(); });

  it('advances the session revision on consecutive edits even if the device clock moves backwards', async () => {
    const row = await diary.create('2026-11-18', 'Ciencias');
    spyOn(Date, 'now').and.returnValue(Date.parse(row.updatedAt) - 5000);
    await diary.update(row.id, { notes: 'Edición con cambio de reloj' });
    const next = await identity.read<StudySession>('diary', row.id);
    expect(Date.parse(next!.updatedAt)).toBeGreaterThan(Date.parse(row.updatedAt));
  });

  it('keeps an encrypted revision pending without consent, on App Check failure and on an incomplete ACK', async () => {
    const row = await diary.create('2026-11-18', 'Ciencias');
    await diary.update(row.id, { notes: 'Edición sin conexión' });
    sync.setSyncConsent(false);
    await sync.refreshCount();
    expect(sync.pendingCount()).toBe(1);
    network.and.returnValue(true);
    await expectAsync(sync.flush()).toBeRejectedWithError(/autorización/);
    sync.setSyncConsent(true);
    const attestation = (sync as unknown as { appCheckToken: jasmine.Spy }).appCheckToken;
    attestation.and.rejectWith(new Error('appCheck/recaptcha-error'));
    await expectAsync(sync.flush()).toBeRejectedWithError(/recaptcha-error/);
    expect(post).not.toHaveBeenCalled();
    expect(sync.pendingCount()).toBe(1);
    attestation.and.resolveTo('synthetic-attestation');
    post.and.returnValue(of({ hashes: { sessions: { [crypto.randomUUID()]: hash } } }));
    await expectAsync(sync.flush()).toBeRejectedWithError(/no confirmó/);
    await sync.refreshCount();
    expect(sync.pendingCount()).toBe(1);
    post.and.returnValue(of({ hashes: { sessions: { [row.id]: hash } } }));
    await sync.flush();
    expect(sync.pendingCount()).toBe(0);
  });

  it('syncs the grade selected when the session was created and leaves ungraded sessions unassigned locally', async () => {
    const settings = TestBed.inject(StudentSettingsService);
    const legacy = await diary.create('2026-11-17', 'Ciencias');
    await settings.save(4, 'es', false);
    const graded = await diary.create('2026-11-18', 'Ciencias');
    await settings.save(5, 'es', false);
    await diary.load();
    await diary.update(graded.id, { notes: 'Apunte de cuarto' });
    await diary.update(legacy.id, { notes: 'Apunte anterior' });
    network.and.returnValue(true);
    post.and.callFake((_url: string, body: { sessions: { id: string, grade?: number }[] }) => {
      expect(body.sessions.find(row => row.id === graded.id)?.grade).toBe(4);
      expect(body.sessions.find(row => row.id === legacy.id)?.grade).toBeUndefined();
      return of({ hashes: { sessions: Object.fromEntries(body.sessions.map(row => [row.id, hash])) } });
    });
    await sync.flush();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('retains an offline edit and event after losing the ACK, and replays the same ID when online', async () => {
    const session = await diary.create('2026-11-18', 'Ciencias');
    await diary.update(session.id, { notes: 'Apunte sintético sin red' });
    const eventId = await sync.enqueueInteraction('Pregunta de prueba', 'Respuesta de prueba', 'ON_DEVICE', false);
    await expectAsync(sync.flush()).toBeRejectedWithError(/Sin conexión/);
    expect(sync.pendingCount()).toBe(2); // One diary revision and one separate Tutor interaction.
    expect(post).not.toHaveBeenCalled();
    const saved = await identity.read<StudySession>('diary', session.id);
    expect(saved?.notes).toBe('Apunte sintético sin red');

    const delivered: string[] = [];
    const sessions = new Map<string, StudySession>();
    post.and.callFake((path: string, body: { events?: SyncEvent[], sessions?: StudySession[] },
                       { headers }: { headers: HttpHeaders }) => {
      expect(headers.get('Authorization')).toBe('Bearer synthetic-auth');
      expect(headers.get('X-Firebase-AppCheck')).toBe('synthetic-attestation');
      if (body.events) {
        delivered.push(...body.events.map(event => event.id));
        if (delivered.length === 1) return throwError(() => new HttpErrorResponse({ status: 503 }));
        return of({ ids: body.events.map(event => event.id) });
      }
      expect(path).toContain('/diary/sync');
      for (const row of body.sessions!) sessions.set(row.id, row);
      return of({ hashes: { sessions: { [session.id]: hash } } });
    });
    const flush = sync.flush.bind(sync);
    const onFlush = spyOn(sync, 'flush');
    const reconnect = () => new Promise<void>((resolve, reject) => {
      onFlush.and.callFake((...args) => {
        const request = flush(...args);
        request.then(resolve, reject);
        return request;
      });
      window.dispatchEvent(new Event('online'));
    });
    network.and.returnValue(true);
    await expectAsync(reconnect()).toBeRejected();
    expect((await identity.list<SyncEvent>('outbox')).map(row => row.id)).toEqual([eventId]);
    expect(sync.lastSyncSuccess()).toBeNull();
    await reconnect();
    expect(delivered).toEqual([eventId, eventId]);
    expect(sessions.get(session.id)?.notes).toBe(saved!.notes);
    expect(await identity.list('outbox')).toEqual([]);
    expect(sync.pendingCount()).toBe(0);
    expect((await identity.read<{ hash: string }>('syncreceipts', 'diary-' + session.id))?.hash).toBe(hash);
    get.and.callFake((_url: string, { headers }: { headers: HttpHeaders }) => {
      expect(headers.get('X-Firebase-AppCheck')).toBe('synthetic-attestation');
      expect(headers.get('Authorization')).toBe('Bearer synthetic-auth');
      return of({ sessions: [...sessions.values()] });
    });
    expect(await sync.verifyRemoteSessionIds()).toEqual({ sessionIds: [session.id], count: 1 });
  });

  it('keeps a review retryable and reports failure when the server accepts zero review results', async () => {
    const session = await diary.create('2026-11-18', 'Ciencias');
    const memory = TestBed.inject(LearningMemoryService);
    const concept = await memory.registerDoubt(session.id, session.course, session.topic, 'Duda sintética');
    await memory.recordGradedAnswer(concept.id, 'exercise-synthetic', 1, true, 'Retroalimentación');
    network.and.returnValue(true);
    const sent: string[] = [];
    post.and.callFake((_path: string, body: Record<string, { id: string }[]>) => {
      if (body['review_results']) {
        sent.push(body['review_results'][0].id);
        return of({ accepted_results: sent.length === 1 ? 0 : 1 });
      }
      const field = body['sessions'] ? 'sessions' : 'memory_items';
      return of({ hashes: { [field]: { [body[field][0].id]: hash } } });
    });
    await expectAsync(sync.flush()).toBeRejected();
    expect(sync.lastSyncSuccess()).toBeNull();
    await sync.flush();
    expect(sent).toEqual([memory.concepts()[0].history[0].id!, memory.concepts()[0].history[0].id!]);
    expect(sync.lastSyncSuccess()).toBeTruthy();
  });

  it('delivers multiple valid sessions that together exceed the Flask body limit', async () => {
    const sample = await diary.create('2026-11-18', 'Ciencias');
    const rows = Array.from({ length: 5 }, (_, index) => ({
      ...sample, id: index === 0 ? sample.id : crypto.randomUUID(), topics: [{ ...sample.topics[0], notes: ['a'.repeat(900_000)] }],
    }));
    for (const row of rows) await identity.save('diary', row.id, row);
    network.and.returnValue(true);
    const saved: string[] = [];
    let rejected = 0;
    post.and.callFake((_url: string, body: { sessions: StudySession[] }) => {
      if (new Blob([JSON.stringify(body)]).size > 4 * 1024 * 1024) {
        rejected++;
        return throwError(() => new HttpErrorResponse({ status: 413 }));
      }
      saved.push(...body.sessions.map(row => row.id));
      return of({ hashes: { sessions: Object.fromEntries(body.sessions.map(row => [row.id, hash])) } });
    });
    await sync.flush();
    expect(rejected).toBe(1);
    expect(saved.sort()).toEqual(rows.map(row => row.id).sort());
  });
});
