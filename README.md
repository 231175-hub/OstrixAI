# OstrixAI

OstrixAI is an offline-first journal, tutor and study planner for secondary-school students sharing computers in rural Peru. A student can record a question in class, practice without internet, see how an answer was graded, and return for the next review. The project targets the Web/Chrome track of #BuildHybridAI 2026.

## Try one lesson

1. Create a local account and choose English or Spanish. The account unlocks an encrypted notebook on this computer.
2. Load a labelled sample or create a class and save your own notes, doubts and discoveries. A provisional draft can be recovered after an interrupted edit.
3. Attach the class to Ostrix Tutor. Choose Explain, Guide, Practice or Explore. When model generation fails, the explicit Essential guide can quote relevant notes.
4. Answer a matching curriculum exercise or a generated quiz. The answer key determines the grade. The answer and review date persist across restarts.
5. Sign out before handing the computer to the next student. School sync requires consent and an individual Firebase identity.

Spanish and English interface text is available. Sample curriculum, practice text and some controls are in Spanish. Quechua Chanka glossary entries work offline. Spanish-to-Quechua machine translations require authorization and linguistic review.

## Architecture

| Layer | Responsibility |
|---|---|
| Angular 20, PrimeNG, PWA | Diary, tutor, study views and practice. The service worker caches the production shell and local assets after the first visit. |
| IndexedDB and Web Crypto | Per-account salts, PBKDF2-SHA256 and AES-GCM protect notebook records. Authenticated data binds records to their account, category and ID. A tab can recover its active session on reload. A fresh browser session requires the password. |
| Firebase AI Logic | A private or offline request selects ONLY_ON_DEVICE. With consent, a simple request can prefer the device, and a complex task can select Cloud. The service checks inferenceSource. Deterministic material carries its own label. |
| Flask, Firebase Auth and App Check | Versioned routes verify identity and attestation, validate payloads and bound batch sizes. Production API calls use the same origin as the PWA. |
| MySQL | Owner-scoped writes, transactions, stable event IDs and revision checks protect concurrent updates and retries. |

[Architecture](docs/ARQUITECTURA.md) · [Configuration and deployment](docs/CONFIGURATION.md).

## Run locally

The audit used Node 24 and desktop Chrome 158 on Windows. From the repository root:

~~~sh
cd frontend/ostrixai-web
npm ci
npm run build
python -m http.server 4200 --bind 127.0.0.1 --directory dist/ostrixai-web/browser
~~~

Open **http://127.0.0.1:4200**, select English and create a disposable local account. Open the production build online once before testing offline. Use `npm start` for development.

The default production build runs the offline journal with placeholder configuration. For a generative evaluation, configure a dedicated Firebase demo project and reCAPTCHA Enterprise, then run `npm run build -- --configuration production,demo`. Preinstall the local model on a compatible Chrome desktop. The component inspected in this audit reports v3Nano. Nano 4 verification remains outstanding. [Deployment guide](docs/CONFIGURATION.md) · [Firebase hybrid setup](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started).

For the optional school API, set the backend environment and MySQL passwords. Run `docker compose --env-file backend/.env -f compose.local.yaml up -d` from the repository root for a local deployment. The Flask entry point is `backend/wsgi.py`. For a hosted evaluation serve the PWA over HTTPS, proxy `/api/v1` to Flask and authorize the evaluation origin in Firebase. Existing databases with migrations 001 and 002 require migration 003 before this API is deployed.

## Verify the build

From `frontend/ostrixai-web`, with desktop Chrome installed:

~~~sh
npm run build
npm test -- --watch=false --browsers=ChromeHeadless
npm run test:browser
node scripts/test-input-focus.mjs
npm audit --omit=dev
~~~

From `backend`, install `requirements.txt` in a virtual environment and run `python -m unittest discover -s tests -v`. Set `OSTRIX_TEST_MYSQL=1` with a local mysqld executable in PATH to include the temporary database integration tests. Browser and database tests use synthetic records..

The local development history records the baseline on 16 November 2026, followed by the educational memory, hybrid tutor, persistence and telemetry changes. The owner must complete the pre-existing work disclosure and authorize publication and submission. [MIT license](LICENSE) · [Spanish README](README_ES.md).
