import assert from 'node:assert/strict';
import { serveProduction } from './serve-production.mjs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright-core';

const report = process.env.OSTRIX_BROWSER_REPORT_DIR ?? fileURLToPath(new URL('../../../docs/evidence/browser/', import.meta.url));
const profile = await mkdtemp(join(tmpdir(), 'ostrix-browser-audit-'));
const {server, url} = await serveProduction();
const calls = new Set();
const syncCalls = new Set();
const evidence = {executedAt:new Date().toISOString(), command:'npm run test:browser',
  driver:'Playwright Core, isolated Chrome headless profile on loopback',screenshots:[],tutor:[]};
let ctx;
const start = async () => {
  const options = { headless: true, viewport: { width: 1366, height: 900 },
    ...(process.env.CHROME_BIN ? {executablePath: process.env.CHROME_BIN} : {channel: 'chrome'}) };
  ctx = await chromium.launchPersistentContext(profile, options);
  ctx.setDefaultTimeout(18000);
  // Count attempts (including failed requests) on every page and the Angular service worker.
  ctx.on('request', request => {
    const dest = new URL(request.url());
    if (/\/api\/v1\/(?:diary\/)?sync$/.test(dest.pathname)) syncCalls.add(request);
    if (/generativelanguage\.googleapis\.com$|aiplatform\.googleapis\.com$|firebasevertexai\.googleapis\.com$/i.test(dest.hostname) ||
        /generateContent|streamGenerateContent|predictLongRunning|\/api\/v1\/(translate|translation)(?:\/|$)/i.test(dest.pathname)) {
      calls.add(request); // Never log URLs, headers or bodies.
    }
  });
  return ctx.pages()[0] || await ctx.newPage();
};
const note = 'PWA-ALFA Las ecuaciones lineales requieren aplicar la misma operación en ambos lados para despejar la incógnita.';
const doubt = '¿Cómo se despeja la incógnita de PWA-ALFA?';
const question = 'Compara dos estrategias para resolver ecuaciones usando únicamente mi apunte de PWA-ALFA.';
const passphrase = 'Prueba-Aula!2026';
async function register(page, username) {
  await page.goto(url + '/#registro');
  await page.locator('[name=regUsername]').fill(username);
  await page.locator('[name=regPassword]').fill(passphrase);
  await page.locator('[name=regConfirm]').fill(passphrase);
  await page.locator('form button[type=submit]').click();
  await page.waitForURL('**/#inicio');
}
async function login(page, username) {
  await page.goto(url + '/#acceso');
  await page.locator('[name=username]').fill(username);
  await page.locator('[name=password]').fill(passphrase);
  await page.locator('form button[type=submit]').click();
  await page.waitForURL('**/#inicio');
}
async function stores(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('ostrixai-private-v1');
      req.onsuccess = () => resolve(req.result);
      req.onerror = reject;
    });
    const all = name => new Promise((resolve, reject) => {
      const req = db.transaction(name).objectStore(name).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = reject;
    });
    const [secrets, sessions] = await Promise.all([all('secrets'), all('session')]);
    db.close();
    return { protectedRows: secrets.length, categories: secrets.map(r => r.category),
      plaintext: JSON.stringify(secrets).includes('PWA-ALFA') || JSON.stringify(localStorage).includes('PWA-ALFA'),
      rawUnlockKeys: sessions.some(s => 'key' in s), sealedSession: sessions.some(s => !!s.ciphertext),
      unsealedRows: secrets.some(r => !r.ciphertext || !r.nonce || 'value' in r) };
  });
}
// Independently inspect the actual encrypted review record for the disposable, known-password account.
async function checkSpacedReview(page) {
  const summary = await page.evaluate(async password => {
    const result = req => new Promise((resolve,reject) => {
      req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error); });
    const db = await result(indexedDB.open('ostrixai-private-v1'));
    const profile = await result(db.transaction('profiles').objectStore('profiles').index('username').get('audit_alfa'));
    const rows = await result(db.transaction('secrets').objectStore('secrets').index('owner').getAll(profile.id));
    db.close();
    const bytes = encoded => Uint8Array.from(atob(encoded), c=>c.charCodeAt(0));
    const material = await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
    const key = await crypto.subtle.deriveKey({name:'PBKDF2',salt:bytes(profile.salt),iterations:310000,hash:'SHA-256'},
      material,{name:'AES-GCM',length:256},false,['decrypt']);
    const memory = await Promise.all(rows.filter(r=>r.category==='memory').map(async r =>
      JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(r.nonce),
        additionalData:new TextEncoder().encode(r.id)},key,bytes(r.ciphertext))))));
    const reviewed = memory.find(c=>c.history?.some(h=>h.exerciseId?.includes('mat-sec2-002') && h.isCorrect));
    return reviewed && {historyLength:reviewed.history.length,score:reviewed.history[0].score,status:reviewed.status,
      repetitions:reviewed.repetitions, intervalDays:reviewed.intervalDays,
      daysToNextReview:(Date.parse(reviewed.nextReviewDate)-Date.parse(reviewed.lastReviewedDate))/86400000};
  },passphrase);
  assert.deepEqual(summary,{historyLength:1,score:5,status:'TESTED',repetitions:1,intervalDays:1,daysToNextReview:1});
  return summary;
}
async function assertDraftEncrypted(page) {
  for (let n = 0; n < 30; n++) {
    const state = await stores(page);
    if (state.categories.includes('editdrafts')) {
      assert.equal(state.plaintext, false);
      assert.equal(state.unsealedRows, false);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.fail('Expected an encrypted provisional draft');
}
async function measureContrast(locator, name) {
  await locator.waitFor();
  // These controls use solid paints. Read settled browser styles and their opaque ancestor.
  const paint = await locator.evaluate(el => {
    const fg = getComputedStyle(el).color;
    let node = el;
    while (node) {
      const style = getComputedStyle(node);
      if (style.backgroundImage !== 'none' || Number(style.opacity) !== 1) throw Error('Expected solid paint');
      const bg = style.backgroundColor;
      if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return {fg,bg};
      node = node.parentElement;
    }
    throw Error('No opaque background');
  });
  const luminance = color => {
    assert.match(color,/^rgb\(\d+, \d+, \d+\)$/);
    const channel = color.match(/\d+/g).map(Number).map(n => n / 255)
      .map(n => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4);
    return channel[0]*0.2126 + channel[1]*0.7152 + channel[2]*0.0722;
  };
  const values = [luminance(paint.fg), luminance(paint.bg)].sort((a,b)=>a-b);
  const ratio = (values[1]+0.05)/(values[0]+0.05);
  evidence.contrast ??= [];
  evidence.contrast.push({name,...paint,ratio:Number(ratio.toFixed(3)),minimum:4.5});
  assert.ok(ratio >= 4.5, name+' contrast '+ratio.toFixed(3));
}
async function checkDialogKeyboard(page) {
  const trigger = page.getByRole('button',{name:'Nueva sesión',exact:true});
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog',{name:'Nueva sesión'});
  await dialog.waitFor();
  const inside = () => page.waitForFunction(() => document.querySelector('[role=dialog]')?.contains(document.activeElement));
  await inside();
  const count = await dialog.locator('select:enabled, button:enabled, input:enabled').count();
  assert.ok(count >= 3);
  for (const key of ['Tab','Shift+Tab']) {
    for (let i=0; i<=count; i++) {
      await page.keyboard.press(key);
      await inside();
    }
  }
  await measureContrast(dialog.locator('h2'), 'Session dialog heading');
  await page.keyboard.press('Escape');
  await dialog.waitFor({state:'detached'});
  await trigger.and(page.locator(':focus')).waitFor();
  evidence.keyboardDialog = {opened:'Enter',focusStayedInside:true, directions:['Tab','Shift+Tab'],
    dismissed:'Escape',focusReturnedTo:'Nueva sesión'};
}
async function screenshot(page, name) {
  await mkdir(report, {recursive:true});
  await page.screenshot({path:join(report, name + '.png'), animations:'disabled'});
  evidence.screenshots.push({file:name+'.png', ...page.viewportSize()});
}
async function checkStandaloneInstall(page) {
  const manifestId = new URL('/', url).href;
  const browser = await ctx.browser().newBrowserCDPSession();
  try {
    try {
      await browser.send('PWA.install', {manifestId, installUrlOrBundleUrl: manifestId});
    } catch (error) {
      if (!/wasn't found|not supported|not implemented|not available/i.test(error.message)) throw error;
      evidence.standaloneInstall = {status:'UNAVAILABLE', reason:'Chrome does not offer installation in this context'};
      return;
    }
    try {
      await browser.send('PWA.getOsAppState', {manifestId});
      await browser.send('PWA.changeAppUserSettings', {manifestId, displayMode:'standalone'});
      const {targetId} = await browser.send('PWA.launch', {manifestId});
      const {targetInfo} = await browser.send('Target.getTargetInfo', {targetId});
      const launchedWindow = await browser.send('Browser.getWindowForTarget', {targetId});
      const pageSession = await ctx.newCDPSession(page);
      const originalWindow = await pageSession.send('Browser.getWindowForTarget');
      await pageSession.detach();
      assert.ok(launchedWindow.windowId !== originalWindow.windowId, 'Expected a separate installed-app window');
      evidence.standaloneInstall = {status:'PASS', installed:true, launched:true,
        independentWindow:true, targetType:targetInfo.type};
      console.log('Temporary PWA installed, OS state confirmed and separate app window launched');
    } finally {
      // Only remove the test origin we just installed in the temporary browser profile.
      await browser.send('PWA.uninstall', {manifestId});
    }
    await page.bringToFront();
  } finally {
    await browser.detach();
  }
}
async function openBlackboard(page) {
  await page.locator('.page-h').waitFor();
  if (!await page.locator('.pizarra-sheet').isVisible()) {
    await page.locator('.page-h button').filter({hasText:/apuntes originales|pizarra/i}).click();
  }
  await page.locator('.pizarra-textarea-auto').first().waitFor();
}
async function openBlackboardAfterNavigate(page, book) {
  await page.goto(book);
  await openBlackboard(page);
}
async function verifyNote(page) {
  await openBlackboard(page);
  await page.waitForFunction(text => document.querySelector('.pizarra-textarea-auto')?.value === text, note);
  await page.getByText(doubt, {exact:true}).first().waitFor();
}
async function consentProbe(page, offline, sessionId) {
  await page.goto(url + '/#tutor');
  await page.locator('#tutor-message').waitFor();
  const cases = [
    ['Explícame', question, /Guardar en apuntes/i, /Apuntes y Memoria/],
    ['Guíame', 'Guíame paso a paso para despejar la incógnita en mis apuntes PWA-ALFA.', /Guardar duda/i, /Dudas y Repaso/],
    ['Practiquemos', 'Dame un ejercicio sobre ecuaciones lineales de mis apuntes PWA-ALFA.', /Crear repaso/i, /Repaso/],
    ['Exploremos', 'Exploremos la relación entre una balanza y las ecuaciones lineales de PWA-ALFA.', /Eureka/i, /Eureka/],
  ];
  const guides = new Set();
  for (const [mode, prompt, saveButton, savedLabel] of cases) {
    await page.locator('.new-button').click();
    await page.locator('#study-session').selectOption(sessionId);
    const modeButton = page.locator('.mode-select .mode').filter({has:page.getByText(mode, {exact:true})});
    await modeButton.click();
    await modeButton.and(page.locator('.active')).waitFor();
    await page.locator('#tutor-message').fill(prompt);
    await page.locator('.send-button').click();
    await page.locator('.message-text').filter({hasText:prompt}).first().waitFor();
    await page.locator('.inference, .feedback[role=alert]').first().waitFor({timeout:90000});
    const reply = page.locator('.assistant-message').last();
    const generated = await reply.locator('.inference').count() > 0;
    if (!generated) {
      await page.getByTestId('tutor-essential-guide').click();
      await reply.locator('.inference').waitFor();
      assert.match(await reply.locator('.inference').innerText(), /Esencial.*sin modelo/i);
      const content = await reply.locator('.message-text').innerText();
      assert.match(content, /PWA-ALFA Las ecuaciones lineales/);
      guides.add(content.slice(content.lastIndexOf('»') + 1).trim());
    } else {
      assert.match(await reply.locator('.inference').innerText(), /ON_DEVICE/i);
      assert.ok((await reply.locator('.message-text').innerText()).trim());
    }
    if (offline) {
      await reply.getByRole('button',{name:saveButton}).click();
      if (mode === 'Exploremos') {
        assert.equal(await page.locator('#save-content').inputValue(), '');
        await page.locator('#save-content').fill('Descubrí que puedo comprobar una ecuación sustituyendo la incógnita.');
      }
      await page.locator('.save-buttons .primary-small').click();
      await page.locator('.success-note').filter({hasText:savedLabel}).waitFor();
      if (mode === 'Explícame') await screenshot(page,'offline-tutor-guide');
    }
    evidence.tutor.push({online:!offline,mode,modelAnswered:generated,remoteInferenceRequests:calls.size,
      displayedSource:(await reply.locator('.inference').innerText()).trim(), saved:offline});
    assert.equal(calls.size, 0);
  }
  assert.equal(guides.size, evidence.tutor.filter(item => item.online === !offline && !item.modelAnswered).length);
  console.log('Tutor', offline ? 'offline' : 'online', '4 separate conversations; note-based guides:', guides.size);
}
let stage = 'launch';
try {
  let page = await start();
  const cdpVersion = await ctx.newCDPSession(page);
  evidence.browser = (await cdpVersion.send('Browser.getVersion')).product;
  evidence.ngswManifestSha256 = createHash('sha256').update(await (await fetch(url + '/ngsw.json')).text()).digest('hex');
  console.log('Chrome', await page.evaluate(() => navigator.userAgent.match(/(?:Headless)?Chrome\/([\d.]+)/)?.[1]));
  stage = 'installability';
  await page.goto(url);
  await page.locator('.pubnav').waitFor();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, {timeout: 55000});
  const cdp = await ctx.newCDPSession(page);
  const {installabilityErrors} = await cdp.send('Page.getInstallabilityErrors');
  assert.deepEqual(installabilityErrors, []);
  evidence.installabilityErrors = installabilityErrors;
  const manifest = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).json());
  assert.equal(manifest.display, 'standalone');
  assert.deepEqual(manifest.icons.map(icon => icon.sizes).sort(), ['192x192', '512x512']);
  console.log('Production worker controls page; Chrome installability errors: 0');
  await checkStandaloneInstall(page);
  for (const [name, width, height] of [['desktop',1366,900],['tablet',820,1180],['mobile',390,844]]) {
    await page.setViewportSize({width,height});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await screenshot(page, 'landing-' + name);
  }
  await page.setViewportSize({width:1366,height:900});
  await measureContrast(page.locator('.hero .btn.primary'), 'Start call to action');
  await page.locator('#pub-lang').selectOption('en');
  assert.match(await page.locator('.hero .btn.primary').innerText(), /start|begin|get/i);
  await page.locator('#pub-lang').selectOption('es');
  stage = 'register';
  await register(page, 'audit_alfa');
  stage = 'keyboard and contrast';
  await measureContrast(page.locator('.side .nav [aria-current=page]'), 'Current navigation item');
  await checkDialogKeyboard(page);
  await page.getByRole('button',{name:/Cargar sesión de ejemplo/}).click();
  await page.waitForURL('**/#libro-*');
  const book = page.url();
  const sessionId = book.split('#libro-')[1];
  assert.ok(sessionId);
  stage = 'offline save';
  await ctx.setOffline(true);
  assert.equal(await page.evaluate(() => navigator.onLine), false);
  await page.reload();
  await openBlackboard(page);
  const editor = page.locator('.pizarra-textarea-auto').first();
  await editor.fill(note);
  const doubts = page.locator('.pizarra-dudas-input-box input');
  await doubts.fill(doubt);
  await doubts.press('Enter');
  await assertDraftEncrypted(page);
  await page.locator('.btn-guardar-principal').click();
  await page.locator('.pizarra-status-badge.saved, .pizarra-status-badge.updated').waitFor();
  await page.reload();
  await verifyNote(page);
  const connectivity = await page.evaluate(async () => {
    let externalProbeReachable = false;
    try { await fetch('/network-test-' + crypto.randomUUID() + '?ngsw-bypass=true', {cache:'no-store'});
      externalProbeReachable = true; } catch { /* Chrome's offline transport must reject the fetch. */ }
    return {navigatorOnline:navigator.onLine, uncachedOriginReachable:externalProbeReachable};
  });
  assert.equal(connectivity.uncachedOriginReachable, false, 'A fresh request must fail after an offline reload');
  if (connectivity.navigatorOnline) {
    // Chrome 158 recreated the document with the OS interface flag despite the blocked transport.
    // Reapply the protocol's interface-state override to the current target; never replace navigator in JS.
    await cdp.send('Network.overrideNetworkState', {offline:true, latency:0, downloadThroughput:0, uploadThroughput:0,
      connectionType:'none'});
    await page.waitForFunction(() => !navigator.onLine);
  }
  await page.locator('.ai-chip.off').filter({hasText:/sin conexi|desconectad/i}).first().waitFor();
  evidence.offlineTransport = {...connectivity, navigatorOnlineAtCapture:await page.evaluate(()=>navigator.onLine)};
  await screenshot(page, 'offline-notebook-desktop');
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Notebook overflows mobile');
  await screenshot(page, 'offline-notebook-mobile');
  await page.setViewportSize({width:1366,height:900});
  const disk = await stores(page);
  assert.ok(disk.protectedRows > 0 && disk.sealedSession && !disk.rawUnlockKeys && !disk.plaintext && !disk.unsealedRows);
  evidence.offlineSaveAndReload = {status:'PASS',protectedRecords:disk.protectedRows,rawUnlockKeys:disk.rawUnlockKeys,plaintextDraft:disk.plaintext};
  console.log('Offline reload, note and doubt editing, encrypted persistence: passed');
  stage = 'tutor offline';
  await consentProbe(page, true, sessionId);
  await cdp.send('Network.overrideNetworkState',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  await ctx.setOffline(false);
  assert.equal(await page.evaluate(() => navigator.onLine), true);
  stage = 'tutor online';
  await consentProbe(page, false, sessionId);
  stage = 'practice';
  await page.goto(book);
  await page.locator('.page-h button').filter({hasText:/practicar|práctica|examen/i}).click();
  await page.locator('.practice-start-btn').click();
  await page.locator('.practice-question-text').waitFor({timeout: 60000});
  const count = await page.locator('.practice-quick-num').count();
  assert.ok(count > 0);
  for (let i=0;i<count;i++) {
    const current = page.locator('.practice-question-text');
    const text = await current.innerText();
    assert.match(text,/ecuaci|incógnita|lineal/i);
    const options = page.locator('.practice-option-cell');
    const correct = options.filter({has:page.locator('.practice-option-text',{hasText:/^6$/})});
    assert.equal(await correct.count(),1,'Expected the real catalogue linear-equation answer');
    await correct.click();
    await page.locator('.practice-nav-bar .btn.primary').click();
  }
  await page.locator('.practice-score-num').waitFor();
  assert.equal((await page.locator('.practice-score-num').innerText()).trim(),'100%');
  await page.goto(url + '/#progreso');
  await page.getByText('100%', {exact:true}).first().waitFor();
  stage = 'sync gate';
  await page.goto(url + '/#configuracion');
  const syncSection = page.locator('section.card').filter({has:page.locator('label').filter({hasText:/Autorizar sincronización/})});
  const linkButton = syncSection.getByRole('button',{name:/vincular cuenta escolar de Google/i});
  await linkButton.waitFor();
  evidence.schoolLinkEnabledInBuild = await linkButton.isEnabled();
  await ctx.setOffline(true);
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b =>
    /vincular cuenta escolar de google/i.test(b.innerText) && b.disabled));
  await ctx.setOffline(false);
  await syncSection.locator('input[type=checkbox]').check();
  await syncSection.getByRole('button',{name:/sincronizar/i}).click();
  await page.locator('.toast').filter({hasText:/requiere la cuenta individual|vincula una identidad/i}).waitFor();
  assert.equal(syncCalls.size,0);
  console.log('School sync consent without authenticated binding: 0 sync requests');
  stage = 'restart';
  await ctx.close(); ctx = undefined;
  page = await start();
  await ctx.setOffline(true);
  await page.goto(book);
  await page.locator('[name=password]').waitFor();
  await login(page, 'audit_alfa');
  await page.goto(book);
  await verifyNote(page);
  await page.goto(url + '/#progreso');
  await page.getByText('100%', {exact:true}).first().waitFor();
  evidence.persistedSpacedReview = await checkSpacedReview(page);
  await page.goto(url + '/#repaso');
  await page.locator('.item.yellow').first().waitFor();
  stage = 'isolation';
  await openBlackboardAfterNavigate(page, book);
  const topicId = await page.locator('.pizarra-topic-section').first().getAttribute('data-topic-id');
  // Add the exact v2 emergency-draft format to this disposable account for migration coverage.
  await page.evaluate(async ({sessionId,topicId}) => {
    const db = await new Promise((resolve,reject) => {const r=indexedDB.open('ostrixai-private-v1');
      r.onsuccess=()=>resolve(r.result); r.onerror=reject;});
    const owner = await new Promise((resolve,reject) => {
      const r=db.transaction('profiles').objectStore('profiles').index('username').get('audit_alfa');
      r.onsuccess=()=>resolve(r.result.id); r.onerror=reject; });
    db.close();
    localStorage.setItem('ostrix_draft_' + owner + '_' + sessionId, JSON.stringify({timestamp:Date.now(),
      doubts:[],eureka:[],topics:[{id:topicId,name:'Tema recuperado',notes:['PWA-ALFA legacy draft'],order:0}]}));
  },{sessionId,topicId});
  await page.goto(url + '/#configuracion');
  await page.locator('button[title]').filter({hasText:/salir|cerrar sesión/i}).first().or(page.locator('button.btn.danger').filter({hasText:/sesión/i})).first().click();
  await page.waitForURL('**/#bienvenida');
  await page.reload();
  await page.locator('.pubnav').waitFor();
  assert.doesNotMatch(await page.locator('app-root').innerText(), /PWA-ALFA|¿Por qué al pasar/);
  await register(page, 'audit_beta');
  for (const route of ['#diario','#dudas','#tutor','#repaso','#progreso']) {
    await page.goto(url + '/' + route);
    const target = page.locator({ '#diario':'.editorial-shelf, .page-h', '#dudas':'.doubts-kanban-grid',
      '#tutor':'#tutor-message','#repaso':'main h3','#progreso':'main .grid.g4' }[route]);
    await target.first().waitFor();
    const body = await page.locator('main').innerText();
    assert.doesNotMatch(body,/PWA-ALFA|¿Por qué al pasar|\[Ejemplo\]/i);
    assert.equal(await page.locator('.thread-choice, .item.yellow, .editorial-card-btn-practice').count(), 0);
    if (route === '#progreso') assert.doesNotMatch(body,/100%/);
  }
  assert.ok(await page.evaluate(() => Object.keys(localStorage).some(k=>k.startsWith('ostrix_draft_'))),
    'Unrelated account must not consume a legacy draft');
  await page.goto(url + '/#configuracion');
  await page.getByRole('button',{name:'Cerrar sesión segura'}).click();
  await page.waitForURL('**/#bienvenida');
  await page.locator('.pubnav').waitFor();
  await page.locator('.pubnav').getByText('Ya tengo una cuenta',{exact:true}).click();
  await login(page,'audit_alfa');
  await openBlackboardAfterNavigate(page,book);
  await assertDraftEncrypted(page);
  assert.equal(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('ostrix_draft_'))),false);
  const recoverButton = page.getByRole('button',{name:/recuperar/i});
  await recoverButton.click();
  await recoverButton.waitFor({state:'hidden'});
  assert.equal(await page.locator('.pizarra-textarea-auto').first().inputValue(),'PWA-ALFA legacy draft');
  console.log('Provisional drafts encrypted; legacy draft migrated and recovered only by its owner');
  assert.equal(calls.size, 0);
  console.log('Closed/reopened browser, re-authenticated offline, recovered results, second account isolation: passed');
  evidence.completedAt = new Date().toISOString();
  Object.assign(evidence,{status:'PASS',deniedCloudRequests:calls.size,unauthenticatedSchoolSyncRequests:syncCalls.size,
    migration:'Owner recovered the legacy draft after the other account signed out; plaintext removed',
    restart:'Notebook, doubt and 100% curriculum practice score recovered after Chrome restart and offline login',
    isolation:'Diary, doubts, tutor, review queue and progress checked for two local accounts',
    limitations:['Live Google school account popup and authenticated school sync require a configured identity.',
      'A clean headless profile is not evidence for the Gemini Nano model version.']});
  console.log('Remote inference requests observed with cloud disallowed:', calls.size);
} catch (err) {
  const current = ctx?.pages()[0];
  const visible = current && await current.locator('h1').allTextContents().catch(()=>[]);
  Object.assign(evidence,{status:'FAIL',failedStage:stage,path:current && new URL(current.url()).hash?.split('-')[0], head:visible});
  console.error('Failed at:', stage);
  throw err;
} finally {
  await mkdir(report,{recursive:true});
  await writeFile(join(report,'results.json'), JSON.stringify(evidence,null,2)+'\n');
  await ctx?.close();
  await new Promise(resolve => server.close(resolve));
  if (basename(profile).startsWith('ostrix-browser-audit-') && resolve(profile).startsWith(resolve(tmpdir()) + sep))
    await rm(profile, {recursive:true,force:true,maxRetries:4});
}
