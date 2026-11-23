import { AsyncPipe, DatePipe, NgFor, NgIf, NgSwitch } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  Observable,
  Subject,
  catchError,
  distinctUntilChanged,
  finalize,
  forkJoin,
  map,
  of,
  startWith,
  switchMap,
  tap,
} from 'rxjs';
import { ProjectMemberService } from '../../core/api/project-member.service';
import { ProjectService } from '../../core/api/project.service';
import { StatusService } from '../../core/api/status.service';
import { TaskService } from '../../core/api/task.service';
import { UserService } from '../../core/api/user.service';
import { ProjectMember } from '../../models/project-member';
import { Project } from '../../models/project';
import { Status } from '../../models/status';
import { Task } from '../../models/task';
import { User } from '../../models/user';
import { ConfirmDialog } from '../../shared/confirm-dialog/confirm-dialog';
import { trimmedLength } from '../../shared/trimmed-length.validator';

interface MemberRow extends ProjectMember {
  userName: string;
  userEmail: string;
}

interface TaskRow extends Task {
  statusName: string;
  statusColor: string;
}

interface ProjectPage {
  project: Project;
  ownerName: string;
  members: MemberRow[];
  tasks: TaskRow[];
  completion: number;
  users: User[];
}

type DetailState =
  | { status: 'loading' | 'error' | 'notfound'; page: null }
  | { status: 'ready'; page: ProjectPage };

@Component({
  selector: 'app-project-detail',
  imports: [AsyncPipe, DatePipe, NgFor, NgIf, NgSwitch, ReactiveFormsModule, RouterLink, ConfirmDialog],
  templateUrl: './project-detail.html',
  styleUrl: './project-detail.css',
})
export class ProjectDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly projectService = inject(ProjectService);
  private readonly taskService = inject(TaskService);
  private readonly memberService = inject(ProjectMemberService);
  private readonly userService = inject(UserService);
  private readonly statusService = inject(StatusService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly refresh$ = new Subject<void>();

  readonly notice = signal(typeof history === 'undefined' ? '' : String(history.state?.notice ?? ''));
  readonly pageError = signal('');
  readonly memberBusy = signal(false);
  readonly memberError = signal('');
  readonly submitted = signal(false);
  readonly editingMemberId = signal<number | null>(null);
  readonly editBusy = signal(false);
  readonly editError = signal('');
  readonly pendingRemove = signal<MemberRow | null>(null);
  readonly removeBusy = signal(false);
  readonly removeError = signal('');

  readonly addMemberForm = new FormGroup({
    userId: new FormControl<number | null>(null, Validators.required),
    role: new FormControl('', { nonNullable: true, validators: [trimmedLength(1, 80)] }),
  });
  readonly editRole = new FormControl('', {
    nonNullable: true,
    validators: [trimmedLength(1, 80)],
  });

  private readonly id$ = this.route.paramMap.pipe(
    map((params) => Number(params.get('id'))),
    distinctUntilChanged(),
  );

  readonly vm$: Observable<DetailState> = this.id$.pipe(
    switchMap((id) =>
      this.refresh$.pipe(
        startWith(undefined),
        switchMap(() =>
          forkJoin({
            project: this.projectService.getById(id),
            tasks: this.taskService.listByProject(id),
            members: this.memberService.listByProject(id),
            users: this.userService.list(),
            statuses: this.statusService.list(),
          }).pipe(
            map(({ project, tasks, members, users, statuses }): DetailState => ({
              status: 'ready',
              page: this.toPage(project, tasks, members, users, statuses),
            })),
            catchError((error: unknown) =>
              of<DetailState>({
                status: error instanceof HttpErrorResponse && error.status === 404 ? 'notfound' : 'error',
                page: null,
              }),
            ),
            startWith<DetailState>({ status: 'loading', page: null }),
          ),
        ),
      ),
    ),
  );

  trackById(_: number, item: { id: number }): number {
    return item.id;
  }

  retry(): void {
    this.refresh$.next();
  }

  addMember(projectId: number, users: User[], members: MemberRow[]): void {
    if (this.memberBusy()) return;
    this.submitted.set(true);
    this.addMemberForm.markAllAsTouched();
    const { userId, role } = this.addMemberForm.getRawValue();
    if (this.addMemberForm.invalid || userId === null) return;
    if (!users.some((user) => user.id === userId)) {
      this.memberError.set('A kiválasztott felhasználó már nem érhető el.');
      return;
    }
    if (members.some((member) => member.userId === userId)) {
      this.memberError.set('Ez a felhasználó már tagja a projektnek.');
      return;
    }

    this.memberBusy.set(true);
    this.memberError.set('');
    this.memberService
      .create({ projectId, userId, role: role.trim() })
      .pipe(
        tap(() => this.refresh$.next()),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.memberBusy.set(false)),
      )
      .subscribe({
        next: () => {
          this.addMemberForm.reset({ userId: null, role: '' });
          this.submitted.set(false);
          this.notice.set('A projekttag hozzáadva.');
        },
        error: (error: unknown) =>
          this.memberError.set(
            error instanceof HttpErrorResponse && error.status === 404
              ? 'A projekt vagy a felhasználó már nem érhető el; frissítsd az oldalt.'
              : 'A projekttag mentése nem sikerült. Próbáld újra.',
          ),
      });
  }

  startEdit(member: MemberRow): void {
    this.editRole.setValue(member.role);
    this.editRole.markAsPristine();
    this.editError.set('');
    this.editingMemberId.set(member.id);
  }

  cancelEdit(): void {
    if (this.editBusy()) return;
    this.editingMemberId.set(null);
    this.editError.set('');
  }

  saveRole(member: MemberRow): void {
    if (this.editBusy()) return;
    this.editRole.markAsTouched();
    if (this.editRole.invalid) return;
    this.editBusy.set(true);
    this.editError.set('');
    this.memberService
      .update(member.id, { role: this.editRole.value.trim() })
      .pipe(
        tap(() => this.refresh$.next()),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.editBusy.set(false)),
      )
      .subscribe({
        next: () => {
          this.editingMemberId.set(null);
          this.notice.set('A projekttag szerepköre módosítva.');
        },
        error: () => this.editError.set('A szerepkör mentése nem sikerült. Próbáld újra.'),
      });
  }

  requestRemove(member: MemberRow): void {
    this.removeError.set('');
    this.pendingRemove.set(member);
  }

  cancelRemove(): void {
    if (!this.removeBusy()) this.pendingRemove.set(null);
  }

  confirmRemove(): void {
    const member = this.pendingRemove();
    if (!member || this.removeBusy()) return;
    this.removeBusy.set(true);
    this.removeError.set('');
    this.memberService
      .remove(member.id)
      .pipe(
        tap(() => this.refresh$.next()),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.removeBusy.set(false)),
      )
      .subscribe({
        next: () => {
          this.pendingRemove.set(null);
          this.notice.set('A projekttag eltávolítva.');
        },
        error: () => this.removeError.set('A projekttag eltávolítása nem sikerült. Próbáld újra.'),
      });
  }

  private toPage(
    project: Project,
    tasks: Task[],
    members: ProjectMember[],
    users: User[],
    statuses: Status[],
  ): ProjectPage {
    const statusById = new Map(statuses.map((status) => [status.id, status]));
    const userById = new Map(users.map((user) => [user.id, user]));
    const projectTasks = tasks.map((task): TaskRow => {
      const status = statusById.get(task.statusId);
      return {
        ...task,
        statusName: status?.name ?? 'Ismeretlen állapot',
        statusColor: status?.color ?? '#667085',
      };
    });
    const doneCount = tasks.filter((task) => statusById.get(task.statusId)?.key === 'done').length;
    return {
      project,
      ownerName: userById.get(project.ownerId)?.name ?? 'Ismeretlen felhasználó',
      members: members.map((member): MemberRow => ({
        ...member,
        userName: userById.get(member.userId)?.name ?? 'Ismeretlen felhasználó',
        userEmail: userById.get(member.userId)?.email ?? '',
      })),
      tasks: projectTasks,
      completion: tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0,
      users,
    };
  }
}
