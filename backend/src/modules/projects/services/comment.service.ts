import {
  ProjectCommentRepository,
  ProjectRepository,
  AuditEventRepository,
  ProjectCommentDTO,
  TeamRepository,
} from '../../../core/repositories';
import { NotFoundError, ValidationError } from '../../../core/errors';
import { PROJECT_STATUS } from '@hackathon/contracts';

export interface CommentServiceDependencies {
  projectCommentRepository: ProjectCommentRepository;
  projectRepository: ProjectRepository;
  teamRepository: TeamRepository;
  auditEventRepository: AuditEventRepository;
}

export interface CreateCommentParams {
  projectId: string;
  content: string;
  authorId?: string | null;
  authorName?: string;
  voterIdentity?: string;
  eventId?: string; // used to cross-verify the project belongs to the event if provided
}

export interface PaginatedCommentsResponse {
  data: Array<{
    id?: string;
    projectId: string;
    authorName: string;
    content: string;
    createdAt?: string;
  }>;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export class CommentService {
  constructor(private readonly dependencies: CommentServiceDependencies) {}

  async createComment(params: CreateCommentParams): Promise<ProjectCommentDTO> {
    const { projectId, content, authorId, authorName, voterIdentity, eventId } = params;

    // 1. Verify target project exists and is eligible
    const project = await this.dependencies.projectRepository.findById(projectId);
    if (!project || project.status !== PROJECT_STATUS.SUBMITTED) {
      throw new NotFoundError('Project not found or ineligible for commenting');
    }
    
    // 2. Validate event association if eventId is provided (IDOR protection)
    const team = await this.dependencies.teamRepository.findById(project.teamId);
    if (!team) {
      throw new NotFoundError('Project team not found');
    }
    
    if (eventId && team.eventId !== eventId) {
      throw new NotFoundError('Project not found');
    }

    // 3. Validate & sanitize content (Plain text enforcement + XSS safety)
    if (!content || typeof content !== 'string') {
      throw new ValidationError('Comment content is required');
    }

    const trimmed = content.trim();
    if (trimmed.length === 0) {
      throw new ValidationError('Comment content cannot be empty or whitespace only');
    }
    if (trimmed.length > 1000) {
      throw new ValidationError('Comment content exceeds maximum length of 1000 characters');
    }

    // Strip HTML tags and script elements for plain text safety
    const sanitizedContent = this.sanitizePlainText(trimmed);
    if (sanitizedContent.length === 0) {
      throw new ValidationError('Comment contains no valid text content');
    }

    // 4. Resolve author display name safely
    const finalAuthorName = (authorName && authorName.trim().length > 0)
      ? this.sanitizePlainText(authorName.trim())
      : 'Community Member';

    // 5. Create comment record
    const comment = await this.dependencies.projectCommentRepository.create({
      projectId,
      authorId: authorId ?? null,
      authorName: finalAuthorName,
      content: sanitizedContent,
      isApproved: true,
    });

    // 6. Audit log
    await this.dependencies.auditEventRepository.create({
      eventId: team.eventId, // Trusted relational eventId
      action: 'COMMENT_CREATED',
      severity: 'INFO',
      actor: voterIdentity ?? authorId ?? 'anonymous',
      details: { projectId, commentId: comment.id },
    });

    return comment;
  }

  async getCommentsForProject(
    projectId: string,
    eventId?: string,
    page: number = 1,
    pageSize: number = 20
  ): Promise<PaginatedCommentsResponse> {
    const project = await this.dependencies.projectRepository.findById(projectId);
    if (!project || project.status !== PROJECT_STATUS.SUBMITTED) {
      throw new NotFoundError('Project not found');
    }

    if (eventId) {
      const team = await this.dependencies.teamRepository.findById(project.teamId);
      if (!team || team.eventId !== eventId) {
        throw new NotFoundError('Project not found');
      }
    }

    const safePage = Math.max(1, Math.floor(page));
    const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)));

    const result = await this.dependencies.projectCommentRepository.listByProject(
      projectId,
      { page: safePage, pageSize: safePageSize }
    );

    let comments: ProjectCommentDTO[];
    let total: number;

    if (Array.isArray(result)) {
      comments = result;
      total = result.length;
    } else {
      comments = result.comments;
      total = result.total;
    }

    const totalPages = Math.ceil(total / safePageSize) || 1;

    return {
      data: comments.map((c) => ({
        id: c.id,
        projectId: c.projectId,
        authorName: c.authorName,
        content: c.content,
        createdAt: c.createdAt?.toISOString(),
      })),
      pagination: {
        page: safePage,
        pageSize: safePageSize,
        total,
        totalPages,
      },
    };
  }

  private sanitizePlainText(input: string): string {
    return input.replace(/<[^>]*>?/gm, '');
  }
}
