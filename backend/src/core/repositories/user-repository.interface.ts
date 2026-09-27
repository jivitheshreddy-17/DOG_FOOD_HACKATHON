import { AuthenticatedRole } from '@hackathon/contracts';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  role: AuthenticatedRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserDto {
  id?: string;
  email: string;
  passwordHash: string;
  role: AuthenticatedRole;
}

export interface UserRepository {
  findById(id: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  create(data: CreateUserDto): Promise<UserRecord>;
}
