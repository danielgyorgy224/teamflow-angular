import { AsyncPipe, NgFor, NgIf } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, catchError, forkJoin, map, of, startWith } from 'rxjs';
import { UserService } from '../../core/api/user.service';
import { User } from '../../models/user';
import { trimmedLength } from '../../shared/trimmed-length.validator';

type FormState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; users: User[]; user: User | null };

@Component({
  selector: 'app-user-form',
  imports: [AsyncPipe, NgFor, NgIf, ReactiveFormsModule, RouterLink],
  templateUrl: './user-form.html',
  styleUrl: './user-form.css',
})
export class UserForm {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly userService = inject(UserService);
  private readonly destroyRef = inject(DestroyRef);
  readonly userId = Number(this.route.snapshot.paramMap.get('id')) || null;
  readonly submitted = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal('');

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [trimmedLength(1, 100)] }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email, Validators.maxLength(254)],
    }),
    role: new FormControl('', { nonNullable: true, validators: [trimmedLength(1, 80)] }),
    active: new FormControl(true, { nonNullable: true }),
  });

  readonly vm$: Observable<FormState> = forkJoin({
    users: this.userService.list(),
    user: this.userId ? this.userService.getById(this.userId) : of(null),
  }).pipe(
    map(({ users, user }): FormState => {
      if (user) {
        this.form.patchValue({ name: user.name, email: user.email, role: user.role, active: user.active });
        this.form.markAsPristine();
      }
      return { status: 'ready', users, user };
    }),
    catchError(() => of<FormState>({ status: 'error' })),
    startWith<FormState>({ status: 'loading' }),
  );

  save(users: User[]): void {
    if (this.saving()) return;
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const value = this.form.getRawValue();
    const email = value.email.trim().toLocaleLowerCase();
    if (users.some((user) => user.id !== this.userId && user.email.toLocaleLowerCase() === email)) {
      this.saveError.set('Ez az e-mail-cím már használatban van.');
      return;
    }

    this.saving.set(true);
    this.saveError.set('');
    const payload = {
      name: value.name.trim(),
      email,
      role: value.role.trim(),
      active: value.active,
    };
    const request = this.userId
      ? this.userService.update(this.userId, payload)
      : this.userService.create(payload);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => void this.router.navigate(['/team']),
      error: (error: unknown) => {
        this.saving.set(false);
        this.saveError.set(
          error instanceof HttpErrorResponse && error.status === 404
            ? 'A felhasználót már nem találom. Frissítsd az oldalt.'
            : 'A mentés nem sikerült. Az adatok megmaradtak, próbáld újra.',
        );
      },
    });
  }
}
