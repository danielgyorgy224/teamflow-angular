export type ProjectStatus = 'active' | 'archived';

export interface Project {
  id: number;
  name: string;
  description: string;
  ownerId: number;
  status: ProjectStatus;
  startDate: string;
  dueDate: string;
}
