import { PrismaClient, Prisma } from '@prisma/client';
import { ProjectCommentRepository, ProjectCommentDTO } from '../../../core/repositories';

export class PrismaProjectCommentRepository implements ProjectCommentRepository {
  constructor(private readonly prisma: PrismaClient | Prisma.TransactionClient) {}

  async create(data: ProjectCommentDTO): Promise<ProjectCommentDTO> {
    return this.prisma.projectComment.create({
      data: {
        id: data.id,
        projectId: data.projectId,
        authorId: data.authorId,
        authorName: data.authorName,
        content: data.content,
        isApproved: data.isApproved,
        createdAt: data.createdAt,
      },
    });
  }

  async listByProject(projectId: string, options?: { page: number; pageSize: number }): Promise<{ comments: ProjectCommentDTO[]; total: number }> {
    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 20;
    
    const [comments, total] = await Promise.all([
      this.prisma.projectComment.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.projectComment.count({ where: { projectId } }),
    ]);

    return { comments, total };
  }

  async countByProject(projectId: string): Promise<number> {
    return this.prisma.projectComment.count({
      where: { projectId },
    });
  }
}
