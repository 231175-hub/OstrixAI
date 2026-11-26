import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { randomUUID } from 'node:crypto';
import { serveProduction } from './serve-production.mjs';

const {server, url} = await serveProduction();
let browser;
try {
  browser = await chromium.launch({channel: 'chrome', headless: true});
  const page = await browser.newPage();
  await page.goto(url + '/#registro');
  const password = randomUUID();
  await page.locator('[name=regUsername]').fill('qa' + randomUUID().slice(0, 8));
  await page.locator('[name=regPassword]').fill(password);
  await page.locator('[name=regConfirm]').fill(password);
  await page.locator('button[type=submit]').click();
  await page.getByRole('button', {name:/Cargar sesión de ejemplo/}).click();
  await page.waitForURL('**/#libro-*');
  await page.locator('.page-h').waitFor();
  if (!await page.locator('.pizarra-sheet').isVisible()) {
    await page.locator('.page-h button').filter({hasText:/pizarra|apuntes originales/i}).first().click();
  }
  for (const field of ['.pizarra-topic-input-title', '.pizarra-textarea-auto']) {
    const input = page.locator(field).first();
    await input.fill('');
    await input.focus();
    let expected = '';
    for (const ch of 'Aprender') {
      await page.keyboard.type(ch);
      expected += ch;
      assert.equal(await input.inputValue(), expected);
      assert.equal(await input.evaluate(el => el === document.activeElement), true);
    }
  }
  await page.locator('.btn-add-topic-main').click();
  const nextTitle = page.locator('.pizarra-topic-input-title').nth(1);
  await nextTitle.fill('');
  await nextTitle.pressSequentially('Otro tema');
  assert.equal(await nextTitle.inputValue(), 'Otro tema');
  assert.equal(await nextTitle.evaluate(el => el === document.activeElement), true);
  console.log('PASS: title, note and second topic retained keyboard focus and all characters.');
} finally {
  await browser?.close();
  server.close();
}
