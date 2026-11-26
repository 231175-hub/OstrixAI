/** COMPANION-01: copied prompts only; never reads notebook content or invokes Cloud. */
export type CompanionArea =
  | 'inicio' | 'diario' | 'apuntes' | 'dudas' | 'eureka'
  | 'repaso' | 'progreso' | 'libro' | 'configuracion' | 'tutor'
  | 'practica' | 'bienvenida' | 'acceso' | 'registro' | 'perfil';
export type CompanionMode = 'explain' | 'guide' | 'practice' | 'explore';
export type CompanionLocale = 'es' | 'en' | 'qu-chanka';

export interface CompanionAction {
  readonly mode: CompanionMode;
  readonly label: string;
  readonly prompt: string;
}
export interface CompanionMessage {
  readonly heading: string;
  readonly sentence: string;
  readonly actions: readonly CompanionAction[];
}

const LABELS: Record<CompanionMode, readonly [string, string]> = {
  explain: ['Explícame', 'Explain'],
  guide: ['Dame una pista', 'Guide me'],
  practice: ['Microdesafío', 'Mini challenge'],
  explore: ['Exploremos', 'Explore'],
};

const CONTEXT: Record<string, { es: string; en: string; topicEs: string; topicEn: string }> = {
  inicio: {
    es: '¿Qué te gustaría aprender hoy?', en: 'What would you like to learn today?',
    topicEs: 'un tema de secundaria que el estudiante elija', topicEn: 'a secondary-school topic chosen by the student',
  },
  diario: {
    es: 'Tu diario puede convertirse en una nueva actividad.', en: 'Your diary can become a new learning activity.',
    topicEs: 'una sesión de mi diario que yo elija', topicEn: 'a diary session that I choose',
  },
  apuntes: {
    es: 'Podemos transformar un apunte en comprensión.', en: 'We can turn a note into understanding.',
    topicEs: 'un concepto de mis apuntes que yo indique', topicEn: 'a concept from my notes that I specify',
  },
  dudas: {
    es: 'Una duda puede ser el inicio de un descubrimiento.', en: 'A question can be the start of a discovery.',
    topicEs: 'una duda de clase que yo describa', topicEn: 'a classroom question that I describe',
  },
  eureka: {
    es: '¿Investigamos tu próxima idea?', en: 'Shall we investigate your next idea?',
    topicEs: 'una idea Eureka que yo explique', topicEn: 'an Eureka idea that I explain',
  },
  repaso: {
    es: 'Un reto corto puede ayudarte a recordar.', en: 'A short challenge can help you remember.',
    topicEs: 'un tema que necesito repasar', topicEn: 'a topic I need to review',
  },
  progreso: {
    es: 'Un pequeño paso también cuenta.', en: 'Every small step counts.',
    topicEs: 'un tema que me cueste aprender', topicEn: 'a topic I find difficult',
  },
  libro: {
    es: 'Puedes estudiar esta sesión sin salir del cuaderno.', en: 'You can study this session from your notebook.',
    topicEs: 'la sesión escolar que estoy revisando', topicEn: 'the school session I am viewing',
  },
  configuracion: {
    es: 'Tú controlas cómo aprende Ostrix contigo.', en: 'You control how Ostrix supports your learning.',
    topicEs: 'el funcionamiento offline y el consentimiento para la nube', topicEn: 'offline operation and cloud consent',
  },
};

/** Prompts always ask rather than disclose private notes; Tutor owns authorization. */
export function companionMessage(view: CompanionArea, language: CompanionLocale): CompanionMessage {
  const en = language === 'en';
  const entry = CONTEXT[view] ?? CONTEXT['inicio'];
  const topic = en ? entry.topicEn : entry.topicEs;
  const prompts: Record<CompanionMode, string> = en
    ? {
        explain: `Help me understand ${topic}. First ask which exact concept I want to understand. Explain at secondary-school level.`,
        guide: `Guide me through ${topic} without giving away the answer. Start with one specific question.`,
        practice: `Let's practice ${topic}. Give me ONE short question, wait for my answer, then offer constructive feedback. Do not answer it yourself.`,
        explore: `Help me explore ${topic} with an accessible mini-experiment or investigation. First ask one question about the materials available. Never invent observations.`,
      }
    : {
        explain: `Ayúdame a comprender ${topic}. Primero pregúntame qué concepto exacto quiero entender. Explícalo a nivel de secundaria.`,
        guide: `Guíame para entender ${topic} sin darme la solución. Empieza con una sola pregunta concreta.`,
        practice: `Practiquemos ${topic}. Dame UN ejercicio corto, espera mi respuesta y luego dame retroalimentación. No lo resuelvas por mí.`,
        explore: `Ayúdame a explorar ${topic} con una investigación o experimento sencillo. Primero pregunta una sola vez qué materiales tengo. No inventes observaciones.`,
      };
  const modes: CompanionMode[] = ['explain', 'guide', 'practice', 'explore'];
  return {
    heading: en ? 'Ostrix, your learning companion' : 'Ostrix, tu compañero de aprendizaje',
    sentence: en ? entry.en : entry.es,
    actions: modes.map(mode => ({ mode, label: LABELS[mode][en ? 1 : 0], prompt: prompts[mode] })),
  };
}
