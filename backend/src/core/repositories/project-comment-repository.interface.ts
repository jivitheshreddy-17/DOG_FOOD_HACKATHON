export interface ProjectCommentDTO {
  id?: string;
  projectId: string;
  authorId?: string | null;
  authorName: string;
  content: string;
  isApproved?: boolean;
  createdAt?: Date;
}

export interface ProjectCommentRepository {
  create(data: ProjectCommentDTO): Promise<ProjectCommentDTO>;
  listByProject(projectId: string, options?: { page: number; pageSize: number }): Promise<{ comments: ProjectCommentDTO[]; total: number }>;
  countByProject(projectId: string): Promise<number>;
}
