import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { DeviceCapabilitiesService } from './core/device-capabilities.service';
import { OstrixAiService } from './core/ostrix-ai.service';

describe('Doubt status in the offline diary', () => {
  it('persists mastery after reopening and leaves the stored status visible when a write fails', async () => {
    TestBed.configureTestingModule({providers: [
      provideHttpClient(), provideHttpClientTesting(),
      { provide: DeviceCapabilitiesService, useValue: {} },
      { provide: OstrixAiService, useValue: {} },
    ]});
    const app = TestBed.runInInjectionContext(() => new App());
    spyOn(app, 'showToast');
    try {
      await app.identity.register('qa-' + crypto.randomUUID().slice(0, 8), 'synthetic-test-password');
      const session = await app.diary.create('2026-11-20', 'Ciencias');
      const text = '¿Qué refleja la luz?';
      await app.diary.addConcept(session.id, 'doubts', text);
      await app.memory.registerDoubt(session.id, session.course, session.topic, text);
      await app.masterDoubt(app.allDoubts()[0]);
      app.memory.clear();
      await app.memory.load();
      expect(app.allDoubts()[0].st).toBe(3);
      spyOn(app.identity, 'save').and.rejectWith(new Error('Storage unavailable'));
      await app.advanceDoubtStatus(app.allDoubts()[0]);
      expect(app.allDoubts()[0].st).toBe(3);
      expect(app.showToast).toHaveBeenCalledWith(app.t('statusSaveErrorRetry'));
    } finally {
      app.identity.logout();
    }
  });
});
