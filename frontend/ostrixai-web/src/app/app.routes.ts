import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/diario/diario.component').then(m => m.DiarioComponent) },
  { path: 'laboratorio-ia', loadComponent: () => import('./features/tutor/tutor.component').then(m => m.TutorComponent) },
  { path: 'tutor', loadComponent: () => import('./features/tutor/tutor.component').then(m => m.TutorComponent) },
  { path: '**', redirectTo: '' },
];
