import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { LocalIdentityService } from './local-identity.service';
import { StudentSettingsService } from './student-settings.service';
import { SyncService } from './sync.service';
import { TranslationService } from './translation.service';

describe('SyncService account switches', () => {
  it('blocks a private translation when Firebase restores a different student’s credential', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const identity = TestBed.inject(LocalIdentityService);
    const translator = TestBed.inject(TranslationService);
    const getIdToken = jasmine.createSpy('getIdToken');
    try {
      await identity.register(crypto.randomUUID().slice(0, 12), 'synthetic-test-password');
      await identity.linkServerAccount(crypto.randomUUID());
      await TestBed.inject(StudentSettingsService).setAllowCloudEnrichment(true);
      Object.assign(translator, { auth: { authStateReady: async () => {},
        currentUser: { uid: crypto.randomUUID(), isAnonymous: false, emailVerified: true, getIdToken } } });
      await expectAsync(translator.translateDerivedText('test', 'Una frase sintética de prueba.', 'es', 'qu', true))
        .toBeRejectedWithError(/identidad escolar individual/);
      expect(getIdToken).not.toHaveBeenCalled();
      TestBed.inject(HttpTestingController).verify();
    } finally { identity.logout(); }
  });

  it('rejects diary reads and sync when the Firebase identity differs from the encrypted binding', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const identity = TestBed.inject(LocalIdentityService);
    const sync = TestBed.inject(SyncService);
    const http = TestBed.inject(HttpTestingController);
    const name = crypto.randomUUID().slice(0, 12);
    try {
      await identity.register(name, 'synthetic-test-password');
      await identity.linkServerAccount('test-uid-a-' + name);
      // Simulate a completed popup for B while the notebook is still linked to A.
      const userB = { uid: 'test-uid-b-' + name, emailVerified: true, isAnonymous: false };
      Object.assign(sync, { auth: { currentUser: userB } });
      sync.setSyncConsent(true);
      await sync.refreshCount();
      expect(sync.serverIdentityLinked()).toBeFalse();
      // Even a stale UI flag must be insufficient to send a request.
      sync.serverIdentityLinked.set(true);
      await expectAsync(sync.verifyRemoteSessionIds()).toBeRejectedWithError(/no corresponde/);
      await expectAsync(sync.flush()).toBeRejectedWithError(/Vincula una identidad/);
      http.verify();
    } finally { identity.logout(); }
  });

  it('restores tab consent and the matching school credential, then isolates the next login', async () => {
    function boot() {
      TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
      return { identity: TestBed.inject(LocalIdentityService), sync: TestBed.inject(SyncService) };
    }
    const name = crypto.randomUUID().slice(0, 12);
    const password = 'synthetic-test-password';
    const firstUser = { uid: crypto.randomUUID(), isAnonymous: false, emailVerified: true };
    const secondUser = { ...firstUser, uid: crypto.randomUUID() };
    let { identity, sync } = boot();
    try {
      await identity.register(name + 'a', password);
      await identity.linkServerAccount(firstUser.uid);
      sync.setSyncConsent(true);
      await identity.save('outbox', 'shared-id', { id: 'shared-id', answer: 'profile A' });

      // A page reload reconstructs both services without ending the unlocked tab.
      TestBed.resetTestingModule();
      ({ identity, sync } = boot());
      expect(sync.getSyncConsent()).toBeFalse();
      await identity.restoreSession();
      const auth = { currentUser: firstUser as typeof firstUser | null, signOut: async () => { auth.currentUser = null; } };
      Object.assign(sync, { auth });
      await sync.refreshCount();
      expect(sync.getSyncConsent()).toBeTrue();
      expect(sync.serverIdentityLinked()).toBeTrue();
      expect(sync.pendingCount()).toBe(1);
      auth.currentUser = null;
      await sync.refreshCount();
      expect(sync.serverIdentityLinked()).toBeFalse();
      expect(sync.pendingCount()).toBe(1);
      auth.currentUser = secondUser;
      await sync.refreshCount();
      expect(sync.serverIdentityLinked()).toBeFalse();
      auth.currentUser = firstUser;
      await sync.refreshCount();
      expect(sync.serverIdentityLinked()).toBeTrue();

      sync.clear();
      identity.logout();
      await identity.register(name + 'b', password);
      await identity.linkServerAccount(secondUser.uid);
      auth.currentUser = secondUser;
      await sync.refreshCount();
      expect(sync.getSyncConsent()).toBeFalse();
      expect(sync.serverIdentityLinked()).toBeTrue();
      expect(sync.pendingCount()).toBe(0);
      expect(await identity.read('outbox', 'shared-id')).toBeUndefined();

      identity.logout();
      await identity.login(name + 'a', password);
      await sync.refreshCount();
      expect(sync.getSyncConsent()).toBeFalse();
      expect(sync.serverIdentityLinked()).toBeFalse();
      expect(sync.pendingCount()).toBe(1);
      TestBed.inject(HttpTestingController).verify();
    } finally { identity.logout(); }
  });

  it('discards the previous student’s outbox count when switching accounts during a read', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const identity = TestBed.inject(LocalIdentityService);
    const sync = TestBed.inject(SyncService);
    const prefix = crypto.randomUUID().slice(0, 12);
    const password = 'synthetic-test-password';
    let finish!: () => void;
    const pause = new Promise<void>(resolve => finish = resolve);
    try {
      sync.setSyncConsent(true);
      await identity.register(prefix + 'a', password);
      await identity.save('outbox', 'event-a', { id: 'event-a' });
      const eventsA = await identity.list('outbox');
      const ownerA = identity.student();
      spyOn(identity, 'list').and.callFake(async <T>() => {
        if (identity.student() !== ownerA) return [];
        await pause;
        return eventsA as T[];
      });
      const pendingRead = sync.refreshCount();
      sync.clear();
      identity.logout();
      await identity.register(prefix + 'b', password);
      sync.setSyncConsent(true);
      await sync.refreshCount();
      finish();
      await pendingRead;
      expect(sync.pendingCount()).toBe(0);
      expect(sync.serverIdentityLinked()).toBeFalse();
    } finally {
      finish();
      sync.clear();
      identity.logout();
    }
  });
});
