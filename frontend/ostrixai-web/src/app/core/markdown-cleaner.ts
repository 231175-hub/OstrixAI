/**
 * Limpiador y formateador de texto y Markdown para OstrixAi.
 * Asegura que la interfaz educativa para secundaria rural presente textos legibles,
 * limpios de símbolos crudos de Markdown (##, **, etc.) y libres de fugas de instrucciones internas.
 */

import { formatTutorFractions } from './tutor-fractions';

export interface StructuredSummary {
  readonly paragraphs: string[];
  readonly keyPoints: string[];
  readonly rawText: string;
}

/**
 * Elimina sintaxis cruda de Markdown (almohadillas de encabezado, asteriscos de negrita/cursiva,
 * delimitadores de código) y devuelve texto plano limpio y ordenado.
 */
export function cleanMarkdownToText(raw: string): string {
  if (!raw) return '';

  return formatTutorFractions(raw)
    // Eliminar bloques de código markdown ```...```
    .replace(/```[\s\S]*?```/g, '')
    // Eliminar encabezados tipo #, ##, ###, #### al inicio de línea
    .replace(/^#{1,6}\s+/gm, '')
    // Convertir **negrita** o __negrita__ a texto simple
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    // Convertir *cursiva* o _cursiva_ a texto simple
    .replace(/(\*|_)(.*?)\1/g, '$2')
    // Eliminar enlaces [texto](url) dejando solo texto
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Eliminar líneas divisorias --- o ***
    .replace(/^(\s*[-*_]){3,}\s*$/gm, '')
    // Normalizar viñetas crudas (*, -, +) a viñetas estándar •
    .replace(/^[\s]*[-*+]\s+/gm, '• ')
    // Limpiar espacios en blanco redundantes por línea
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    // Máximo 2 saltos de línea consecutivos
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Convierte un texto con markdown básico en HTML seguro y sanitizado para la interfaz del Tutor.
 * Soporta negrita básica (<strong>) y saltos de párrafo, evitando inyecciones arbitrarias.
 */
export function formatMarkdownToSafeHtml(raw: string): string {
  if (!raw) return '';

  // 1. Escapar caracteres HTML básicos para prevenir XSS
  const escaped = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  // 2. Limpiar encabezados de markdown crudo al inicio de línea
  const cleanHeadings = escaped.replace(/^#{1,6}\s+(.+)$/gm, '<strong>$1</strong>');

  // 3. Convertir **negrita** a <strong>
  const bolded = cleanHeadings.replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>');

  // 4. Convertir viñetas a elementos de lista limpios
  const lines = bolded.split('\n');
  const formattedLines: string[] = [];
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('• ') || trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inList) {
        formattedLines.push('<ul class="tutor-list">');
        inList = true;
      }
      const itemContent = trimmed.replace(/^[•\-*]\s+/, '');
      formattedLines.push(`<li>${itemContent}</li>`);
    } else {
      if (inList) {
        formattedLines.push('</ul>');
        inList = false;
      }
      if (trimmed.length > 0) {
        formattedLines.push(`<p>${trimmed}</p>`);
      }
    }
  }
  if (inList) {
    formattedLines.push('</ul>');
  }

  return formattedLines.join('');
}

/**
 * Separa una respuesta de resumen en párrafos continuos y puntos clave limpios.
 * Evita la explosión de viñetas donde cada línea se convertía en un <li> con markdown crudo.
 */
export function splitSummaryIntoParagraphsAndPoints(rawText: string): StructuredSummary {
  const cleaned = cleanMarkdownToText(rawText);
  if (!cleaned) {
    return { paragraphs: [], keyPoints: [], rawText: '' };
  }

  const lines = cleaned.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const paragraphs: string[] = [];
  const keyPoints: string[] = [];

  let currentPara: string[] = [];

  for (const line of lines) {
    if (line.startsWith('• ')) {
      if (currentPara.length > 0) {
        paragraphs.push(currentPara.join(' '));
        currentPara = [];
      }
      const pt = line.replace(/^•\s*/, '').trim();
      if (pt) keyPoints.push(pt);
    } else {
      currentPara.push(line);
    }
  }

  if (currentPara.length > 0) {
    paragraphs.push(currentPara.join(' '));
  }

  return {
    paragraphs,
    keyPoints,
    rawText,
  };
}

/**
 * Desinfecta un prompt entrante para extraer EXCLUSIVAMENTE los apuntes y notas del estudiante,
 * descartando instrucciones de sistema, plantillas, reglas o metadatos de contexto.
 * Esencial para evitar fugas de prompts en el Modo Esencial Offline.
 */
export function sanitizeStudentNotesFromPrompt(input: string): string {
  if (!input || !input.trim()) return '';

  const raw = input.trim();

  // Si el texto contiene delimitadores explícitos de apuntes, extraer solo el interior
  const notesMarkers = [
    /APUNTES DEL ESTUDIANTE:\s*([\s\S]*?)(?=(?:\n[A-ZÁÉÍÓÚ\s]{3,}:|$))/i,
    /APUNTES:\s*([\s\S]*?)(?=(?:\n[A-ZÁÉÍÓÚ\s]{3,}:|$))/i,
    /STUDENT NOTES:\s*([\s\S]*?)(?=(?:\n[A-Z\s]{3,}:|$))/i,
    /NOTES:\s*([\s\S]*?)(?=(?:\n[A-Z\s]{3,}:|$))/i,
  ];

  for (const marker of notesMarkers) {
    const match = raw.match(marker);
    if (match && match[1] && match[1].trim()) {
      return cleanExtractedNoteLines(match[1]);
    }
  }

  // Si no hay marcadores explícitos, limpiar línea a línea descartando encabezados de instrucción
  return cleanExtractedNoteLines(raw);
}

function cleanExtractedNoteLines(text: string): string {
  const forbiddenPrefixes = [
    'curso:',
    'tema:',
    'subject:',
    'topic:',
    'reglas obligatorias:',
    'strict rules:',
    'reglas:',
    'rules:',
    'redacta un resumen',
    'write a',
    'actúa como',
    'eres ostrix',
    'you are ostrix',
    'session context:',
    'previous sessions:',
    'due reviews:',
    'registered doubts:',
    'current student question:',
    'historial:',
    'contexto previo:',
    'contexto:',
    'apuntes:',
    'student notes:',
    'notes:',
    'apuntes del estudiante:',
  ];

  const lines = text.split('\n');
  const validLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();

    const isForbidden = forbiddenPrefixes.some(prefix => lower.startsWith(prefix));
    if (!isForbidden) {
      validLines.push(trimmed);
    }
  }

  return validLines.join('\n').trim();
}
