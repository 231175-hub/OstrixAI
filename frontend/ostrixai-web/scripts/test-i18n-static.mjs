/** Dependency-free audit of translations in the two real, navigable Angular views. */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'app');
const dictionary = readFileSync(resolve(root, 'core/interface-language.ts'), 'utf8');
const defined = new Set([...dictionary.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):\s*\{/gm)].map(m => m[1]));
const pages = [resolve(root, 'app.html'), resolve(root, 'features/diario/diario.component.html')];
let references = 0;
const errors = [];
for (const page of pages) {
  const template = readFileSync(page, 'utf8');
  const keys = [...template.matchAll(/\bt\('([^']+)'\)/g)].map(m => m[1]);
  references += keys.length;
  for (const key of keys) {
    if (!defined.has(key)) errors.push(`${page}: missing translation key: ${key}`);
  }
  // Fail only on confirmed untranslated body text, not names, student input,
  // prompt strings, or explicit Spanish branches inside already-localized expressions.
  for (const item of template.matchAll(/>([^<>]+)</g)) {
    const text = item[1].trim();
    if (!text || text.includes('{{') || text === 'Español') continue;
    if (/[¿¡áéíóúñÁÉÍÓÚÑ]/.test(text)) errors.push(`${page}: untranslated visible text: ${text.slice(0, 90)}`);
  }
}
for (const key of ['journalPreferencesTitle', 'journalNoSessions', 'journalAiSummary',
                   'journalAllowCloud', 'practiceFullDescLabel', 'appNotesPlaceholder']) {
  if (!defined.has(key)) errors.push(`Missing expected English expansion: ${key}`);
  const match = dictionary.match(new RegExp(`^  ${key}: \\{ es: ("[^"\\n]*"), en: ("[^"\\n]*")`, 'm'));
  if (!match || match[1] === match[2]) errors.push(`Missing or unchanged English translation: ${key}`);
}
console.log(`Checked ${pages.length} templates and ${references} translated references.`);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('PASS: all referenced keys exist and no accented Spanish body strings remain in audited views.');
}
