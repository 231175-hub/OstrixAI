import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { chromium } from 'playwright-core';
import { serveProduction } from './serve-production.mjs';

// Optional real export stays in process memory. The private fields enter Chrome only after it is offline.
const backupPath = process.argv.slice(2).find(arg => arg !== '--guided');
const backup = backupPath && JSON.parse((await readFile(backupPath, 'utf8')).replace(/^\uFEFF/, ''));
const lesson = backup ? backup.sessions.find(s => s.course === 'Matemática' && s.notes &&
  s.doubts.some(d => /fracci[oó]n/i.test(d))) : {
  course: 'Matemática', topic: 'Fracciones', date: '2026-11-20',
  notes: 'El denominador cuenta las partes iguales de la unidad.', doubts: ['¿Cómo resto fracciones?'],
};
if (!lesson) throw new Error('Select a journal export containing a math session with fraction notes and a doubt.');
const doubt = lesson.doubts.find(d => /fracci[oó]n/i.test(d));
const { server, url } = await serveProduction();
const operator = process.argv.includes('--guided') ? createInterface({ input: process.stdin, output: process.stdout }) : null;
let browser;
let stage = 'start';
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const password = randomUUID();
  let remoteInference = 0;
  context.on('request', r => {
    if (/generateContent|streamGenerateContent|firebasevertexai|aiplatform\.googleapis|generativelanguage\.googleapis/i.test(r.url())) remoteInference++;
  });
  await page.goto(url + '/#registro');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, { timeout: 65000 });
  await page.locator('[name=regUsername]').fill('demo' + randomUUID().slice(0, 8));
  await page.locator('[name=regPassword]').fill(password);
  await page.locator('[name=regConfirm]').fill(password);
  await page.locator('form button[type=submit]').click();
  await page.waitForURL('**/#inicio');
  stage = 'install offline assets';
  await page.evaluate(async () => {
    await fetch('/index.html');
    const manifest = await (await fetch('/ngsw.json')).json();
    for (const path of manifest.assetGroups.flatMap(group => group.urls)) {
      if (!(await caches.match(path))) await fetch(path);
    }
  });
  await page.waitForFunction(async () => !!(await caches.match('/index.html')));
  await context.setOffline(true);
  await page.goto(url + '/#tutor');
  await page.getByTestId('learning-empty').waitFor();
  stage = 'create offline session';
  await page.goto(url + '/#inicio');
  await page.locator('.page-h button.primary').first().click();
  const form = page.getByRole('dialog').first();
  if (!await form.locator('[name=course] option').evaluateAll((items, course) =>
    items.some(i => i.value === course), lesson.course)) {
    await form.locator('label button').click();
    await page.locator('[name=courseName]').fill(lesson.course);
    await page.getByRole('dialog').last().locator('[type=submit]').click();
  }
  await form.locator('[name=course]').selectOption(lesson.course);
  await form.locator('[name=date]').fill(lesson.date);
  await form.locator('[type=submit]').click();
  await page.waitForURL('**/#libro-*');
  const id = page.url().split('#libro-')[1];
  stage = 'save private example';
  await page.locator('.pizarra-topic-input-title').first().fill(lesson.topic);
  await page.locator('.pizarra-textarea-auto').first().fill(lesson.notes);
  const input = page.locator('.pizarra-dudas-input-box input').first();
  await input.fill(doubt);
  await input.press('Enter');
  await page.locator('.btn-guardar-principal').click();
  await page.locator('.pizarra-status-badge.saved, .pizarra-status-badge.updated').waitFor();
  stage = 'recommendation after offline reload';
  await page.goto(url + '/#tutor');
  stage = 'reload private tutor from installed PWA';
  await page.reload();
  const card = page.getByTestId('learning-step');
  stage = 'wait for private card';
  await card.waitFor();
  assert.equal(await card.count(), 1);
  assert.ok((await card.innerText()).includes(doubt));
  await card.locator('summary').click();
  assert.ok((await card.innerText()).includes(lesson.date));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  if (operator) {
    console.log('One recommendation matches the selected journal doubt. Its explanation includes the session date. Mobile width fits.');
    assert.equal((await operator.question('Type diary to inspect its source session: ')).trim(), 'diary');
  }
  stage = 'secondary link to original session';
  await card.getByRole('button', { name: 'Ver en mi Diario' }).click();
  await page.waitForURL('**/#libro-' + id);
  await page.goto(url + '/#tutor');
  stage = 'dismiss the card';
  await card.getByRole('button', { name: 'Ahora no' }).click();
  assert.equal(await card.count(), 0);
  await page.reload();
  stage = 'start and finish targeted exercise';
  if (operator) assert.equal((await operator.question('Source session verified. Type practice to start after dismissal and reload: ')).trim(), 'practice');
  await card.getByRole('button', { name: 'Practicar ahora' }).click();
  const activity = page.getByTestId('focused-practice');
  await activity.waitFor();
  assert.equal(await page.locator('#study-session').inputValue(), id);
  assert.match(await page.locator('.mode.active').innerText(), /practiquemos/i);
  assert.match(await activity.innerText(), /Biblioteca offline/);
  const options = activity.locator('.step-actions button');
  let choice = 0;
  if (operator) {
    console.log('Practiquemos is open in the same session. Local library question:\n' + await activity.locator('h2').innerText());
    const labels = await options.allInnerTexts();
    console.log(labels.map((text, index) => (index + 1) + '. ' + text).join('\n'));
    choice = Number(await operator.question('Choose an answer (1–' + labels.length + '): ')) - 1;
    assert.ok(Number.isInteger(choice) && choice >= 0 && choice < labels.length);
  }
  await options.nth(choice).click();
  await activity.getByRole('status').waitFor();
  if (operator) console.log(await activity.getByRole('status').innerText());
  await page.reload();
  await page.getByTestId('learning-empty').waitFor();
  assert.equal(await card.count(), 0);
  assert.equal(remoteInference, 0);
  console.log('PASS: empty account, encrypted journal entry, one explained card, diary link, dismissal, offline reload, mobile width, scoped practice, offline library, graded attempt and recomputation. Remote inference requests: 0.');
} catch (error) {
  // Playwright locator diagnostics can contain student material. Never log the original exception.
  const code = /net::ERR_[A-Z_]+|strict mode violation|Timeout \d+ms exceeded|Target closed|Execution context was destroyed/i.exec(error.message)?.[0] ?? error.name;
  console.error('FAIL at ' + stage + ' (' + code + ').');
  process.exitCode = 1;
} finally {
  operator?.close();
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
