import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { Priority } from '../../models/priority';
import { API_BASE_URL } from './api-config';

type PriorityWrite = Omit<Priority, 'id'>;

@Injectable({ providedIn: 'root' })
export class PriorityService {
  private readonly http = inject(HttpClient);
  private readonly url = `${API_BASE_URL}/priorities`;

  list(params = new HttpParams()): Observable<Priority[]> {
    return this.http.get<Priority[]>(this.url, { params });
  }

  getById(id: number): Observable<Priority> {
    return this.http.get<Priority>(`${this.url}/${id}`);
  }

  create(data: PriorityWrite): Observable<Priority> {
    return this.http.post<Priority>(this.url, data);
  }

  update(id: number, data: Partial<PriorityWrite>): Observable<Priority> {
    return this.http.patch<Priority>(`${this.url}/${id}`, data);
  }

  remove(id: number): Observable<void> {
    return this.http.delete<unknown>(`${this.url}/${id}`)
      .pipe(map(() => void 0));
  }
}
