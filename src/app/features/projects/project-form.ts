import { AsyncPipe, NgFor, NgIf } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, catchError, forkJoin, map, of, startWith } from 'rxjs';
import { HasUnsavedChanges } from '../../core/guards/route-guards';
import { ProjectService } from '../../core/api/project.service';
import { UserService } from '../../core/api/user.service';
import { Project, ProjectStatus } from '../../models/project';
import { User } from '../../models/user';
import { trimmedLength } from '../../shared/trimmed-length.validator';

type FormState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; users: User[]; project: Project | null };

const dateOrderValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const start = control.get('startDate')?.value as string | null;
  const due = control.get('dueDate')?.value as string | null;
  return start && due && due < start ? { dateOrder: true } : null;
};

@Component({
  selector: 'app-project-form',
  imports: [AsyncPipe, NgFor, NgIf, ReactiveFormsModule, RouterLink],
  templateUrl: './project-form.html',
  styleUrl: './project-form.css',
})
export class ProjectForm implements HasUnsavedChanges {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly projectService = inject(ProjectService);
  private readonly userService = inject(UserService);
  private readonly destroyRef = inject(DestroyRef);
  readonly projectId = Number(this.route.snapshot.paramMap.get('id')) || null;
  readonly submitted = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal('');
  private saved = false;

  readonly form = new FormGroup(
    {
      name: new FormControl('', { nonNullable: true, validators: [trimmedLength(1, 100)] }),
      description: new FormControl('', { nonNullable: true, validators: [trimmedLength(0, 1000)] }),
      ownerId: new FormControl<number | null>(null, Validators.required),
      status: new FormControl<ProjectStatus>('active', { nonNullable: true, validators: [Validators.required] }),
      startDate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      dueDate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    },
    { validators: [dateOrderValidator] },
  );

  readonly vm$: Observable<FormState> = forkJoin({
    users: this.userService.list(),
    project: this.projectId
      ? this.projectService.getById(this.projectId)
      : of(null),
  }).pipe(
    map(({ users, project }): FormState => {
      if (project) {
        this.form.patchValue({
          name: project.name,
          description: project.description,
          ownerId: project.ownerId,
          status: project.status,
          startDate: project.startDate,
          dueDate: project.dueDate,
        });
        this.form.markAsPristine();
      }
      return { status: 'ready', users, project };
    }),
    catchError((error: unknown) =>
      of<FormState>({
        status: error instanceof HttpErrorResponse && error.status === 404 ? 'error' : 'error',
      }),
    ),
    startWith<FormState>({ status: 'loading' }),
  );

  hasUnsavedChanges(): boolean {
    return this.form.dirty && !this.saved;
  }

  trackById(_: number, item: { id: number }): number {
    return item.id;
  }

  save(): void {
    if (this.saving()) return;
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const value = this.form.getRawValue();
    if (value.ownerId === null) return;
    this.saving.set(true);
    this.saveError.set('');
    const payload = {
      name: value.name.trim(),
      description: value.description.trim(),
      ownerId: value.ownerId,
      status: value.status,
      startDate: value.startDate,
      dueDate: value.dueDate,
    };
    const request = this.projectId
      ? this.projectService.update(this.projectId, payload)
      : this.projectService.create(payload);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (project) => {
        this.saved = true;
        void this.router.navigate(['/projects', project.id], {
          state: { notice: this.projectId ? 'A projekt adatai elmentve.' : 'A projekt létrehozva.' },
        });
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.saveError.set(
          error instanceof HttpErrorResponse && error.status === 404
            ? 'A projektet vagy a kiválasztott projektgazdát már nem találom. Frissítsd az oldalt.'
            : 'A mentés nem sikerült. Az adatok megmaradtak, próbáld újra.',
        );
      },
    });
  }
}
