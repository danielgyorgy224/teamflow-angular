import { Component, ElementRef, inject, viewChild } from '@angular/core';
import { AsyncPipe, DatePipe, NgFor, NgIf } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Observable, Subject, catchError, forkJoin, map, of, startWith, switchMap } from 'rxjs';
import { ProjectService } from '../../core/api/project.service';
import { StatusService } from '../../core/api/status.service';
import { TaskService } from '../../core/api/task.service';
import { TimeEntryService } from '../../core/api/time-entry.service';
import { UserService } from '../../core/api/user.service';
import { DashboardSummary, buildSummary } from './dashboard.helpers';

/** Külön loading, error és ready állapot; az üres eset a ready-n belül a mutatókból látszik. */
type DashboardVm =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; summary: DashboardSummary };

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, NgIf, NgFor, AsyncPipe, DatePipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  private readonly taskService = inject(TaskService);
  private readonly statusService = inject(StatusService);
  private readonly userService = inject(UserService);
  private readonly projectService = inject(ProjectService);
  private readonly timeEntryService = inject(TimeEntryService);

  private readonly page = viewChild<ElementRef<HTMLElement>>('page');
  private readonly refresh$ = new Subject<void>();

  /**
   * forkJoin: az öt véges kérés együtt fut, és egyetlen eredményből számolunk (map). A legutóbbi
   * kérés számít (switchMap); a hibát a belső folyam kezeli, így az újrapróbálás működik.
   */
  readonly vm$: Observable<DashboardVm> = this.refresh$.pipe(
    startWith(undefined),
    switchMap(() =>
      forkJoin({
        tasks: this.taskService.list(),
        statuses: this.statusService.list(),
        users: this.userService.list(),
        projects: this.projectService.list(),
        timeEntries: this.timeEntryService.list(),
      }).pipe(
        map((data): DashboardVm => ({ status: 'ready', summary: buildSummary(data) })),
        catchError(() => of<DashboardVm>({ status: 'error' })),
        startWith<DashboardVm>({ status: 'loading' }),
      ),
    ),
  );

  trackById(_: number, item: { id: number }): number {
    return item.id;
  }

  retry(): void {
    this.refresh$.next();
    // Az újrapróbálás gomb eltűnik, ezért a fókusz az oldalra kerül.
    this.page()?.nativeElement.focus();
  }
}
