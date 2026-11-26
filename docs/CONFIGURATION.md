# Firebase and API deployment

## Public release

From `frontend/ostrixai-web`, run `npm ci` and `npm run build`. The default production build uses the placeholders in `src/app/core/web-config.ts` and disables App Check debug mode. Its offline journal works without a Firebase project. Serve `dist/ostrixai-web/browser` over HTTPS, or use loopback for a local evaluation. Point the reverse proxy's `/api/v1/` routes at the Flask API. In production Angular sends these calls to the frontend origin. During local development `npm start` uses Flask on port 5000.

## Configured evaluation build

1. Use a dedicated Firebase web app approved for the evaluation. Copy `src/app/core/web-config.ts` to `src/app/core/web-config.local.ts` and fill the Firebase web identifiers and reCAPTCHA Enterprise site key in that local file. Existing checkouts may already have this file. Git ignores it.
2. Configure Firebase AI Logic, App Check, the allowed evaluation origin, and the APIs needed by the web key in that project. Enable the individual Firebase sign-in provider used for school sync. Configure the backend identity with App Check validation and permission to check revoked Firebase Auth tokens. Validate the deployed behavior with an evaluation account.
3. Run the following PowerShell commands from the frontend. The first produces a separate artifact. The environment variable selects that artifact for the inference harness. The harness uses a synthetic student in a temporary profile. See the jury demo guide for the Chrome component and hardware prerequisites.

```powershell
npx ng build --configuration production,demo --output-path dist/ostrixai-configured
$env:OSTRIX_BUILD_DIR='dist/ostrixai-configured/browser'
node scripts/test-live-inference.mjs
```

A configured web bundle necessarily exposes its Firebase client identifiers to its users. Restrict the key to the dedicated project, permitted APIs and evaluation origins. Keep privileged API keys, debug tokens, Admin service-account JSON and student data outside the release and Git history. The default production bundle can be checked with `node scripts/test-public-config.mjs`. Clear `OSTRIX_BUILD_DIR` or point it to the public bundle before running that check. [Firebase guidance on web API keys](https://firebase.google.com/docs/projects/api-keys).

The legacy repository history contains a Google web key. Use an owner-reviewed clean export or separately authorized history cleanup before making a repository public. Revoke the previously exposed App Check debug token in Firebase Console and confirm the original token is rejected. [App Check debug-provider management](https://firebase.google.com/docs/app-check/web/debug-provider).

## App Check para una demostración local

1. Abre la compilación de desarrollo con `npm start` en localhost. En **Application → Session Storage** de DevTools, crea `ostrix-appcheck-debug-opt-in` con valor `true` en esa pestaña. Para la clave `ostrix-appcheck-debug-token`, usa un secreto nuevo y exclusivo de la evaluación, registrado por el propietario en **Firebase Console → App Check → aplicación web → Manage debug tokens**. Introduce su valor directamente en Session Storage, con la grabación de pantalla y la captura de red detenidas.
2. Recarga la misma pestaña. Antes de crear el cliente Firebase, Ostrix selecciona el proveedor local según el origen y ambas entradas. Firebase debe aceptar el intercambio del secreto y emitir una atestación vigente. Las entradas de Session Storage por sí solas sólo acreditan configuración local. Flask sigue verificando la atestación y el token de la cuenta Google en cada petición privada. [Intercambio de tokens de depuración](https://firebase.google.com/docs/reference/appcheck/rest/v1/projects.apps/exchangeDebugToken).
3. Con un cuaderno de evaluación vinculado y un cambio pendiente, autoriza la sincronización y pulsa **Sincronizar**. Verifica el estado HTTP de `POST /api/v1/diary/sync` y que se confirmó la revisión correspondiente. Registra sólo el estado HTTP y el resultado de comparación. Un error exige revisar el registro del token para esa aplicación y las verificaciones de Flask. Evita capturar cuerpos, cabeceras o notas durante la demostración.
4. Al terminar, revoca el token desde la misma consola de Firebase. Retira únicamente las dos entradas de depuración de esa pestaña y recarga. Las compilaciones de producción y demo usan reCAPTCHA Enterprise.

La cuenta Google usa persistencia de Firebase por pestaña. Con el mismo desbloqueo local, recargar conserva el consentimiento para sincronizar y vuelve a comprobar la cuenta verificada frente a la vinculación cifrada. Cerrar la sesión local revoca ese consentimiento, cierra la sesión Firebase y exige autorizar de nuevo desde un nuevo desbloqueo. Un perfil con una vinculación anterior puede necesitar seleccionar Google una vez después de actualizar: la versión anterior guardaba la credencial sólo en memoria. [Persistencia de Firebase Auth](https://firebase.google.com/docs/auth/web/auth-state-persistence).

## Flask and MySQL

Provide the variables in `backend/.env.example` through your deployment's secret manager or an ignored local environment file. A new MySQL database uses `backend/database/schema.sql`. Existing databases with migrations 001 and 002 apply `003_owner_scoped_diary.sql` once before running this backend. The new migration adds user-scoped keys and revision metadata. Back up through the owner's normal operational procedure before migrating any real data.

For the optional local Compose stack set both MySQL passwords in the local environment to values chosen by its owner. Existing volumes require the credentials originally assigned when initialized. Local Compose reads the selected file with this command from the repository root.

```powershell
docker compose --env-file backend/.env -f compose.local.yaml up -d
```

Configure Application Default Credentials for Firebase Admin in the backend process. In Compose, the read-only mount expects the owner's credential at `backend/.credentials/firebase-admin.json`. Protect the file with local access controls. Production can use a workload identity. Configure `CORS_ORIGINS` with the exact frontend origins and use verified MySQL TLS or a protected private database network. The application verifies both Auth and App Check and rejects anonymous accounts for private synchronization. [Firebase token revocation](https://firebase.google.com/docs/auth/admin/manage-sessions). [App Check verification](https://firebase.google.com/docs/app-check/custom-resource-backend).
