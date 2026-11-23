import { AsyncPipe, DatePipe, NgFor, NgIf, NgSwitch } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Observable, Subject, catchError, finalize, forkJoin, map, of, startWith, switchMap } from 'rxjs';
import { ProjectMemberService } from '../../core/api/project-member.service';
import { ProjectService } from '../../core/api/project.service';
import { StatusService } from '../../core/api/status.service';
import { TaskService } from '../../core/api/task.service';
import { UserService } from '../../core/api/user.service';
import { Project } from '../../models/project';
import { Status } from '../../models/status';
import { Task } from '../../models/task';
import { User } from '../../models/user';
import { ConfirmDialog } from '../../shared/confirm-dialog/confirm-dialog';

interface ProjectRow extends Project {
  ownerName: string;
  taskCount: number;
  completion: number;
}

type ProjectState =
  | { status: 'loading' | 'error'; projects: ProjectRow[] }
  | { status: 'ready'; projects: ProjectRow[] };

type PendingDelete =
  | { project: Project; details: string[] }
  | { project: Project; details: null };

@Component({
  selector: 'app-project-list',
  imports: [AsyncPipe, DatePipe, NgFor, NgIf, NgSwitch, RouterLink, ConfirmDialog],
  templateUrl: './project-list.html',
  styleUrl: './project-list.css',
})
export class ProjectList {
  private readonly projectService = inject(ProjectService);
  private readonly taskService = inject(TaskService);
  private readonly statusService = inject(StatusService);
  private readonly userService = inject(UserService);
  private readonly memberService = inject(ProjectMemberService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly refresh$ = new Subject<void>();

  readonly pendingDelete = signal<PendingDelete | null>(null);
  readonly deleteBusy = signal(false);
  readonly deleteError = signal('');
  readonly pageError = signal('');

  readonly vm$: Observable<ProjectState> = this.refresh$.pipe(
    startWith(undefined),
    switchMap(() =>
      forkJoin({
        projects: this.projectService.list(),
        tasks: this.taskService.list(),
        statuses: this.statusService.list(),
        users: this.userService.list(),
      }).pipe(
        map(({ projects, tasks, statuses, users }): ProjectState => ({
          status: 'ready',
          projects: projects
            .map((project) => this.toRow(project, tasks, statuses, users))
            .sort((a, b) => a.name.localeCompare(b.name, 'hu')),
        })),
        catchError(() => of<ProjectState>({ status: 'error', projects: [] })),
        startWith<ProjectState>({ status: 'loading', projects: [] }),
      ),
    ),
  );

  trackById(_: number, item: { id: number }): number {
    return item.id;
  }

  retry(): void {
    this.refresh$.next();
  }

  requestDelete(project: Project): void {
    if (this.deleteBusy()) return;
    this.pageError.set('');
    forkJoin({
      tasks: this.taskService.listByProject(project.id),
      members: this.memberService.listByProject(project.id),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ tasks, members }) => {
          const details = [
            tasks.length ? `${tasks.length} kapcsolódó feladat` : '',
            members.length ? `${members.length} projekttag` : '',
          ].filter(Boolean);
          this.deleteError.set('');
          this.pendingDelete.set({ project, details: details.length ? details : null });
        },
        error: () => this.pageError.set('A projekt kapcsolatait nem sikerült ellenőrizni; a törlés nem indult el.'),
      });
  }

  confirmDelete(): void {
    const pending = this.pendingDelete();
    if (!pending || pending.details || this.deleteBusy()) return;
    this.deleteBusy.set(true);
    this.deleteError.set('');
    this.projectService
      .remove(pending.project.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.deleteBusy.set(false)),
      )
      .subscribe({
        next: () => {
          this.pendingDelete.set(null);
          this.refresh$.next();
        },
        error: (error: unknown) =>
          this.deleteError.set(
            error instanceof HttpErrorResponse && error.status === 404
              ? 'A projektet már törölték. Frissítsd a listát.'
              : 'A projekt törlése nem sikerült. Próbáld újra.',
          ),
      });
  }

  cancelDelete(): void {
    if (!this.deleteBusy()) this.pendingDelete.set(null);
  }

  private toRow(project: Project, tasks: Task[], statuses: Status[], users: User[]): ProjectRow {
    const projectTasks = tasks.filter((task) => task.projectId === project.id);
    const doneStatusIds = new Set(
      statuses.filter((status) => status.key === 'done').map((status) => status.id),
    );
    const doneCount = projectTasks.filter((task) => doneStatusIds.has(task.statusId)).length;
    return {
      ...project,
      ownerName: users.find((user) => user.id === project.ownerId)?.name ?? 'Ismeretlen felhasználó',
      taskCount: projectTasks.length,
      completion: projectTasks.length ? Math.round((doneCount / projectTasks.length) * 100) : 0,
    };
  }
}
