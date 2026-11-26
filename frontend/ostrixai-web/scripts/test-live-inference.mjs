// Serve a production build on loopback. Use synthetic data and an isolated Chrome profile.
import { chromium } from 'playwright-core';
import { mkdtemp, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

import { serveProduction } from './serve-production.mjs';

const { server, url } = await serveProduction(process.env.OSTRIX_BUILD_DIR);
const base = new URL(url);
const parent = resolve(process.env.OSTRIX_MODEL_TEST_DIR ?? tmpdir());
const profile = await mkdtemp(join(parent, 'ostrix-nano-'));
let context;
let page;
const report = {date:new Date().toISOString(), samples:[], authorizedCloud:null};
const authorizedCloud = process.env.OSTRIX_TEST_AUTHORIZED_CLOUD === '1';
try {
  const source = process.env.OSTRIX_MODEL_COMPONENT;
  if (source) {
    const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
    if (manifest.name !== 'Optimization Guide On Device Model' || !/^[0-9.]+$/.test(manifest.version)) {
      throw new Error('Select an installed Chrome model component.');
    }
    report.component = {version:manifest.version, model:manifest.BaseModelSpec?.name, baseVersion:manifest.BaseModelSpec?.version};
    console.log(report.component);
    await cp(source, join(profile, 'OptGuideOnDeviceModel', manifest.version), { recursive: true });
  }
  if (process.env.OSTRIX_MODEL_PROFILE) {
    // Carry the same machine's component registration and measured hardware capabilities only.
    const src = process.env.OSTRIX_MODEL_PROFILE;
    const onDevice = JSON.parse(await readFile(join(src, 'Local State'), 'utf8')).optimization_guide?.on_device ?? {};
    const measured = Object.fromEntries(['performance_class', 'performance_class_gpu_id', 'performance_class_version',
      'vram_mb', 'last_version'].filter(k => Object.hasOwn(onDevice, k)).map(k => [k, onDevice[k]]));
    await writeFile(join(profile, 'Local State'), JSON.stringify({optimization_guide: {on_device: measured}}));
    await cp(join(src, 'OptimizationGuideModelsManifest'), join(profile, 'OptimizationGuideModelsManifest'), {recursive:true});
  }
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chrome', headless: process.env.OSTRIX_HEADED !== '1',
    args: ['--enable-features=PromptAPIForGeminiNano,PromptAPIForGeminiNanoMultimodalInput,OptimizationGuideOnDeviceModel',
      ...authorizedCloud ? [] : ['--disable-background-networking', '--disable-component-update',
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1']],
  });
  if (!authorizedCloud) {
    await context.route('**/*', route => new URL(route.request().url()).origin === base.origin
      ? route.continue() : route.abort('blockedbyclient'));
  }
  page = await context.newPage();
  await page.setViewportSize({width:1366,height:900});
  let remote = 0;
  const transport = [];
  context.on('response', response => {
    if (/generateContent|streamGenerateContent|predictLongRunning/i.test(new URL(response.url()).pathname)) {
      const request = response.request();
      transport.push({method:request.method(), status:response.status(),
        initiator:request.serviceWorker() ? 'service-worker' : 'page', servedByWorker:response.fromServiceWorker()});
    }
  });
  context.on('request', request => {
    if (/generateContent|streamGenerateContent|predictLongRunning/i.test(new URL(request.url()).pathname)) remote++;
  });
  await page.goto(new URL('/#registro', base).href);
  await page.locator('[name=regUsername]').fill('audit' + randomUUID().slice(0, 8));
  const password = randomUUID();
  await page.locator('[name=regPassword]').fill(password);
  await page.locator('[name=regConfirm]').fill(password);
  await page.locator('button[type=submit]').click();
  await page.waitForURL('**/#inicio');
  await page.locator('.nav a[href="#configuracion"]').click();
  await page.getByRole('button', {name:/Probar Nano local|Test local Nano/}).waitFor();
  report.manifestSha256 = createHash('sha256').update(await (await fetch(new URL('/ngsw.json', base))).text()).digest('hex');
  report.runtime = await page.evaluate(async () => ({
    browser: navigator.userAgent.match(/(?:Headless)?Chrome\/[\d.]+/)?.[0],
    availability: await globalThis.LanguageModel?.availability({expectedOutputs:[{type:'text',languages:['es']}]}) ?? 'API unavailable'
  }));
  console.log(report.runtime);
  for (const offline of [false, true]) {
    await context.setOffline(offline);
    for (let sample = 1; sample <= 3; sample++) {
      const button = page.getByRole('button', { name: /Probar Nano local|Test local Nano/ });
      const started = performance.now();
      await button.click();
      await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(el =>
        !el.disabled && /Probar Nano local|Test local Nano/.test(el.textContent)), null, { timeout: 200000 });
      const status = (await page.locator('p[role=status]').allTextContents()).join(' ');
      const success = status.match(/PRUEBA CORRECTA: ON_DEVICE en (\d+) ms/);
      const measured = {offline, sample, elapsedMs:Math.round(performance.now()-started), source:success?'ON_DEVICE':null, latencyMs:success ? Number(success[1]) : null,
        error:success ? undefined : /no está disponible|no disponible|unavailable/i.test(status) ? 'device unavailable' : 'local inference failed'};
      report.samples.push(measured);
      console.log(measured);
      if (!success) { process.exitCode = 2; break; }
    }
  }
  if (report.samples.some(sample => sample.offline && sample.source === 'ON_DEVICE')) {
    // Keep the browser offline through all turns. Only generated messages with SDK provenance count.
    await page.locator('.nav a[href="#tutor"]').click();
    await exerciseTutor('ON_DEVICE');
    await page.locator('.nav a[href="#configuracion"]').click();
  }
  report.deniedCloudRequests = remote;
  console.log('Remote inference requests without consent', remote);
  if (remote) throw new Error('Remote request without consent.');
  if (authorizedCloud) {
    await context.setOffline(false);
    const consent = page.locator('label').filter({hasText: /Gemini Cloud/}).locator('input[type=checkbox]').last();
    await consent.check();
    await page.getByText('Configuración guardada.', {exact: true}).waitFor();
    await page.locator('.nav a[href="#tutor"]').click();
    await page.locator('#tutor-message').fill('Compara un medio y un cuarto con un ejemplo breve.');
    const before = remote;
    await page.locator('.send-button').click();
    await page.locator('p.inference, .feedback[role=alert]').first().waitFor({timeout:180000});
    const confirmed = await page.locator('p.inference').filter({hasText:'IN_CLOUD'}).count();
    const feedback = await page.locator('.feedback[role=alert]').allTextContents();
    const category = feedback.some(v => /app.?check|attestation|captcha/i.test(v)) ? 'attestation' : feedback.length ? 'request failed' : null;
    report.authorizedCloud = {confirmed:!!confirmed, requests:remote-before, transport, failure:category};
    console.log(report.authorizedCloud);
    if (!confirmed) process.exitCode = 2;
    else await exerciseTutor();
  }

  async function exerciseTutor(requiredSource) {
      // Synthetic prompts only. Preserve the generated answer for review of teaching quality.
      report.liveTutor ??= [];
      for (const [mode, question, followup] of [
        ['Explícame', 'Explícame por qué un medio es mayor que un cuarto con un ejemplo cotidiano.', '¿Y si divido la misma barra en ocho partes?'],
        ['Guíame', 'Guíame para comparar 1/2 con 1/4 paso a paso.', 'Creo que debo dividir una tira igual en cuatro partes. ¿Cuál sería el siguiente paso?'],
        ['Practiquemos', 'Dame un ejercicio para comparar 1/2 y 1/4, espera mi respuesta.', 'Mi respuesta es que un cuarto es mayor porque 4 es mayor que 2. ¿Es correcta?'],
        ['Exploremos', 'Observé que las plantas junto a la ventana crecieron más que las del pasillo.', 'Quiero diseñar un experimento que compruebe esa observación.'],
      ]) {
        await page.locator('.new-button').click();
        await page.locator('.mode-select .mode').filter({has:page.getByText(mode,{exact:true})}).click();
        for (const prompt of [question, followup].filter(Boolean)) {
          const priorReplies = await page.locator('.assistant-message').count();
          await page.locator('#tutor-message').fill(prompt);
          await page.locator('.send-button').click();
          const answer = page.locator('.assistant-message').nth(priorReplies);
          const alert = page.locator('.feedback[role=alert]');
          await answer.locator('p.inference').or(alert).first().waitFor({timeout:110000});
          if (await alert.isVisible()) {
            report.liveTutor.push({mode, prompt, completed:false});
            process.exitCode = 2;
            break;
          }
          const provenance = await answer.locator('p.inference').innerText();
          const source = provenance.match(/ON_DEVICE|IN_CLOUD/)?.[0];
          if (!source || (requiredSource && requiredSource !== source)) throw Error('Missing or unexpected SDK inference source');
          report.liveTutor.push({mode, prompt, completed:true, source, text:await answer.locator('.message-text').innerText()});
        }
      }
  }
} catch (error) {
  if (page && !page.isClosed()) console.log('Page diagnostics, visible buttons', await page.getByRole('button').count());
  throw error;
} finally {
  await context?.close();
  server.close();
  if (process.env.OSTRIX_INFERENCE_REPORT) await writeFile(process.env.OSTRIX_INFERENCE_REPORT, JSON.stringify(report,null,2)+'\n');
  if (dirname(profile) === parent && basename(profile).startsWith('ostrix-nano-')) {
    await rm(profile, { recursive: true, force: true, maxRetries: 3 });
  }
}
