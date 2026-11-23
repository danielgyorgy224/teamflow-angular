import { AsyncPipe, NgFor, NgIf, NgSwitch } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Observable, Subject, catchError, finalize, forkJoin, map, of, startWith, switchMap } from 'rxjs';
import { CommentService } from '../../core/api/comment.service';
import { ProjectMemberService } from '../../core/api/project-member.service';
import { ProjectService } from '../../core/api/project.service';
import { TaskService } from '../../core/api/task.service';
import { TimeEntryService } from '../../core/api/time-entry.service';
import { UserService } from '../../core/api/user.service';
import { User } from '../../models/user';
import { ConfirmDialog } from '../../shared/confirm-dialog/confirm-dialog';

interface UserRow extends User {
  referenceCount: number;
}

interface UserReferences {
  projects: number;
  tasks: number;
  comments: number;
  timeEntries: number;
  projectMembers: number;
}

type TeamState =
  | { status: 'loading' | 'error'; users: UserRow[] }
  | { status: 'ready'; users: UserRow[] };

type PendingDelete = { user: User; details: string[] } | { user: User; details: null };

@Component({
  selector: 'app-team',
  imports: [AsyncPipe, NgFor, NgIf, NgSwitch, RouterLink, ConfirmDialog],
  templateUrl: './team.html',
  styleUrl: './team.css',
})
export class Team {
  private readonly userService = inject(UserService);
  private readonly projectService = inject(ProjectService);
  private readonly taskService = inject(TaskService);
  private readonly commentService = inject(CommentService);
  private readonly timeEntryService = inject(TimeEntryService);
  private readonly memberService = inject(ProjectMemberService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly refresh$ = new Subject<void>();

  readonly pendingDelete = signal<PendingDelete | null>(null);
  readonly deleteBusy = signal(false);
  readonly deleteError = signal('');
  readonly pageError = signal('');

  readonly vm$: Observable<TeamState> = this.refresh$.pipe(
    startWith(undefined),
    switchMap(() =>
      forkJoin({
        users: this.userService.list(),
        projects: this.projectService.list(),
        tasks: this.taskService.list(),
        comments: this.commentService.list(),
        timeEntries: this.timeEntryService.list(),
        projectMembers: this.memberService.list(),
      }).pipe(
        map(({ users, projects, tasks, comments, timeEntries, projectMembers }): TeamState => ({
          status: 'ready',
          users: [...users]
            .map((user) => {
              const referenceCount =
                projects.filter((project) => project.ownerId === user.id).length +
                tasks.filter((task) => task.assigneeId === user.id).length +
                comments.filter((comment) => comment.userId === user.id).length +
                timeEntries.filter((entry) => entry.userId === user.id).length +
                projectMembers.filter((member) => member.userId === user.id).length;
              return { ...user, referenceCount };
            })
            .sort((a, b) => a.name.localeCompare(b.name, 'hu')),
        })),
        catchError(() => of<TeamState>({ status: 'error', users: [] })),
        startWith<TeamState>({ status: 'loading', users: [] }),
      ),
    ),
  );

  trackById(_: number, item: { id: number }): number {
    return item.id;
  }

  retry(): void {
    this.refresh$.next();
  }

  requestDelete(user: User): void {
    if (this.deleteBusy()) return;
    this.pageError.set('');
    forkJoin({
      projects: this.projectService.list(),
      tasks: this.taskService.list(),
      comments: this.commentService.list(),
      timeEntries: this.timeEntryService.list(),
      projectMembers: this.memberService.list(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          const references: UserReferences = {
            projects: data.projects.filter((project) => project.ownerId === user.id).length,
            tasks: data.tasks.filter((task) => task.assigneeId === user.id).length,
            comments: data.comments.filter((comment) => comment.userId === user.id).length,
            timeEntries: data.timeEntries.filter((entry) => entry.userId === user.id).length,
            projectMembers: data.projectMembers.filter((member) => member.userId === user.id).length,
          };
          const details = [
            references.projects ? `${references.projects} projektgazda-hivatkozás` : '',
            references.tasks ? `${references.tasks} felelős feladat` : '',
            references.comments ? `${references.comments} hozzászólás` : '',
            references.timeEntries ? `${references.timeEntries} időnapló-bejegyzés` : '',
            references.projectMembers ? `${references.projectMembers} projekttagság` : '',
          ].filter(Boolean);
          this.deleteError.set('');
          this.pendingDelete.set({ user, details: details.length ? details : null });
        },
        error: () => this.pageError.set('A felhasználó kapcsolatait nem sikerült ellenőrizni; a törlés nem indult el.'),
      });
  }

  confirmDelete(): void {
    const pending = this.pendingDelete();
    if (!pending || pending.details || this.deleteBusy()) return;
    this.deleteBusy.set(true);
    this.deleteError.set('');
    this.userService
      .remove(pending.user.id)
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
              ? 'A felhasználót már törölték. Frissítsd a listát.'
              : 'A felhasználó törlése nem sikerült. Próbáld újra.',
          ),
      });
  }

  cancelDelete(): void {
    if (!this.deleteBusy()) this.pendingDelete.set(null);
  }
}
