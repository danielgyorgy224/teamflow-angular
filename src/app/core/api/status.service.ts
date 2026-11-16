import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { Status } from '../../models/status';
import { API_BASE_URL } from './api-config';

type StatusWrite = Omit<Status, 'id'>;

@Injectable({ providedIn: 'root' })
export class StatusService {
  private readonly http = inject(HttpClient);
  private readonly url = `${API_BASE_URL}/statuses`;

  list(params = new HttpParams()): Observable<Status[]> {
    return this.http.get<Status[]>(this.url, { params });
  }

  getById(id: number): Observable<Status> {
    return this.http.get<Status>(`${this.url}/${id}`);
  }

  create(data: StatusWrite): Observable<Status> {
    return this.http.post<Status>(this.url, data);
  }

  update(id: number, data: Partial<StatusWrite>): Observable<Status> {
    return this.http.patch<Status>(`${this.url}/${id}`, data);
  }

  remove(id: number): Observable<void> {
    return this.http.delete<unknown>(`${this.url}/${id}`)
      .pipe(map(() => void 0));
  }
}
