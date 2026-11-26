import type { FirebaseOptions } from 'firebase/app';
import type { CustomProviderOptions } from 'firebase/app-check';

/** Development only. Exchange a registered secret without the SDK's debug-token console output. */
export function configureAppCheckDebug(options: FirebaseOptions): CustomProviderOptions | undefined {
  if (typeof window === 'undefined' || !['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) return;
  if (sessionStorage.getItem('ostrix-appcheck-debug-opt-in') !== 'true') return;
  const debugToken = sessionStorage.getItem('ostrix-appcheck-debug-token')?.trim();
  if (!debugToken || !options.projectId || !options.appId || !options.apiKey) return;
  const project = encodeURIComponent(options.projectId);
  const app = encodeURIComponent(options.appId);
  const apiKey = options.apiKey;
  return {
    getToken: async () => {
      const response = await fetch(`https://firebaseappcheck.googleapis.com/v1/projects/${project}/apps/${app}:exchangeDebugToken`, {
        method: 'POST', credentials: 'omit', redirect: 'error',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
        body: JSON.stringify({ debugToken }),
      });
      if (!response.ok) throw new Error(`Firebase rechazó la atestación local (HTTP ${response.status}).`);
      const { token, ttl } = await response.json();
      const seconds = typeof ttl === 'string' && /^\d+(\.\d+)?s$/.test(ttl) ? Number(ttl.slice(0, -1)) : 0;
      if (typeof token !== 'string' || !token || !Number.isFinite(seconds) || seconds <= 0) {
        throw new Error('La atestación recibida no es válida.');
      }
      return { token, expireTimeMillis: Date.now() + seconds * 1000 };
    },
  };
}
