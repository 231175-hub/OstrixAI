import { LocalIdentityService } from './local-identity.service';

describe('Local school identity binding in IndexedDB', () => {
  it('permits repeat confirmation for the same owner and rejects both kinds of cross-account link', async () => {
    const identity = new LocalIdentityService();
    const prefix = crypto.randomUUID().slice(0, 12);
    const password = 'synthetic-test-password';
    const uid = crypto.randomUUID();
    try {
      await identity.register(prefix + 'a', password);
      await identity.linkServerAccount(uid);
      await identity.linkServerAccount(uid);
      await expectAsync(identity.linkServerAccount(crypto.randomUUID())).toBeRejected();
      identity.logout();
      await identity.register(prefix + 'b', password);
      await expectAsync(identity.linkServerAccount(uid)).toBeRejected();
      expect(await identity.read('settings','server_identity')).toBeUndefined();
    } finally { identity.logout(); }
  });

  it('retains the first successful edit when two writes expect the same IndexedDB revision', async () => {
    const identity = new LocalIdentityService();
    try {
      await identity.register(crypto.randomUUID().slice(0, 12), 'synthetic-test-password');
      await identity.save('diary', 'synthetic', {text:'original'});
      const first = await identity.readVersion<{text:string}>('diary','synthetic');
      await identity.save('diary','synthetic',{text:'first edit'},first!.nonce);
      await expectAsync(identity.save('diary','synthetic',{text:'stale edit'},first!.nonce)).toBeRejected();
      expect((await identity.read<{text:string}>('diary','synthetic'))?.text).toBe('first edit');
    } finally { identity.logout(); }
  });

  it('keeps matching diary IDs and drafts separate through account switches and reloads', async () => {
    const identity = new LocalIdentityService();
    const names = ['a', 'b'].map(suffix => crypto.randomUUID().slice(0, 12) + suffix);
    const password = 'synthetic-test-password';
    try {
      for (const name of names) {
        await identity.register(name, password);
        await identity.linkServerAccount('test-uid-' + name);
        expect(await identity.list('diary')).toEqual([]);
        expect(await identity.read('drafts', 'current')).toBeUndefined();
        await identity.save('diary', 'shared-session-id', { note: name });
        await identity.save('drafts', 'current', { note: name });
        identity.logout();
      }
      for (const name of names) {
        await identity.login(name, password);
        const reloaded = new LocalIdentityService();
        expect((await reloaded.restoreSession())?.username).toBe(name);
        expect(await reloaded.list('diary')).toEqual([{ note: name }]);
        expect(await reloaded.read('drafts', 'current')).toEqual({ note: name });
        expect((await reloaded.read<{firebaseUid: string}>('settings', 'server_identity'))?.firebaseUid)
          .toBe('test-uid-' + name);
        identity.logout();
      }
    } finally { identity.logout(); }
  });

  it('keeps the diary locked when logout interrupts restoration', async () => {
    const identity = new LocalIdentityService();
    await identity.register(crypto.randomUUID().slice(0, 12), 'synthetic-test-password');
    const reloaded = new LocalIdentityService();
    let finish!: () => void;
    const pause = new Promise<void>(resolve => finish = resolve);
    let started!: () => void;
    const decrypting = new Promise<void>(resolve => started = resolve);
    const decrypt = crypto.subtle.decrypt.bind(crypto.subtle);
    spyOn(crypto.subtle, 'decrypt').and.callFake(async (...args) => {
      started();
      await pause;
      return decrypt(...args);
    });
    try {
      const restoring = reloaded.restoreSession();
      await decrypting;
      reloaded.logout();
      finish();
      expect(await restoring).toBeNull();
      expect(reloaded.student()).toBeNull();
      await expectAsync(reloaded.list('diary')).toBeRejected();
    } finally { finish(); identity.logout(); }
  });

  it('cancels an unfinished login when the local session is locked', async () => {
    const identity = new LocalIdentityService();
    const username = crypto.randomUUID().slice(0, 12);
    const password = 'synthetic-test-password';
    await identity.register(username, password);
    identity.logout();
    try {
      const login = identity.login(username, password);
      identity.logout();
      await expectAsync(login).toBeRejected();
      expect(identity.student()).toBeNull();
      expect(await new LocalIdentityService().restoreSession()).toBeNull();
    } finally { identity.logout(); }
  });

  it('locks copies of a revoked tab session and leaves an independent student signed in', async () => {
    const identity = new LocalIdentityService();
    const prefix = crypto.randomUUID().slice(0, 12);
    const password = 'synthetic-test-password';
    const otherWindow = document.createElement('iframe');
    document.body.appendChild(otherWindow);
    const onLock = jasmine.createSpy('lock the diary');
    const stop = identity.watchSessionRevocation(onLock);
    const sendRevocation = async (id: string): Promise<void> => {
      const delivered = new Promise<void>(resolve => {
        const received = (event: StorageEvent): void => {
          if (event.key === 'ostrixai-session-closed' && event.newValue === id) {
            window.removeEventListener('storage', received);
            resolve();
          }
        };
        window.addEventListener('storage', received);
      });
      otherWindow.contentWindow!.localStorage.setItem('ostrixai-session-closed', id);
      await delivered;
    };
    try {
      await identity.register(prefix + 'a', password);
      const idA = JSON.parse(sessionStorage.getItem('ostrixai-unlock')!).id;
      identity.logout();
      expect(localStorage.getItem('ostrixai-session-closed')).toBe(idA);
      await identity.register(prefix + 'b', password);
      const idB = JSON.parse(sessionStorage.getItem('ostrixai-unlock')!).id;
      await identity.save('diary', 'shared-id', { note: 'B' });
      // Re-deliver A's event after B has unlocked this tab.
      localStorage.removeItem('ostrixai-session-closed');
      await sendRevocation(idA);
      expect(onLock).not.toHaveBeenCalled();
      expect(await identity.read('diary', 'shared-id')).toEqual({ note: 'B' });
      await sendRevocation(idB);
      expect(onLock).toHaveBeenCalledTimes(1);
      expect(identity.student()).toBeNull();
      await expectAsync(identity.read('diary', 'shared-id')).toBeRejected();
      expect(await new LocalIdentityService().restoreSession()).toBeNull();
    } finally {
      stop();
      identity.logout();
      otherWindow.remove();
    }
  });
});
