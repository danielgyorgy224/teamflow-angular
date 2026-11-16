import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE_URL } from './api-config';
import { TaskService } from './task.service';
import { CommentService } from './comment.service';
import { TimeEntryService } from './time-entry.service';
import { ChecklistService } from './checklist.service';
import { ProjectMemberService } from './project-member.service';

describe('Lekérdezési minták (HttpParams)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('TaskService.search()', () => {
    it('az összes szűrőt query paraméterként küldi, trimmelt q-val', () => {
      TestBed.inject(TaskService)
        .search({ q: '  API ', statusId: 2, assigneeId: '1', projectId: 1 })
        .subscribe();
      const req = http.expectOne((r) => r.url === `${API_BASE_URL}/tasks`);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('q')).toBe('API');
      expect(req.request.params.get('statusId')).toBe('2');
      expect(req.request.params.get('assigneeId')).toBe('1');
      expect(req.request.params.get('projectId')).toBe('1');
      req.flush([]);
    });

    it('üres szűrőt nem küld ki', () => {
      TestBed.inject(TaskService)
        .search({ q: '   ', statusId: null, assigneeId: '', projectId: undefined })
        .subscribe();
      const req = http.expectOne(`${API_BASE_URL}/tasks`);
      expect(req.request.params.keys().length).toBe(0);
      req.flush([]);
    });

    it('határidő szerinti rendezésnél _sort és _order (JSON Server 0.17.4)', () => {
      TestBed.inject(TaskService).search({ sort: 'dueDate' }).subscribe();
      const req = http.expectOne((r) => r.url === `${API_BASE_URL}/tasks`);
      expect(req.request.params.get('_sort')).toBe('dueDate');
      expect(req.request.params.get('_order')).toBe('asc');
      req.flush([]);
    });

    it('listByProject(): projectId paraméter', () => {
      TestBed.inject(TaskService).listByProject(2).subscribe();
      const req = http.expectOne((r) => r.url === `${API_BASE_URL}/tasks`);
      expect(req.request.params.get('projectId')).toBe('2');
      req.flush([]);
    });
  });

  const childCases: [string, string, string, (id: number) => unknown][] = [
    ['CommentService.listByTask', 'comments', 'taskId', (id) => TestBed.inject(CommentService).listByTask(id)],
    ['TimeEntryService.listByTask', 'timeEntries', 'taskId', (id) => TestBed.inject(TimeEntryService).listByTask(id)],
    ['ChecklistService.listByTask', 'checklistItems', 'taskId', (id) => TestBed.inject(ChecklistService).listByTask(id)],
    ['ProjectMemberService.listByProject', 'projectMembers', 'projectId', (id) => TestBed.inject(ProjectMemberService).listByProject(id)],
  ];

  childCases.forEach(([name, resource, param, call]) => {
    it(`${name}(): GET /${resource}?${param}=1`, () => {
      (call(1) as { subscribe: () => void }).subscribe();
      const req = http.expectOne((r) => r.url === `${API_BASE_URL}/${resource}`);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get(param)).toBe('1');
      req.flush([]);
    });
  });
});
