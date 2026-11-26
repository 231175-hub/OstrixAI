/** Fast, dependency-free regression checks for the real Angular templates/CSS.
 * Not a replacement for an ng build or authenticated browser E2E. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
const css = readFileSync(resolve(root, 'src/styles.css'), 'utf8');
const app = readFileSync(resolve(root, 'src/app/app.html'), 'utf8');
const journal = readFileSync(resolve(root, 'src/app/features/diario/diario.component.html'), 'utf8');
function check(condition, label) {
  if (!condition) throw new Error('FAIL FRONT UI: ' + label);
  console.log('PASS FRONT UI: ' + label);
}
for (const cls of ['practice-question-header', 'practice-question-text', 'practice-option-text',
                   'practice-page-list', 'practice-quick-num']) {
  check(css.includes('.' + cls + ' {') || css.includes(' .' + cls + ' {'), `${cls} has explicit CSS`);
  check(app.includes(cls), `${cls} exists in the practice template`);
}
check(app.includes(`[attr.aria-current]="qi === currentQuestionIndex() ? 'step' : null"`), 'Current question has accessible state');
check(app.includes('[attr.aria-pressed]="userAnswers()[q.id] === optIdx"'), 'Answer options have accessible selected state');
check(app.includes('role="progressbar"'), 'Progress has a semantic indicator');
check(css.includes('grid-template-columns: repeat(2, minmax(0, 1fr))') && css.includes('@media (max-width: 640px)'), 'Mobile question navigation is responsive');
check(css.includes('.practice-quick-num.answered:not(.current)') && css.includes('.practice-quick-num.current'), 'Answered/current question states have distinctive styles');
check(!journal.includes('Gemini Nano: Listo (Local)'), 'Journal device status is localized');
check(!journal.includes('aria-label="Estado del sistema e inferencia"'), 'Journal status aria-label is localized');
console.log('STATIC UI AUDIT PASS. Run Angular build and browser test on your machine.');
