import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { Task } from '../../models/task';
import { API_BASE_URL } from './api-config';

type TaskWrite = Omit<Task, 'id'>;

@Injectable({ providedIn: 'root' })
export class TaskService {
  private readonly http = inject(HttpClient);
  private readonly url = `${API_BASE_URL}/tasks`;

  list(params = new HttpParams()): Observable<Task[]> {
    return this.http.get<Task[]>(this.url, { params });
  }

  getById(id: number): Observable<Task> {
    return this.http.get<Task>(`${this.url}/${id}`);
  }

  create(data: TaskWrite): Observable<Task> {
    return this.http.post<Task>(this.url, data);
  }

  update(id: number, data: Partial<TaskWrite>): Observable<Task> {
    return this.http.patch<Task>(`${this.url}/${id}`, data);
  }

  remove(id: number): Observable<void> {
    return this.http.delete<unknown>(`${this.url}/${id}`)
      .pipe(map(() => void 0));
  }

  /** Szűrés: üres értéket nem küldünk ki. A q szerveroldali keresés (JSON Server 0.17.4). */
  search(filters: {
    q?: string | null;
    statusId?: number | string | null;
    assigneeId?: number | string | null;
    projectId?: number | string | null;
    sort?: 'dueDate' | null;
  } = {}): Observable<Task[]> {
    let params = new HttpParams();
    const { q, statusId, assigneeId, projectId, sort } = filters;
    if (q && q.trim()) params = params.set('q', q.trim());
    if (statusId) params = params.set('statusId', String(statusId));
    if (assigneeId) params = params.set('assigneeId', String(assigneeId));
    if (projectId) params = params.set('projectId', String(projectId));
    if (sort === 'dueDate') params = params.set('_sort', 'dueDate').set('_order', 'asc');
    return this.list(params);
  }

  listByProject(projectId: number): Observable<Task[]> {
    return this.list(new HttpParams().set('projectId', projectId));
  }
}
