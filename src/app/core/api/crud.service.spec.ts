import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE_URL } from './api-config';
import { UserService } from './user.service';
import { ProjectService } from './project.service';
import { TaskService } from './task.service';
import { CommentService } from './comment.service';
import { LabelService } from './label.service';
import { StatusService } from './status.service';
import { PriorityService } from './priority.service';
import { TimeEntryService } from './time-entry.service';
import { ChecklistService } from './checklist.service';
import { ProjectMemberService } from './project-member.service';

interface CrudLike {
  list(): import('rxjs').Observable<unknown>;
  getById(id: number): import('rxjs').Observable<unknown>;
  create(data: any): import('rxjs').Observable<any>;
  update(id: number, data: any): import('rxjs').Observable<unknown>;
  remove(id: number): import('rxjs').Observable<void>;
}

interface Case {
  resource: string;
  service: Type<CrudLike>;
  sample: Record<string, unknown>;
}

const CASES: Case[] = [
  { resource: 'users', service: UserService, sample: { name: 'Teszt Elek', email: 't@example.com', role: 'Dev', active: true } },
  { resource: 'projects', service: ProjectService, sample: { name: 'Proj', description: '', ownerId: 1, status: 'active', startDate: '2026-11-16', dueDate: '2026-12-11' } },
  { resource: 'tasks', service: TaskService, sample: { projectId: 1, title: 'Feladat', description: '', assigneeId: 1, statusId: 1, priorityId: 1, dueDate: '2026-12-01', estimateHours: 2, labelIds: [1] } },
  { resource: 'comments', service: CommentService, sample: { taskId: 1, userId: 1, body: 'Szia', createdAt: '2026-11-18T09:00:00Z' } },
  { resource: 'labels', service: LabelService, sample: { name: 'Label', color: '#315CE8' } },
  { resource: 'statuses', service: StatusService, sample: { name: 'Uj', key: 'new', color: '#667085', order: 4 } },
  { resource: 'priorities', service: PriorityService, sample: { name: 'Kritikus', level: 4 } },
  { resource: 'timeEntries', service: TimeEntryService, sample: { taskId: 1, userId: 1, minutes: 30, date: '2026-11-18', note: '' } },
  { resource: 'checklistItems', service: ChecklistService, sample: { taskId: 1, text: 'Pont', done: false } },
  { resource: 'projectMembers', service: ProjectMemberService, sample: { projectId: 1, userId: 1, role: 'Dev' } },
];

CASES.forEach(({ resource, service, sample }) => {
  describe(`${service.name} (/${resource})`, () => {
    let svc: CrudLike;
    let http: HttpTestingController;
    const base = `${API_BASE_URL}/${resource}`;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting()],
      });
      svc = TestBed.inject(service);
      http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => http.verify());

    it('list(): GET a gyűjtemény-útvonalra', () => {
      let result: unknown;
      svc.list().subscribe((r) => (result = r));
      const req = http.expectOne(base);
      expect(req.request.method).toBe('GET');
      req.flush([{ id: 1, ...sample }]);
      expect(result).toEqual([{ id: 1, ...sample }]);
    });

    it('getById(): GET a rekordvégpontra', () => {
      svc.getById(7).subscribe();
      const req = http.expectOne(`${base}/7`);
      expect(req.request.method).toBe('GET');
      req.flush({ id: 7, ...sample });
    });

    it('create(): POST id nélküli törzzsel, a szerver adja az id-t', () => {
      let created: any;
      svc.create(sample as any).subscribe((r) => (created = r));
      const req = http.expectOne(base);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(sample);
      expect('id' in (req.request.body as object)).toBe(false);
      req.flush({ id: 99, ...sample }, { status: 201, statusText: 'Created' });
      expect(created.id).toBe(99);
    });

    it('update(): PATCH a módosított mezőkkel', () => {
      const patch = { ...sample };
      svc.update(3, patch as any).subscribe();
      const req = http.expectOne(`${base}/3`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual(patch);
      req.flush({ id: 3, ...sample });
    });

    it('remove(): DELETE, és üres (void) értéket ad vissza', () => {
      let emitted = false;
      let value: unknown = 'nem-void';
      svc.remove(5).subscribe((v) => {
        emitted = true;
        value = v;
      });
      const req = http.expectOne(`${base}/5`);
      expect(req.request.method).toBe('DELETE');
      req.flush({});
      expect(emitted).toBe(true);
      expect(value).toBeUndefined();
    });

    it('hiba esetén továbbítja a HttpErrorResponse-t (nincs elnyelt hiba)', () => {
      let error: HttpErrorResponse | undefined;
      svc.create(sample as any).subscribe({ error: (e) => (error = e) });
      http.expectOne(base).flush('boom', { status: 500, statusText: 'Server Error' });
      expect(error).toBeDefined();
      expect(error!.status).toBe(500);
    });
  });
});
