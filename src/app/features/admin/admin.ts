import { AsyncPipe, NgFor, NgIf, NgSwitch } from '@angular/common';
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
  filter,
  finalize,
  forkJoin,
  map,
  of,
  startWith,
  switchMap,
  tap,
} from 'rxjs';
import { ADMIN_RESOURCES, AdminResource, isAdminResource } from '../../core/guards/route-guards';
import { LabelService } from '../../core/api/label.service';
import { PriorityService } from '../../core/api/priority.service';
import { StatusService } from '../../core/api/status.service';
import { TaskService } from '../../core/api/task.service';
import { Label } from '../../models/label';
import { Priority } from '../../models/priority';
import { Status } from '../../models/status';
import { Task } from '../../models/task';
import { ConfirmDialog } from '../../shared/confirm-dialog/confirm-dialog';
import { trimmedLength } from '../../shared/trimmed-length.validator';

interface CatalogRow {
  id: number;
  name: string;
  color?: string;
  key?: string;
  order?: number;
  level?: number;
}

type CatalogState =
  | { status: 'loading' | 'error'; resource: AdminResource; rows: CatalogRow[] }
  | { status: 'ready'; resource: AdminResource; rows: CatalogRow[] };

type PendingDelete = { row: CatalogRow; details: string[] } | { row: CatalogRow; details: null };

const TITLES: Record<AdminResource, string> = {
  labels: 'Címkék',
  statuses: 'Állapotok',
  priorities: 'Prioritások',
};

@Component({
  selector: 'app-admin',
  imports: [AsyncPipe, NgFor, NgIf, NgSwitch, ReactiveFormsModule, RouterLink, ConfirmDialog],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class Admin {
  private readonly route = inject(ActivatedRoute);
  private readonly labelService = inject(LabelService);
  private readonly statusService = inject(StatusService);
  private readonly priorityService = inject(PriorityService);
  private readonly taskService = inject(TaskService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly refresh$ = new Subject<void>();

  readonly resources = ADMIN_RESOURCES;
  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly formOpen = signal(false);
  readonly editingId = signal<number | null>(null);
  readonly saveError = signal('');
  readonly pageError = signal('');
  readonly pendingDelete = signal<PendingDelete | null>(null);
  readonly deleteBusy = signal(false);
  readonly deleteError = signal('');

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [trimmedLength(1, 80)] }),
    color: new FormControl('#315CE8', { nonNullable: true }),
    key: new FormControl('', { nonNullable: true }),
    order: new FormControl<number | null>(null),
    level: new FormControl<number | null>(null),
  });

  readonly vm$: Observable<CatalogState> = this.route.paramMap.pipe(
    map((params) => params.get('resource')),
    filter(isAdminResource),
    distinctUntilChanged(),
    switchMap((resource) =>
      this.refresh$.pipe(
        startWith(undefined),
        switchMap(() =>
          this.loadRows(resource).pipe(
            map((rows): CatalogState => ({ status: 'ready', resource, rows })),
            catchError(() => of<CatalogState>({ status: 'error', resource, rows: [] })),
            startWith<CatalogState>({ status: 'loading', resource, rows: [] }),
          ),
        ),
      ),
    ),
  );

  trackById(_: number, item: { id: number }): number {
    return item.id;
  }

  title(resource: AdminResource): string {
    return TITLES[resource];
  }

  retry(): void {
    this.refresh$.next();
  }

  openCreate(resource: AdminResource): void {
    this.setValidators(resource);
    this.form.reset({ name: '', color: '#315CE8', key: '', order: null, level: null });
    this.formOpen.set(true);
    this.editingId.set(null);
    this.submitted.set(false);
    this.saveError.set('');
  }

  openEdit(resource: AdminResource, row: CatalogRow): void {
    this.setValidators(resource);
    this.form.reset({
      name: row.name,
      color: row.color ?? '#315CE8',
      key: row.key ?? '',
      order: row.order ?? null,
      level: row.level ?? null,
    });
    this.formOpen.set(true);
    this.editingId.set(row.id);
    this.submitted.set(false);
    this.saveError.set('');
  }

  closeForm(): void {
    if (this.saving()) return;
    this.formOpen.set(false);
    this.saveError.set('');
  }

  save(resource: AdminResource, rows: CatalogRow[]): void {
    if (this.saving()) return;
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const raw = this.form.getRawValue();
    const duplicate = rows.some((row) => {
      if (row.id === this.editingId()) return false;
      if (resource === 'labels') return row.name.trim().toLocaleLowerCase() === raw.name.trim().toLocaleLowerCase();
      if (resource === 'statuses') return row.key?.toLocaleLowerCase() === raw.key.trim().toLocaleLowerCase();
      return row.level === raw.level;
    });
    if (duplicate) {
      this.saveError.set(
        resource === 'statuses'
          ? 'Ez az állapotkulcs már használatban van.'
          : resource === 'priorities'
            ? 'Ez a prioritási szint már használatban van.'
            : 'Ilyen nevű címke már létezik.',
      );
      return;
    }

    this.saving.set(true);
    this.saveError.set('');
    const id = this.editingId();
    const request = this.write(resource, id, raw);
    request
      .pipe(
        tap(() => this.refresh$.next()),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.saving.set(false)),
      )
      .subscribe({
        next: () => {
          this.formOpen.set(false);
          this.editingId.set(null);
        },
        error: (error: unknown) =>
          this.saveError.set(
            error instanceof HttpErrorResponse && error.status === 404
              ? 'A törzsadatot már törölték. Frissítsd a listát.'
              : 'A mentés nem sikerült. Az adatok megmaradtak, próbáld újra.',
          ),
      });
  }

  requestDelete(resource: AdminResource, row: CatalogRow): void {
    if (this.deleteBusy()) return;
    this.pageError.set('');
    this.taskService.list().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (tasks) => {
        const refs = tasks.filter((task) => this.isReferenced(resource, row.id, task)).length;
        this.deleteError.set('');
        this.pendingDelete.set({
          row,
          details: refs ? [`${refs} feladat hivatkozik erre a törzsadatra`] : null,
        });
      },
      error: () => this.pageError.set('A hivatkozások ellenőrzése nem sikerült; a törlés nem indult el.'),
    });
  }

  confirmDelete(resource: AdminResource): void {
    const pending = this.pendingDelete();
    if (!pending || pending.details || this.deleteBusy()) return;
    this.deleteBusy.set(true);
    this.deleteError.set('');
    this.remove(resource, pending.row.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.deleteBusy.set(false)),
      )
      .subscribe({
        next: () => {
          this.pendingDelete.set(null);
          this.refresh$.next();
        },
        error: () => this.deleteError.set('A törlés nem sikerült. Próbáld újra.'),
      });
  }

  cancelDelete(): void {
    if (!this.deleteBusy()) this.pendingDelete.set(null);
  }

  private loadRows(resource: AdminResource): Observable<CatalogRow[]> {
    switch (resource) {
      case 'labels':
        return this.labelService.list().pipe(map((items) => items.map((item) => ({ ...item }))));
      case 'statuses':
        return this.statusService.list().pipe(
          map((items) => items.map((item) => ({ ...item })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))),
        );
      case 'priorities':
        return this.priorityService.list().pipe(
          map((items) => items.map((item) => ({ ...item })).sort((a, b) => (a.level ?? 0) - (b.level ?? 0))),
        );
    }
  }

  private setValidators(resource: AdminResource): void {
    const { color, key, order, level } = this.form.controls;
    color.setValidators(resource === 'labels' || resource === 'statuses' ? [Validators.required, Validators.pattern(/^#[0-9a-fA-F]{6}$/)] : []);
    key.setValidators(resource === 'statuses' ? [Validators.required, Validators.pattern(/^[a-z][a-z0-9-]*$/)] : []);
    order.setValidators(resource === 'statuses' ? [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)] : []);
    level.setValidators(resource === 'priorities' ? [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)] : []);
    for (const control of [color, key, order, level]) control.updateValueAndValidity({ emitEvent: false });
  }

  private write(
    resource: AdminResource,
    id: number | null,
    value: ReturnType<typeof this.form.getRawValue>,
  ): Observable<Label | Status | Priority> {
    if (resource === 'labels') {
      const data = { name: value.name.trim(), color: value.color };
      return id ? this.labelService.update(id, data) : this.labelService.create(data);
    }
    if (resource === 'statuses') {
      const data = {
        name: value.name.trim(),
        key: value.key.trim(),
        color: value.color,
        order: value.order ?? 1,
      };
      return id ? this.statusService.update(id, data) : this.statusService.create(data);
    }
    const data = { name: value.name.trim(), level: value.level ?? 1 };
    return id ? this.priorityService.update(id, data) : this.priorityService.create(data);
  }

  private remove(resource: AdminResource, id: number): Observable<void> {
    switch (resource) {
      case 'labels':
        return this.labelService.remove(id);
      case 'statuses':
        return this.statusService.remove(id);
      case 'priorities':
        return this.priorityService.remove(id);
    }
  }

  private isReferenced(resource: AdminResource, id: number, task: Task): boolean {
    if (resource === 'labels') return task.labelIds.includes(id);
    if (resource === 'statuses') return task.statusId === id;
    return task.priorityId === id;
  }
}
