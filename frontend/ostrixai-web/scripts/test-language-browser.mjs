import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright-core';
import { interfaceText } from '../src/app/core/interface-language.ts';
import { serveProduction } from './serve-production.mjs';

const { server, url } = await serveProduction();
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const issues = [];
  const expectText = (actual, expected, action) => {
    if (actual !== expected) issues.push({ action, actual, expected });
  };
  const languages = ['es', 'en', 'qu-chanka'];
  const waitLanguage = language => page.waitForFunction(
    lang => document.documentElement.lang === lang, language === 'qu-chanka' ? 'qu' : language);
  const syntheticName = 'lang-' + randomUUID().slice(0, 8);
  const password = randomUUID();

  await page.goto(url + '/#registro');
  for (const language of languages) {
    await page.locator('.pubnav select').selectOption(language);
    await waitLanguage(language);
    expectText(await page.locator('h1').innerText(), interfaceText('registerTitle', language), language + ' registro');
    expectText(await page.locator('[name=regPassword]').getAttribute('placeholder'),
      language === 'en' ? 'At least 10 characters' : 'Al menos 10 caracteres', language + ' ayuda de contraseña');
  }
  await page.goto(url + '/#acceso');
  await page.locator('.pubnav select').selectOption('en');
  await page.locator('[name=username]').fill(syntheticName);
  await page.locator('[name=password]').fill(password);
  await page.locator('form button[type=submit]').click();
  expectText(await page.locator('[role=alert]').innerText(), 'Incorrect username or password.', 'en acceso rechazado');

  await page.goto(url + '/#registro');
  await page.locator('.pubnav select').selectOption('es');
  await page.locator('[name=regUsername]').fill(syntheticName);
  await page.locator('[name=regPassword]').fill(password);
  await page.locator('[name=regConfirm]').fill(password);
  await page.locator('form button[type=submit]').click();
  await page.getByRole('button', { name: /Cargar sesión de ejemplo/ }).click();
  await page.waitForURL('**/#libro-*');
  for (const language of languages) {
    await page.locator('header.top select').selectOption(language);
    await waitLanguage(language);
    await page.locator('.nav a[href="#diario"]').click();
    await page.getByRole('heading', { name: interfaceText('myDiary', language), exact: true }).waitFor();
    await page.locator('#dlist .editorial-card').filter({ hasText: 'Matemática' }).waitFor();
    await page.locator('.nav a[href="#tutor"]').click();
    await page.locator('#tutor-message').waitFor();
    assert.deepEqual(await page.locator('.mode-select .mode strong').allTextContents(),
      ['modeExplainTitle', 'modeGuideTitle', 'modePracticeTitle', 'modeExploreTitle'].map(key => interfaceText(key, language)));
    await page.locator('.nav a[href="#configuracion"]').click();
    await page.getByRole('heading', { name: interfaceText('settingsTitle', language), exact: true }).waitFor();
    await page.reload();
    await waitLanguage(language);
    assert.equal(await page.locator('header.top select').inputValue(), language);
  }
  assert.deepEqual(issues, []);
  console.log('PASS: registration hints, rejected login, journal content, four Tutor labels, settings and language across reloads (es/en/qu-chanka).');
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
