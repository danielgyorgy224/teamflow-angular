import { Component, ElementRef, inject, viewChild } from '@angular/core';
import { AsyncPipe, DatePipe, NgFor, NgIf } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  Observable,
  Subject,
  catchError,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  forkJoin,
  map,
  merge,
  of,
  shareReplay,
  skip,
  startWith,
  switchMap,
  tap,
} from 'rxjs';
import { ProjectService } from '../../core/api/project.service';
import { StatusService } from '../../core/api/status.service';
import { TaskService } from '../../core/api/task.service';
import { UserService } from '../../core/api/user.service';
import { Project } from '../../models/project';
import { Status } from '../../models/status';
import { Task } from '../../models/task';
import { User } from '../../models/user';
import {
  EMPTY_FILTERS,
  Lookups,
  SortKey,
  TaskFilters,
  TaskRow,
  buildRows,
  filtersEqual,
  hasActiveFilters,
  parseFilters,
  toQueryParams,
} from './task-list.helpers';

type LookupState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: Lookups };

/** A listaállapot mindig azt a szűrőt hordozza, amelyikhez a kérés tartozik. */
type ListState =
  | { status: 'loading'; filters: TaskFilters; previous: Task[] }
  | { status: 'error'; filters: TaskFilters }
  | { status: 'ready'; filters: TaskFilters; tasks: Task[] };

/** A sablon egyetlen nézetmodellje: külön loading, error, empty és rows nézet. */
interface ListVm {
  view: 'loading' | 'error' | 'empty' | 'rows';
  /** Új kérés fut, de az előző sorok még látszanak (nem ugrál az oldal). */
  busy: boolean;
  rows: TaskRow[];
  filters: TaskFilters;
  hasFilters: boolean;
  users: User[];
  projects: Project[];
  statuses: Status[];
  /** Pl. "6 feladat · 2 projekt"; az állapotrész külön van, mert mobilon nem látszik. */
  subtitle: string;
  subtitleStatus: string;
  total: number;
  sortLabel: string;
}

@Component({
  selector: 'app-task-list',
  imports: [ReactiveFormsModule, RouterLink, NgIf, NgFor, AsyncPipe, DatePipe],
  templateUrl: './task-list.html',
  styleUrl: './task-list.css',
})
export class TaskList {
  private readonly taskService = inject(TaskService);
  private readonly userService = inject(UserService);
  private readonly projectService = inject(ProjectService);
  private readonly statusService = inject(StatusService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly listArea = viewChild<ElementRef<HTMLElement>>('listArea');

  /** Kiindulás: az URL query paramétereiből (frissítés, másolt link). */
  private readonly initial = parseFilters(this.route.snapshot.queryParamMap);

  readonly form = new FormGroup({
    q: new FormControl(this.initial.q, { nonNullable: true }),
    statusId: new FormControl(this.initial.statusId, { nonNullable: true }),
    assigneeId: new FormControl(this.initial.assigneeId, { nonNullable: true }),
    projectId: new FormControl(this.initial.projectId, { nonNullable: true }),
  });

  /** Az URL-ből érkező változás (visszalépés, "Szűrők törlése") ezen át jut a folyamokba. */
  private readonly external$ = new Subject<TaskFilters>();
  private readonly sortInput$ = new Subject<SortKey>();
  /** Újrapróbálás, vagy későbbi írás utáni frissítés: ez a Subject indítja újra a lekéréseket. */
  private readonly refresh$ = new Subject<void>();

  /** A legutóbb alkalmazott szűrők; ezzel különböztetjük meg a saját URL-visszhangot a visszalépéstől. */
  private applied: TaskFilters = this.initial;
  /** A legutóbbi sikeres lista, hogy új kérés közben ne üresedjen ki a táblázat. */
  private lastTasks: Task[] = [];

  /** Keresés: gépelés után 300 ms várakozás, azonos szöveg nem indít új kérést. */
  private readonly search$ = merge(
    this.form.controls.q.valueChanges.pipe(debounceTime(300)),
    this.external$.pipe(map((filters) => filters.q)),
  ).pipe(
    startWith(this.initial.q),
    map((value) => value.trim()),
    distinctUntilChanged(),
  );

  /**
   * Szűrők együtt: combineLatest + startWith + map. Az első érték azonnal megy (alaphelyzetben is
   * indul lekérdezés), a további, egyszerre érkező változásokat a debounceTime(0) egyetlen
   * állapottá vonja össze.
   */
  readonly filters$: Observable<TaskFilters> = merge(
    of(this.initial),
    combineLatest([
      this.search$,
      this.fieldStream(this.form.controls.statusId, (filters) => filters.statusId),
      this.fieldStream(this.form.controls.assigneeId, (filters) => filters.assigneeId),
      this.fieldStream(this.form.controls.projectId, (filters) => filters.projectId),
      merge(this.sortInput$, this.external$.pipe(map((filters) => filters.sort))).pipe(
        startWith(this.initial.sort),
        distinctUntilChanged(),
      ),
    ]).pipe(
      map(
        ([q, statusId, assigneeId, projectId, sort]): TaskFilters => ({
          q,
          statusId,
          assigneeId,
          projectId,
          sort,
        }),
      ),
      skip(1), // a kezdőállapotot már az of(this.initial) adta
      debounceTime(0),
    ),
  ).pipe(
    distinctUntilChanged(filtersEqual),
    tap((filters) => (this.applied = filters)),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  /**
   * Feladatok: a legutóbbi szűrő kérése számít (switchMap), a hibát a belső folyam kezeli
   * (catchError), így a következő keresés hiba után is működik. A betöltési állapotot a
   * legutóbbi aktív kérés adja, nincs finalize, ami egy újabb kérés jelzőjét lekapcsolná.
   */
  private readonly list$: Observable<ListState> = combineLatest([
    this.filters$,
    this.refresh$.pipe(startWith(undefined)),
  ]).pipe(
    switchMap(([filters]) =>
      this.taskService
        .search({
          q: filters.q,
          statusId: filters.statusId,
          assigneeId: filters.assigneeId,
          projectId: filters.projectId,
          sort: filters.sort === 'dueDate' ? 'dueDate' : null,
        })
        .pipe(
          tap((tasks) => (this.lastTasks = tasks)),
          map((tasks): ListState => ({ status: 'ready', filters, tasks })),
          catchError(() => of<ListState>({ status: 'error', filters })),
          startWith<ListState>({ status: 'loading', filters, previous: this.lastTasks }),
        ),
    ),
  );

  /** A nevek feloldásához és a választók opcióihoz szükséges listák, egyszer töltődnek be. */
  private readonly lookups$: Observable<LookupState> = this.refresh$.pipe(
    startWith(undefined),
    switchMap(() =>
      forkJoin({
        users: this.userService.list(),
        projects: this.projectService.list(),
        statuses: this.statusService.list(),
        total: this.taskService.list().pipe(map((all) => all.length)),
      }).pipe(
        map((data): LookupState => ({ status: 'ready', data })),
        catchError(() => of<LookupState>({ status: 'error' })),
        startWith<LookupState>({ status: 'loading' }),
      ),
    ),
  );

  readonly vm$: Observable<ListVm> = combineLatest([this.lookups$, this.list$]).pipe(
    map(([lookups, list]) => this.toVm(lookups, list)),
  );

  constructor() {
    // Szűrő → URL: a nézet másolható és újratölthető.
    this.filters$.pipe(takeUntilDestroyed()).subscribe((filters) => {
      if (!filtersEqual(filters, parseFilters(this.route.snapshot.queryParamMap))) {
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: toQueryParams(filters),
        });
      }
    });

    // URL → szűrő: böngésző vissza/előre gomb. A saját visszhangot (azonos állapot) figyelmen kívül hagyjuk.
    this.route.queryParamMap.pipe(map(parseFilters), takeUntilDestroyed()).subscribe((filters) => {
      if (!filtersEqual(filters, this.applied)) {
        this.applyExternal(filters);
      }
    });
  }

  trackById(_: number, item: { id: number }): number {
    return item.id;
  }

  toggleSort(): void {
    this.sortInput$.next(this.applied.sort === 'id' ? 'dueDate' : 'id');
  }

  clearFilters(): void {
    this.applyExternal({ ...EMPTY_FILTERS, sort: this.applied.sort });
    this.searchInput()?.nativeElement.focus();
  }

  retry(): void {
    this.refresh$.next();
    // A gomb eltűnik, ezért a fókusz a listaterületre kerül, nem vész el.
    this.listArea()?.nativeElement.focus();
  }

  /** Az űrlapot csendben állítja be, a folyamok egyetlen külső eseményt kapnak. */
  private applyExternal(filters: TaskFilters): void {
    this.form.patchValue(
      {
        q: filters.q,
        statusId: filters.statusId,
        assigneeId: filters.assigneeId,
        projectId: filters.projectId,
      },
      { emitEvent: false },
    );
    this.external$.next(filters);
  }

  /** Választó vagy más azonnali mező: minden változás számít, a külső érték is. */
  private fieldStream(
    control: FormControl<string>,
    pick: (filters: TaskFilters) => string,
  ): Observable<string> {
    return merge(control.valueChanges, this.external$.pipe(map(pick))).pipe(
      startWith(control.value),
      distinctUntilChanged(),
    );
  }

  private toVm(lookups: LookupState, list: ListState): ListVm {
    const data = lookups.status === 'ready' ? lookups.data : null;
    const filters = list.filters;
    const base = {
      filters,
      hasFilters: hasActiveFilters(filters),
      users: data?.users ?? [],
      projects: data?.projects ?? [],
      statuses: data?.statuses ?? [],
      sortLabel: filters.sort === 'dueDate' ? 'határidő' : 'azonosító',
    };

    if (list.status === 'error' || lookups.status === 'error') {
      return {
        ...base,
        view: 'error',
        busy: false,
        rows: [],
        subtitle: 'Az adatok nem érhetők el',
        subtitleStatus: '',
        total: 0,
      };
    }

    if (list.status === 'loading' || data === null) {
      const previous = list.status === 'loading' && data ? buildRows(list.previous, data) : [];
      return {
        ...base,
        view: previous.length > 0 ? 'rows' : 'loading',
        busy: true,
        rows: previous,
        subtitle: previous.length > 0 ? this.subtitle(previous) : 'Betöltés...',
        subtitleStatus: previous.length > 0 ? this.statusText(base.statuses, filters) : '',
        total: data?.total ?? previous.length,
      };
    }

    const rows = buildRows(list.tasks, data);
    return {
      ...base,
      view: rows.length > 0 ? 'rows' : 'empty',
      busy: false,
      rows,
      subtitle: this.subtitle(rows),
      subtitleStatus: this.statusText(data.statuses, filters),
      total: data.total,
    };
  }

  private subtitle(rows: TaskRow[]): string {
    const projectCount = new Set(rows.map((row) => row.projectId)).size;
    return `${rows.length} feladat · ${projectCount} projekt`;
  }

  private statusText(statuses: Status[], filters: TaskFilters): string {
    return filters.statusId
      ? (statuses.find((status) => String(status.id) === filters.statusId)?.name.toLowerCase() ??
          'szűrt állapot')
      : 'minden állapot';
  }
}
