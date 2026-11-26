import { configureAppCheckDebug } from './app-check-debug';
import { configureAppCheckDebug as production } from './app-check-debug.prod';

describe('Loopback App Check configuration', () => {
  const config = { projectId: 'test-project', appId: 'test-app', apiKey: 'synthetic-web-key' };
  const optIn = 'ostrix-appcheck-debug-opt-in';
  const secret = 'ostrix-appcheck-debug-token';
  // Karma runs on loopback in an isolated browser profile.
  afterEach(() => { sessionStorage.removeItem(optIn); sessionStorage.removeItem(secret); });

  it('requires both opt-in and a token and excludes the provider from production', () => {
    expect(configureAppCheckDebug(config)).toBeUndefined();
    sessionStorage.setItem(optIn, 'true');
    expect(configureAppCheckDebug(config)).toBeUndefined();
    sessionStorage.setItem(secret, crypto.randomUUID());
    expect(configureAppCheckDebug(config)).toBeDefined();
    expect(production(config)).toBeUndefined();
  });

  it('only returns the attestation and expiry issued by Firebase', async () => {
    const fetch = spyOn(window, 'fetch');
    sessionStorage.setItem(optIn, 'true');
    sessionStorage.setItem(secret, crypto.randomUUID());
    const provider = configureAppCheckDebug(config)!;
    expect(fetch).not.toHaveBeenCalled();
    fetch.and.resolveTo(new Response(null, { status: 403 }));
    await expectAsync(provider.getToken()).toBeRejectedWithError(/HTTP 403/);
    expect(fetch.calls.mostRecent().args[0]).toBe(
      'https://firebaseappcheck.googleapis.com/v1/projects/test-project/apps/test-app:exchangeDebugToken');
    fetch.and.resolveTo(Response.json({ token: 'synthetic-attestation', ttl: 'invalid' }));
    await expectAsync(provider.getToken()).toBeRejectedWithError(/válida/);
    const now = Date.now();
    fetch.and.resolveTo(Response.json({ token: 'synthetic-attestation', ttl: '3600.5s' }));
    const result = await provider.getToken();
    expect(result.token).toBe('synthetic-attestation');
    expect(result.expireTimeMillis).toBeGreaterThanOrEqual(now + 3600500);
  });
});
