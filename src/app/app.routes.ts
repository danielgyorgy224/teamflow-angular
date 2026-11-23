import { Routes } from '@angular/router';
import { adminResourceGuard, unsavedChangesGuard, validIdGuard } from './core/guards/route-guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'dashboard',
    title: 'Áttekintés – TeamFlow',
    loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'tasks',
    title: 'Feladatok – TeamFlow',
    loadComponent: () => import('./features/tasks/task-list').then((m) => m.TaskList),
  },
  {
    path: 'tasks/new',
    title: 'Új feladat – TeamFlow',
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./features/tasks/task-form').then((m) => m.TaskForm),
  },
  {
    path: 'tasks/:id',
    title: 'Feladat – TeamFlow',
    canActivate: [validIdGuard],
    loadComponent: () => import('./features/tasks/task-detail').then((m) => m.TaskDetail),
  },
  {
    path: 'tasks/:id/edit',
    title: 'Feladat szerkesztése – TeamFlow',
    canActivate: [validIdGuard],
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./features/tasks/task-form').then((m) => m.TaskForm),
  },
  {
    path: 'projects',
    title: 'Projektek – TeamFlow',
    loadComponent: () => import('./features/projects/project-list').then((m) => m.ProjectList),
  },
  {
    path: 'projects/new',
    title: 'Új projekt – TeamFlow',
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./features/projects/project-form').then((m) => m.ProjectForm),
  },
  {
    path: 'projects/:id/edit',
    title: 'Projekt szerkesztése – TeamFlow',
    canActivate: [validIdGuard],
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./features/projects/project-form').then((m) => m.ProjectForm),
  },
  {
    path: 'projects/:id',
    title: 'Projekt – TeamFlow',
    canActivate: [validIdGuard],
    loadComponent: () => import('./features/projects/project-detail').then((m) => m.ProjectDetail),
  },
  {
    path: 'team',
    title: 'Csapat – TeamFlow',
    loadComponent: () => import('./features/team/team').then((m) => m.Team),
  },
  { path: 'admin', pathMatch: 'full', redirectTo: 'admin/labels' },
  {
    path: 'admin/:resource',
    title: 'Törzsadatok – TeamFlow',
    canActivate: [adminResourceGuard],
    loadComponent: () => import('./features/admin/admin').then((m) => m.Admin),
  },
  {
    path: '**',
    title: 'Nem található – TeamFlow',
    loadComponent: () => import('./features/not-found/not-found').then((m) => m.NotFound),
  },
];
