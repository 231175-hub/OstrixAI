import { Injectable, inject, signal } from '@angular/core';
import { LocalIdentityService } from './local-identity.service';
import { matchCourseCover } from './course-covers';

export interface StudentCourse {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly color?: string;
  readonly coverId?: string;
}

/**
 * Servicio de Gestión de Cursos Personalizados por Estudiante.
 * Permite a los estudiantes de secundaria rural definir libremente las asignaturas
 * que cursan en su colegio o comunidad sin imponer catálogos rígidos.
 *
 * Cada curso se guarda cifrado individualmente mediante Web Crypto API (AES-GCM-256)
 * vinculado de forma estricta al identificador local del estudiante autenticado.
 */
@Injectable({ providedIn: 'root' })
export class StudentCoursesService {
  private readonly identity = inject(LocalIdentityService);
  readonly courses = signal<readonly StudentCourse[]>([]);
  private writeTail: Promise<void> = Promise.resolve();

  /**
   * Carga los cursos cifrados del estudiante.
   * Si se suministran nombres de cursos provenientes de sesiones académicas existentes,
   * se migran/preservan de forma transparente para no perder apuntes históricos.
   */
  async load(existingSessionCourses?: readonly string[]): Promise<void> {
    await this.writeTail;
    const owner = this.identity.student()?.id;
    if (!owner) {
      this.clear();
      return;
    }

    const stored = await this.identity.list<StudentCourse>('courses');
    const coursesMap = new Map<string, StudentCourse>();
    for (const c of stored) {
      if (c && c.id && c.name) {
        coursesMap.set(c.name.trim().toLowerCase(), c);
      }
    }

    // Auto-migración/preservación: si el estudiante tiene sesiones históricas con cursos que aún no se registraron como StudentCourse,
    // se crean automáticamente para asegurar que nunca pierdan visibilidad de sus apuntes.
    if (existingSessionCourses && existingSessionCourses.length > 0) {
      for (const courseName of existingSessionCourses) {
        const clean = courseName.trim();
        if (clean && !coursesMap.has(clean.toLowerCase())) {
          const autoCourse: StudentCourse = {
            id: crypto.randomUUID(),
            name: clean,
            createdAt: new Date().toISOString(),
            coverId: matchCourseCover(clean).id,
          };
          if (this.identity.student()?.id !== owner) return;
          try {
            await this.identity.save('courses', autoCourse.id, autoCourse);
            coursesMap.set(clean.toLowerCase(), autoCourse);
          } catch {
            coursesMap.set(clean.toLowerCase(), autoCourse);
          }
        }
      }
    }

    if (this.identity.student()?.id === owner) {
      this.courses.set([...coursesMap.values()].sort((a, b) => a.name.localeCompare(b.name)));
    }
  }

  /**
   * Añade un nuevo curso personalizado para el estudiante autenticado.
   * Aplica validaciones estrictas: no vacío, trim, unicidad sin distinción de mayúsculas/minúsculas.
   */
  async add(rawName: string, explicitCoverId?: string): Promise<StudentCourse> {
    const clean = rawName.trim();
    if (!clean) {
      throw new Error('El nombre del curso no puede estar vacío.');
    }
    if (clean.length > 80) {
      throw new Error('El nombre del curso no puede exceder 80 caracteres.');
    }

    const current = this.courses();
    const isDup = current.some(c => c.name.toLowerCase() === clean.toLowerCase());
    if (isDup) {
      throw new Error('Ya existe un curso con ese nombre en tu cuenta.');
    }

    const cover = matchCourseCover(clean, explicitCoverId);

    const course: StudentCourse = {
      id: crypto.randomUUID(),
      name: clean,
      createdAt: new Date().toISOString(),
      coverId: cover.id,
    };

    await this.queue(async () => {
      await this.identity.save('courses', course.id, course);
      this.courses.update(list => [...list, course].sort((a, b) => a.name.localeCompare(b.name)));
    });

    return course;
  }

  /**
   * Cambia la portada visual de un curso personalizado.
   */
  async setCover(id: string, coverId: string): Promise<StudentCourse> {
    const current = this.courses();
    const existing = current.find(c => c.id === id);
    if (!existing) {
      throw new Error('Curso no encontrado.');
    }

    const updated: StudentCourse = {
      ...existing,
      coverId,
    };

    await this.queue(async () => {
      await this.identity.save('courses', id, updated);
      this.courses.update(list =>
        list.map(c => (c.id === id ? updated : c)).sort((a, b) => a.name.localeCompare(b.name))
      );
    });

    return updated;
  }

  /**
   * Actualiza el nombre de un curso existente sin alterar sus registros académicos previos.
   */
  async update(id: string, newName: string): Promise<StudentCourse> {
    const clean = newName.trim();
    if (!clean) {
      throw new Error('El nombre del curso no puede estar vacío.');
    }
    if (clean.length > 80) {
      throw new Error('El nombre del curso no puede exceder 80 caracteres.');
    }

    const current = this.courses();
    const existing = current.find(c => c.id === id);
    if (!existing) {
      throw new Error('Curso no encontrado.');
    }

    const isDup = current.some(c => c.id !== id && c.name.toLowerCase() === clean.toLowerCase());
    if (isDup) {
      throw new Error('Ya existe otro curso con ese nombre en tu cuenta.');
    }

    const updated: StudentCourse = {
      ...existing,
      name: clean,
    };

    await this.queue(async () => {
      await this.identity.save('courses', id, updated);
      this.courses.update(list =>
        list.map(c => (c.id === id ? updated : c)).sort((a, b) => a.name.localeCompare(b.name))
      );
    });

    return updated;
  }

  /**
   * Elimina un curso del listado personal del estudiante.
   */
  async remove(id: string): Promise<void> {
    await this.queue(async () => {
      await this.identity.delete('courses', id);
      this.courses.update(list => list.filter(c => c.id !== id));
    });
  }

  /**
   * Limpia la memoria reactiva al cerrar sesión para garantizar aislamiento.
   */
  clear(): void {
    this.courses.set([]);
  }

  private queue<T>(op: () => Promise<T>): Promise<T> {
    const owner = this.identity.student();
    const next = this.writeTail.then(() => {
      if (!owner || owner !== this.identity.student()) throw new Error('La sesión cambió.');
      return op();
    });
    this.writeTail = next.then(() => undefined, () => undefined);
    return next;
  }
}
