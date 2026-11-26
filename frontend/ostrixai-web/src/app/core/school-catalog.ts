/** Areas curriculares de educación secundaria en Perú.
 * Las subdivisiones son una ayuda de navegación, NO cursos obligatorios del Minedu.
 * El catálogo se distribuye con la app y funciona desconectado.
 */
export interface CourseItem {
  readonly id: string;
  readonly name: string;
  readonly topics?: readonly string[];
}

export const SCHOOL_COURSES: readonly CourseItem[] = [
  { id: 'mat', name: 'Matemática' },
  { id: 'com', name: 'Comunicación' },
  { id: 'cyt', name: 'Ciencia y Tecnología', topics: ['Física', 'Química', 'Biología', 'Otro tema'] },
  { id: 'cso', name: 'Ciencias Sociales', topics: ['Historia', 'Geografía', 'Economía', 'Otro tema'] },
  { id: 'dpcc', name: 'Desarrollo Personal, Ciudadanía y Cívica (DPCC)' },
  { id: 'ing', name: 'Inglés' },
  { id: 'art', name: 'Arte y Cultura' },
  { id: 'efi', name: 'Educación Física' },
  { id: 'ept', name: 'Educación para el Trabajo (EPT)' },
  { id: 'rel', name: 'Educación Religiosa' },
  { id: 'tut', name: 'Tutoría y Orientación Educativa' },
  { id: 'cas', name: 'Castellano como segunda lengua (EIB)' },
];

/** Algunos colegios distribuyen CyT en asignaturas separadas; se ofrecen listas ya listas. */
export function courseOptions(scienceSeparate: boolean): readonly CourseItem[] {
  if (!scienceSeparate) return SCHOOL_COURSES;
  return [
    ...SCHOOL_COURSES.filter(c => c.id !== 'cyt'),
    { id: 'fis', name: 'Física' },
    { id: 'qui', name: 'Química' },
    { id: 'bio', name: 'Biología' },
  ];
}
