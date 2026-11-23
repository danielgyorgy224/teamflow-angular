import { Project } from '../../models/project';
import { Status } from '../../models/status';
import { Task } from '../../models/task';
import { TimeEntry } from '../../models/time-entry';
import { User } from '../../models/user';

export interface DashboardInput {
  tasks: Task[];
  statuses: Status[];
  users: User[];
  projects: Project[];
  timeEntries: TimeEntry[];
}

export interface DashboardTaskRow {
  id: number;
  title: string;
  projectName: string;
  statusName: string;
  statusColor: string;
  assigneeName: string;
  dueDate: string;
}

export interface DashboardSummary {
  total: number;
  projectCount: number;
  doing: number;
  done: number;
  donePercent: number;
  totalMinutes: number;
  totalTime: string;
  openTasks: DashboardTaskRow[];
}

const UNKNOWN = 'Ismeretlen';

export function buildSummary(data: DashboardInput): DashboardSummary {
  const statusById = new Map(data.statuses.map((status) => [status.id, status]));
  const userById = new Map(data.users.map((user) => [user.id, user]));
  const projectById = new Map(data.projects.map((project) => [project.id, project]));
  const done = data.tasks.filter((task) => statusById.get(task.statusId)?.key === 'done').length;
  const totalMinutes = data.timeEntries.reduce((total, entry) => total + entry.minutes, 0);
  const openTasks = data.tasks
    .filter((task) => statusById.get(task.statusId)?.key !== 'done')
    .map((task): DashboardTaskRow => {
      const status = statusById.get(task.statusId);
      return {
        id: task.id,
        title: task.title,
        projectName: projectById.get(task.projectId)?.name ?? UNKNOWN,
        statusName: status?.name ?? UNKNOWN,
        statusColor: status?.color ?? '#667085',
        assigneeName: userById.get(task.assigneeId)?.name ?? UNKNOWN,
        dueDate: task.dueDate,
      };
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id - b.id);

  return {
    total: data.tasks.length,
    projectCount: new Set(data.tasks.map((task) => task.projectId)).size,
    doing: data.tasks.filter((task) => statusById.get(task.statusId)?.key === 'doing').length,
    done,
    donePercent: data.tasks.length === 0 ? 0 : Math.round((done / data.tasks.length) * 100),
    totalMinutes,
    totalTime: `${new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 1 }).format(totalMinutes / 60)} óra`,
    openTasks,
  };
}
