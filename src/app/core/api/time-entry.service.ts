import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { TimeEntry } from '../../models/time-entry';
import { API_BASE_URL } from './api-config';

type TimeEntryWrite = Omit<TimeEntry, 'id'>;

@Injectable({ providedIn: 'root' })
export class TimeEntryService {
  private readonly http = inject(HttpClient);
  private readonly url = `${API_BASE_URL}/timeEntries`;

  list(params = new HttpParams()): Observable<TimeEntry[]> {
    return this.http.get<TimeEntry[]>(this.url, { params });
  }

  getById(id: number): Observable<TimeEntry> {
    return this.http.get<TimeEntry>(`${this.url}/${id}`);
  }

  create(data: TimeEntryWrite): Observable<TimeEntry> {
    return this.http.post<TimeEntry>(this.url, data);
  }

  update(id: number, data: Partial<TimeEntryWrite>): Observable<TimeEntry> {
    return this.http.patch<TimeEntry>(`${this.url}/${id}`, data);
  }

  remove(id: number): Observable<void> {
    return this.http.delete<unknown>(`${this.url}/${id}`)
      .pipe(map(() => void 0));
  }

  listByTask(taskId: number): Observable<TimeEntry[]> {
    return this.list(new HttpParams().set('taskId', taskId));
  }
}
