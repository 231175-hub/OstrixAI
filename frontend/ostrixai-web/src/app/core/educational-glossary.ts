/**
 * Glosario Educativo Bilingüe Español <-> Quechua Chanka (Offline)
 * OstrixAi - Vocabulario Curricular EIB Minedu / Ayacucho / Andahuaylas
 */

export interface GlossaryEntry {
  readonly es: string;
  readonly quChanka: string;
  readonly en: string;
  readonly domain: string;
  readonly definitionEs: string;
}

export const EDUCATIONAL_GLOSSARY: readonly GlossaryEntry[] = [
  {
    es: 'matemática',
    quChanka: 'yupana / yupay yachay',
    en: 'mathematics',
    domain: 'Matemática',
    definitionEs: 'Ciencia deductiva que estudia las propiedades de los entes abstractos y sus relaciones.'
  },
  {
    es: 'fracción',
    quChanka: 'rakiy / patma',
    en: 'fraction',
    domain: 'Matemática',
    definitionEs: 'División de una unidad en partes iguales.'
  },
  {
    es: 'denominador',
    quChanka: 'rakiq yupay',
    en: 'denominator',
    domain: 'Matemática',
    definitionEs: 'Número que indica en cuántas partes iguales se divide la unidad.'
  },
  {
    es: 'numerador',
    quChanka: 'aymurraq yupay',
    en: 'numerator',
    domain: 'Matemática',
    definitionEs: 'Número que indica cuántas partes iguales se toman de la unidad.'
  },
  {
    es: 'ecuación',
    quChanka: 'chaninchinakuy',
    en: 'equation',
    domain: 'Matemática',
    definitionEs: 'Igualdad matemática entre dos expresiones que contiene una o más incógnitas.'
  },
  {
    es: 'célula',
    quChanka: 'kawsayku',
    en: 'cell',
    domain: 'Ciencia y Tecnología',
    definitionEs: 'Unidad anatómica y funcional mínima de todos los seres vivos.'
  },
  {
    es: 'fotosíntesis',
    quChanka: 'intipa kallpanwan kawsachiy',
    en: 'photosynthesis',
    domain: 'Ciencia y Tecnología',
    definitionEs: 'Proceso metabólico por el cual las plantas producen glucosa usando luz solar, agua y CO2.'
  },
  {
    es: 'oxígeno',
    quChanka: 'kawsay wayra',
    en: 'oxygen',
    domain: 'Ciencia y Tecnología',
    definitionEs: 'Gas vital para la respiración aeróbica de los seres vivos.'
  },
  {
    es: 'energía',
    quChanka: 'kallpa',
    en: 'energy',
    domain: 'Física',
    definitionEs: 'Capacidad de realizar un trabajo o causar un cambio físico.'
  },
  {
    es: 'fuerza',
    quChanka: 'kallpa churay',
    en: 'force',
    domain: 'Física',
    definitionEs: 'Acción que altera el estado de reposo o de movimiento de un cuerpo.'
  },
  {
    es: 'átomo',
    quChanka: 'huch\'uy kurkucha',
    en: 'atom',
    domain: 'Química',
    definitionEs: 'Unidad fundamental de la materia que conserva las propiedades de un elemento químico.'
  },
  {
    es: 'comunicación',
    quChanka: 'willanakuy / rimanakuy',
    en: 'communication',
    domain: 'Comunicación',
    definitionEs: 'Intercambio de mensajes e ideas entre interlocutores.'
  },
  {
    es: 'idea principal',
    quChanka: 'chawpi yuyay',
    en: 'main idea',
    domain: 'Comunicación',
    definitionEs: 'Pensamiento central que expresa lo más importante de un texto o párrafo.'
  },
  {
    es: 'comunidad',
    quChanka: 'ayllu',
    en: 'community / ayllu',
    domain: 'Ciencias Sociales',
    definitionEs: 'Unidad social andina basada en el parentesco y la colaboración mutua.'
  },
  {
    es: 'reciprocidad',
    quChanka: 'ayni',
    en: 'reciprocity / ayni',
    domain: 'Ciencias Sociales',
    definitionEs: 'Práctica tradicional de ayuda mutua comunitaria: hoy por ti, mañana por mí.'
  }
];

export function lookupGlossary(term: string): GlossaryEntry | undefined {
  const norm = term.toLowerCase().trim();
  return EDUCATIONAL_GLOSSARY.find(g =>
    g.es.toLowerCase() === norm ||
    g.quChanka.toLowerCase().split('/').some(word => word.trim() === norm) ||
    g.en.toLowerCase() === norm
  );
}
