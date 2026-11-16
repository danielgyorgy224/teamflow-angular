import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { Comment } from '../../models/comment';
import { API_BASE_URL } from './api-config';

type CommentWrite = Omit<Comment, 'id'>;

@Injectable({ providedIn: 'root' })
export class CommentService {
  private readonly http = inject(HttpClient);
  private readonly url = `${API_BASE_URL}/comments`;

  list(params = new HttpParams()): Observable<Comment[]> {
    return this.http.get<Comment[]>(this.url, { params });
  }

  getById(id: number): Observable<Comment> {
    return this.http.get<Comment>(`${this.url}/${id}`);
  }

  create(data: CommentWrite): Observable<Comment> {
    return this.http.post<Comment>(this.url, data);
  }

  update(id: number, data: Partial<CommentWrite>): Observable<Comment> {
    return this.http.patch<Comment>(`${this.url}/${id}`, data);
  }

  remove(id: number): Observable<void> {
    return this.http.delete<unknown>(`${this.url}/${id}`)
      .pipe(map(() => void 0));
  }

  listByTask(taskId: number): Observable<Comment[]> {
    return this.list(new HttpParams().set('taskId', taskId));
  }
}
