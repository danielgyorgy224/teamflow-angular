import { buildSummary } from './dashboard.helpers';
import { Project } from '../../models/project';
import { Status } from '../../models/status';
import { Task } from '../../models/task';
import { TimeEntry } from '../../models/time-entry';
import { User } from '../../models/user';

describe('buildSummary', () => {
  const statuses: Status[] = [
    { id: 1, name: 'Tervezett', key: 'todo', color: '#667085', order: 1 },
    { id: 2, name: 'Folyamatban', key: 'doing', color: '#315CE8', order: 2 },
    { id: 3, name: 'Kész', key: 'done', color: '#087F5B', order: 3 },
  ];
  const users: User[] = [{ id: 1, name: 'Kiss Anna', email: 'anna@example.com', role: 'Fejlesztő', active: true }];
  const projects: Project[] = [
    { id: 1, name: 'TeamFlow', description: '', ownerId: 1, status: 'active', startDate: '2026-11-01', dueDate: '2026-12-01' },
    { id: 2, name: 'Docs', description: '', ownerId: 1, status: 'active', startDate: '2026-11-01', dueDate: '2026-12-01' },
  ];
  const tasks: Task[] = [
    { id: 1, projectId: 1, title: 'A', description: '', assigneeId: 1, statusId: 2, priorityId: 1, dueDate: '2026-11-24', estimateHours: 1, labelIds: [] },
    { id: 2, projectId: 1, title: 'B', description: '', assigneeId: 1, statusId: 2, priorityId: 1, dueDate: '2026-11-25', estimateHours: 1, labelIds: [] },
    { id: 3, projectId: 2, title: 'C', description: '', assigneeId: 1, statusId: 3, priorityId: 1, dueDate: '2026-11-26', estimateHours: 1, labelIds: [] },
    { id: 4, projectId: 2, title: 'D', description: '', assigneeId: 1, statusId: 1, priorityId: 1, dueDate: '2026-11-27', estimateHours: 1, labelIds: [] },
    { id: 5, projectId: 1, title: 'E', description: '', assigneeId: 1, statusId: 1, priorityId: 1, dueDate: '2026-11-28', estimateHours: 1, labelIds: [] },
    { id: 6, projectId: 1, title: 'F', description: '', assigneeId: 1, statusId: 1, priorityId: 1, dueDate: '2026-11-29', estimateHours: 1, labelIds: [] },
  ];
  const timeEntries: TimeEntry[] = [
    { id: 1, taskId: 1, userId: 1, minutes: 90, date: '2026-11-18', note: '' },
    { id: 2, taskId: 1, userId: 1, minutes: 60, date: '2026-11-18', note: '' },
  ];

  it('calculates the PDF reference totals from the API data', () => {
    const summary = buildSummary({ tasks, statuses, users, projects, timeEntries });
    expect(summary.total).toBe(6);
    expect(summary.projectCount).toBe(2);
    expect(summary.doing).toBe(2);
    expect(summary.done).toBe(1);
    expect(summary.donePercent).toBe(17);
    expect(summary.totalMinutes).toBe(150);
    expect(summary.totalTime).toBe('2,5 óra');
    expect(summary.openTasks.map((task) => task.id)).toEqual([1, 2, 4, 5, 6]);
  });

  it('handles an empty task list without dividing by zero', () => {
    const summary = buildSummary({ tasks: [], statuses, users, projects, timeEntries: [] });
    expect(summary.donePercent).toBe(0);
    expect(summary.openTasks).toEqual([]);
    expect(summary.totalTime).toBe('0 óra');
  });
});
