import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { browserSessionPersistence, initializeAuth } from 'firebase/auth';
import {
  AppCheck, CustomProvider, initializeAppCheck, ReCaptchaEnterpriseProvider,
} from 'firebase/app-check';
import { environment } from './environment';
import { configureAppCheckDebug } from './app-check-debug';

export function isFirebaseConfigured(): boolean {
  return (
    Boolean(environment.firebase.apiKey) &&
    !environment.firebase.apiKey.startsWith('REPLACE_WITH_') &&
    Boolean(environment.firebase.projectId) &&
    !environment.firebase.projectId.startsWith('REPLACE_WITH_')
  );
}

export function isAppCheckConfigured(): boolean {
  return (
    isFirebaseConfigured() &&
    Boolean(environment.recaptchaEnterpriseSiteKey) &&
    !environment.recaptchaEnterpriseSiteKey.startsWith('REPLACE_WITH_')
  );
}

// Select the loopback-only development provider before creating any Firebase client.
const developmentProvider = configureAppCheckDebug(environment.firebase);

/** One shared Firebase runtime; App Check must be initialized before requesting cloud AI. */
export const firebaseApp: FirebaseApp = getApps().length > 0
  ? getApp()
  : initializeApp(environment.firebase);

let appCheckInstance: AppCheck | null = null;
if (typeof window !== 'undefined' && isAppCheckConfigured()) {
  try {
    appCheckInstance = initializeAppCheck(firebaseApp, {
      provider: developmentProvider ? new CustomProvider(developmentProvider) :
        new ReCaptchaEnterpriseProvider(environment.recaptchaEnterpriseSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch {
    console.warn('App Check initialization failed.');
  }
}

export const firebaseAppCheck: AppCheck | null = appCheckInstance;

// All Firebase consumers use this tab's credential. Supply the popup resolver only on the link button.
export const firebaseAuth = initializeAuth(firebaseApp, { persistence: browserSessionPersistence });
