// Static regression checks for the Practice Results template and responsive styles.
// Runtime visual and Angular compilation checks must also run on the developer PC.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(join(dir, 'src/app/app.html'), 'utf8');
const css = readFileSync(join(dir, 'src/styles.css'), 'utf8');
const i18n = readFileSync(join(dir, 'src/app/core/interface-language.ts'), 'utf8');
const assert = (truth, message) => { if (!truth) throw new Error(message); };
const must = [
  '[class.view-practice]="view() === \'practica\'"',
  'class="practice-review-header"',
  'class="practice-review-answers"',
  'class="chip practice-review-status"',
  '[class.item-correct]="att.userAnswers[q.id] === q.correctAnswerIndex"',
  '[class.item-incorrect]="att.userAnswers[q.id] !== undefined && att.userAnswers[q.id] !== q.correctAnswerIndex"',
  '[class.item-unanswered]="att.userAnswers[q.id] === undefined"',
  'class="practice-results-footer"',
  'class="practice-results-actions"',
  'class="btn practice-weak-action"',
];
for (const marker of must) assert(html.includes(marker), `Missing practice markup: ${marker}`);
for (const sel of [
  '.practice-review-item.item-correct',
  '.practice-review-item.item-incorrect',
  '.practice-review-item.item-unanswered',
  '.practice-review-answers',
  '.practice-review-status',
  '.practice-results-footer',
  '.content.view-practice',
  '@media (max-width: 640px)',
]) assert(css.includes(sel), `Missing CSS selector: ${sel}`);
for (const k of [
  'practiceResultCorrect', 'practiceResultIncorrect', 'practiceResultUnanswered',
  'practiceBackToSession', 'practiceReviewWeakTopics',
]) {
  assert(i18n.includes(`${k}: { es:`), `Missing translations for ${k}`);
  assert(html.includes(`t('${k}')`), `Unused practice i18n key: ${k}`);
}
assert(!html.includes("'✓ Correcta'"), 'Status still hard-coded in Spanish');
assert(!html.includes('class="row between" style="align-items:flex-start;margin-bottom:8px"'), 'Old wrapping review header still present');
console.log('PASS: practice result markup, status borders, responsive selectors, and multilingual labels.');
