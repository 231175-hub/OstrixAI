/**
 * Small, conservative structural check for explicitly requested numbers
 * of materials or procedure steps. Never fabricates or deletes experiment content.
 */
const countWords: Record<string, number> = {
  un: 1, una: 1, uno: 1, one: 1,
  dos: 2, two: 2, tres: 3, three: 3,
  cuatro: 4, four: 4, cinco: 5, five: 5,
  seis: 6, six: 6, siete: 7, seven: 7,
  ocho: 8, eight: 8,
};

type Section = 'materials' | 'steps';

function expectedCounts(question: string): Map<Section, number> {
  const counts = new Map<Section, number>();
  const pattern = /\b(\d{1,2}|un|una|uno|one|dos|two|tres|three|cuatro|four|cinco|five|seis|six|siete|seven|ocho|eight)\s+(materiales?|materials?|pasos?|steps?)\b/gi;
  for (const match of question.matchAll(pattern)) {
    const count = /^\d+$/.test(match[1]) ? Number(match[1]) : countWords[match[1].toLowerCase()];
    if (!count || count > 8) continue;
    const section: Section = /^(?:material|materials)/i.test(match[2]) ? 'materials' : 'steps';
    // If conflicting counts are requested, do not guess which one applies.
    if (!counts.has(section)) counts.set(section, count);
    else if (counts.get(section) !== count) counts.delete(section);
  }
  return counts;
}

function sectionHeading(line: string): Section | null {
  const clean = line.trim().replace(/^#{1,5}\s*/, '').replace(/\*/g, '').trim();
  if (/^(?:materiales?|materials?)\b[^:]*:\s*$/i.test(clean)) return 'materials';
  if (/^(?:(?:pasos?|steps?)(?:\s+del?\s+experimento)?|procedimiento|procedure)\b[^:]*:\s*$/i.test(clean)) return 'steps';
  return null;
}

function countNumberedItems(answer: string, wanted: Section): number | null {
  let inSection = false;
  let seen = false;
  let count = 0;
  for (const line of answer.split(/\r?\n/)) {
    const heading = sectionHeading(line);
    if (heading) {
      if (inSection) break;
      inSection = heading === wanted;
      continue;
    }
    if (!inSection) continue;
    if (/^\s*\d{1,2}[.)]\s+\S/.test(line)) {
      count++;
      seen = true;
      continue;
    }
    if (seen && /^\s*(?:#{1,5}\s*)?[\wÁÉÍÓÚáéíóúñÑ¿? ]{3,55}:\s*$/.test(line)) break;
  }
  return seen ? count : null;
}

export function reviewExploreItemCounts(question: string, answer: string, english: boolean): string | null {
  const expected = expectedCounts(question);
  if (!expected.size) return null;
  const feedback: string[] = [];
  for (const [section, requested] of expected) {
    const actual = countNumberedItems(answer, section);
    if (actual === requested) continue;
    const label = section === 'materials'
      ? english ? 'materials' : 'materiales'
      : english ? 'steps' : 'pasos';
    feedback.push(english
      ? `Provide exactly ${requested} numbered ${label} in their own section.`
      : `Incluye exactamente ${requested} ${label} numerados en su propia sección.`);
  }
  return feedback.length ? feedback.join(' ') : null;
}
