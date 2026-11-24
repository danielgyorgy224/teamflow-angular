import { Component, DestroyRef, ElementRef, inject, signal } from '@angular/core';
import { AsyncPipe, DatePipe, NgFor, NgIf, NgSwitch, NgSwitchCase } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  Observable,
  Subject,
  catchError,
  combineLatest,
  distinctUntilChanged,
  finalize,
  forkJoin,
  map,
  merge,
  of,
  startWith,
  switchMap,
  tap,
} from 'rxjs';
import { ChecklistService } from '../../core/api/checklist.service';
import { CommentService } from '../../core/api/comment.service';
import { LabelService } from '../../core/api/label.service';
import { PriorityService } from '../../core/api/priority.service';
import { ProjectService } from '../../core/api/project.service';
import { StatusService } from '../../core/api/status.service';
import { TaskService } from '../../core/api/task.service';
import { TimeEntryService } from '../../core/api/time-entry.service';
import { UserService } from '../../core/api/user.service';
import { CURRENT_USER_ID } from '../../core/current-user';
import { ChecklistItem } from '../../models/checklist-item';
import { Comment } from '../../models/comment';
import { Task } from '../../models/task';
import { TimeEntry } from '../../models/time-entry';
import { User } from '../../models/user';
import { ConfirmDialog } from '../../shared/confirm-dialog/confirm-dialog';
import { textErrorMessage, trimmedLength } from '../../shared/trimmed-length.validator';
import {
  SectionState,
  TaskInfo,
  TaskLookups,
  blockingDetails,
  buildInfo,
  checklistProgress,
  formatHours,
  formatMinutes,
  loadSection,
  sortComments,
  sumMinutes,
  userName,
} from './task-detail.helpers';

const COMMENT_MAX = 500;
const CHECKLIST_MAX = 120;

type CoreState =
  | { status: 'loading' | 'error' | 'notfound' }
  | ({ status: 'ready'; task: Task } & TaskLookups);

interface CommentRow {
  id: number;
  author: string;
  createdAt: string;
  body: string;
}

interface TimeRow {
  id: number;
  userId: number;
  who: string;
  minutes: number;
  date: string;
  note: string;
}

/** A kész oldal adatai; csak akkor létezik, ha a feladat és a hivatkozott adatok betöltődtek. */
interface PageVm {
  task: Task;
  info: TaskInfo;
  users: User[];
  estimate: string;
  comments: SectionState<CommentRow>;
  checklist: SectionState<ChecklistItem>;
  checklistProgress: string;
  time: SectionState<TimeRow>;
  totalTime: string;
}

/** A sablon egyetlen nézetmodellje: az oldal és a három gyermeklista külön állapottal. */
interface DetailVm {
  view: 'loading' | 'error' | 'notfound' | 'ready';
  page: PageVm | null;
}

/** Megerősítést váró törlés vagy blokkolt törlés (tájékoztató modal). */
type PendingDelete =
  | { kind: 'task'; id: number; subject: string }
  | { kind: 'blocked'; id: number; subject: string; details: string[] }
  | { kind: 'comment'; id: number; subject: string }
  | { kind: 'checklist'; id: number; subject: string }
  | { kind: 'time'; id: number; subject: string };

@Component({
  selector: 'app-task-detail',
  imports: [ReactiveFormsModule, RouterLink, NgIf, NgFor, NgSwitch, NgSwitchCase, AsyncPipe, DatePipe, ConfirmDialog],
  templateUrl: './task-detail.html',
  styleUrl: './task-detail.css',
})
export class TaskDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly taskService = inject(TaskService);
  private readonly commentService = inject(CommentService);
  private readonly checklistService = inject(ChecklistService);
  private readonly timeEntryService = inject(TimeEntryService);
  private readonly userService = inject(UserService);
  private readonly statusService = inject(StatusService);
  private readonly priorityService = inject(PriorityService);
  private readonly labelService = inject(LabelService);
  private readonly projectService = inject(ProjectService);

  readonly commentMax = COMMENT_MAX;
  readonly checklistMax = CHECKLIST_MAX;

  // ---------- Adatfolyamok ----------

  private readonly id$ = this.route.paramMap.pipe(
    map((params) => Number(params.get('id'))),
    distinctUntilChanged(),
  );

  /** Újrapróbálás: minden szakaszt újratölt. */
  private readonly reload$ = new Subject<void>();
  /** Sikeres írás után csak az érintett lista töltődik újra (Subject + tap). */
  private readonly commentsChanged$ = new Subject<void>();
  private readonly checklistChanged$ = new Subject<void>();
  private readonly timeChanged$ = new Subject<void>();

  /** Latest users for validating the selected comment author on submit. */
  private users: User[] = [];

  /**
   * Feladat + hivatkozott adatok. A legutóbbi kérés számít (switchMap); a 404 külön "nem található"
   * állapot, minden más hiba "error". A projekt hibája nem töri el az oldalt.
   */
  private readonly core$: Observable<CoreState> = combineLatest([
    this.id$,
    this.reload$.pipe(startWith(undefined)),
  ]).pipe(
    switchMap(([id]) =>
      this.taskService.getById(id).pipe(
        switchMap((task) =>
          forkJoin({
            users: this.userService.list(),
            statuses: this.statusService.list(),
            priorities: this.priorityService.list(),
            labels: this.labelService.list(),
            project: this.projectService.getById(task.projectId).pipe(catchError(() => of(null))),
          }).pipe(
            tap(({ users }) => this.onUsers(users)),
            map((lookups): CoreState => ({ status: 'ready', task, ...lookups })),
          ),
        ),
        catchError((error: unknown) =>
          of<CoreState>({
            status: error instanceof HttpErrorResponse && error.status === 404 ? 'notfound' : 'error',
          }),
        ),
        startWith<CoreState>({ status: 'loading' }),
      ),
    ),
  );

  private readonly comments$ = loadSection(
    this.id$,
    merge(this.reload$, this.commentsChanged$),
    (id) => this.commentService.listByTask(id),
  );
  private readonly checklist$ = loadSection(
    this.id$,
    merge(this.reload$, this.checklistChanged$),
    (id) => this.checklistService.listByTask(id),
  );
  private readonly time$ = loadSection(
    this.id$,
    merge(this.reload$, this.timeChanged$),
    (id) => this.timeEntryService.listByTask(id),
  );

  readonly vm$: Observable<DetailVm> = combineLatest([
    this.core$,
    this.comments$,
    this.checklist$,
    this.time$,
  ]).pipe(map(([core, comments, checklist, time]) => this.toVm(core, comments, checklist, time)));

  // ---------- Állapot a sablonnak (signal: zoneless változásészlelés) ----------

  readonly notice = signal(typeof history === 'undefined' ? '' : String(history.state?.notice ?? ''));
  readonly pageError = signal('');
  readonly checkingDelete = signal(false);
  readonly pendingDelete = signal<PendingDelete | null>(null);
  readonly deleteBusy = signal(false);
  readonly deleteError = signal<string | null>(null);

  readonly commentFormOpen = signal(false);
  readonly commentSubmitted = signal(false);
  readonly commentSaving = signal(false);
  readonly commentError = signal('');
  readonly editingCommentId = signal<number | null>(null);
  readonly commentEditSubmitted = signal(false);
  readonly commentEditSaving = signal(false);

  readonly checklistSubmitted = signal(false);
  readonly checklistSaving = signal(false);
  readonly checklistError = signal('');
  readonly editingChecklistId = signal<number | null>(null);
  readonly checklistEditSubmitted = signal(false);
  readonly checklistEditSaving = signal(false);
  private readonly busyItems = signal<ReadonlySet<number>>(new Set());

  readonly timeFormOpen = signal(false);
  readonly timeSubmitted = signal(false);
  readonly timeSaving = signal(false);
  readonly timeError = signal('');
  readonly editingTimeId = signal<number | null>(null);

  // ---------- Űrlapok ----------

  readonly commentForm = new FormGroup({
    userId: new FormControl<number>(CURRENT_USER_ID, {
      nonNullable: true,
      validators: [Validators.required],
    }),
    body: new FormControl('', {
      nonNullable: true,
      validators: [trimmedLength(1, COMMENT_MAX)],
    }),
  });
  readonly commentEditCtrl = new FormControl('', {
    nonNullable: true,
    validators: [trimmedLength(1, COMMENT_MAX)],
  });
  readonly checklistCtrl = new FormControl('', {
    nonNullable: true,
    validators: [trimmedLength(1, CHECKLIST_MAX)],
  });
  readonly checklistEditCtrl = new FormControl('', {
    nonNullable: true,
    validators: [trimmedLength(1, CHECKLIST_MAX)],
  });
  readonly timeForm = new FormGroup({
    userId: new FormControl<number | null>(CURRENT_USER_ID, Validators.required),
    minutes: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(1),
      Validators.pattern(/^\d+$/),
    ]),
    date: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    note: new FormControl('', { nonNullable: true, validators: [trimmedLength(0, 200)] }),
  });

  // ---------- Sablonsegédek ----------

  trackById(_: number, item: { id: number }): number {
    return item.id;
  }

  isBusy(id: number): boolean {
    return this.busyItems().has(id);
  }

  /** A hibaüzenet touched állapot vagy sikertelen beküldési kísérlet után jelenik meg. */
  textError(control: FormControl<string>, submitted: boolean, max: number): string | null {
    return control.touched || submitted ? textErrorMessage(control.errors, max) : null;
  }

  retry(): void {
    this.reload$.next();
    this.focusById('task-main');
  }

  // ---------- Feladat törlése ----------

  /** Törlés előtt friss ellenőrzés: kapcsolódó rekordokkal a feladat nem törölhető. */
  requestTaskDelete(task: Task): void {
    if (this.checkingDelete()) return;
    this.pageError.set('');
    this.checkingDelete.set(true);
    forkJoin({
      comments: this.commentService.listByTask(task.id),
      timeEntries: this.timeEntryService.listByTask(task.id),
      checklist: this.checklistService.listByTask(task.id),
    })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.checkingDelete.set(false)),
      )
      .subscribe({
        next: (related) => {
          const details = blockingDetails({
            comments: related.comments.length,
            timeEntries: related.timeEntries.length,
            checklist: related.checklist.length,
          });
          const subject = `#${task.id} ${task.title}`;
          this.deleteError.set(null);
          this.pendingDelete.set(
            details.length > 0
              ? { kind: 'blocked', id: task.id, subject, details }
              : { kind: 'task', id: task.id, subject },
          );
        },
        error: () =>
          this.pageError.set('A kapcsolódó rekordok ellenőrzése nem sikerült, a törlés nem indult el.'),
      });
  }

  requestCommentDelete(row: CommentRow): void {
    this.deleteError.set(null);
    this.pendingDelete.set({ kind: 'comment', id: row.id, subject: `${row.author}: ${row.body}` });
  }

  requestChecklistDelete(item: ChecklistItem): void {
    this.deleteError.set(null);
    this.pendingDelete.set({ kind: 'checklist', id: item.id, subject: item.text });
  }

  requestTimeDelete(entry: TimeRow): void {
    this.deleteError.set(null);
    this.pendingDelete.set({ kind: 'time', id: entry.id, subject: `${entry.minutes} perc · ${entry.who}` });
  }

  cancelDelete(): void {
    if (this.deleteBusy()) return;
    this.pendingDelete.set(null);
  }

  confirmDelete(): void {
    const pending = this.pendingDelete();
    if (!pending || pending.kind === 'blocked' || this.deleteBusy()) return;

    const request$ =
      pending.kind === 'task'
        ? this.taskService.remove(pending.id)
        : pending.kind === 'comment'
          ? this.commentService.remove(pending.id).pipe(tap(() => this.commentsChanged$.next()))
          : pending.kind === 'checklist'
            ? this.checklistService.remove(pending.id).pipe(tap(() => this.checklistChanged$.next()))
            : this.timeEntryService.remove(pending.id).pipe(tap(() => this.timeChanged$.next()));

    this.deleteBusy.set(true);
    this.deleteError.set(null);
    request$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.deleteBusy.set(false)),
      )
      .subscribe({
        next: () => {
          this.pendingDelete.set(null);
          if (pending.kind === 'task') {
            void this.router.navigate(['/tasks']);
            return;
          }
          if (this.editingCommentId() === pending.id && pending.kind === 'comment') {
            this.editingCommentId.set(null);
          }
          if (this.editingChecklistId() === pending.id && pending.kind === 'checklist') {
            this.editingChecklistId.set(null);
          }
          this.notice.set(
            pending.kind === 'comment'
              ? 'A hozzászólás törölve.'
              : pending.kind === 'checklist'
                ? 'A pont törölve.'
                : 'Az időnapló-bejegyzés törölve.',
          );
          // A törölt sor megnyitó gombja megszűnt, ezért a panel címére kerül a fókusz.
          setTimeout(() => {
            const target =
              pending.kind === 'comment'
                ? 'comments-title'
                : pending.kind === 'checklist'
                  ? 'checklist-title'
                  : 'time-title';
            this.focusById(target);
          });
        },
        error: () =>
          this.deleteError.set('A törlés nem sikerült, a rekord megmaradt. Próbáld újra.'),
      });
  }

  // ---------- Ellenőrzőlista ----------

  addChecklistItem(taskId: number): void {
    if (this.checklistSaving()) return;
    this.checklistSubmitted.set(true);
    this.checklistCtrl.markAsTouched();
    if (this.checklistCtrl.invalid) return;

    this.checklistSaving.set(true);
    this.checklistError.set('');
    this.checklistService
      .create({ taskId, text: this.checklistCtrl.value.trim(), done: false })
      .pipe(
        tap(() => this.checklistChanged$.next()),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.checklistSaving.set(false)),
      )
      .subscribe({
        next: () => {
          this.checklistCtrl.reset('');
          this.checklistSubmitted.set(false);
          this.notice.set('Az ellenőrzőlista-pont hozzáadva.');
        },
        // Hibánál a beírt szöveg megmarad, sikerüzenet nincs.
        error: () => this.checklistError.set('A mentés nem sikerült. Próbáld újra.'),
      });
  }

  toggleChecklistItem(item: ChecklistItem, event: Event): void {
    const box = event.target as HTMLInputElement;
    if (this.isBusy(item.id)) {
      box.checked = item.done;
      return;
    }
    this.setBusy(item.id, true);
    this.checklistError.set('');
    this.checklistService
      .update(item.id, { done: box.checked })
      .pipe(
        tap(() => this.checklistChanged$.next()),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.setBusy(item.id, false)),
      )
      .subscribe({
        error: () => {
          box.checked = item.done; // a böngésző már átbillentette, a szerver nem
          this.checklistError.set('Az állapot mentése nem sikerült. Próbáld újra.');
        },
      });
  }

  startChecklistEdit(item: ChecklistItem): void {
    this.checklistEditCtrl.reset(item.text);
    this.checklistEditSubmitted.set(false);
    this.editingChecklistId.set(item.id);
    setTimeout(() => this.focusById('checklist-edit-input'));
  }

  cancelChecklistEdit(itemId: number): void {
    this.editingChecklistId.set(null);
    setTimeout(() => this.focusById(`checklist-edit-${itemId}`));
  }

  saveChecklistEdit(item: ChecklistItem): void {
    if (this.checklistEditSaving()) return;
    this.checklistEditSubmitted.set(true);
    this.checklistEditCtrl.markAsTouched();
    if (this.checklistEditCtrl.invalid) return;

    this.checklistEditSaving.set(true);
    this.checklistError.set('');
    this.checklistService
      .update(item.id, { text: this.checklistEditCtrl.value.trim() })
      .pipe(
        tap(() => this.checklistChanged$.next()),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.checklistEditSaving.set(false)),
      )
      .subscribe({
        next: () => {
          this.editingChecklistId.set(null);
          this.notice.set('Az ellenőrzőlista-pont módosítva.');
          setTimeout(() => this.focusById(`checklist-edit-${item.id}`));
        },
        error: () => this.checklistError.set('A mentés nem sikerült. Próbáld újra.'),
      });
  }

  // ---------- Hozzászólások ----------

  openCommentForm(): void {
    this.commentFormOpen.set(true);
    setTimeout(() => this.focusById('comment-body'));
  }

  closeCommentForm(): void {
    this.commentFormOpen.set(false);
    this.commentSubmitted.set(false);
    this.commentError.set('');
    this.commentForm.controls.body.reset('');
    setTimeout(() => this.focusById('comment-open'));
  }

  addComment(taskId: number): void {
    if (this.commentSaving()) return;
    this.commentSubmitted.set(true);
    this.commentForm.markAllAsTouched();
    const { userId, body } = this.commentForm.getRawValue();
    // Csak létező felhasználó lehet a szerző.
    if (this.commentForm.invalid || !this.users.some((user) => user.id === userId)) {
      if (!this.users.some((user) => user.id === userId)) {
        this.commentForm.controls.userId.setErrors({ unknown: true });
      }
      return;
    }

    this.commentSaving.set(true);
    this.commentError.set('');
    this.commentService
      .create({ taskId, userId, body: body.trim(), createdAt: new Date().toISOString() })
      .pipe(
        tap(() => this.commentsChanged$.next()),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.commentSaving.set(false)),
      )
      .subscribe({
        next: () => {
          this.commentForm.controls.body.reset('');
          this.commentSubmitted.set(false);
          this.commentFormOpen.set(false);
          this.notice.set('A hozzászólás hozzáadva.');
          setTimeout(() => this.focusById('comment-open'));
        },
        error: () => this.commentError.set('A mentés nem sikerült. A szöveg megmaradt, próbáld újra.'),
      });
  }

  startCommentEdit(row: CommentRow): void {
    this.commentEditCtrl.reset(row.body);
    this.commentEditSubmitted.set(false);
    this.editingCommentId.set(row.id);
    setTimeout(() => this.focusById('comment-edit-input'));
  }

  cancelCommentEdit(commentId: number): void {
    this.editingCommentId.set(null);
    setTimeout(() => this.focusById(`comment-edit-${commentId}`));
  }

  saveCommentEdit(row: CommentRow): void {
    if (this.commentEditSaving()) return;
    this.commentEditSubmitted.set(true);
    this.commentEditCtrl.markAsTouched();
    if (this.commentEditCtrl.invalid) return;

    this.commentEditSaving.set(true);
    this.commentError.set('');
    this.commentService
      .update(row.id, { body: this.commentEditCtrl.value.trim() })
      .pipe(
        tap(() => this.commentsChanged$.next()),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.commentEditSaving.set(false)),
      )
      .subscribe({
        next: () => {
          this.editingCommentId.set(null);
          this.notice.set('A hozzászólás módosítva.');
          setTimeout(() => this.focusById(`comment-edit-${row.id}`));
        },
        error: () => this.commentError.set('A mentés nem sikerült. A szöveg megmaradt, próbáld újra.'),
      });
  }

  openTimeForm(users: User[]): void {
    if (this.timeSaving()) return;
    const userId = users.some((user) => user.id === this.timeForm.controls.userId.value)
      ? this.timeForm.controls.userId.value
      : (users[0]?.id ?? null);
    this.timeForm.reset({ userId, minutes: null, date: new Date().toISOString().slice(0, 10), note: '' });
    this.timeSubmitted.set(false);
    this.timeError.set('');
    this.editingTimeId.set(null);
    this.timeFormOpen.set(true);
    setTimeout(() => this.focusById('time-user'));
  }

  startTimeEdit(entry: TimeRow): void {
    this.timeSubmitted.set(false);
    this.timeError.set('');
    this.editingTimeId.set(entry.id);
    this.timeFormOpen.set(true);
    this.timeForm.reset({
      userId: entry.userId,
      minutes: entry.minutes,
      date: entry.date,
      note: entry.note,
    });
    setTimeout(() => this.focusById('time-user'));
  }

  closeTimeForm(): void {
    if (this.timeSaving()) return;
    this.timeFormOpen.set(false);
    this.editingTimeId.set(null);
    this.timeSubmitted.set(false);
    this.timeError.set('');
    setTimeout(() => this.focusById('time-open'));
  }

  saveTime(taskId: number, users: User[]): void {
    if (this.timeSaving()) return;
    this.timeSubmitted.set(true);
    this.timeForm.markAllAsTouched();
    const value = this.timeForm.getRawValue();
    if (
      this.timeForm.invalid ||
      value.userId === null ||
      value.minutes === null ||
      !users.some((user) => user.id === value.userId)
    ) {
      if (value.userId !== null && !users.some((user) => user.id === value.userId)) {
        this.timeForm.controls.userId.setErrors({ unknown: true });
      }
      return;
    }

    this.timeSaving.set(true);
    this.timeError.set('');
    const payload = {
      taskId,
      userId: value.userId,
      minutes: value.minutes,
      date: value.date,
      note: value.note.trim(),
    };
    const editingId = this.editingTimeId();
    const request = editingId
      ? this.timeEntryService.update(editingId, payload)
      : this.timeEntryService.create(payload);
    request
      .pipe(
        tap(() => this.timeChanged$.next()),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.timeSaving.set(false)),
      )
      .subscribe({
        next: () => {
          this.timeFormOpen.set(false);
          this.editingTimeId.set(null);
          this.timeForm.reset({ userId: value.userId, minutes: null, date: '', note: '' });
          this.timeSubmitted.set(false);
          this.notice.set(editingId ? 'Az időnapló-bejegyzés módosítva.' : 'Az időnapló-bejegyzés rögzítve.');
          setTimeout(() => this.focusById('time-open'));
        },
        error: (error: unknown) =>
          this.timeError.set(
            error instanceof HttpErrorResponse && error.status === 404
              ? 'A feladatot vagy a felhasználót már nem találom. Frissítsd az oldalt.'
              : 'A mentés nem sikerült. Az adatok megmaradtak, próbáld újra.',
          ),
      });
  }

  // ---------- Belső segédek ----------

  private onUsers(users: User[]): void {
    this.users = users;
    // Alapértelmezett szerző: a demó felhasználó, ha nem létezik, az első csapattag.
    const current = this.commentForm.controls.userId;
    if (!users.some((user) => user.id === current.value) && users.length > 0) {
      current.setValue(users[0].id);
    }
  }

  private setBusy(id: number, busy: boolean): void {
    const next = new Set(this.busyItems());
    if (busy) next.add(id);
    else next.delete(id);
    this.busyItems.set(next);
  }

  private focusById(id: string): void {
    this.host.nativeElement.querySelector<HTMLElement>(`#${id}`)?.focus();
  }

  private toVm(
    core: CoreState,
    comments: SectionState<Comment>,
    checklist: SectionState<ChecklistItem>,
    time: SectionState<TimeEntry>,
  ): DetailVm {
    const users = core.status === 'ready' ? core.users : [];
    const commentRows: SectionState<CommentRow> = {
      status: comments.status,
      items: sortComments(comments.items).map((c) => ({
        id: c.id,
        author: userName(users, c.userId),
        createdAt: c.createdAt,
        body: c.body,
      })),
    };
    const timeRows: SectionState<TimeRow> = {
      status: time.status,
      items: time.items.map((t) => ({
        id: t.id,
        userId: t.userId,
        who: userName(users, t.userId),
        minutes: t.minutes,
        date: t.date,
        note: t.note,
      })),
    };
    if (core.status !== 'ready') {
      return { view: core.status, page: null };
    }
    return {
      view: 'ready',
      page: {
        task: core.task,
        info: buildInfo(core.task, core),
        users,
        estimate: formatHours(core.task.estimateHours),
        comments: commentRows,
        checklist,
        checklistProgress: checklistProgress(checklist.items),
        time: timeRows,
        totalTime: formatMinutes(sumMinutes(time.items)),
      },
    };
  }
}
