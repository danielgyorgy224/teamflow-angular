import { Observable, catchError, map, of, startWith, switchMap } from 'rxjs';
import { ChecklistItem } from '../../models/checklist-item';
import { Comment } from '../../models/comment';
import { Label } from '../../models/label';
import { Priority } from '../../models/priority';
import { Project } from '../../models/project';
import { Status } from '../../models/status';
import { Task } from '../../models/task';
import { TimeEntry } from '../../models/time-entry';
import { User } from '../../models/user';

export interface SectionState<T> {
  status: 'loading' | 'error' | 'ready';
  items: T[];
}

export interface TaskLookups {
  users: User[];
  statuses: Status[];
  priorities: Priority[];
  labels: Label[];
  project: Project | null;
}

export interface TaskInfo {
  projectId: number;
  projectName: string;
  statusName: string;
  statusColor: string;
  priorityName: string;
  assigneeName: string;
  labels: Label[];
}

export function loadSection<T>(
  id$: Observable<number>,
  reload$: Observable<void>,
  request: (id: number) => Observable<T[]>,
): Observable<SectionState<T>> {
  return id$.pipe(
    switchMap((id) =>
      reload$.pipe(
        startWith(undefined),
        switchMap(() =>
          request(id).pipe(
            map((items): SectionState<T> => ({ status: 'ready', items })),
            catchError(() => of<SectionState<T>>({ status: 'error', items: [] })),
            startWith<SectionState<T>>({ status: 'loading', items: [] }),
          ),
        ),
      ),
    ),
  );
}

export function buildInfo(task: Task, lookups: TaskLookups): TaskInfo {
  const status = lookups.statuses.find((item) => item.id === task.statusId);
  const priority = lookups.priorities.find((item) => item.id === task.priorityId);
  const labels = new Map(lookups.labels.map((label) => [label.id, label]));
  return {
    projectId: task.projectId,
    projectName: lookups.project?.name ?? 'Ismeretlen projekt',
    statusName: status?.name ?? 'Ismeretlen állapot',
    statusColor: status?.color ?? '#667085',
    priorityName: priority?.name ?? 'Ismeretlen prioritás',
    assigneeName: userName(lookups.users, task.assigneeId),
    labels: task.labelIds.flatMap((id) => {
      const label = labels.get(id);
      return label ? [label] : [];
    }),
  };
}

export function blockingDetails(counts: {
  comments: number;
  timeEntries: number;
  checklist: number;
}): string[] {
  return [
    counts.comments > 0 ? `${counts.comments} hozzászólás` : '',
    counts.timeEntries > 0 ? `${counts.timeEntries} időnapló-bejegyzés` : '',
    counts.checklist > 0 ? `${counts.checklist} ellenőrzőlista-pont` : '',
  ].filter(Boolean);
}

export function checklistProgress(items: ChecklistItem[]): string {
  if (items.length === 0) return '0 / 0';
  return `${items.filter((item) => item.done).length} / ${items.length}`;
}

export function formatHours(hours: number): string {
  return `${new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 1 }).format(hours)} óra`;
}

export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder} perc`;
  if (remainder === 0) return `${hours} óra`;
  return `${hours} óra ${remainder} perc`;
}

export function sortComments(comments: Comment[]): Comment[] {
  return [...comments].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id,
  );
}

export function sumMinutes(entries: TimeEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.minutes, 0);
}

export function userName(users: User[], userId: number): string {
  return users.find((user) => user.id === userId)?.name ?? 'Ismeretlen felhasználó';
}
