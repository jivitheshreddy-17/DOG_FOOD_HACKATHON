import { PrismaTransactionClient } from '../prisma.client';
import {
  UserRepository,
  UserRecord,
  CreateUserDto
} from '../../../core/repositories';
import { AuthenticatedRole } from '@hackathon/contracts';
import { Role } from '@prisma/client';

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaTransactionClient) {}

  async findById(id: string): Promise<UserRecord | null> {
    const user = await this.prisma.user.findUnique({
      where: { id }
    });
    if (!user) return null;
    return this.mapToDomain(user);
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const user = await this.prisma.user.findUnique({
      where: { email }
    });
    if (!user) return null;
    return this.mapToDomain(user);
  }

  async create(data: CreateUserDto): Promise<UserRecord> {
    const user = await this.prisma.user.create({
      data: {
        id: data.id,
        email: data.email,
        name: data.email.split('@')[0],
        passwordHash: data.passwordHash,
        role: this.mapRoleToPrisma(data.role),
      }
    });
    return this.mapToDomain(user);
  }

  private mapToDomain(user: any): UserRecord {
    return {
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      role: this.mapRoleToDomain(user.role),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private mapRoleToPrisma(role: AuthenticatedRole): Role {
    return role as Role;
  }

  private mapRoleToDomain(role: Role): AuthenticatedRole {
    return role as AuthenticatedRole;
  }
}
