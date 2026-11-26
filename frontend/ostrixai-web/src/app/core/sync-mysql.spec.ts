import { HttpResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { tap } from 'rxjs';
import { LearningDiaryService } from './learning-diary.service';
import { LocalIdentityService } from './local-identity.service';
import { SyncService } from './sync.service';

// Supplied only by the disposable MySQL fixture in backend/tests/test_mysql_integration.py.
declare const OSTRIX_FIXTURE_PORT: number;
if (typeof OSTRIX_FIXTURE_PORT === 'number') {
  describe('Encrypted offline diary → Flask → MySQL', () => {
    it('retains an edited revision across reload, 401 and a lost commit ACK', async () => {
      const user = { uid: 'mysql-fixture-google-a', isAnonymous: false, emailVerified: true,
        getIdToken: async () => 'synthetic-id' };
      let rejectAppCheck = false;
      let loseResponse = false;
      const boot = () => {
        TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([(request, next) => {
          const path = request.url.slice(request.url.indexOf('/api/v1/'));
          return next(request.clone({ url: `http://127.0.0.1:${OSTRIX_FIXTURE_PORT}${path}` })).pipe(tap(event => {
            if (event instanceof HttpResponse && loseResponse) {
              loseResponse = false;
              throw new Error('Simulated lost ACK after Flask returned.');
            }
          }));
        }]))] });
        const identity = TestBed.inject(LocalIdentityService);
        const sync = TestBed.inject(SyncService);
        Object.assign(sync, { auth: { currentUser: user } });
        spyOn(sync as unknown as { appCheckToken(): Promise<string> }, 'appCheckToken')
          .and.callFake(async () => rejectAppCheck ? 'synthetic-rejected' : 'synthetic-app');
        return { identity, sync, diary: TestBed.inject(LearningDiaryService) };
      };
      const network = spyOnProperty(navigator, 'onLine', 'get').and.returnValue(true);
      let app = boot();
      try {
        await app.identity.register(crypto.randomUUID().slice(0, 12), 'synthetic-test-password');
        await app.identity.linkServerAccount(user.uid);
        app.sync.setSyncConsent(true);
        const session = await app.diary.create('2026-11-18', 'Ciencias');
        await app.sync.flush();
        expect(app.sync.pendingCount()).toBe(0);
        network.and.returnValue(false);
        await app.diary.update(session.id, { notes: 'Edición local de prueba' });
        await app.sync.refreshCount();
        expect(app.sync.pendingCount()).toBe(1);
        await expectAsync(app.sync.flush()).toBeRejectedWithError(/Sin conexión/);
        TestBed.resetTestingModule();
        app = boot();
        await app.identity.restoreSession();
        await app.sync.refreshCount();
        expect(app.sync.pendingCount()).toBe(1);
        network.and.returnValue(true);
        rejectAppCheck = true;
        await expectAsync(app.sync.flush()).toBeRejectedWithError(/401/);
        expect(app.sync.pendingCount()).toBe(1);
        rejectAppCheck = false;
        loseResponse = true;
        await expectAsync(app.sync.flush()).toBeRejectedWithError(/lost ACK/);
        expect(app.sync.pendingCount()).toBe(1);
        await app.diary.update(session.id, { notes: 'Segunda edición local de prueba' });
        await app.sync.flush();
        expect(app.sync.pendingCount()).toBe(0);
        expect(await app.sync.verifyRemoteSessionIds()).toEqual({ sessionIds: [session.id], count: 1 });
        TestBed.resetTestingModule();
        app = boot();
        await app.identity.restoreSession();
        await app.sync.refreshCount();
        expect(app.sync.pendingCount()).toBe(0);
        expect(app.sync.pendingCountKnown()).toBeTrue();
      } finally { app.identity.logout(); }
    }, 30_000);
  });
}
