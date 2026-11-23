import { ParamMap } from '@angular/router';
import { Project } from '../../models/project';
import { Status } from '../../models/status';
import { Task } from '../../models/task';
import { User } from '../../models/user';

export type SortKey = 'id' | 'dueDate';

export interface TaskFilters {
  q: string;
  statusId: string;
  assigneeId: string;
  projectId: string;
  sort: SortKey;
}

export interface Lookups {
  users: User[];
  projects: Project[];
  statuses: Status[];
  total: number;
}

export interface TaskRow extends Task {
  projectName: string;
  statusName: string;
  statusColor: string;
  assigneeName: string;
}

export const EMPTY_FILTERS: TaskFilters = {
  q: '',
  statusId: '',
  assigneeId: '',
  projectId: '',
  sort: 'id',
};

function positiveInt(value: string | null): string {
  return value !== null && /^[1-9]\d*$/.test(value) ? value : '';
}

export function parseFilters(params: ParamMap): TaskFilters {
  const sort = params.get('sort');
  return {
    q: (params.get('q') ?? '').trim(),
    statusId: positiveInt(params.get('statusId')),
    assigneeId: positiveInt(params.get('assigneeId')),
    projectId: positiveInt(params.get('projectId')),
    sort: sort === 'dueDate' ? 'dueDate' : 'id',
  };
}

export function toQueryParams(filters: TaskFilters): Record<string, string | null> {
  return {
    q: filters.q || null,
    statusId: filters.statusId || null,
    assigneeId: filters.assigneeId || null,
    projectId: filters.projectId || null,
    sort: filters.sort === 'id' ? null : filters.sort,
  };
}

export function filtersEqual(a: TaskFilters, b: TaskFilters): boolean {
  return (
    a.q === b.q &&
    a.statusId === b.statusId &&
    a.assigneeId === b.assigneeId &&
    a.projectId === b.projectId &&
    a.sort === b.sort
  );
}

export function hasActiveFilters(filters: TaskFilters): boolean {
  return Boolean(filters.q || filters.statusId || filters.assigneeId || filters.projectId);
}

export function buildRows(tasks: Task[], lookups: Lookups): TaskRow[] {
  const projects = new Map(lookups.projects.map((project) => [project.id, project.name]));
  const statuses = new Map(lookups.statuses.map((status) => [status.id, status]));
  const users = new Map(lookups.users.map((user) => [user.id, user.name]));
  return tasks.map((task) => {
    const status = statuses.get(task.statusId);
    return {
      ...task,
      projectName: projects.get(task.projectId) ?? 'Ismeretlen projekt',
      statusName: status?.name ?? 'Ismeretlen állapot',
      statusColor: status?.color ?? '#667085',
      assigneeName: users.get(task.assigneeId) ?? 'Ismeretlen felhasználó',
    };
  });
}
