import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { InferenceMode, InferenceSource, type GenerativeModel } from 'firebase/ai';
import { DeviceCapabilitiesService } from './device-capabilities.service';
import { LocalIdentityService } from './local-identity.service';
import { OstrixAiService, classifyAiError } from './ostrix-ai.service';
import { StudentSettingsService } from './student-settings.service';
import { SyncService } from './sync.service';

// Deterministic orchestration tests. The scripted SDK stream is a fault injector,
// not an attestation of a physical model or a live Firebase project.
describe('OstrixAiService routing and request lifetime', () => {
  const owner = signal<{ id: string } | null>(null);
  const online = signal(true);
  const profile = signal({ offlineOnly: false, allowCloudEnrichment: false });
  const persist = jasmine.createSpy('enqueueInteraction');
  const calls: { mode: InferenceMode; name: string; signal: AbortSignal }[] = [];
  let ai: OstrixAiService;
  let configured = true;
  const sdkResponse = (source: InferenceSource | undefined) =>
    ({ inferenceSource: source, text: () => 'cuatro' });
  const streamed = (source: InferenceSource | undefined, finalSource = source) => ({
    stream: (async function* () { yield sdkResponse(source); })(),
    response: Promise.resolve(sdkResponse(finalSource)),
  });
  type Script = (mode: InferenceMode) => Promise<ReturnType<typeof streamed>>;
  let next: Script;
  const pending = () => new Promise<never>(() => {});
  const noSave = { saveInOutbox: false, allowEssentialFallback: false };

  beforeEach(() => {
    calls.length = 0;
    configured = true;
    owner.set({ id: 'audit-student' });
    online.set(true);
    profile.set({ offlineOnly: false, allowCloudEnrichment: false });
    persist.calls.reset();
    TestBed.configureTestingModule({ providers: [
      { provide: DeviceCapabilitiesService, useValue: { online, setEngineBusy() {}, setEngineReady() {} } },
      { provide: LocalIdentityService, useValue: { student: owner } },
      { provide: StudentSettingsService, useValue: { profile } },
      { provide: SyncService, useValue: { enqueueInteraction: persist } },
    ] });
    ai = TestBed.inject(OstrixAiService);
    next = async mode => streamed(mode === InferenceMode.ONLY_IN_CLOUD
      ? InferenceSource.IN_CLOUD : InferenceSource.ON_DEVICE);
    const boundary = ai as unknown as {
      modelForRequest(mode: InferenceMode, name: string, signal: AbortSignal): GenerativeModel;
      cloudConfigured(): boolean;
    };
    spyOn(boundary, 'cloudConfigured').and.callFake(() => configured);
    spyOn(boundary, 'modelForRequest').and.callFake((mode, name, signal) => {
      calls.push({ mode, name, signal });
      return { generateContentStream: () => next(mode) } as unknown as GenerativeModel;
    });
  });

  for (const connected of [true, false]) {
    it('uses only the device without consent, online=' + connected, async () => {
      online.set(connected);
      for (const complex of [true, false]) {
        const result = await ai.processPromptDetailed('2 + 2', complex, noSave);
        expect(result.source).toBe('ON_DEVICE');
        expect(result.limited).toBe(complex);
      }
      expect(calls.map(c => c.mode)).toEqual([InferenceMode.ONLY_ON_DEVICE, InferenceMode.ONLY_ON_DEVICE]);
    });
  }

  it('uses device preference only with permission and accepts either reported source', async () => {
    for (const source of [InferenceSource.ON_DEVICE, InferenceSource.IN_CLOUD]) {
      next = async () => streamed(source);
      const result = await ai.processPromptDetailed('2 + 2', false, { ...noSave, cloudConsent: true });
      expect(calls.at(-1)?.mode).toBe(InferenceMode.PREFER_ON_DEVICE);
      expect(result.source).toBe(source === InferenceSource.ON_DEVICE ? 'ON_DEVICE' : 'IN_CLOUD');
    }
  });

  it('keeps an unconfigured deployment local even when an individual explicitly allows Cloud', async () => {
    configured = false;
    const options = { ...noSave, cloudConsent: true };
    await expectAsync(ai.generateCloudOnly('x', true, options)).toBeRejectedWithError(/App Check/);
    expect((await ai.processPromptDetailed('x', true, options)).source).toBe('ON_DEVICE');
    expect(calls.map(call => call.mode)).toEqual([InferenceMode.ONLY_ON_DEVICE]);
  });

  it('requires consent for each request, a current student and a network for strict Cloud', async () => {
    const ask = () => ai.generateCloudOnly('x', true, { ...noSave, cloudConsent: 'profile' });
    await expectAsync(ask()).toBeRejected();
    profile.set({ allowCloudEnrichment: true, offlineOnly: false });
    expect((await ask()).source).toBe('IN_CLOUD');
    await expectAsync(ai.generateCloudOnly('x', true, noSave)).toBeRejected();
    online.set(false);
    await expectAsync(ask()).toBeRejected();
    online.set(true);
    profile.set({ allowCloudEnrichment: true, offlineOnly: true });
    await expectAsync(ask()).toBeRejected();
    owner.set(null);
    await expectAsync(ai.generateCloudOnly('x', true, { ...noSave, cloudConsent: true })).toBeRejected();
    expect(calls.map(c => c.mode)).toEqual([InferenceMode.ONLY_IN_CLOUD]);
  });

  it('rejects omitted, inconsistent and wrong inferenceSource without retry or persistence', async () => {
    for (const [chunk, final] of [
      [undefined, undefined], [InferenceSource.IN_CLOUD, InferenceSource.IN_CLOUD],
      [InferenceSource.ON_DEVICE, InferenceSource.IN_CLOUD],
    ]) {
      next = async () => streamed(chunk, final);
      await expectAsync(ai.generateStrictLocal('x', false)).toBeRejectedWithError(/inferenceSource/);
      expect(ai.streamingText()).toBe('');
    }
    expect(calls.length).toBe(3);
    expect(persist).not.toHaveBeenCalled();
  });

  it('retries a confirmed HTTP 500 once with backoff, then recovers', async () => {
    const started = performance.now();
    next = async () => {
      if (calls.length === 1) throw Object.assign(new Error('JSON from gateway'), { customErrorData: { status: 500 } });
      return streamed(InferenceSource.IN_CLOUD);
    };
    const result = await ai.processPromptDetailed('compara', true, { ...noSave, cloudConsent: true });
    expect(result.retries).toBe(1);
    expect(performance.now() - started).toBeGreaterThanOrEqual(1100);
    expect(calls.length).toBe(2);
  });

  it('tries the alternate model once on HTTP 404 and never retries security or quota errors', async () => {
    for (const status of [404, 403, 429]) {
      calls.length = 0;
      next = async () => { throw Object.assign(new Error('JSON'), { customErrorData: { status } }); };
      await expectAsync(ai.generateCloudOnly('x', false, { ...noSave, cloudConsent: true })).toBeRejected();
      expect(calls.length).toBe(status === 404 ? 2 : 1);
      if (status === 404) expect(calls[0].name).not.toBe(calls[1].name);
    }
  });

  it('times out a stalled stream and suppresses replay of partial output', async () => {
    next = async () => ({
      stream: (async function* () { yield sdkResponse(InferenceSource.IN_CLOUD); await pending(); })(),
      response: pending(),
    });
    await expectAsync(ai.generateCloudOnly('x', true, { ...noSave, cloudConsent: true, timeoutMs: 30 }))
      .toBeRejectedWithError(/tiempo límite/);
    expect(calls.length).toBe(1);
    expect(calls[0].signal.aborted).toBeTrue();
    expect(ai.streamingText()).toBe('');
  });

  it('aborts on logout, rejects concurrent work, and allows a fresh request', async () => {
    next = pending;
    const old = ai.processPromptDetailed('first', true, { cloudConsent: true });
    await expectAsync(ai.processPromptDetailed('duplicate', false)).toBeRejectedWithError(/en curso/);
    ai.resetLocalSession();
    owner.set({ id: 'other-student' });
    next = async () => streamed(InferenceSource.ON_DEVICE);
    const fresh = ai.generateStrictLocal('second', false, noSave);
    await expectAsync(old).toBeRejected();
    expect((await fresh).source).toBe('ON_DEVICE');
    expect(ai.lastError()).toBeNull();
    expect(calls.length).toBe(2);
    expect(calls[0].signal.aborted).toBeTrue();
    expect(persist).not.toHaveBeenCalled();
  });

  it('does not dispatch a retry after permission has been revoked during backoff', async () => {
    next = async () => { throw Object.assign(new Error('busy'), { customErrorData: { status: 503 } }); };
    const work = ai.processPromptDetailed('x', true, { ...noSave, cloudConsent: true });
    await new Promise(resolve => setTimeout(resolve, 25));
    ai.revokeCloudConsent();
    await expectAsync(work).toBeRejected();
    expect(calls.length).toBe(1);
  });

  it('marks the deterministic fallback and records the total time including the failed model', async () => {
    next = async () => { throw new Error('on-device model is not available'); };
    const result = await ai.processPromptDetailed('La célula es la unidad básica.', false);
    expect(result.source).toBe('OFFLINE_ESSENTIAL');
    expect(result.modelUsed).toBe('offline-essential-deterministic');
    expect(result.telemetry?.totalLatencyMs).toBe(result.latencyMs);
    expect(ai.lastResult()).toBe(result);
    expect(persist).not.toHaveBeenCalled();
  });

  it('prefers SDK status and distinguishes a timeout from a user abort and token errors', () => {
    expect(classifyAiError({ message: 'JSON token limit exceeded', customErrorData: { status: 403 } }).category)
      .toBe('APP_CHECK_OR_FORBIDDEN');
    expect(classifyAiError(new DOMException('aborted due to timeout', 'AbortError')).category).toBe('TIMEOUT');
    expect(classifyAiError(new DOMException('cancelled', 'AbortError')).category).toBe('ABORTED');
    expect(classifyAiError(new Error('token array not valid')).category).toBe('UNKNOWN');
  });
});

describe('account ownership of inference preferences', () => {
  it('discards an old read and immediately hides settings when the student changes', async () => {
    const owner = signal({ id: 'student-a' });
    let resolve!: (value: object) => void;
    const read = jasmine.createSpy('read').and.callFake(() => new Promise(r => { resolve = r; }));
    TestBed.configureTestingModule({ providers: [
      { provide: LocalIdentityService, useValue: { student: owner, read } },
    ] });
    const settings = TestBed.inject(StudentSettingsService);
    const stale = settings.load();
    owner.set({ id: 'student-b' });
    resolve({ allowCloudEnrichment: true });
    await stale;
    expect(settings.profile().allowCloudEnrichment).toBeFalse();
    const malformed = settings.load();
    resolve({ allowCloudEnrichment: 'false' });
    await malformed;
    expect(settings.profile().allowCloudEnrichment).toBeFalse();
    const current = settings.load();
    resolve({ allowCloudEnrichment: true });
    await current;
    expect(settings.profile().allowCloudEnrichment).toBeTrue();
    owner.set({ id: 'student-c' });
    expect(settings.profile().allowCloudEnrichment).toBeFalse();
  });
});
