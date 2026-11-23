import { AsyncPipe, NgFor, NgIf } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, catchError, forkJoin, map, of, startWith } from 'rxjs';
import { LabelService } from '../../core/api/label.service';
import { PriorityService } from '../../core/api/priority.service';
import { ProjectService } from '../../core/api/project.service';
import { StatusService } from '../../core/api/status.service';
import { TaskService } from '../../core/api/task.service';
import { UserService } from '../../core/api/user.service';
import { HasUnsavedChanges } from '../../core/guards/route-guards';
import { Label } from '../../models/label';
import { Priority } from '../../models/priority';
import { Project } from '../../models/project';
import { Status } from '../../models/status';
import { Task } from '../../models/task';
import { User } from '../../models/user';
import { trimmedLength } from '../../shared/trimmed-length.validator';

interface TaskFormData {
  projects: Project[];
  users: User[];
  statuses: Status[];
  priorities: Priority[];
  labels: Label[];
  task: Task | null;
}

type FormState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: TaskFormData };

@Component({
  selector: 'app-task-form',
  imports: [AsyncPipe, NgFor, NgIf, ReactiveFormsModule, RouterLink],
  templateUrl: './task-form.html',
  styleUrl: './task-form.css',
})
export class TaskForm implements HasUnsavedChanges {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly taskService = inject(TaskService);
  private readonly projectService = inject(ProjectService);
  private readonly userService = inject(UserService);
  private readonly statusService = inject(StatusService);
  private readonly priorityService = inject(PriorityService);
  private readonly labelService = inject(LabelService);
  private readonly destroyRef = inject(DestroyRef);

  readonly taskId = Number(this.route.snapshot.paramMap.get('id')) || null;
  readonly submitted = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal('');
  private saved = false;

  readonly form = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [trimmedLength(1, 120)] }),
    description: new FormControl('', { nonNullable: true, validators: [trimmedLength(0, 2000)] }),
    projectId: new FormControl<number | null>(null, Validators.required),
    assigneeId: new FormControl<number | null>(null, Validators.required),
    statusId: new FormControl<number | null>(null, Validators.required),
    priorityId: new FormControl<number | null>(null, Validators.required),
    dueDate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    estimateHours: new FormControl<number | null>(null, [Validators.required, Validators.min(0.1)]),
    labelIds: new FormControl<number[]>([], { nonNullable: true }),
  });

  readonly vm$: Observable<FormState> = forkJoin({
    projects: this.projectService.list(),
    users: this.userService.list(),
    statuses: this.statusService.list(),
    priorities: this.priorityService.list(),
    labels: this.labelService.list(),
    task: this.taskId ? this.taskService.getById(this.taskId) : of(null),
  }).pipe(
    map((data): FormState => {
      if (data.task) {
        this.form.patchValue(data.task);
        this.form.markAsPristine();
      } else {
        this.form.patchValue({
          projectId: data.projects[0]?.id ?? null,
          assigneeId: data.users.find((user) => user.active)?.id ?? data.users[0]?.id ?? null,
          statusId: data.statuses.find((status) => status.key !== 'done')?.id ?? data.statuses[0]?.id ?? null,
          priorityId: data.priorities[0]?.id ?? null,
        });
        this.form.markAsPristine();
      }
      return { status: 'ready', data };
    }),
    catchError(() => of<FormState>({ status: 'error' })),
    startWith<FormState>({ status: 'loading' }),
  );

  hasUnsavedChanges(): boolean {
    return this.form.dirty && !this.saved;
  }

  trackById(_: number, item: { id: number }): number {
    return item.id;
  }

  toggleLabel(id: number, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const labels = this.form.controls.labelIds.value;
    this.form.controls.labelIds.setValue(
      checked ? [...new Set([...labels, id])] : labels.filter((labelId) => labelId !== id),
    );
    this.form.controls.labelIds.markAsDirty();
  }

  save(data: TaskFormData): void {
    if (this.saving()) return;
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const value = this.form.getRawValue();
    if (
      value.projectId === null ||
      value.assigneeId === null ||
      value.statusId === null ||
      value.priorityId === null ||
      !data.projects.some((project) => project.id === value.projectId) ||
      !data.users.some((user) => user.id === value.assigneeId) ||
      !data.statuses.some((status) => status.id === value.statusId) ||
      !data.priorities.some((priority) => priority.id === value.priorityId) ||
      value.labelIds.some((id) => !data.labels.some((label) => label.id === id))
    ) {
      this.saveError.set('A kiválasztott projekt, csapattag, állapot, prioritás vagy címke már nem érhető el. Frissítsd az oldalt.');
      return;
    }

    this.saving.set(true);
    this.saveError.set('');
    const payload = {
      title: value.title.trim(),
      description: value.description.trim(),
      projectId: value.projectId,
      assigneeId: value.assigneeId,
      statusId: value.statusId,
      priorityId: value.priorityId,
      dueDate: value.dueDate,
      estimateHours: value.estimateHours ?? 0,
      labelIds: value.labelIds,
    };
    const request = this.taskId
      ? this.taskService.update(this.taskId, payload)
      : this.taskService.create(payload);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (task) => {
        this.saved = true;
        void this.router.navigate(['/tasks', task.id], {
          state: { notice: this.taskId ? 'A feladat adatai elmentve.' : 'A feladat létrehozva.' },
        });
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.saveError.set(
          error instanceof HttpErrorResponse && error.status === 404
            ? 'A feladat vagy valamelyik kiválasztott hivatkozás már nem érhető el. Frissítsd az oldalt.'
            : 'A mentés nem sikerült. Az adatok megmaradtak, próbáld újra.',
        );
      },
    });
  }
}
