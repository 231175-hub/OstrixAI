/**
 * Keep the first main question in a guided turn without removing the preceding hint.
 * A model may ask several questions despite the prompt; preserve the learning scaffold.
 * Do not use this helper to invent a question or validate the correctness of its content.
 */
export function keepOneGuideQuestion(answer: string): string {
  const marks = [...answer.matchAll(/\?/g)];
  if (marks.length <= 1) return answer;
  const end = marks[0].index! + 1;
  return answer.slice(0, end).trimEnd();
}
