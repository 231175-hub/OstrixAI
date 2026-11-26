/** Validate the public, unconfigured release artifact without exposing any values. */
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { serveProduction } from './serve-production.mjs';

const root = resolve(process.env.OSTRIX_BUILD_DIR || 'dist/ostrixai-web/browser');
const scripts = (await readdir(root)).filter(path => path.endsWith('.js'));
for (const script of scripts) {
  const content = await readFile(resolve(root, script), 'utf8');
  assert.equal(/AIza[0-9A-Za-z_-]{35}/.test(content), false, 'Public release contains a Google API key');
  assert.equal(content.includes('http://localhost:5000'), false, 'Production API points to localhost');
  assert.equal(/\.FIREBASE_APPCHECK_DEBUG_TOKEN\s*=(?!=)/.test(content), false, 'Production sets a debug token');
  assert.equal(content.includes('ostrix-appcheck-debug-'), false, 'Production includes the loopback token provider');
}
const {server, url} = await serveProduction(root);
let browser;
try {
  const options = process.env.CHROME_BIN ? {executablePath: process.env.CHROME_BIN} : {channel: 'chrome'};
  browser = await chromium.launch({headless: true, ...options});
  const page = await browser.newPage();
  const external = new Map();
  let errors = 0;
  page.on('request', request => {
    const target = new URL(request.url());
    if (/^https?:/.test(target.protocol) && target.origin !== url) {
      const type = ['gapi','recaptcha','firebasejs','firebase-ai','fonts','chrome','generativelanguage'].find(category => target.pathname.includes(category)) || request.resourceType();
      const host = target.hostname + ' (' + type + ')';
      external.set(host, (external.get(host) || 0) + 1);
    }
  });
  const code = text => text.match(/(?:NG[0-9]{3,}|(?:auth|installations|appCheck|app|ai)\/[a-z-]{3,})/i)?.[0] || 'unclassified';
  page.on('pageerror', error => { errors++; console.error('startup error category', code(error.message)); });
  page.on('console', msg => { if (msg.type() === 'error') console.error('console error category', code(msg.text())); });
  await page.goto(url);
  await page.locator('.pubnav a').first().waitFor();
  await page.evaluate(() => Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Service worker registration timed out')), 20000)),
  ]));
  assert.equal(errors, 0, 'Client error at startup');
  if (external.size) console.error('External request hosts', Object.fromEntries(external));
  assert.equal(external.size, 0, 'Startup made an external request');
  console.log(JSON.stringify({scripts:scripts.length, pageErrors:errors, externalRequests:external.size, serviceWorkerReady:true}));
} finally {
  if (browser) await browser.close();
  await new Promise(done => server.close(done));
}

