import type { StudySession } from './session-migration';
import type { TutorMode } from './tutor-conversation.service';

const common = new Set(('que como cual para pero por con una unos sobre entre mis los las del esta este ' +
  'estos estas dime explica puedes apuntes pregunta tema the what which how why from these notes explain').split(' '));

function terms(text: string): string[] {
  return (text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter(term => term.length >= 3 && !common.has(term));
}

/** Local reading activities. Every quoted passage comes from this session's original notes. */
export function buildEssentialTutorGuide(
  question: string, mode: TutorMode, session: Pick<StudySession, 'notes' | 'topics'>, english: boolean
): string {
  const originals = [session.notes, ...session.topics.map(topic => topic.originalNotesText)];
  const passages = originals.flatMap(text => text.split(/\n+|(?<=[.!?])\s+/))
    .map(text => text.trim()).filter(text => text.length >= 8);
  const wanted = new Set(terms(question));
  const ranked = passages.map(text => ({
    text, score: new Set(terms(text).filter(term => wanted.has(term))).size,
  })).sort((a, b) => b.score - a.score);
  const asksAboutNotes = /\b(apuntes|anoté|anotado|mis notas|estos apuntes|this (topic|concept)|my notes)\b/i.test(question);
  const best = ranked[0];
  if (!best || (!best.score && !asksAboutNotes)) {
    return english
      ? 'I could not find a passage in your notes that supports an answer to this question. Add the definition, rule or worked example from your lesson and try again.'
      : 'No encontré un pasaje de tus apuntes que permita responder esta pregunta. Añade la definición, regla o ejemplo de la clase y vuelve a intentarlo.';
  }
  const excerpt = best.text.length <= 280 ? best.text : best.text.slice(0, 279).replace(/\s+\S*$/, '') + '…';
  const citation = english ? 'From your notes: “' + excerpt + '”' : 'En tus apuntes: «' + excerpt + '»';
  const activities: Record<TutorMode, [string, string]> = {
    explain: ['Reescribe esta idea con tus palabras. ¿Qué parte de la cita ayuda a responder tu pregunta?',
      'Restate the idea in your own words. Which part of the passage helps answer your question?'],
    guide: ['Primero identifica el dato principal. Después señala qué dato adicional necesitarías para responder.',
      'First identify the main fact. Then say what additional information you would need to answer.'],
    practice: ['Sin mirar el pasaje, escribe una afirmación que recuerdes. Compruébala con la cita y corrige cualquier diferencia.',
      'Hide the passage and write one statement from memory. Check it against the quotation and correct any differences.'],
    explore: ['Propón una situación de tu comunidad donde podrías comprobar esta idea. ¿Qué observación la apoyaría?',
      'Suggest a situation in your community where you could test this idea. What observation would support it?'],
  };
  return citation + '\n\n' + activities[mode][english ? 1 : 0];
}
